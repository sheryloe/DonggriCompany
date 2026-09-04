import type { DatabaseSync } from "node:sqlite";

import type { ContinuityCheckpoint } from "./checkpoint-contract.js";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.js";
import {
  SqliteContinuityRunLedger,
  type ContinuityProvider,
  type ContinuityRun,
  type ContinuityRunEvent,
  type ContinuityRunStatus,
} from "./run-ledger.js";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

export type ContinuityTransitPhase =
  | "source_stopped"
  | "checkpoint_persisted"
  | "target_validated"
  | "approval_recorded"
  | "dispatch_reserved"
  | "resume_confirmed";

export type ContinuityHeartbeatFreshness = "fresh" | "stale" | "missing" | "not_applicable" | "unknown";
export type ContinuityReconcileState =
  | "not_started"
  | "source_paused"
  | "observing"
  | "in_sync"
  | "reconcile_required"
  | "terminal";

export interface ContinuityRunEventView {
  run_id: string;
  sequence: number;
  event_type: string;
  occurred_at: string;
}

/**
 * Public continuity read model.
 *
 * This is intentionally a whitelist rather than a spread of a checkpoint or
 * Runner row. In particular, objectives, prompts, paths, account-pool data,
 * process identity and event payloads never cross the API/WS boundary.
 */
export interface ContinuityTransitProjectionView {
  project_id: string;
  task_id: string;
  checkpoint_id: string;
  checkpoint_sequence: number;
  checkpoint_status: ContinuityCheckpoint["status"];
  phase: ContinuityTransitPhase;
  phase_index: number;
  source_run_id: string;
  source_provider: ContinuityProvider;
  source_run_status: ContinuityRunStatus | null;
  target_run_id: string | null;
  target_provider: ContinuityProvider;
  target_run_status: ContinuityRunStatus | null;
  cursor_run_id: string;
  state_version: number;
  event_sequence: number;
  heartbeat_at: string | null;
  heartbeat_freshness: ContinuityHeartbeatFreshness;
  heartbeat_age_ms: number | null;
  reconcile_state: ContinuityReconcileState;
  latest_event: ContinuityRunEventView | null;
  blockers: string[];
  next_safe_action: string;
  motion_eligible: boolean;
  updated_at: string;
  observed_at: string;
}

export interface ContinuityRunEventsView {
  run_id: string;
  after_sequence: number;
  event_sequence: number;
  state_version: number;
  run_status: ContinuityRunStatus;
  events: ContinuityRunEventView[];
}

export interface ContinuityRealtimeProjectionOptions {
  now?: () => string;
  heartbeatFreshMs?: number;
}

const PHASE_INDEX: Readonly<Record<ContinuityTransitPhase, number>> = {
  source_stopped: 0,
  checkpoint_persisted: 1,
  target_validated: 2,
  approval_recorded: 3,
  dispatch_reserved: 4,
  resume_confirmed: 5,
};

const TERMINAL_RUN_STATUSES = new Set<ContinuityRunStatus>(["completed", "failed", "canceled"]);
const PUBLIC_BLOCKER_CODES = new Set([
  "approval_required",
  "auth_required",
  "checkpoint_conflict",
  "dispatch_identity_mismatch",
  "dispatch_reconcile_unknown",
  "dispatch_uncertain",
  "event_cursor_incomplete",
  "heartbeat_missing",
  "heartbeat_stale",
  "provider_unavailable",
  "reconcile_required",
  "source_claim_mismatch",
  "source_ownership_mismatch",
  "source_pause_ack_required",
  "source_run_missing",
  "target_run_missing",
  "workspace_conflict",
  "workspace_drift",
]);
const PUBLIC_EVENT_TYPES = new Set([
  "execution_completed",
  "execution_effect_recorded",
  "execution_failed",
  "execution_rejected",
  "execution_replayed",
  "provider.output",
  "runner.boot_reconciled",
  "runner.canceled",
  "runner.child_started",
  "runner.completed",
  "runner.dispatch_reserved",
  "runner.dispatch_start_uncertain",
  "runner.pause_acknowledged",
  "runner.pause_failed",
  "runner.pause_requested",
  "runner.running",
  "runner.shutdown_child_reconciled",
  "runner.start_failed",
  "runner.started",
  "runner.starting",
  "runner.state_changed",
]);

function boundedLimit(value: number, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(maximum, value)) : fallback;
}

function publicBlockerCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return PUBLIC_BLOCKER_CODES.has(normalized) ? normalized : "unclassified_blocker";
}

function publicEvent(event: ContinuityRunEvent): ContinuityRunEventView {
  const normalizedType = event.event_type.trim().toLowerCase();
  return {
    run_id: event.run_id,
    sequence: event.sequence,
    event_type: PUBLIC_EVENT_TYPES.has(normalizedType) ? normalizedType : "runner.event",
    occurred_at: event.occurred_at,
  };
}

function heartbeatState(
  run: ContinuityRun,
  observedAtMs: number,
  heartbeatFreshMs: number,
): { freshness: ContinuityHeartbeatFreshness; ageMs: number | null } {
  const heartbeatRequired = run.status === "starting" || run.status === "running" || run.status === "pause_requested";
  if (!heartbeatRequired) return { freshness: "not_applicable", ageMs: null };
  if (!run.heartbeat_at) return { freshness: "missing", ageMs: null };
  const heartbeatMs = Date.parse(run.heartbeat_at);
  if (!Number.isFinite(heartbeatMs) || !Number.isFinite(observedAtMs)) {
    return { freshness: "unknown", ageMs: null };
  }
  const ageMs = Math.max(0, observedAtMs - heartbeatMs);
  if (heartbeatMs - observedAtMs > 5_000) return { freshness: "unknown", ageMs: null };
  return { freshness: ageMs <= heartbeatFreshMs ? "fresh" : "stale", ageMs };
}

function phaseFor(checkpoint: ContinuityCheckpoint, target: ContinuityRun | null, heartbeatFresh: boolean) {
  let phase: ContinuityTransitPhase = "checkpoint_persisted";
  if (checkpoint.status === "approval_required") phase = "target_validated";
  if (
    checkpoint.status === "accepted" ||
    checkpoint.status === "resuming" ||
    checkpoint.status === "running" ||
    checkpoint.status === "completed" ||
    checkpoint.status === "dispatch_uncertain" ||
    checkpoint.status === "stale"
  ) {
    phase = "approval_recorded";
  }
  if (target) phase = "dispatch_reserved";
  if (target && (target.status === "completed" || (target.status === "running" && heartbeatFresh))) {
    phase = "resume_confirmed";
  }
  return { phase, phaseIndex: PHASE_INDEX[phase] };
}

function nextSafeAction(checkpoint: ContinuityCheckpoint, target: ContinuityRun | null): string {
  if (target?.status === "dispatch_uncertain" || target?.status === "stale") return "reconcile_target_run";
  if (target?.status === "running") return "monitor_live_run";
  if (target?.status === "completed") return "review_completion_evidence";
  if (target?.status === "failed" || target?.status === "canceled") return "inspect_terminal_evidence";
  const actions: Partial<Record<ContinuityCheckpoint["status"], string>> = {
    ready_for_transfer: "validate_target",
    target_validating: "wait_for_target_validation",
    approval_required: "obtain_control_plane_approval",
    accepted: "observe_dispatch",
    resuming: "observe_dispatch",
    checkpoint_conflict: "resolve_workspace_conflict",
    provider_unavailable: "restore_target_provider",
    auth_required: "restore_target_authorization",
    dispatch_uncertain: "reconcile_target_run",
    stale: "reconcile_target_run",
    failed: "inspect_terminal_evidence",
    canceled: "inspect_terminal_evidence",
    completed: "review_completion_evidence",
  };
  return actions[checkpoint.status] ?? "inspect_continuity_state";
}

function reconcileState(
  source: ContinuityRun | null,
  target: ContinuityRun | null,
  freshness: ContinuityHeartbeatFreshness,
): ContinuityReconcileState {
  if (!source) return "reconcile_required";
  if (!target) return source.status === "paused" ? "source_paused" : "not_started";
  if (target.status === "dispatch_uncertain" || target.status === "stale") return "reconcile_required";
  if (TERMINAL_RUN_STATUSES.has(target.status)) return "terminal";
  if (target.status === "running") return freshness === "fresh" ? "in_sync" : "reconcile_required";
  return "observing";
}

export class ContinuityRealtimeProjectionService {
  private readonly store: SqliteContinuityCheckpointStore;
  private readonly ledger: SqliteContinuityRunLedger;
  private readonly now: () => string;
  private readonly heartbeatFreshMs: number;

  constructor(db: DbLike, options: ContinuityRealtimeProjectionOptions = {}) {
    this.store = new SqliteContinuityCheckpointStore(db);
    this.ledger = new SqliteContinuityRunLedger(db);
    this.now = options.now ?? (() => new Date().toISOString());
    this.heartbeatFreshMs = boundedLimit(options.heartbeatFreshMs ?? 30_000, 30_000, 300_000);
  }

  recent(limit = 50): ContinuityTransitProjectionView[] {
    return this.store.recent(boundedLimit(limit, 50, 100)).map((checkpoint) => this.fromCheckpoint(checkpoint));
  }

  forTask(taskId: string): ContinuityTransitProjectionView | null {
    const checkpoint = this.store.latest(taskId.trim());
    return checkpoint ? this.fromCheckpoint(checkpoint) : null;
  }

  fromCheckpoint(checkpoint: ContinuityCheckpoint): ContinuityTransitProjectionView {
    const observedAt = this.now();
    const observedAtMs = Date.parse(observedAt);
    const source = this.ledger.get(checkpoint.source_run_id);
    const targetRunId = checkpoint.target_run_id?.trim() || null;
    const target = targetRunId ? this.ledger.get(targetRunId) : null;
    const cursor = target ?? source;
    const blockers = checkpoint.blockers.map(publicBlockerCode);
    if (!source) blockers.push("source_run_missing");
    if (targetRunId && !target) blockers.push("target_run_missing");

    const heartbeat = cursor
      ? heartbeatState(cursor, observedAtMs, this.heartbeatFreshMs)
      : { freshness: "unknown" as const, ageMs: null };
    if (target?.status === "running" && heartbeat.freshness !== "fresh") {
      blockers.push(heartbeat.freshness === "missing" ? "heartbeat_missing" : "heartbeat_stale");
    }
    if (target?.status === "dispatch_uncertain" || target?.status === "stale") {
      blockers.push("reconcile_required");
    }

    const latestEvent =
      cursor && cursor.last_event_sequence > 0
        ? (this.ledger.listEvents(cursor.run_id, cursor.last_event_sequence - 1, 1)[0] ?? null)
        : null;
    if (cursor && cursor.last_event_sequence > 0 && latestEvent?.sequence !== cursor.last_event_sequence) {
      blockers.push("event_cursor_incomplete");
    }
    const { phase, phaseIndex } = phaseFor(checkpoint, target, heartbeat.freshness === "fresh");
    const reconcile = reconcileState(source, target, heartbeat.freshness);
    const uniqueBlockers = [...new Set(blockers)];

    return {
      project_id: checkpoint.project_id,
      task_id: checkpoint.task_id,
      checkpoint_id: checkpoint.checkpoint_id,
      checkpoint_sequence: checkpoint.sequence,
      checkpoint_status: checkpoint.status,
      phase,
      phase_index: phaseIndex,
      source_run_id: checkpoint.source_run_id,
      source_provider: checkpoint.source_provider,
      source_run_status: source?.status ?? null,
      target_run_id: target?.run_id ?? targetRunId,
      target_provider: checkpoint.target_provider,
      target_run_status: target?.status ?? null,
      cursor_run_id: cursor?.run_id ?? checkpoint.source_run_id,
      state_version: cursor?.state_version ?? 0,
      event_sequence: cursor?.last_event_sequence ?? 0,
      heartbeat_at: cursor?.heartbeat_at ?? null,
      heartbeat_freshness: heartbeat.freshness,
      heartbeat_age_ms: heartbeat.ageMs,
      reconcile_state: reconcile,
      latest_event: latestEvent ? publicEvent(latestEvent) : null,
      blockers: uniqueBlockers,
      next_safe_action: nextSafeAction(checkpoint, target),
      motion_eligible: Boolean(
        target &&
        target.run_id === cursor?.run_id &&
        target.status === "running" &&
        heartbeat.freshness === "fresh" &&
        phase === "resume_confirmed",
      ),
      updated_at: cursor?.updated_at ?? checkpoint.created_at,
      observed_at: observedAt,
    };
  }

  runEvents(runId: string, afterSequence = 0, limit = 200): ContinuityRunEventsView | null {
    const normalizedRunId = runId.trim();
    const run = this.ledger.get(normalizedRunId);
    if (!run) return null;
    const after = Number.isSafeInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
    return {
      run_id: run.run_id,
      after_sequence: after,
      event_sequence: run.last_event_sequence,
      state_version: run.state_version,
      run_status: run.status,
      events: this.ledger.listEvents(run.run_id, after, boundedLimit(limit, 200, 500)).map(publicEvent),
    };
  }
}
