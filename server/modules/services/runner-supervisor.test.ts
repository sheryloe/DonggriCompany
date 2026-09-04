import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyContinuityCheckpointSchema } from "../bootstrap/schema/continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "../bootstrap/schema/continuity-run-schema.ts";
import {
  RUNNER_SUPERVISOR_UNBOUND,
  RunnerSupervisor,
  runnerSupervisorRegistry,
  type RunnerChildCloseAck,
  type RunnerChildIdentity,
  type RunnerChildPort,
  type RunnerChildProbeResult,
} from "./runner-supervisor.ts";
import {
  SqliteContinuityRunLedger,
  type ContinuityRunStatus,
  type ReserveContinuityRunInput,
} from "../workflow/continuity/run-ledger.ts";

const IDENTITY: RunnerChildIdentity = {
  pid: 4242,
  processStartedAt: "2026-08-29T00:00:00.000Z",
  processFingerprint: "a".repeat(64),
  providerNativeSessionId: "native-session-1",
};

class FakeChildPort implements RunnerChildPort {
  readonly bound = true;
  startCount = 0;
  closeCount = 0;
  probeCount = 0;
  startThrows: Error | null = null;
  closeThrows: Error | null = null;
  probeThrows: Error | null = null;
  onProbe: (() => void) | null = null;
  closeAck: RunnerChildCloseAck = {
    acknowledged: true,
    alive: false,
    pid: IDENTITY.pid,
    processFingerprint: IDENTITY.processFingerprint,
  };
  probeResult: RunnerChildProbeResult = {
    alive: true,
    pid: IDENTITY.pid,
    processStartedAt: IDENTITY.processStartedAt,
    processFingerprint: IDENTITY.processFingerprint,
  };

  async start(): Promise<RunnerChildIdentity> {
    this.startCount += 1;
    await Promise.resolve();
    if (this.startThrows) throw this.startThrows;
    return { ...IDENTITY };
  }

  async close(): Promise<RunnerChildCloseAck> {
    this.closeCount += 1;
    if (this.closeThrows) throw this.closeThrows;
    return { ...this.closeAck };
  }

  async probe(): Promise<RunnerChildProbeResult> {
    this.probeCount += 1;
    this.onProbe?.();
    if (this.probeThrows) throw this.probeThrows;
    return { ...this.probeResult };
  }
}

describe("RunnerSupervisor", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    while (databases.length > 0) databases.pop()?.close();
    vi.useRealTimers();
  });

  function createDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    applyContinuityCheckpointSchema(db);
    applyContinuityRunSchema(db);
    databases.push(db);
    return db;
  }

  function sourceRun(overrides: Partial<ReserveContinuityRunInput> = {}): ReserveContinuityRunInput {
    return {
      run_id: "run-source-1",
      project_id: "project-1",
      task_id: "task-1",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "codex-main",
      dispatch_id: "dispatch-source-1",
      created_at: "2026-08-29T00:00:00.000Z",
      ...overrides,
    };
  }

  function useFakeClock(iso = "2026-08-29T00:00:00.000Z"): () => Date {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    return () => new Date(Date.now());
  }

  function durableEventSentinelCount(db: DatabaseSync, sentinel: string): number {
    return Number(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM continuity_run_events WHERE instr(payload_json, ?) > 0")
          .get(sentinel) as { count: number }
      ).count,
    );
  }

  it("fails before reserving when the production child port is unbound", async () => {
    const db = createDb();
    const supervisor = new RunnerSupervisor(db, {
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });

    await expect(supervisor.reserveAndStartSource(sourceRun())).rejects.toThrow(RUNNER_SUPERVISOR_UNBOUND);
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 0 });
    expect(supervisor.getReadiness()).toMatchObject({ ready: false, bound: false, bootReconciled: true });
  });

  it("reserves a task-owned source run before checkpoint and collapses concurrent starts to one spawn", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    const ledger = new SqliteContinuityRunLedger(db);
    ledger.reserve(sourceRun());

    const [first, second] = await Promise.all([
      supervisor.startReserved("run-source-1", "dispatch-source-1"),
      supervisor.startReserved("run-source-1", "dispatch-source-1"),
    ]);

    expect(child.startCount).toBe(1);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      project_id: "project-1",
      task_id: "task-1",
      checkpoint_id: null,
      status: "running",
      pid: IDENTITY.pid,
      process_fingerprint: IDENTITY.processFingerprint,
      provider_native_session_id: IDENTITY.providerNativeSessionId,
    });
    expect(ledger.listEvents(first.run_id).map((event) => event.event_type)).toEqual([
      "runner.starting",
      "runner.child_started",
    ]);
  });

  it("persists only a closed failure code when child start throws private text", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    child.startThrows = new Error("C:/Users/private-owner/provider-token=SECRET:start");
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });

    await expect(supervisor.reserveAndStartSource(sourceRun())).rejects.toThrow("provider-token=SECRET:start");

    const event = new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1);
    expect(event).toMatchObject({
      event_type: "runner.start_failed",
      payload: {
        failure_code: "child_start_failed",
        child_identity_received: false,
        close_acknowledged: false,
      },
    });
    expect(durableEventSentinelCount(db, "private-owner")).toBe(0);
    expect(durableEventSentinelCount(db, "SECRET")).toBe(0);
  });

  it("renews a matching live child for multiple lease cycles with atomic CAS events", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    const started = await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(2_100);

    const renewed = supervisor.getRun(started.run_id);
    expect(child.probeCount).toBe(2);
    expect(renewed).toMatchObject({
      status: "running",
      state_version: started.state_version + 2,
      heartbeat_at: "2026-08-29T00:00:02.000Z",
      lease_expires_at: "2026-08-29T00:00:05.000Z",
      owner_instance_id: "instance-test",
    });
    const events = new SqliteContinuityRunLedger(db).listEvents(started.run_id);
    expect(events.map((event) => event.event_type)).toEqual([
      "runner.starting",
      "runner.child_started",
      "runner.heartbeat",
      "runner.heartbeat",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);

    await supervisor.shutdown("test");
  });

  it("stops renewal and marks a matching dead child stale", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    child.probeResult.alive = false;
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(1_100);
    const probeCount = child.probeCount;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(probeCount).toBe(1);
    expect(child.probeCount).toBe(probeCount);
    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "stale",
      owner_instance_id: null,
      lease_expires_at: null,
      pid: null,
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)?.event_type).toBe(
      "runner.heartbeat_child_dead",
    );
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      reason: "runner_supervisor_child_state_uncertain",
    });
    await expect(
      supervisor.reserveAndStartSource(
        sourceRun({ run_id: "run-source-2", task_id: "task-2", dispatch_id: "dispatch-source-2" }),
      ),
    ).rejects.toThrow("runner_supervisor_child_state_uncertain");
  });

  it("stops renewal on a live process identity mismatch without closing the observed PID", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    child.probeResult.processFingerprint = "b".repeat(64);
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(1_100);

    expect(child.probeCount).toBe(1);
    expect(child.closeCount).toBe(0);
    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "dispatch_uncertain",
      owner_instance_id: null,
      lease_expires_at: null,
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)).toMatchObject({
      event_type: "runner.heartbeat_identity_mismatch",
      payload: {
        pid_matches: true,
        process_started_at_matches: true,
        process_fingerprint_matches: false,
      },
    });
    expect(supervisor.getReadiness().ready).toBe(false);
  });

  it("sanitizes probe errors, marks dispatch uncertain, and stops renewal", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    child.probeThrows = new Error("C:/Users/private-owner/provider-token.txt");
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(1_100);
    const probeCount = child.probeCount;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.probeCount).toBe(probeCount);
    expect(supervisor.getRun("run-source-1")?.status).toBe("dispatch_uncertain");
    const event = new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1);
    expect(event).toMatchObject({
      event_type: "runner.heartbeat_probe_failed",
      payload: { failure_code: "heartbeat_probe_failed" },
    });
    expect(JSON.stringify(event?.payload)).not.toContain("private-owner");
    expect(JSON.stringify(event?.payload)).not.toContain("provider-token");
    expect(supervisor.getReadiness().ready).toBe(false);
  });

  it("records a CAS conflict when the durable state version changes during the liveness probe", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    child.onProbe = () => {
      db.prepare("UPDATE continuity_runs SET state_version = state_version + 1 WHERE run_id = ?").run("run-source-1");
    };
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(1_100);

    expect(child.probeCount).toBe(1);
    expect(supervisor.getRun("run-source-1")?.status).toBe("dispatch_uncertain");
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)?.event_type).toBe(
      "runner.heartbeat_cas_conflict",
    );
    expect(supervisor.getReadiness().ready).toBe(false);
  });

  it("preserves a foreign owner lease when ownership changes during the liveness probe", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const foreignHeartbeat = "2026-08-29T00:00:00.500Z";
    const foreignLeaseExpiry = "2026-08-29T00:00:10.500Z";
    child.onProbe = () => {
      db.prepare(
        `UPDATE continuity_runs
         SET state_version = state_version + 1,
             owner_instance_id = ?, heartbeat_at = ?, lease_expires_at = ?
         WHERE run_id = ?`,
      ).run("instance-other", foreignHeartbeat, foreignLeaseExpiry, "run-source-1");
    };
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await vi.advanceTimersByTimeAsync(1_100);

    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "running",
      owner_instance_id: "instance-other",
      heartbeat_at: foreignHeartbeat,
      lease_expires_at: foreignLeaseExpiry,
    });
    expect(child.startCount).toBe(1);
    expect(child.closeCount).toBe(0);
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      activeRunIds: [],
      reason: "runner_supervisor_child_state_uncertain",
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)).toMatchObject({
      event_type: "runner.heartbeat_cas_conflict",
      payload: {
        failure_code: "heartbeat_cas_conflict",
        preserved_status: "running",
        ownership_preserved: true,
      },
    });
    await expect(
      supervisor.reserveAndStartSource(
        sourceRun({ run_id: "run-source-2", task_id: "task-2", dispatch_id: "dispatch-source-2" }),
      ),
    ).rejects.toThrow("runner_supervisor_child_state_uncertain");
    expect(child.startCount).toBe(1);

    expect(await supervisor.shutdown("test")).toEqual({
      paused: 0,
      reconciled: 0,
      failed: 0,
      spawnCount: 0,
      runIds: [],
    });
    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "running",
      owner_instance_id: "instance-other",
      heartbeat_at: foreignHeartbeat,
      lease_expires_at: foreignLeaseExpiry,
    });
    expect(child.closeCount).toBe(0);
  });

  it("allows only one nonterminal root source owner for a project and task", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });

    const results = await Promise.allSettled([
      supervisor.reserveAndStartSource(sourceRun()),
      supervisor.reserveAndStartSource(
        sourceRun({ run_id: "run-source-2", dispatch_id: "dispatch-source-2", provider: "claude" }),
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: "continuity_source_ownership_conflict" }),
    });
    expect(child.startCount).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 1 });
  });

  it("returns an identical dispatch replay without resuming a paused source", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    const running = await supervisor.reserveAndStartSource(sourceRun());
    const paused = await supervisor.pause(running.run_id, "handoff");

    const replay = await supervisor.reserveAndStartSource(sourceRun());

    expect(replay).toEqual(paused);
    expect(replay.status).toBe("paused");
    expect(child.startCount).toBe(1);
    expect(child.closeCount).toBe(1);
  });

  it("keeps checkpoint-owned target reservations out of the source reservation API", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, { childPort: child, instanceId: "instance-test" });

    await expect(supervisor.reserveAndStartSource(sourceRun({ checkpoint_id: "checkpoint-target" }))).rejects.toThrow(
      "runner_source_checkpoint_forbidden",
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 0 });
    expect(child.startCount).toBe(0);
  });

  it("persists pause_requested and only marks paused after a dead matching child ACK", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    const running = await supervisor.reserveAndStartSource(sourceRun());

    const paused = await supervisor.pause(running.run_id, "checkpoint_capture");

    expect(child.closeCount).toBe(1);
    expect(paused).toMatchObject({ status: "paused", owner_instance_id: null, lease_expires_at: null });
    const events = new SqliteContinuityRunLedger(db).listEvents(running.run_id);
    expect(events.slice(-2).map((event) => event.event_type)).toEqual([
      "runner.pause_requested",
      "runner.pause_acknowledged",
    ]);
    expect(events.at(-1)?.payload).toMatchObject({
      acknowledged: true,
      alive: false,
      pid: IDENTITY.pid,
      process_fingerprint: IDENTITY.processFingerprint,
    });
  });

  it("cancels renewal before pause and emits no later heartbeat", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());
    await vi.advanceTimersByTimeAsync(1_100);
    expect(child.probeCount).toBe(1);

    await supervisor.pause("run-source-1", "checkpoint_capture");
    const eventCount = new SqliteContinuityRunLedger(db).listEvents("run-source-1").length;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.probeCount).toBe(1);
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1")).toHaveLength(eventCount);
    expect(supervisor.getRun("run-source-1")?.status).toBe("paused");
  });

  it("fails closed without a monitoring gap when durable identity changed before pause", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());
    db.prepare("UPDATE continuity_runs SET process_fingerprint = ? WHERE run_id = ?").run(
      "b".repeat(64),
      "run-source-1",
    );

    await expect(supervisor.pause("run-source-1", "checkpoint_capture")).rejects.toThrow(
      "runner_pause_process_fingerprint_mismatch",
    );
    const eventCount = new SqliteContinuityRunLedger(db).listEvents("run-source-1").length;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.closeCount).toBe(0);
    expect(child.probeCount).toBe(0);
    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "dispatch_uncertain",
      owner_instance_id: null,
      lease_expires_at: null,
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1")).toHaveLength(eventCount);
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)).toMatchObject({
      event_type: "runner.pause_failed",
      payload: { failure_code: "child_pause_failed" },
    });
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      reason: "runner_supervisor_child_state_uncertain",
    });
    await expect(
      supervisor.reserveAndStartSource(
        sourceRun({ run_id: "run-source-2", task_id: "task-2", dispatch_id: "dispatch-source-2" }),
      ),
    ).rejects.toThrow("runner_supervisor_child_state_uncertain");
    expect(child.startCount).toBe(1);
  });

  it("cancels heartbeat before probing a run observed in a terminal state", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    const running = await supervisor.reserveAndStartSource(sourceRun());
    const occurredAt = "2026-08-29T00:00:00.500Z";
    new SqliteContinuityRunLedger(db).transitionWithEvent({
      run_id: running.run_id,
      expected_state_version: running.state_version,
      expected_status: "running",
      status: "completed",
      owner_instance_id: null,
      lease_expires_at: null,
      heartbeat_at: occurredAt,
      event_type: "runner.completed",
      payload: { outcome: "complete" },
      occurred_at: occurredAt,
    });
    const eventCount = new SqliteContinuityRunLedger(db).listEvents(running.run_id).length;

    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.probeCount).toBe(0);
    expect(new SqliteContinuityRunLedger(db).listEvents(running.run_id)).toHaveLength(eventCount);
    expect(supervisor.getRun(running.run_id)?.status).toBe("completed");
  });

  it("collapses concurrent pauses to one close request", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    await supervisor.reserveAndStartSource(sourceRun());

    const [first, second] = await Promise.all([
      supervisor.pause("run-source-1", "first"),
      supervisor.pause("run-source-1", "second"),
    ]);

    expect(first).toEqual(second);
    expect(first.status).toBe("paused");
    expect(child.closeCount).toBe(1);
  });

  it("fails closed to stale when a close ACK does not match the child fingerprint", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    child.closeAck.processFingerprint = "b".repeat(64);
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await expect(supervisor.pause("run-source-1")).rejects.toThrow("runner_pause_process_fingerprint_mismatch");
    expect(supervisor.getRun("run-source-1")?.status).toBe("stale");
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      reason: "runner_supervisor_child_state_uncertain",
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)?.event_type).toBe("runner.pause_failed");
  });

  it("persists only a closed failure code when pause close throws private text", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    await supervisor.reserveAndStartSource(sourceRun());
    child.closeThrows = new Error("C:/Users/private-owner/provider-token=SECRET:pause");

    await expect(supervisor.pause("run-source-1", "checkpoint_capture")).rejects.toThrow("provider-token=SECRET:pause");

    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)).toMatchObject({
      event_type: "runner.pause_failed",
      payload: {
        failure_code: "child_pause_failed",
        reason: "checkpoint_capture",
      },
    });
    expect(durableEventSentinelCount(db, "private-owner")).toBe(0);
    expect(durableEventSentinelCount(db, "SECRET")).toBe(0);
  });

  it("retains an uncertain child identity until shutdown gets a verified close ACK", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    new SqliteContinuityRunLedger(db).reserve(sourceRun());
    db.exec(`
      CREATE TRIGGER reject_child_started_uncertain
      BEFORE INSERT ON continuity_run_events
      WHEN NEW.event_type = 'runner.child_started'
      BEGIN
        SELECT RAISE(ABORT, 'test_child_started_rejected');
      END;
    `);
    child.closeThrows = new Error("C:/Users/private-owner/provider-token=SECRET:close");

    await expect(supervisor.startReserved("run-source-1", "dispatch-source-1")).rejects.toThrow(
      "test_child_started_rejected",
    );
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      reason: "runner_supervisor_child_state_uncertain",
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)).toMatchObject({
      event_type: "runner.start_failed",
      payload: { failure_code: "child_close_failed" },
    });
    expect(durableEventSentinelCount(db, "private-owner")).toBe(0);
    expect(durableEventSentinelCount(db, "SECRET")).toBe(0);
    await expect(
      supervisor.reserveAndStartSource(sourceRun({ run_id: "run-source-2", dispatch_id: "dispatch-source-2" })),
    ).rejects.toThrow("runner_supervisor_child_state_uncertain");

    child.closeThrows = null;
    const shutdown = await supervisor.shutdown("SIGTERM");
    expect(shutdown).toEqual({
      paused: 0,
      reconciled: 1,
      failed: 0,
      spawnCount: 0,
      runIds: ["run-source-1"],
    });
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)?.event_type).toBe(
      "runner.shutdown_child_reconciled",
    );
  });

  it("closes a spawned child and records dispatch_uncertain when the running CAS event cannot commit", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    new SqliteContinuityRunLedger(db).reserve(sourceRun());
    db.exec(`
      CREATE TRIGGER reject_child_started
      BEFORE INSERT ON continuity_run_events
      WHEN NEW.event_type = 'runner.child_started'
      BEGIN
        SELECT RAISE(ABORT, 'test_child_started_rejected');
      END;
    `);

    await expect(supervisor.startReserved("run-source-1", "dispatch-source-1")).rejects.toThrow(
      "test_child_started_rejected",
    );

    expect(child.startCount).toBe(1);
    expect(child.closeCount).toBe(1);
    expect(supervisor.getRun("run-source-1")?.status).toBe("dispatch_uncertain");
    expect(new SqliteContinuityRunLedger(db).listEvents("run-source-1").at(-1)?.event_type).toBe("runner.start_failed");
  });

  it("never respawns stale or dispatch-uncertain durable rows", async () => {
    for (const status of ["stale", "dispatch_uncertain"] as const) {
      const db = createDb();
      const child = new FakeChildPort();
      const supervisor = new RunnerSupervisor(db, { childPort: child, instanceId: `instance-${status}` });
      new SqliteContinuityRunLedger(db).reserve(sourceRun({ status }));

      await expect(supervisor.startReserved("run-source-1", "dispatch-source-1")).rejects.toThrow(
        `runner_run_not_startable:${status}`,
      );
      expect(child.startCount).toBe(0);
    }
  });

  it("boot reconciles every nonterminal state without starting a child", () => {
    const db = createDb();
    const child = new FakeChildPort();
    const ledger = new SqliteContinuityRunLedger(db);
    const statuses: ContinuityRunStatus[] = [
      "reserved",
      "starting",
      "running",
      "pause_requested",
      "paused",
      "dispatch_uncertain",
      "stale",
    ];
    statuses.forEach((status, index) => {
      ledger.reserve(
        sourceRun({
          run_id: `run-${status}`,
          task_id: `task-${status}`,
          dispatch_id: `dispatch-${index}`,
          status,
        }),
      );
    });

    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });

    expect(child.startCount).toBe(0);
    expect(supervisor.bootReconcile()).toEqual({
      inspected: 0,
      reconciled: 0,
      failed: 0,
      spawnCount: 0,
      runIds: [],
    });
    expect(ledger.get("run-reserved")?.status).toBe("failed");
    expect(ledger.get("run-paused")?.status).toBe("paused");
    for (const status of statuses.filter((value) => value !== "reserved" && value !== "paused")) {
      expect(ledger.get(`run-${status}`)?.status).toBe("stale");
    }
    for (const status of statuses) {
      expect(ledger.listEvents(`run-${status}`).at(-1)?.event_type).toBe("runner.boot_reconciled");
    }
  });

  it("holds an unexpired foreign lease without adoption, then reconciles state-only after expiry", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const ledger = new SqliteContinuityRunLedger(db);
    ledger.reserve(
      sourceRun({
        status: "running",
        pid: IDENTITY.pid,
        process_started_at: IDENTITY.processStartedAt,
        process_fingerprint: IDENTITY.processFingerprint,
        owner_instance_id: "instance-foreign",
        heartbeat_at: "2026-08-29T00:00:00.000Z",
        lease_expires_at: "2026-08-29T00:00:03.000Z",
      }),
    );

    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-local",
      leaseMs: 3_000,
    });

    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "running",
      owner_instance_id: "instance-foreign",
      lease_expires_at: "2026-08-29T00:00:03.000Z",
    });
    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      bootReconciled: false,
      reason: "runner_supervisor_boot_reconcile_pending",
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(supervisor.getRun("run-source-1")?.status).toBe("running");

    await vi.advanceTimersByTimeAsync(1);

    expect(supervisor.getRun("run-source-1")).toMatchObject({
      status: "stale",
      owner_instance_id: null,
      lease_expires_at: null,
    });
    expect(ledger.listEvents("run-source-1").at(-1)?.event_type).toBe("runner.boot_reconciled");
    expect(child.startCount).toBe(0);
    expect(child.probeCount).toBe(0);
    expect(supervisor.getReadiness()).toMatchObject({ ready: true, bootReconciled: true });
  });

  it("keeps readiness closed when any boot reconciliation transaction fails", () => {
    const db = createDb();
    const ledger = new SqliteContinuityRunLedger(db);
    ledger.reserve(sourceRun());
    db.exec(`
      CREATE TRIGGER reject_boot_reconcile
      BEFORE INSERT ON continuity_run_events
      WHEN NEW.event_type = 'runner.boot_reconciled'
      BEGIN
        SELECT RAISE(ABORT, 'test_boot_reconcile_rejected');
      END;
    `);
    const supervisor = new RunnerSupervisor(db, {
      childPort: new FakeChildPort(),
      instanceId: "instance-test",
    });

    expect(supervisor.getReadiness()).toMatchObject({
      ready: false,
      bound: true,
      bootReconciled: true,
      reason: "runner_supervisor_boot_reconcile_failed",
    });
    expect(ledger.get("run-source-1")?.status).toBe("reserved");
  });

  it("reconciles more than one ledger page without spawning", () => {
    const db = createDb();
    const ledger = new SqliteContinuityRunLedger(db);
    for (let index = 0; index < 505; index += 1) {
      ledger.reserve(
        sourceRun({
          run_id: `run-page-${index}`,
          task_id: `task-page-${index}`,
          dispatch_id: `dispatch-page-${index}`,
        }),
      );
    }
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, { childPort: child, instanceId: "instance-test" });

    expect(child.startCount).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) AS count FROM continuity_runs WHERE status = 'failed'").get() as { count: number })
        .count,
    ).toBe(505);
    expect(supervisor.getReadiness().ready).toBe(true);
  });

  it("shuts down local children without respawn and rejects later starts", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "instance-test",
    });
    await supervisor.reserveAndStartSource(sourceRun());

    const result = await supervisor.shutdown("SIGTERM");

    expect(result).toEqual({ paused: 1, reconciled: 0, failed: 0, spawnCount: 0, runIds: ["run-source-1"] });
    expect(child.startCount).toBe(1);
    expect(child.closeCount).toBe(1);
    expect(supervisor.getRun("run-source-1")?.status).toBe("paused");
    await expect(
      supervisor.reserveAndStartSource(sourceRun({ run_id: "run-source-2", dispatch_id: "dispatch-source-2" })),
    ).rejects.toThrow("runner_supervisor_shutting_down");
    expect(child.startCount).toBe(1);
  });

  it("cancels heartbeat timers before shutdown closes local children", async () => {
    const now = useFakeClock();
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now,
      instanceId: "instance-test",
      leaseMs: 3_000,
    });
    await supervisor.reserveAndStartSource(sourceRun());

    await supervisor.shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.probeCount).toBe(0);
    expect(child.closeCount).toBe(1);
    expect(supervisor.getRun("run-source-1")?.status).toBe("paused");
  });

  it("keeps exactly one registry Supervisor per DatabaseSync object", () => {
    const db = createDb();
    const child = new FakeChildPort();
    expect(runnerSupervisorRegistry.peek(db)).toBeNull();
    const first = runnerSupervisorRegistry.getOrCreate(db, { childPort: child, instanceId: "instance-test" });
    const second = runnerSupervisorRegistry.getOrCreate(db);
    expect(second).toBe(first);
    expect(runnerSupervisorRegistry.peek(db)).toBe(first);
    expect(() => runnerSupervisorRegistry.getOrCreate(db, { childPort: new FakeChildPort() })).toThrow(
      "runner_supervisor_already_registered",
    );
  });
});
