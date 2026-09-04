import { makeIdempotencyKey, postWithIdempotency, request } from "./core";

export type ContinuityProvider = "codex" | "claude";
export type ContinuityCheckpointStatus =
  | "ready_for_transfer"
  | "target_validating"
  | "approval_required"
  | "accepted"
  | "resuming"
  | "running"
  | "completed"
  | "checkpoint_conflict"
  | "provider_unavailable"
  | "auth_required"
  | "dispatch_uncertain"
  | "stale"
  | "failed"
  | "canceled";
export type ContinuityRunStatus =
  | "reserved"
  | "starting"
  | "running"
  | "pause_requested"
  | "paused"
  | "dispatch_uncertain"
  | "stale"
  | "completed"
  | "failed"
  | "canceled";
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

export interface ContinuityTransitProjectionView {
  project_id: string;
  task_id: string;
  checkpoint_id: string;
  checkpoint_sequence: number;
  checkpoint_status: ContinuityCheckpointStatus;
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

/** Compatibility name for view-only callers. It is no longer a raw checkpoint. */
export type ContinuityCheckpointView = ContinuityTransitProjectionView;

export type ContinuitySyncState = "snapshot" | "exact" | "gap" | "run_changed" | "offline" | "error";
export interface ContinuityLiveProjection extends ContinuityTransitProjectionView {
  sync_state: ContinuitySyncState;
}

export interface ContinuityRunEventsView {
  run_id: string;
  after_sequence: number;
  event_sequence: number;
  state_version: number;
  run_status: ContinuityRunStatus;
  events: ContinuityRunEventView[];
}

export type ContinuityProjectionUpdateDecision = "exact" | "duplicate" | "gap" | "run_changed" | "snapshot_required";

export interface CreateContinuityCheckpointInput {
  project_id: string;
  project_path: string;
  task_id: string;
  source_run_id: string;
  source_provider: ContinuityProvider;
  source_account_pool_id: string;
  source_account_label: string;
  target_provider: ContinuityProvider;
  target_account_pool_id: string;
  target_account_label: string;
  objective: string;
  acceptance_criteria: string[];
  completed: string[];
  pending: string[];
  next_safe_action: string;
  created_by: string;
}

interface ContinuityMutationResult {
  status: "created" | "replay" | "idempotency_conflict";
  projection: ContinuityTransitProjectionView;
}

const CHECKPOINT_STATUSES = new Set<ContinuityCheckpointStatus>([
  "ready_for_transfer",
  "target_validating",
  "approval_required",
  "accepted",
  "resuming",
  "running",
  "completed",
  "checkpoint_conflict",
  "provider_unavailable",
  "auth_required",
  "dispatch_uncertain",
  "stale",
  "failed",
  "canceled",
]);
const RUN_STATUSES = new Set<ContinuityRunStatus>([
  "reserved",
  "starting",
  "running",
  "pause_requested",
  "paused",
  "dispatch_uncertain",
  "stale",
  "completed",
  "failed",
  "canceled",
]);
const PHASES = new Set<ContinuityTransitPhase>([
  "source_stopped",
  "checkpoint_persisted",
  "target_validated",
  "approval_recorded",
  "dispatch_reserved",
  "resume_confirmed",
]);
const HEARTBEAT_FRESHNESS = new Set<ContinuityHeartbeatFreshness>([
  "fresh",
  "stale",
  "missing",
  "not_applicable",
  "unknown",
]);
const RECONCILE_STATES = new Set<ContinuityReconcileState>([
  "not_started",
  "source_paused",
  "observing",
  "in_sync",
  "reconcile_required",
  "terminal",
]);
const PHASE_INDEX: Record<ContinuityTransitPhase, number> = {
  source_stopped: 0,
  checkpoint_persisted: 1,
  target_validated: 2,
  approval_recorded: 3,
  dispatch_reserved: 4,
  resume_confirmed: 5,
};
const PROJECTION_KEYS = new Set([
  "project_id",
  "task_id",
  "checkpoint_id",
  "checkpoint_sequence",
  "checkpoint_status",
  "phase",
  "phase_index",
  "source_run_id",
  "source_provider",
  "source_run_status",
  "target_run_id",
  "target_provider",
  "target_run_status",
  "cursor_run_id",
  "state_version",
  "event_sequence",
  "heartbeat_at",
  "heartbeat_freshness",
  "heartbeat_age_ms",
  "reconcile_state",
  "latest_event",
  "blockers",
  "next_safe_action",
  "motion_eligible",
  "updated_at",
  "observed_at",
]);

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableRunStatus(value: unknown): value is ContinuityRunStatus | null {
  return value === null || (typeof value === "string" && RUN_STATUSES.has(value as ContinuityRunStatus));
}

export function isContinuityRunEventView(value: unknown): value is ContinuityRunEventView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ContinuityRunEventView>;
  return (
    Object.keys(value).every((key) => ["run_id", "sequence", "event_type", "occurred_at"].includes(key)) &&
    typeof item.run_id === "string" &&
    item.run_id.length > 0 &&
    isNonNegativeInteger(item.sequence) &&
    item.sequence > 0 &&
    typeof item.event_type === "string" &&
    /^[a-z0-9][a-z0-9_.:-]{0,95}$/.test(item.event_type) &&
    typeof item.occurred_at === "string"
  );
}

export function isContinuityTransitProjectionView(value: unknown): value is ContinuityTransitProjectionView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Object.keys(value).every((key) => PROJECTION_KEYS.has(key))) return false;
  const item = value as Partial<ContinuityTransitProjectionView>;
  return (
    typeof item.project_id === "string" &&
    typeof item.task_id === "string" &&
    typeof item.checkpoint_id === "string" &&
    isNonNegativeInteger(item.checkpoint_sequence) &&
    typeof item.checkpoint_status === "string" &&
    CHECKPOINT_STATUSES.has(item.checkpoint_status as ContinuityCheckpointStatus) &&
    typeof item.phase === "string" &&
    PHASES.has(item.phase as ContinuityTransitPhase) &&
    item.phase_index === PHASE_INDEX[item.phase as ContinuityTransitPhase] &&
    typeof item.source_run_id === "string" &&
    (item.source_provider === "codex" || item.source_provider === "claude") &&
    isNullableRunStatus(item.source_run_status) &&
    (item.target_run_id === null || typeof item.target_run_id === "string") &&
    (item.target_provider === "codex" || item.target_provider === "claude") &&
    isNullableRunStatus(item.target_run_status) &&
    typeof item.cursor_run_id === "string" &&
    isNonNegativeInteger(item.state_version) &&
    isNonNegativeInteger(item.event_sequence) &&
    (item.heartbeat_at === null || typeof item.heartbeat_at === "string") &&
    typeof item.heartbeat_freshness === "string" &&
    HEARTBEAT_FRESHNESS.has(item.heartbeat_freshness as ContinuityHeartbeatFreshness) &&
    (item.heartbeat_age_ms === null || isNonNegativeInteger(item.heartbeat_age_ms)) &&
    typeof item.reconcile_state === "string" &&
    RECONCILE_STATES.has(item.reconcile_state as ContinuityReconcileState) &&
    (item.latest_event === null || isContinuityRunEventView(item.latest_event)) &&
    Array.isArray(item.blockers) &&
    item.blockers.every((blocker) => typeof blocker === "string" && /^[a-z0-9][a-z0-9_.:-]{0,79}$/.test(blocker)) &&
    typeof item.next_safe_action === "string" &&
    /^[a-z0-9][a-z0-9_.:-]{0,79}$/.test(item.next_safe_action) &&
    typeof item.motion_eligible === "boolean" &&
    typeof item.updated_at === "string" &&
    typeof item.observed_at === "string"
  );
}

/** Compatibility validator name. */
export const isContinuityCheckpointView = isContinuityTransitProjectionView;

export function classifyContinuityProjectionUpdate(
  current: ContinuityTransitProjectionView,
  incoming: ContinuityTransitProjectionView,
): ContinuityProjectionUpdateDecision {
  if (incoming.task_id !== current.task_id) return "snapshot_required";
  if (incoming.cursor_run_id !== current.cursor_run_id) return "run_changed";
  if (incoming.event_sequence < current.event_sequence) return "duplicate";
  if (incoming.event_sequence === current.event_sequence) {
    return incoming.checkpoint_sequence === current.checkpoint_sequence &&
      incoming.state_version === current.state_version
      ? "duplicate"
      : "snapshot_required";
  }
  if (incoming.event_sequence !== current.event_sequence + 1) return "gap";
  if (incoming.state_version < current.state_version) return "snapshot_required";
  return "exact";
}

export function hasExactContinuityEventRange(
  events: readonly ContinuityRunEventView[],
  expectedRunId: string,
  afterSequence: number,
  throughSequence: number,
): boolean {
  if (throughSequence <= afterSequence) return events.length === 0;
  if (events.length !== throughSequence - afterSequence) return false;
  return events.every((event, index) => event.run_id === expectedRunId && event.sequence === afterSequence + index + 1);
}

function requireProjection(value: unknown): ContinuityTransitProjectionView {
  if (!isContinuityTransitProjectionView(value)) throw new Error("continuity_projection_invalid");
  return value;
}

function requireProjectionList(value: unknown): ContinuityTransitProjectionView[] {
  if (!Array.isArray(value) || !value.every(isContinuityTransitProjectionView)) {
    throw new Error("continuity_projection_list_invalid");
  }
  return value;
}

export async function getRecentContinuityProjections(signal?: AbortSignal): Promise<ContinuityTransitProjectionView[]> {
  const response = await request<{ projections: unknown }>("/api/continuity/projections/recent", { signal });
  return requireProjectionList(response.projections);
}

export const getRecentContinuityCheckpoints = getRecentContinuityProjections;

export async function getTaskContinuityProjection(
  taskId: string,
  signal?: AbortSignal,
): Promise<ContinuityTransitProjectionView> {
  const response = await request<{ projection: unknown }>(
    `/api/continuity/tasks/${encodeURIComponent(taskId)}/projection`,
    { signal },
  );
  return requireProjection(response.projection);
}

export async function getTaskContinuityCheckpoints(
  taskId: string,
  signal?: AbortSignal,
): Promise<ContinuityTransitProjectionView[]> {
  const response = await request<{ projections: unknown }>(
    `/api/continuity/tasks/${encodeURIComponent(taskId)}/checkpoints`,
    { signal },
  );
  return requireProjectionList(response.projections);
}

export async function getContinuityRunEvents(
  runId: string,
  afterSequence: number,
  signal?: AbortSignal,
): Promise<ContinuityRunEventsView> {
  const normalizedAfter = Math.max(0, Math.trunc(afterSequence));
  const response = await request<ContinuityRunEventsView>(
    `/api/continuity/runs/${encodeURIComponent(runId)}/events?after_sequence=${normalizedAfter}`,
    { signal },
  );
  const responseKeys = new Set(["run_id", "after_sequence", "event_sequence", "state_version", "run_status", "events"]);
  if (
    !response ||
    typeof response !== "object" ||
    !Object.keys(response).every((key) => responseKeys.has(key)) ||
    response.run_id !== runId ||
    response.after_sequence !== normalizedAfter ||
    !isNonNegativeInteger(response.event_sequence) ||
    !isNonNegativeInteger(response.state_version) ||
    !RUN_STATUSES.has(response.run_status) ||
    !Array.isArray(response.events) ||
    !response.events.every((event) => isContinuityRunEventView(event) && event.run_id === runId)
  ) {
    throw new Error("continuity_run_events_invalid");
  }
  return response;
}

async function mutationProjection(
  path: string,
  body: Record<string, unknown>,
  keyPrefix: string,
): Promise<ContinuityTransitProjectionView> {
  const idempotencyKey = makeIdempotencyKey(keyPrefix);
  const result = await postWithIdempotency<ContinuityMutationResult>(path, body, idempotencyKey);
  return requireProjection(result.projection);
}

export function createContinuityCheckpoint(
  input: CreateContinuityCheckpointInput,
): Promise<ContinuityTransitProjectionView> {
  return mutationProjection("/api/continuity/checkpoints", { ...input }, "continuity-create");
}

export function validateContinuityCheckpoint(
  checkpointId: string,
  projectPath: string,
): Promise<ContinuityTransitProjectionView> {
  return mutationProjection(
    `/api/continuity/checkpoints/${encodeURIComponent(checkpointId)}/validate`,
    { project_path: projectPath },
    "continuity-validate",
  );
}

export async function acceptContinuityCheckpoint(
  checkpointId: string,
  approvalRef: string,
): Promise<ContinuityTransitProjectionView> {
  const normalizedApprovalRef = approvalRef.trim();
  if (!normalizedApprovalRef || normalizedApprovalRef.startsWith("ui:")) {
    throw new Error("continuity_server_approval_ref_required");
  }
  return mutationProjection(
    `/api/continuity/checkpoints/${encodeURIComponent(checkpointId)}/accept`,
    { approval_ref: normalizedApprovalRef },
    "continuity-accept",
  );
}

export function resumeContinuityCheckpoint(checkpointId: string): Promise<ContinuityTransitProjectionView> {
  return mutationProjection(
    `/api/continuity/checkpoints/${encodeURIComponent(checkpointId)}/resume`,
    {},
    "continuity-resume",
  );
}
