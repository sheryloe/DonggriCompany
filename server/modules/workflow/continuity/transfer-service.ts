import { randomUUID } from "node:crypto";

import { ContinuityCheckpointSchema, type ContinuityCheckpoint } from "./checkpoint-contract.js";
import type { SqliteContinuityCheckpointStore } from "./checkpoint-store.js";
import type { ProviderReadiness } from "./provider-readiness.js";
import { validateContinuityWorkspace, type WorkspaceValidation } from "./workspace-identity.js";

type Workspace = ContinuityCheckpoint["workspace"];
type Provider = ContinuityCheckpoint["target_provider"];
type ReadinessReader = (provider: Provider, accountPoolId: string) => ProviderReadiness;
type WorkspaceCollector = (projectPath: string) => Workspace;

const AUTHORITATIVE_COMPLETED = ["Source run pause acknowledgement verified"] as const;
const AUTHORITATIVE_CREATED_BY = "continuity-handoff-coordinator";

export type ContinuityDispatchResult =
  | {
      ok: true;
      dispatch_id: string;
      target_run_id: string;
      provider_native_session_id: string;
    }
  | { ok: false; dispatch_id: string; reason?: string };

export type ContinuityDispatchReconciliation =
  | {
      state: "running" | "completed";
      dispatch_id: string;
      target_run_id: string;
      provider_native_session_id: string;
    }
  | { state: "failed"; dispatch_id: string }
  | { state: "unknown"; dispatch_id: string };

type Dispatcher = (checkpoint: ContinuityCheckpoint) => Promise<ContinuityDispatchResult>;
type DispatchReconciler = (
  dispatchId: string,
  checkpoint: ContinuityCheckpoint,
) => Promise<ContinuityDispatchReconciliation>;

export interface CreateTransferInput {
  project_id: string;
  project_path: string;
  task_id: string;
  source_run_id: string;
  source_provider: "codex" | "claude";
  source_account_pool_id: string;
  source_account_label?: string;
  target_provider: "codex" | "claude";
  target_account_pool_id: string;
  target_account_label?: string;
  objective: string;
  acceptance_criteria: string[];
  completed: string[];
  pending: string[];
  blockers?: string[];
  next_safe_action: string;
  verification?: ContinuityCheckpoint["verification"];
  evidence_refs?: string[];
  approval_ref?: string | null;
  idempotency_key: string;
  created_by: string;
}

export interface AuthoritativeContinuitySource {
  run_id: string;
  project_id: string;
  task_id: string;
  provider: "codex" | "claude";
  account_pool_id: string;
  account_label?: string;
  status: "paused";
  pause_acknowledged: true;
}

export interface AuthoritativeContinuityTarget {
  provider: "codex" | "claude";
  account_pool_id: string;
  account_label: string;
}

export interface AuthoritativeContinuityCheckpointContext {
  objective_summary: string;
  acceptance_criteria: readonly string[];
  pending: readonly string[];
  next_safe_action: string;
}

function taskIdentityContext(taskId: string): AuthoritativeContinuityCheckpointContext {
  const boundedTaskId = taskId.trim().replace(/\s+/g, " ").slice(0, 160);
  return {
    objective_summary: `Continue authoritative task ${boundedTaskId} across providers`,
    acceptance_criteria: [`Preserve authoritative ownership for ${boundedTaskId}`],
    pending: [`Resume authoritative task ${boundedTaskId} on the target provider`],
    next_safe_action: `Validate target readiness for ${boundedTaskId}`,
  };
}

function requiredAccountPoolId(value: unknown, side: "source" | "target"): string {
  const accountPoolId = typeof value === "string" ? value.trim() : "";
  if (!accountPoolId) throw new Error(`continuity_${side}_account_pool_id_required`);
  return accountPoolId;
}

function optionalLabel(value: unknown): string | undefined {
  const label = typeof value === "string" ? value.trim() : "";
  return label || undefined;
}

function unavailableStatus(readiness: ProviderReadiness): ContinuityCheckpoint["status"] {
  return readiness.state === "auth_required" ? "auth_required" : "provider_unavailable";
}

function nonEmptyIdentity(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class ContinuityTransferService {
  constructor(
    private readonly store: SqliteContinuityCheckpointStore,
    private readonly collectWorkspace: WorkspaceCollector,
    private readonly readiness: ReadinessReader,
    private readonly _dispatch: Dispatcher,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly emit: (event: ContinuityCheckpoint) => void = () => {},
    private readonly reconcileDispatch: DispatchReconciler = async (dispatchId) => ({
      state: "unknown",
      dispatch_id: dispatchId,
    }),
  ) {}

  createWithAuthoritativeSource(
    input: CreateTransferInput,
    source: AuthoritativeContinuitySource,
    target: AuthoritativeContinuityTarget,
    context: AuthoritativeContinuityCheckpointContext,
  ) {
    const result = this.store.save(this.buildInitialCheckpoint(input, source, target, context));
    if (result.status !== "idempotency_conflict") this.emit(result.checkpoint);
    return result;
  }

  /** Caller owns the surrounding SQLite transaction. */
  createWithAuthoritativeSourceInTransaction(
    input: CreateTransferInput,
    source: AuthoritativeContinuitySource,
    target: AuthoritativeContinuityTarget,
    workspace: Workspace,
    context: AuthoritativeContinuityCheckpointContext,
  ) {
    return this.store.saveInTransaction(this.buildInitialCheckpoint(input, source, target, context, workspace));
  }

  /** @deprecated Only deterministic mock fixtures may use client-owned source identity. */
  create(input: CreateTransferInput) {
    return this.createWithAuthoritativeSource(
      input,
      {
        run_id: input.source_run_id,
        project_id: input.project_id,
        task_id: input.task_id,
        provider: input.source_provider,
        account_pool_id: requiredAccountPoolId(input.source_account_pool_id, "source"),
        account_label: optionalLabel(input.source_account_label),
        status: "paused",
        pause_acknowledged: true,
      },
      {
        provider: input.target_provider,
        account_pool_id: requiredAccountPoolId(input.target_account_pool_id, "target"),
        account_label: requiredAccountPoolId(input.target_account_pool_id, "target"),
      },
      taskIdentityContext(input.task_id),
    );
  }

  private buildInitialCheckpoint(
    input: CreateTransferInput,
    source: AuthoritativeContinuitySource,
    target: AuthoritativeContinuityTarget,
    context: AuthoritativeContinuityCheckpointContext,
    collectedWorkspace?: Workspace,
  ): ContinuityCheckpoint {
    if (source.status !== "paused" || source.pause_acknowledged !== true) {
      throw new Error("continuity_source_pause_ack_required");
    }
    if (input.project_id !== source.project_id || input.task_id !== source.task_id) {
      throw new Error("continuity_source_ownership_mismatch");
    }
    const clientSourcePool = requiredAccountPoolId(input.source_account_pool_id, "source");
    if (
      input.source_run_id !== source.run_id ||
      input.source_provider !== source.provider ||
      clientSourcePool !== source.account_pool_id
    ) {
      throw new Error("continuity_source_claim_mismatch");
    }
    const clientTargetPool = requiredAccountPoolId(input.target_account_pool_id, "target");
    const targetAccountPoolId = requiredAccountPoolId(target.account_pool_id, "target");
    if (input.target_provider !== target.provider || clientTargetPool !== targetAccountPoolId) {
      throw new Error("continuity_target_claim_mismatch");
    }
    const checkpoint = ContinuityCheckpointSchema.parse({
      schema_version: 1,
      checkpoint_id: `checkpoint:${randomUUID()}`,
      previous_checkpoint_id: null,
      sequence: 1,
      project_id: source.project_id,
      task_id: source.task_id,
      source_run_id: source.run_id,
      source_provider: source.provider,
      source_account_pool_id: source.account_pool_id,
      source_account_label: source.account_pool_id,
      target_provider: target.provider,
      target_account_pool_id: targetAccountPoolId,
      target_account_label: target.account_label,
      target_run_id: null,
      provider_native_session_id: null,
      dispatch_id: null,
      status: "ready_for_transfer",
      objective: context.objective_summary,
      acceptance_criteria: [...context.acceptance_criteria],
      completed: [...AUTHORITATIVE_COMPLETED],
      pending: [...context.pending],
      blockers: [],
      next_safe_action: context.next_safe_action,
      workspace: collectedWorkspace ?? this.collectWorkspace(input.project_path),
      verification: [],
      evidence_refs: [],
      approval_ref: null,
      idempotency_key: input.idempotency_key,
      created_by: AUTHORITATIVE_CREATED_BY,
      created_at: this.now(),
    });
    return checkpoint;
  }

  validate(checkpointId: string, projectPath: string, idempotencyKey: string) {
    const current = this.requireLatest(checkpointId);
    if (current.status !== "ready_for_transfer") throw new Error("continuity_validate_state_invalid");
    const actual = this.collectWorkspace(projectPath);
    const workspaceResult = validateContinuityWorkspace(current.workspace, actual);
    if (!workspaceResult.ok) {
      return this.append(current, "checkpoint_conflict", idempotencyKey, actual, [workspaceResult.code]);
    }
    const accountPoolId = current.target_account_pool_id;
    if (!nonEmptyIdentity(accountPoolId)) {
      return this.append(current, "provider_unavailable", idempotencyKey, actual, ["account_pool_id_required"]);
    }
    const readiness = this.readiness(current.target_provider, accountPoolId);
    const labelOverride = readiness.account_label ? { target_account_label: readiness.account_label } : {};
    if (readiness.state !== "ready") {
      return this.append(current, unavailableStatus(readiness), idempotencyKey, actual, [readiness.state], labelOverride);
    }
    return this.append(current, "approval_required", idempotencyKey, actual, [], labelOverride);
  }

  accept(checkpointId: string, approvalRef: string, idempotencyKey: string) {
    const current = this.requireLatest(checkpointId);
    if (current.status !== "approval_required") throw new Error("continuity_accept_state_invalid");
    if (!approvalRef.trim()) throw new Error("continuity_approval_required");
    if (/^ui:/i.test(approvalRef.trim())) throw new Error("continuity_synthetic_approval_forbidden");
    return this.append(current, "accepted", idempotencyKey, current.workspace, [], { approval_ref: approvalRef.trim() });
  }

  async resume(checkpointId: string, idempotencyKey: string) {
    const current = this.requireLatest(checkpointId);
    if (current.status !== "accepted") throw new Error("continuity_resume_state_invalid");
    if (!idempotencyKey.trim()) throw new Error("continuity_idempotency_key_required");
    if (nonEmptyIdentity(current.dispatch_id) && nonEmptyIdentity(current.target_run_id)) {
      // Dispatch ownership belongs exclusively to RunnerSupervisor. An atomic
      // V2 acceptance already has both durable IDs, so this endpoint is an
      // observation only and must never call a provider adapter again.
      return { status: "replay" as const, checkpoint: structuredClone(current) };
    }

    // Compatibility for the isolated credential-free mock demo only. These
    // old checkpoints predate the durable run reservation and therefore cannot
    // duplicate a Supervisor-owned dispatch.
    const accountPoolId = current.target_account_pool_id;
    if (!nonEmptyIdentity(accountPoolId)) {
      return this.append(current, "provider_unavailable", idempotencyKey, current.workspace, [
        "account_pool_id_required",
      ]);
    }
    const initialReadiness = this.readiness(current.target_provider, accountPoolId);
    if (initialReadiness.state !== "ready") {
      return this.append(current, unavailableStatus(initialReadiness), idempotencyKey, current.workspace, [
        initialReadiness.state,
      ]);
    }
    const dispatchId = this.createDispatchId();
    const targetRunId = `run:${randomUUID()}`;
    const resuming = this.append(current, "resuming", `${idempotencyKey}:resuming`, current.workspace, [], {
      dispatch_id: dispatchId,
      target_run_id: targetRunId,
      provider_native_session_id: null,
      ...(initialReadiness.account_label ? { target_account_label: initialReadiness.account_label } : {}),
    });
    if (resuming.status === "idempotency_conflict") return resuming;
    const observedWorkspace = this.collectWorkspace(current.workspace.canonical_project_path);
    const workspace = validateContinuityWorkspace(current.workspace, observedWorkspace);
    if (!workspace.ok) {
      return this.append(resuming.checkpoint, "checkpoint_conflict", `${idempotencyKey}:result`, observedWorkspace, [
        workspace.code,
      ]);
    }
    const dispatchReadiness = this.readiness(current.target_provider, accountPoolId);
    if (dispatchReadiness.state !== "ready") {
      return this.append(
        resuming.checkpoint,
        unavailableStatus(dispatchReadiness),
        `${idempotencyKey}:result`,
        observedWorkspace,
        [dispatchReadiness.state],
      );
    }
    let dispatched: ContinuityDispatchResult;
    try {
      dispatched = await this._dispatch(resuming.checkpoint);
    } catch {
      dispatched = { ok: false, dispatch_id: dispatchId, reason: "dispatch_failed_or_unknown" };
    }
    const identityMismatch =
      dispatched.dispatch_id !== dispatchId ||
      (dispatched.ok &&
        (dispatched.target_run_id !== targetRunId || !nonEmptyIdentity(dispatched.provider_native_session_id)));
    if (!dispatched.ok || identityMismatch) {
      return this.append(resuming.checkpoint, "dispatch_uncertain", `${idempotencyKey}:result`, observedWorkspace, [
        identityMismatch ? "dispatch_identity_mismatch" : "dispatch_failed_or_unknown",
      ]);
    }
    return this.append(resuming.checkpoint, "running", `${idempotencyKey}:result`, observedWorkspace, [], {
      provider_native_session_id: dispatched.provider_native_session_id,
    });
  }

  async reconcile(dispatchId: string, idempotencyKey: string) {
    const normalizedDispatchId = dispatchId.trim();
    if (!normalizedDispatchId) throw new Error("continuity_dispatch_id_required");
    const current = this.store.findLatestByDispatchId(normalizedDispatchId);
    if (!current) throw new Error("continuity_dispatch_not_found");
    const latest = this.store.latest(current.task_id);
    if (latest?.checkpoint_id !== current.checkpoint_id) throw new Error("continuity_checkpoint_not_latest");
    if (current.status !== "dispatch_uncertain") throw new Error("continuity_reconcile_state_invalid");

    let result: ContinuityDispatchReconciliation;
    try {
      result = await this.reconcileDispatch(normalizedDispatchId, current);
    } catch {
      result = { state: "unknown", dispatch_id: normalizedDispatchId };
    }
    if (result.dispatch_id !== normalizedDispatchId) {
      return this.append(current, "dispatch_uncertain", idempotencyKey, current.workspace, [
        "dispatch_identity_mismatch",
      ]);
    }
    if (result.state === "unknown") {
      return this.append(current, "dispatch_uncertain", idempotencyKey, current.workspace, [
        "dispatch_reconcile_unknown",
      ]);
    }
    if (result.state === "failed") {
      return this.append(current, "failed", idempotencyKey, current.workspace, ["dispatch_reconciled_failed"]);
    }
    if (result.target_run_id !== current.target_run_id || !nonEmptyIdentity(result.provider_native_session_id)) {
      return this.append(current, "dispatch_uncertain", idempotencyKey, current.workspace, [
        "dispatch_identity_mismatch",
      ]);
    }
    return this.append(current, result.state, idempotencyKey, current.workspace, [], {
      target_run_id: result.target_run_id,
      provider_native_session_id: result.provider_native_session_id,
    });
  }

  private createDispatchId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dispatchId = `dispatch:${randomUUID()}`;
      if (!this.store.findLatestByDispatchId(dispatchId)) return dispatchId;
    }
    throw new Error("continuity_dispatch_id_reservation_failed");
  }

  private requireLatest(checkpointId: string): ContinuityCheckpoint {
    const checkpoint = this.store.get(checkpointId);
    if (!checkpoint) throw new Error("continuity_checkpoint_not_found");
    const latest = this.store.latest(checkpoint.task_id);
    if (latest?.checkpoint_id !== checkpointId) throw new Error("continuity_checkpoint_not_latest");
    return checkpoint;
  }

  private append(
    current: ContinuityCheckpoint,
    status: ContinuityCheckpoint["status"],
    idempotencyKey: string,
    workspace: Workspace,
    blockers: string[] = [],
    overrides: Partial<ContinuityCheckpoint> = {},
  ) {
    const checkpoint = ContinuityCheckpointSchema.parse({
      ...current,
      ...overrides,
      checkpoint_id: `checkpoint:${randomUUID()}`,
      previous_checkpoint_id: current.checkpoint_id,
      sequence: current.sequence + 1,
      status,
      workspace,
      blockers,
      idempotency_key: idempotencyKey,
      created_at: this.now(),
    });
    const result = this.store.save(checkpoint);
    if (result.status !== "idempotency_conflict") this.emit(result.checkpoint);
    return result;
  }
}

export function workspaceValidationCode(result: WorkspaceValidation): string | null {
  return result.ok ? null : result.code;
}
