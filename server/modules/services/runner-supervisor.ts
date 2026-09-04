import type { DatabaseSync } from "node:sqlite";
import {
  SqliteContinuityRunLedger,
  type ContinuityRun,
  type ContinuityRunStatus,
  type ReserveContinuityRunInput,
} from "../workflow/continuity/run-ledger.ts";

export const RUNNER_SUPERVISOR_UNBOUND = "runner_supervisor_unbound";

type MaybePromise<T> = T | Promise<T>;

export interface RunnerChildIdentity {
  pid: number;
  processStartedAt: string;
  processFingerprint: string;
  providerNativeSessionId: string;
}

export interface RunnerChildStartRequest {
  run: ContinuityRun;
  mode: "start" | "resume";
}

export interface RunnerChildCloseRequest {
  run: ContinuityRun;
  identity: RunnerChildIdentity;
  reason: string;
}

export interface RunnerChildCloseAck {
  acknowledged: boolean;
  alive: boolean;
  pid: number;
  processFingerprint: string;
}

export interface RunnerChildProbeRequest {
  run: ContinuityRun;
  identity: RunnerChildIdentity;
}

export interface RunnerChildProbeResult {
  alive: boolean;
  pid: number;
  processStartedAt: string;
  processFingerprint: string;
}

/**
 * Process boundary owned by the host runtime. Production intentionally uses
 * the unbound port until a separately approved native provider adapter is
 * installed. Tests inject a deterministic fake port.
 */
export interface RunnerChildPort {
  readonly bound: boolean;
  start(request: RunnerChildStartRequest): MaybePromise<RunnerChildIdentity>;
  close(request: RunnerChildCloseRequest): MaybePromise<RunnerChildCloseAck>;
  /** Running children must provide this before their first lease renewal. */
  probe?(request: RunnerChildProbeRequest): MaybePromise<RunnerChildProbeResult>;
}

export interface RunnerSupervisorOptions {
  childPort?: RunnerChildPort;
  now?: () => Date;
  instanceId?: string;
  leaseMs?: number;
}

export interface RunnerReadiness {
  ready: boolean;
  bound: boolean;
  bootReconciled: boolean;
  bootReconcileFailures: number;
  shuttingDown: boolean;
  instanceId: string;
  activeRunIds: string[];
  reason: string | null;
}

export interface RunnerBootReconcileResult {
  inspected: number;
  reconciled: number;
  failed: number;
  spawnCount: 0;
  runIds: string[];
}

export interface RunnerShutdownResult {
  paused: number;
  reconciled: number;
  failed: number;
  spawnCount: 0;
  runIds: string[];
}

const NONTERMINAL_STATUSES: readonly ContinuityRunStatus[] = [
  "reserved",
  "starting",
  "running",
  "pause_requested",
  "paused",
  "dispatch_uncertain",
  "stale",
];

const STARTABLE_STATUSES = new Set<ContinuityRunStatus>(["reserved", "paused"]);

const PROCESS_FINGERPRINT = /^[a-f0-9]{64}$/;

type HeartbeatFailureKind = "dead" | "identity_mismatch" | "probe_failed" | "cas_conflict";

type RunnerFailureCode =
  | "child_start_failed"
  | "child_close_failed"
  | "child_pause_failed"
  | "heartbeat_child_dead"
  | "heartbeat_identity_mismatch"
  | "heartbeat_probe_failed"
  | "heartbeat_cas_conflict";

export const unboundRunnerChildPort: RunnerChildPort = Object.freeze({
  bound: false,
  start(): never {
    throw new Error(RUNNER_SUPERVISOR_UNBOUND);
  },
  close(): never {
    throw new Error(RUNNER_SUPERVISOR_UNBOUND);
  },
});

/**
 * Single durable authority for a DatabaseSync runtime.
 *
 * The ledger CAS is acquired before a child is spawned. An in-memory promise
 * map then collapses concurrent calls in this process onto exactly one spawn.
 * Durable starting/running rows without a local promise/handle are never
 * adopted or respawned: boot reconciliation marks them stale instead.
 */
export class RunnerSupervisor {
  private readonly db: DatabaseSync;
  private readonly ledger: SqliteContinuityRunLedger;
  private readonly childPort: RunnerChildPort;
  private readonly now: () => Date;
  private readonly instanceId: string;
  private readonly leaseMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly starts = new Map<string, Promise<ContinuityRun>>();
  private readonly pauses = new Map<string, Promise<ContinuityRun>>();
  private readonly children = new Map<string, RunnerChildIdentity>();
  private readonly uncertainChildren = new Set<string>();
  private readonly heartbeatFailures = new Set<string>();
  private readonly heartbeatTimers = new Map<string, { generation: number; timer: ReturnType<typeof setInterval> }>();
  private readonly heartbeatInFlight = new Set<string>();
  private readonly foreignLeaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private heartbeatGeneration = 0;
  private bootReconcileStarted = false;
  private bootReconciled = false;
  private bootReconcileFailed = 0;
  private shuttingDown = false;
  private shutdownPromise: Promise<RunnerShutdownResult> | null = null;

  constructor(db: DatabaseSync, options: RunnerSupervisorOptions = {}) {
    this.db = db;
    this.ledger = new SqliteContinuityRunLedger(db);
    this.childPort = options.childPort ?? unboundRunnerChildPort;
    this.now = options.now ?? (() => new Date());
    this.instanceId = options.instanceId?.trim() || `runner-supervisor:${process.pid}:${Date.now()}`;
    this.leaseMs = normalizeLeaseMs(options.leaseMs);
    this.heartbeatIntervalMs = Math.max(1, Math.floor(this.leaseMs / 3));
    this.bootReconcile();
  }

  getReadiness(): RunnerReadiness {
    const bound = this.childPort.bound === true;
    const ready =
      bound &&
      this.bootReconciled &&
      this.bootReconcileFailed === 0 &&
      this.uncertainChildren.size === 0 &&
      this.heartbeatFailures.size === 0 &&
      (this.children.size === 0 || typeof this.childPort.probe === "function") &&
      !this.shuttingDown;
    return {
      ready,
      bound,
      bootReconciled: this.bootReconciled,
      bootReconcileFailures: this.bootReconcileFailed,
      shuttingDown: this.shuttingDown,
      instanceId: this.instanceId,
      activeRunIds: [...this.children.keys()].sort(),
      reason: ready
        ? null
        : !bound
          ? RUNNER_SUPERVISOR_UNBOUND
          : this.bootReconcileFailed > 0
            ? "runner_supervisor_boot_reconcile_failed"
            : this.uncertainChildren.size > 0 ||
                this.heartbeatFailures.size > 0 ||
                (this.children.size > 0 && typeof this.childPort.probe !== "function")
              ? "runner_supervisor_child_state_uncertain"
              : this.shuttingDown
                ? "runner_supervisor_shutting_down"
                : "runner_supervisor_boot_reconcile_pending",
    };
  }

  getRun(runId: string): ContinuityRun | null {
    return this.ledger.get(requireValue(runId, "continuity_run_id_required"));
  }

  listRuns(statuses: readonly ContinuityRunStatus[] = NONTERMINAL_STATUSES): ContinuityRun[] {
    return this.ledger.listByStatuses(statuses, 500);
  }

  async reserveAndStartSource(input: ReserveContinuityRunInput): Promise<ContinuityRun> {
    // This gate is intentionally before the durable reservation. An unbound
    // production runtime must leave neither a run row nor a child side effect.
    this.assertCanStart();
    if (input.checkpoint_id !== undefined && input.checkpoint_id !== null) {
      throw new Error("runner_source_checkpoint_forbidden");
    }
    if (input.parent_run_id !== undefined && input.parent_run_id !== null) {
      throw new Error("runner_source_parent_forbidden");
    }
    const projectId = requireValue(input.project_id ?? "", "continuity_run_project_required");
    const taskId = requireValue(input.task_id ?? "", "continuity_run_task_required");
    const dispatchId = requireValue(input.dispatch_id, "continuity_run_dispatch_required");
    const reservation = this.ledger.withImmediateTransaction(() => {
      const activeRoot = this.ledger.getActiveRootForTask(projectId, taskId);
      if (activeRoot && activeRoot.dispatch_id !== dispatchId) {
        throw new Error("continuity_source_ownership_conflict");
      }
      return this.ledger.reserve(input);
    });
    if (reservation.run.run_id !== input.run_id.trim()) {
      throw new Error("continuity_dispatch_ownership_conflict");
    }
    assertReservationOwnership(reservation.run, input);
    if (reservation.status === "dispatch_exists") return reservation.run;
    return this.startReserved(reservation.run.run_id, reservation.run.dispatch_id);
  }

  startReserved(runId: string, dispatchId?: string): Promise<ContinuityRun> {
    this.assertCanStart();
    const normalizedRunId = requireValue(runId, "continuity_run_id_required");
    const inFlight = this.starts.get(normalizedRunId);
    if (inFlight) return inFlight;

    const operation = this.startReservedOnce(normalizedRunId, dispatchId);
    this.starts.set(normalizedRunId, operation);
    void operation
      .finally(() => {
        if (this.starts.get(normalizedRunId) === operation) this.starts.delete(normalizedRunId);
      })
      .catch(() => undefined);
    return operation;
  }

  pause(runId: string, reason = "handoff"): Promise<ContinuityRun> {
    const normalizedRunId = requireValue(runId, "continuity_run_id_required");
    const existing = this.pauses.get(normalizedRunId);
    if (existing) return existing;
    const operation = this.pauseAfterStart(normalizedRunId, reason);
    this.pauses.set(normalizedRunId, operation);
    void operation
      .finally(() => {
        if (this.pauses.get(normalizedRunId) === operation) this.pauses.delete(normalizedRunId);
      })
      .catch(() => undefined);
    return operation;
  }

  private async pauseAfterStart(runId: string, reason: string): Promise<ContinuityRun> {
    const normalizedRunId = requireValue(runId, "continuity_run_id_required");
    const starting = this.starts.get(normalizedRunId);
    if (starting) await starting;
    return this.pauseRunning(normalizedRunId, reason);
  }

  /**
   * Reconciles durable state after process boot without calling the child port.
   * Every pre-existing nonterminal row receives a durable reconciliation event;
   * no row is adopted and spawnCount is structurally fixed at zero.
   */
  bootReconcile(): RunnerBootReconcileResult {
    if (this.bootReconcileStarted) {
      return { inspected: 0, reconciled: 0, failed: 0, spawnCount: 0, runIds: [] };
    }
    this.bootReconcileStarted = true;
    const placeholders = NONTERMINAL_STATUSES.map(() => "?").join(",");
    const snapshots = this.db
      .prepare(
        `SELECT run_id FROM continuity_runs
         WHERE status IN (${placeholders})
         ORDER BY updated_at ASC, run_id ASC`,
      )
      .all(...NONTERMINAL_STATUSES) as Array<{ run_id: string }>;
    const rows = snapshots
      .map(({ run_id }) => this.ledger.get(run_id))
      .filter((run): run is ContinuityRun => run !== null);
    let reconciled = 0;
    let failed = 0;
    const runIds: string[] = [];
    for (const row of rows) {
      if (this.hasUnexpiredForeignLease(row)) {
        this.scheduleForeignLeaseReconcile(row);
        continue;
      }
      try {
        this.reconcileBootRow(row);
        reconciled += 1;
        runIds.push(row.run_id);
      } catch {
        failed += 1;
      }
    }
    this.bootReconcileFailed = failed;
    this.bootReconciled = this.foreignLeaseTimers.size === 0;
    return { inspected: rows.length, reconciled, failed, spawnCount: 0, runIds };
  }

  private reconcileBootRow(row: ContinuityRun): void {
    const nextStatus = bootStatus(row.status);
    const occurredAt = this.isoNow();
    this.ledger.transitionWithEvent({
      run_id: row.run_id,
      expected_state_version: row.state_version,
      expected_status: row.status,
      status: nextStatus,
      pid: nextStatus === "paused" ? row.pid : null,
      process_started_at: nextStatus === "paused" ? row.process_started_at : null,
      process_fingerprint: nextStatus === "paused" ? row.process_fingerprint : null,
      owner_instance_id: null,
      lease_expires_at: null,
      heartbeat_at: occurredAt,
      event_type: "runner.boot_reconciled",
      payload: {
        from_status: row.status,
        to_status: nextStatus,
        adopted: false,
        spawn_count: 0,
      },
      occurred_at: occurredAt,
    });
  }

  private hasUnexpiredForeignLease(row: ContinuityRun): boolean {
    if (!row.owner_instance_id || row.owner_instance_id === this.instanceId || !row.lease_expires_at) return false;
    const expiresAt = Date.parse(row.lease_expires_at);
    return Number.isFinite(expiresAt) && expiresAt > this.nowMs();
  }

  private scheduleForeignLeaseReconcile(row: ContinuityRun): void {
    const expiresAt = Date.parse(row.lease_expires_at ?? "");
    if (!Number.isFinite(expiresAt)) return;
    const existing = this.foreignLeaseTimers.get(row.run_id);
    if (existing) clearTimeout(existing);
    const delayMs = Math.max(1, Math.min(2_147_483_647, expiresAt - this.nowMs()));
    const timer = setTimeout(() => {
      this.foreignLeaseTimers.delete(row.run_id);
      if (this.shuttingDown) return;
      const current = this.ledger.get(row.run_id);
      if (!current || !NONTERMINAL_STATUSES.includes(current.status)) {
        this.completePendingBootReconcile();
        return;
      }
      if (this.hasUnexpiredForeignLease(current)) {
        this.scheduleForeignLeaseReconcile(current);
        return;
      }
      try {
        this.reconcileBootRow(current);
      } catch {
        this.bootReconcileFailed += 1;
      }
      this.completePendingBootReconcile();
    }, delayMs);
    timer.unref?.();
    this.foreignLeaseTimers.set(row.run_id, timer);
  }

  private completePendingBootReconcile(): void {
    if (this.foreignLeaseTimers.size === 0) this.bootReconciled = true;
  }

  shutdown(signal = "shutdown"): Promise<RunnerShutdownResult> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    this.cancelAllHeartbeatTimers();
    this.cancelForeignLeaseTimers();
    this.shutdownPromise = this.shutdownOnce(signal);
    return this.shutdownPromise;
  }

  private async startReservedOnce(runId: string, dispatchId?: string): Promise<ContinuityRun> {
    let run = this.ledger.get(runId);
    if (!run) throw new Error("continuity_run_missing");
    if (dispatchId !== undefined && run.dispatch_id !== requireValue(dispatchId, "continuity_run_dispatch_required")) {
      throw new Error("continuity_run_dispatch_mismatch");
    }
    if (run.status === "running") {
      if (!this.children.has(runId)) throw new Error("runner_start_ownership_uncertain");
      return run;
    }
    if (run.status === "starting") throw new Error("runner_start_ownership_uncertain");
    if (!STARTABLE_STATUSES.has(run.status)) {
      throw new Error(`runner_run_not_startable:${run.status}`);
    }

    const occurredAt = this.isoNow();
    run = this.ledger.transitionWithEvent({
      run_id: run.run_id,
      expected_state_version: run.state_version,
      expected_status: run.status,
      status: "starting",
      owner_instance_id: this.instanceId,
      lease_expires_at: this.leaseExpiry(),
      heartbeat_at: occurredAt,
      event_type: "runner.starting",
      payload: { dispatch_id: run.dispatch_id, provider: run.provider },
      occurred_at: occurredAt,
    }).run;

    let childIdentity: RunnerChildIdentity | null = null;
    try {
      const identity = validateChildIdentity(
        await this.childPort.start({
          run,
          mode: run.provider_native_session_id ? "resume" : "start",
        }),
      );
      childIdentity = identity;
      const startedAt = this.isoNow();
      run = this.ledger.transitionWithEvent({
        run_id: run.run_id,
        expected_state_version: run.state_version,
        expected_status: "starting",
        status: "running",
        provider_native_session_id: identity.providerNativeSessionId,
        pid: identity.pid,
        process_started_at: identity.processStartedAt,
        process_fingerprint: identity.processFingerprint,
        owner_instance_id: this.instanceId,
        lease_expires_at: this.leaseExpiry(),
        heartbeat_at: startedAt,
        event_type: "runner.child_started",
        payload: {
          pid: identity.pid,
          process_started_at: identity.processStartedAt,
          process_fingerprint: identity.processFingerprint,
          provider_native_session_id: identity.providerNativeSessionId,
        },
        occurred_at: startedAt,
      }).run;
      this.children.set(run.run_id, identity);
      if (!this.shuttingDown) this.scheduleHeartbeat(run.run_id);
      if (this.shuttingDown) return this.pauseRunning(run.run_id, "shutdown_after_start");
      return run;
    } catch (error) {
      const latest = this.ledger.get(run.run_id);
      let closeError: unknown = null;
      let childConfirmedDead = false;
      if (childIdentity) {
        try {
          const ack = await this.childPort.close({
            run: latest ?? run,
            identity: childIdentity,
            reason: "start_commit_failed",
          });
          validateCloseAck(ack, childIdentity);
          childConfirmedDead = true;
        } catch (closeFailure) {
          closeError = closeFailure;
        }
      }
      if (childIdentity && !childConfirmedDead) {
        this.children.set(run.run_id, childIdentity);
        this.uncertainChildren.add(run.run_id);
      }
      if (latest?.status === "starting") {
        this.ledger.transitionWithEvent({
          run_id: latest.run_id,
          expected_state_version: latest.state_version,
          expected_status: "starting",
          status: "dispatch_uncertain",
          owner_instance_id: null,
          lease_expires_at: null,
          heartbeat_at: this.isoNow(),
          event_type: "runner.start_failed",
          payload: {
            failure_code: runnerFailureCode(closeError ? "child_close_failed" : "child_start_failed"),
            child_identity_received: childIdentity !== null,
            close_acknowledged: childIdentity !== null && closeError === null,
          },
          occurred_at: this.isoNow(),
        });
      }
      throw error;
    }
  }

  private async pauseRunning(runId: string, reason: string): Promise<ContinuityRun> {
    this.cancelHeartbeat(runId);
    let run = this.ledger.get(runId);
    if (!run) throw new Error("continuity_run_missing");
    if (run.status === "paused") return run;
    if (run.status !== "running" && run.status !== "pause_requested") {
      throw new Error(`runner_run_not_pausable:${run.status}`);
    }
    const identity = this.children.get(runId);

    let childConfirmedDead = false;
    try {
      if (!identity) throw new Error("runner_pause_child_identity_unavailable");
      assertLedgerIdentity(run, identity);

      if (run.status === "running") {
        const requestedAt = this.isoNow();
        run = this.ledger.transitionWithEvent({
          run_id: run.run_id,
          expected_state_version: run.state_version,
          expected_status: "running",
          status: "pause_requested",
          heartbeat_at: requestedAt,
          event_type: "runner.pause_requested",
          payload: { reason, pid: identity.pid, process_fingerprint: identity.processFingerprint },
          occurred_at: requestedAt,
        }).run;
      }

      const ack = await this.childPort.close({ run, identity, reason });
      validateCloseAck(ack, identity);
      childConfirmedDead = true;
      const pausedAt = this.isoNow();
      const paused = this.ledger.transitionWithEvent({
        run_id: run.run_id,
        expected_state_version: run.state_version,
        expected_status: "pause_requested",
        status: "paused",
        owner_instance_id: null,
        lease_expires_at: null,
        heartbeat_at: pausedAt,
        event_type: "runner.pause_acknowledged",
        payload: {
          reason,
          acknowledged: true,
          alive: false,
          pid: ack.pid,
          process_fingerprint: ack.processFingerprint,
        },
        occurred_at: pausedAt,
      }).run;
      this.children.delete(runId);
      this.uncertainChildren.delete(runId);
      return paused;
    } catch (error) {
      let foreignOwnershipObserved = false;
      try {
        this.ledger.withImmediateTransaction(() => {
          const latest = this.ledger.get(runId);
          if (!latest || (latest.status !== "running" && latest.status !== "pause_requested")) return;
          const occurredAt = this.isoNow();
          if (latest.owner_instance_id === this.instanceId) {
            this.ledger.transitionWithEventInTransaction({
              run_id: latest.run_id,
              expected_state_version: latest.state_version,
              expected_status: latest.status,
              status: latest.status === "running" ? "dispatch_uncertain" : "stale",
              owner_instance_id: null,
              lease_expires_at: null,
              heartbeat_at: occurredAt,
              event_type: "runner.pause_failed",
              payload: { reason, failure_code: runnerFailureCode("child_pause_failed") },
              occurred_at: occurredAt,
            });
          } else {
            foreignOwnershipObserved = latest.owner_instance_id !== null;
            this.ledger.appendEvent({
              run_id: latest.run_id,
              sequence: latest.last_event_sequence + 1,
              event_type: "runner.pause_failed",
              payload: {
                reason,
                failure_code: runnerFailureCode("child_pause_failed"),
                preserved_status: latest.status,
                ownership_preserved: true,
              },
              occurred_at: occurredAt,
            });
          }
        });
      } catch {
        // The in-memory uncertain-child gate remains closed if persistence races.
      }
      if (childConfirmedDead) {
        this.children.delete(runId);
        this.uncertainChildren.delete(runId);
      } else {
        if (foreignOwnershipObserved) this.children.delete(runId);
        this.uncertainChildren.add(runId);
      }
      throw error;
    }
  }

  private async shutdownOnce(signal: string): Promise<RunnerShutdownResult> {
    const inFlight = [...this.starts.values()];
    if (inFlight.length > 0) await Promise.allSettled(inFlight);
    const runIds = [...this.children.keys()].sort();
    let paused = 0;
    let reconciled = 0;
    let failed = 0;
    for (const runId of runIds) {
      try {
        const run = this.ledger.get(runId);
        if (run?.status === "paused") {
          paused += 1;
          continue;
        }
        if (run?.status === "running" || run?.status === "pause_requested") {
          await this.pause(runId, `shutdown:${signal}`);
          paused += 1;
        } else {
          await this.closeUncertainChild(runId, `shutdown:${signal}`);
          reconciled += 1;
        }
      } catch {
        failed += 1;
      }
    }
    return { paused, reconciled, failed, spawnCount: 0, runIds };
  }

  private async closeUncertainChild(runId: string, reason: string): Promise<void> {
    this.cancelHeartbeat(runId);
    const identity = this.children.get(runId);
    const run = this.ledger.get(runId);
    if (!identity || !run) throw new Error("runner_shutdown_child_identity_unavailable");
    const ack = await this.childPort.close({ run, identity, reason });
    validateCloseAck(ack, identity);
    if (NONTERMINAL_STATUSES.includes(run.status)) {
      const nextStatus = run.status === "reserved" ? "failed" : run.status === "paused" ? "paused" : "stale";
      this.ledger.transitionWithEvent({
        run_id: run.run_id,
        expected_state_version: run.state_version,
        expected_status: run.status,
        status: nextStatus,
        owner_instance_id: null,
        lease_expires_at: null,
        heartbeat_at: this.isoNow(),
        event_type: "runner.shutdown_child_reconciled",
        payload: {
          reason,
          acknowledged: true,
          alive: false,
          pid: ack.pid,
          process_fingerprint: ack.processFingerprint,
        },
        occurred_at: this.isoNow(),
      });
    } else {
      this.ledger.appendEvent({
        run_id: run.run_id,
        sequence: run.last_event_sequence + 1,
        event_type: "runner.shutdown_child_reconciled",
        payload: {
          reason,
          acknowledged: true,
          alive: false,
          pid: ack.pid,
          process_fingerprint: ack.processFingerprint,
          terminal_status: run.status,
        },
        occurred_at: this.isoNow(),
      });
    }
    this.children.delete(runId);
    this.uncertainChildren.delete(runId);
  }

  private scheduleHeartbeat(runId: string): void {
    this.cancelHeartbeat(runId);
    const generation = ++this.heartbeatGeneration;
    const timer = setInterval(() => {
      void this.heartbeatTick(runId, generation).catch(() => undefined);
    }, this.heartbeatIntervalMs);
    timer.unref?.();
    this.heartbeatTimers.set(runId, { generation, timer });
  }

  private cancelHeartbeat(runId: string): void {
    const scheduled = this.heartbeatTimers.get(runId);
    if (!scheduled) return;
    clearInterval(scheduled.timer);
    this.heartbeatTimers.delete(runId);
  }

  private cancelAllHeartbeatTimers(): void {
    for (const runId of [...this.heartbeatTimers.keys()]) this.cancelHeartbeat(runId);
  }

  private cancelForeignLeaseTimers(): void {
    for (const timer of this.foreignLeaseTimers.values()) clearTimeout(timer);
    this.foreignLeaseTimers.clear();
  }

  private isHeartbeatCurrent(runId: string, generation: number): boolean {
    return this.heartbeatTimers.get(runId)?.generation === generation && !this.shuttingDown;
  }

  private async heartbeatTick(runId: string, generation: number): Promise<void> {
    if (!this.isHeartbeatCurrent(runId, generation) || this.heartbeatInFlight.has(runId)) return;
    this.heartbeatInFlight.add(runId);
    try {
      const run = this.ledger.get(runId);
      const identity = this.children.get(runId);
      if (!run || run.status !== "running") {
        this.cancelHeartbeat(runId);
        return;
      }
      if (!identity) {
        this.recordHeartbeatFailure(runId, "probe_failed");
        return;
      }
      if (run.owner_instance_id !== this.instanceId || !ledgerIdentityMatches(run, identity)) {
        this.recordHeartbeatFailure(runId, "cas_conflict");
        return;
      }
      if (!this.childPort.probe) {
        this.recordHeartbeatFailure(runId, "probe_failed");
        return;
      }

      let probe: RunnerChildProbeResult;
      try {
        probe = validateProbeResult(await this.childPort.probe({ run, identity }));
      } catch {
        if (this.isHeartbeatCurrent(runId, generation)) this.recordHeartbeatFailure(runId, "probe_failed");
        return;
      }
      if (!this.isHeartbeatCurrent(runId, generation)) return;

      if (!probeIdentityMatches(probe, identity)) {
        this.recordHeartbeatFailure(runId, "identity_mismatch", probe, identity);
        return;
      }
      if (!probe.alive) {
        this.recordHeartbeatFailure(runId, "dead");
        return;
      }

      try {
        this.persistHeartbeat(run, identity);
      } catch (error) {
        this.recordHeartbeatFailure(runId, isHeartbeatCasConflict(error) ? "cas_conflict" : "probe_failed");
      }
    } finally {
      this.heartbeatInFlight.delete(runId);
    }
  }

  private persistHeartbeat(snapshot: ContinuityRun, identity: RunnerChildIdentity): ContinuityRun {
    const occurredAt = this.isoNow();
    const leaseExpiresAt = new Date(Date.parse(occurredAt) + this.leaseMs).toISOString();
    return this.ledger.withImmediateTransaction(() => {
      const current = this.ledger.get(snapshot.run_id);
      if (
        !current ||
        current.status !== "running" ||
        current.state_version !== snapshot.state_version ||
        current.owner_instance_id !== this.instanceId ||
        !ledgerIdentityMatches(current, identity)
      ) {
        throw new Error("runner_heartbeat_cas_conflict");
      }
      const update = this.db
        .prepare(
          `UPDATE continuity_runs
           SET state_version = state_version + 1,
               owner_instance_id = ?, heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
           WHERE run_id = ?
             AND state_version = ?
             AND status = 'running'
             AND owner_instance_id = ?
             AND pid = ?
             AND process_started_at = ?
             AND process_fingerprint = ?`,
        )
        .run(
          this.instanceId,
          occurredAt,
          leaseExpiresAt,
          occurredAt,
          current.run_id,
          snapshot.state_version,
          this.instanceId,
          identity.pid,
          identity.processStartedAt,
          identity.processFingerprint,
        );
      if (Number(update.changes) !== 1) throw new Error("runner_heartbeat_cas_conflict");

      this.ledger.appendEvent({
        run_id: current.run_id,
        sequence: current.last_event_sequence + 1,
        event_type: "runner.heartbeat",
        payload: {
          pid: identity.pid,
          process_started_at: identity.processStartedAt,
          process_fingerprint: identity.processFingerprint,
          owner_instance_id: this.instanceId,
        },
        occurred_at: occurredAt,
      });
      const renewed = this.ledger.get(current.run_id);
      if (!renewed) throw new Error("continuity_run_missing");
      return renewed;
    });
  }

  private recordHeartbeatFailure(
    runId: string,
    kind: HeartbeatFailureKind,
    observed?: RunnerChildProbeResult,
    expected?: RunnerChildIdentity,
  ): void {
    this.cancelHeartbeat(runId);
    this.heartbeatFailures.add(runId);
    const identity = this.children.get(runId);
    if (kind === "dead") {
      this.children.delete(runId);
      this.uncertainChildren.delete(runId);
    } else if (identity) {
      this.uncertainChildren.add(runId);
    }

    const occurredAt = this.isoNow();
    const eventType =
      kind === "dead"
        ? "runner.heartbeat_child_dead"
        : kind === "identity_mismatch"
          ? "runner.heartbeat_identity_mismatch"
          : kind === "cas_conflict"
            ? "runner.heartbeat_cas_conflict"
            : "runner.heartbeat_probe_failed";
    const payload = {
      pid_matches: observed && expected ? observed.pid === expected.pid : null,
      process_started_at_matches: observed && expected ? observed.processStartedAt === expected.processStartedAt : null,
      process_fingerprint_matches:
        observed && expected ? observed.processFingerprint === expected.processFingerprint : null,
      failure_code: heartbeatFailureCode(kind),
    };
    let foreignOwnershipObserved = false;
    try {
      this.ledger.withImmediateTransaction(() => {
        const current = this.ledger.get(runId);
        if (!current) return;
        const locallyOwned =
          current.owner_instance_id === this.instanceId &&
          identity !== undefined &&
          ledgerIdentityMatches(current, identity);
        if (current.status === "running" && locallyOwned) {
          const nextStatus: ContinuityRunStatus = kind === "dead" ? "stale" : "dispatch_uncertain";
          this.ledger.transitionWithEventInTransaction({
            run_id: current.run_id,
            expected_state_version: current.state_version,
            expected_status: "running",
            status: nextStatus,
            pid: kind === "dead" ? null : undefined,
            process_started_at: kind === "dead" ? null : undefined,
            process_fingerprint: kind === "dead" ? null : undefined,
            owner_instance_id: null,
            lease_expires_at: null,
            heartbeat_at: occurredAt,
            event_type: eventType,
            payload,
            occurred_at: occurredAt,
          });
          return;
        }
        foreignOwnershipObserved =
          current.status === "running" &&
          current.owner_instance_id !== null &&
          current.owner_instance_id !== this.instanceId;
        this.ledger.appendEvent({
          run_id: current.run_id,
          sequence: current.last_event_sequence + 1,
          event_type: eventType,
          payload: {
            ...payload,
            preserved_status: current.status,
            ownership_preserved: current.status === "running" && !locallyOwned,
          },
          occurred_at: occurredAt,
        });
      });
    } catch {
      // The in-memory failure gate remains closed even if persistence itself failed.
    }
    if (foreignOwnershipObserved) {
      // A different supervisor now owns the durable lease. Do not close or
      // otherwise mutate the process that the foreign owner may be managing.
      this.children.delete(runId);
      this.uncertainChildren.add(runId);
    }
  }

  private assertCanStart(): void {
    if (!this.childPort.bound) throw new Error(RUNNER_SUPERVISOR_UNBOUND);
    if (!this.bootReconciled) throw new Error("runner_supervisor_boot_reconcile_pending");
    if (this.bootReconcileFailed > 0) throw new Error("runner_supervisor_boot_reconcile_failed");
    if (
      this.uncertainChildren.size > 0 ||
      this.heartbeatFailures.size > 0 ||
      (this.children.size > 0 && typeof this.childPort.probe !== "function")
    ) {
      throw new Error("runner_supervisor_child_state_uncertain");
    }
    if (this.shuttingDown) throw new Error("runner_supervisor_shutting_down");
  }

  private isoNow(): string {
    return new Date(this.nowMs()).toISOString();
  }

  private nowMs(): number {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new Error("runner_supervisor_clock_invalid");
    return value.getTime();
  }

  private leaseExpiry(): string {
    return new Date(this.nowMs() + this.leaseMs).toISOString();
  }
}

const supervisors = new WeakMap<DatabaseSync, RunnerSupervisor>();
const supervisorChildPorts = new WeakMap<DatabaseSync, RunnerChildPort>();

export const runnerSupervisorRegistry = Object.freeze({
  getOrCreate(db: DatabaseSync, options: RunnerSupervisorOptions = {}): RunnerSupervisor {
    const existing = supervisors.get(db);
    if (existing) {
      if (options.childPort && supervisorChildPorts.get(db) !== options.childPort) {
        throw new Error("runner_supervisor_already_registered");
      }
      return existing;
    }
    const supervisor = new RunnerSupervisor(db, options);
    supervisors.set(db, supervisor);
    supervisorChildPorts.set(db, options.childPort ?? unboundRunnerChildPort);
    return supervisor;
  },
  peek(db: DatabaseSync): RunnerSupervisor | null {
    return supervisors.get(db) ?? null;
  },
});

function normalizeLeaseMs(value: number | undefined): number {
  if (value === undefined) return 30_000;
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
    throw new Error("runner_supervisor_lease_invalid");
  }
  return value;
}

function requireValue(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function validateChildIdentity(identity: RunnerChildIdentity): RunnerChildIdentity {
  if (!Number.isSafeInteger(identity.pid) || identity.pid <= 0) throw new Error("runner_child_pid_invalid");
  if (!Number.isFinite(Date.parse(identity.processStartedAt))) {
    throw new Error("runner_child_process_started_at_invalid");
  }
  const fingerprint = identity.processFingerprint.trim().toLowerCase();
  if (!PROCESS_FINGERPRINT.test(fingerprint)) throw new Error("runner_child_process_fingerprint_invalid");
  const sessionId = requireValue(identity.providerNativeSessionId, "runner_child_native_session_id_required");
  return {
    pid: identity.pid,
    processStartedAt: new Date(identity.processStartedAt).toISOString(),
    processFingerprint: fingerprint,
    providerNativeSessionId: sessionId,
  };
}

function validateCloseAck(ack: RunnerChildCloseAck, identity: RunnerChildIdentity): void {
  if (!ack.acknowledged) throw new Error("runner_pause_not_acknowledged");
  if (ack.alive) throw new Error("runner_pause_child_still_alive");
  if (ack.pid !== identity.pid) throw new Error("runner_pause_pid_mismatch");
  if (ack.processFingerprint.trim().toLowerCase() !== identity.processFingerprint) {
    throw new Error("runner_pause_process_fingerprint_mismatch");
  }
}

function validateProbeResult(result: RunnerChildProbeResult): RunnerChildProbeResult {
  if (typeof result?.alive !== "boolean") throw new Error("runner_child_probe_alive_invalid");
  if (!Number.isSafeInteger(result.pid) || result.pid <= 0) throw new Error("runner_child_probe_pid_invalid");
  if (!Number.isFinite(Date.parse(result.processStartedAt))) {
    throw new Error("runner_child_probe_process_started_at_invalid");
  }
  const fingerprint = result.processFingerprint.trim().toLowerCase();
  if (!PROCESS_FINGERPRINT.test(fingerprint)) throw new Error("runner_child_probe_process_fingerprint_invalid");
  return {
    alive: result.alive,
    pid: result.pid,
    processStartedAt: new Date(result.processStartedAt).toISOString(),
    processFingerprint: fingerprint,
  };
}

function probeIdentityMatches(probe: RunnerChildProbeResult, identity: RunnerChildIdentity): boolean {
  return (
    probe.pid === identity.pid &&
    probe.processStartedAt === identity.processStartedAt &&
    probe.processFingerprint === identity.processFingerprint
  );
}

function ledgerIdentityMatches(run: ContinuityRun, identity: RunnerChildIdentity): boolean {
  return (
    run.pid === identity.pid &&
    run.process_started_at === identity.processStartedAt &&
    run.process_fingerprint === identity.processFingerprint
  );
}

function isHeartbeatCasConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "runner_heartbeat_cas_conflict" || error.message === "continuity_run_state_stale")
  );
}

function runnerFailureCode(code: RunnerFailureCode): RunnerFailureCode {
  return code;
}

function heartbeatFailureCode(kind: HeartbeatFailureKind): RunnerFailureCode {
  if (kind === "dead") return "heartbeat_child_dead";
  if (kind === "identity_mismatch") return "heartbeat_identity_mismatch";
  if (kind === "cas_conflict") return "heartbeat_cas_conflict";
  return "heartbeat_probe_failed";
}

function assertLedgerIdentity(run: ContinuityRun, identity: RunnerChildIdentity): void {
  if (run.pid !== identity.pid) throw new Error("runner_pause_pid_mismatch");
  if (run.process_fingerprint !== identity.processFingerprint) {
    throw new Error("runner_pause_process_fingerprint_mismatch");
  }
  if (run.process_started_at !== identity.processStartedAt) {
    throw new Error("runner_pause_process_started_at_mismatch");
  }
}

function assertReservationOwnership(run: ContinuityRun, input: ReserveContinuityRunInput): void {
  const projectId = requireValue(input.project_id ?? "", "continuity_run_project_required");
  const taskId = requireValue(input.task_id ?? "", "continuity_run_task_required");
  if (
    run.project_id !== projectId ||
    run.task_id !== taskId ||
    run.provider !== input.provider ||
    run.account_pool_id !== input.account_pool_id.trim()
  ) {
    throw new Error("continuity_dispatch_ownership_conflict");
  }
}

function bootStatus(status: ContinuityRunStatus): ContinuityRunStatus {
  if (status === "reserved") return "failed";
  if (status === "paused") return "paused";
  return "stale";
}
