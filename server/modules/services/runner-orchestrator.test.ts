import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyContinuityCheckpointSchema } from "../bootstrap/schema/continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "../bootstrap/schema/continuity-run-schema.ts";
import { applyOAuthRunnerIsolationSchema } from "../bootstrap/schema/oauth-runner-isolation.ts";
import { SqliteContinuityRunLedger, type ContinuityRunStatus } from "../workflow/continuity/run-ledger.ts";
import { OfficeRunnerOrchestrator } from "./runner-orchestrator.ts";
import { RunnerSupervisor, type RunnerChildIdentity, type RunnerChildPort } from "./runner-supervisor.ts";

const IDENTITY: RunnerChildIdentity = {
  pid: 5252,
  processStartedAt: "2026-08-29T00:00:00.000Z",
  processFingerprint: "c".repeat(64),
  providerNativeSessionId: "native-office-1",
};

class FakeChildPort implements RunnerChildPort {
  readonly bound = true;
  startCount = 0;
  closeCount = 0;

  start() {
    this.startCount += 1;
    return { ...IDENTITY };
  }

  close() {
    this.closeCount += 1;
    return {
      acknowledged: true,
      alive: false,
      pid: IDENTITY.pid,
      processFingerprint: IDENTITY.processFingerprint,
    };
  }
}

describe("OfficeRunnerOrchestrator compatibility adapter", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    while (databases.length > 0) databases.pop()?.close();
  });

  function createDb() {
    const db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    applyContinuityCheckpointSchema(db);
    applyContinuityRunSchema(db);
    databases.push(db);
    return db;
  }

  function reserve(db: DatabaseSync, status: ContinuityRunStatus = "reserved") {
    return new SqliteContinuityRunLedger(db).reserve({
      run_id: "run-office-1",
      project_id: "project-1",
      task_id: "task-1",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "codex-main",
      dispatch_id: "dispatch-office-1",
      status,
      created_at: "2026-08-29T00:00:00.000Z",
    }).run;
  }

  it("keeps Docker disabled and fails closed through the default unbound Supervisor", async () => {
    const db = createDb();
    const orchestrator = new OfficeRunnerOrchestrator({ db, nowMs: Date.now, broadcast: () => undefined });

    expect(orchestrator.getConfig().dockerEnabled).toBe(false);
    expect(orchestrator.getReadiness()).toMatchObject({ ready: false, reason: "runner_supervisor_unbound" });
    await expect(orchestrator.requestRunner("codex", "codex-main", { kind: "activate" })).rejects.toThrow(
      "runner_supervisor_unbound",
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 0 });
  });

  it("starts only a pre-reserved continuity run and never writes the legacy prompt queue", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "office-test",
    });
    reserve(db);
    const broadcasts: string[] = [];
    const orchestrator = new OfficeRunnerOrchestrator({
      db,
      nowMs: Date.now,
      supervisor,
      broadcast: (event) => broadcasts.push(event),
    });

    const result = await orchestrator.requestRunner("codex", "codex-main", {
      kind: "cli_run",
      runId: "run-office-1",
      dispatchId: "dispatch-office-1",
    });

    expect(child.startCount).toBe(1);
    expect(result).toMatchObject({
      status: "active",
      runner: { status: "active", containerName: "host-native:run-office-1" },
      queueItem: { id: "dispatch-office-1", status: "running" },
    });
    expect(broadcasts).toEqual(["runner.updated", "runner.queue.updated"]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM office_cli_runs").get()).toEqual({ count: 0 });
  });

  it("treats activate as a readiness/projection adapter and never spawns", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, { childPort: child, instanceId: "office-test" });
    const broadcasts: string[] = [];
    const orchestrator = new OfficeRunnerOrchestrator({
      db,
      nowMs: Date.now,
      supervisor,
      broadcast: (event) => broadcasts.push(event),
    });

    const result = await orchestrator.requestRunner("claude", "claude-main", { kind: "activate" });

    expect(result).toEqual({ status: "idle", runner: null, queueItem: null });
    expect(child.startCount).toBe(0);
    expect(child.closeCount).toBe(0);
    expect(broadcasts).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_run_events").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM office_cli_runs").get()).toEqual({ count: 0 });
  });

  it.each([
    ["running", "active", "running"],
    ["paused", "idle", "done"],
    ["completed", "idle", "done"],
    ["failed", "error", "failed"],
  ] as const)(
    "projects persisted %s truth without spawn, queue writes, or broadcasts",
    async (persistedStatus, expectedStatus, expectedQueueStatus) => {
      const db = createDb();
      const child = new FakeChildPort();
      const supervisor = new RunnerSupervisor(db, { childPort: child, instanceId: "office-test" });
      reserve(db, persistedStatus);
      const broadcasts: string[] = [];
      const orchestrator = new OfficeRunnerOrchestrator({
        db,
        nowMs: Date.now,
        supervisor,
        broadcast: (event) => broadcasts.push(event),
      });
      const runsBefore = db.prepare("SELECT * FROM continuity_runs ORDER BY run_id").all();
      const eventsBefore = db.prepare("SELECT * FROM continuity_run_events ORDER BY run_id, sequence").all();

      const result = await orchestrator.requestRunner("codex", "codex-main", { kind: "activate" });

      expect(result.status).toBe(expectedStatus);
      expect(result.runner).toMatchObject({ status: expectedStatus, containerName: "host-native:run-office-1" });
      expect(result.status).toBe(result.runner?.status);
      expect(result.queueItem).toMatchObject({ id: "dispatch-office-1", status: expectedQueueStatus });
      expect(child.startCount).toBe(0);
      expect(child.closeCount).toBe(0);
      expect(broadcasts).toEqual([]);
      expect(db.prepare("SELECT * FROM continuity_runs ORDER BY run_id").all()).toEqual(runsBefore);
      expect(db.prepare("SELECT * FROM continuity_run_events ORDER BY run_id, sequence").all()).toEqual(eventsBefore);
      expect(db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM office_cli_runs").get()).toEqual({ count: 0 });
    },
  );

  it("deactivate delegates to the Supervisor fingerprint-checked pause", async () => {
    const db = createDb();
    const child = new FakeChildPort();
    const supervisor = new RunnerSupervisor(db, {
      childPort: child,
      now: () => new Date("2026-08-29T00:01:00.000Z"),
      instanceId: "office-test",
    });
    reserve(db);
    await supervisor.startReserved("run-office-1", "dispatch-office-1");
    const orchestrator = new OfficeRunnerOrchestrator({
      db,
      nowMs: Date.now,
      supervisor,
      broadcast: () => undefined,
    });

    const result = await orchestrator.deactivateRunner("codex", "codex-main");

    expect(result).toMatchObject({ provider: "codex", accountPoolId: "codex-main", status: "idle" });
    expect(child.closeCount).toBe(1);
    expect(supervisor.getRun("run-office-1")?.status).toBe("paused");
  });
});
