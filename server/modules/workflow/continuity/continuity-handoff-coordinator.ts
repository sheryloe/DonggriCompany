import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import {
  verifyApprovalReceiptSha256,
  verifyMutationPreviewDigests,
  type ApprovalReceipt,
  type MutationPreview,
  type StoredMutationOutcome,
} from "../../control-plane/mutation-authorizer.js";
import { SqliteMutationAuthorizerPersistence } from "../../control-plane/mutation-authorizer-sqlite.js";
import {
  ContinuityCheckpointSchema,
  type ContinuityCheckpoint,
} from "./checkpoint-contract.js";
import { findSensitiveCheckpointValues } from "./checkpoint-safety.js";
import type { SaveCheckpointResult, SqliteContinuityCheckpointStore } from "./checkpoint-store.js";
import type { ProviderReadiness } from "./provider-readiness.js";
import type { ContinuityRun, ContinuityRunEvent, SqliteContinuityRunLedger } from "./run-ledger.js";
import type {
  AuthoritativeContinuityCheckpointContext,
  AuthoritativeContinuitySource,
  AuthoritativeContinuityTarget,
  CreateTransferInput,
  ContinuityTransferService,
} from "./transfer-service.js";
import { validateContinuityWorkspace } from "./workspace-identity.js";

type Row = Record<string, SQLOutputValue>;

export interface ContinuitySupervisorPort {
  pause(runId: string, reason?: string): Promise<ContinuityRun>;
  startReserved(runId: string, dispatchId?: string): Promise<ContinuityRun>;
  shutdown?(signal?: string): Promise<unknown>;
  getReadiness?(): { ready: boolean; reason?: string | null };
}

export interface ContinuityHandoffCoordinatorOptions {
  db: DatabaseSync;
  store: SqliteContinuityCheckpointStore;
  ledger: SqliteContinuityRunLedger;
  transfer: ContinuityTransferService;
  supervisor: ContinuitySupervisorPort | null;
  collectWorkspace: (projectPath: string) => ContinuityCheckpoint["workspace"];
  readiness: (provider: "codex" | "claude", accountPoolId: string) => ProviderReadiness;
  now?: () => string;
  emit?: (checkpoint: ContinuityCheckpoint) => void;
  failpoint?: (name: ContinuityHandoffFailpoint) => void;
}

export type ContinuityHandoffFailpoint =
  | "after_approval_consume"
  | "after_checkpoint_save"
  | "after_target_reserve"
  | "after_initial_event"
  | "after_commit_before_start";

export type AtomicAcceptResult = {
  status: "created" | "replay";
  checkpoint: ContinuityCheckpoint;
  target_run: ContinuityRun;
  spawn_requested: boolean;
};

type AuthoritativeTask = {
  projectId: string;
  projectPath: string;
  taskId: string;
  taskTitle: string;
};

type VerifiedApproval = {
  approval: ApprovalReceipt;
  preview: MutationPreview;
};

type AcceptedOutcomeValue = {
  status: "created";
  checkpoint_id: string;
  target_run_id: string;
  dispatch_id: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJsonObject<T>(value: unknown, code: string): T {
  if (typeof value !== "string") throw new Error(code);
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(code);
    return parsed as T;
  } catch {
    throw new Error(code);
  }
}

function normalizePath(value: string): string {
  return path.win32.normalize(value.trim()).replace(/[\\/]+$/, "").toLowerCase();
}

function boundedSingleLine(value: string, limit: number): string {
  const printable = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
  return printable
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeBoundedId(value: unknown, code: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(normalized) ||
    findSensitiveCheckpointValues(normalized).length > 0
  ) {
    throw new Error(code);
  }
  return normalized;
}

function authoritativeCheckpointContext(authority: AuthoritativeTask): AuthoritativeContinuityCheckpointContext {
  const taskId = boundedSingleLine(authority.taskId, 96);
  const taskTitle = boundedSingleLine(authority.taskTitle, 120) || taskId;
  const descriptor = boundedSingleLine(`${taskTitle} (${taskId})`, 220);
  return {
    objective_summary: boundedSingleLine(`Continue authoritative task ${descriptor} across providers`, 280),
    acceptance_criteria: [boundedSingleLine(`Preserve authoritative ownership for ${descriptor}`, 280)],
    pending: [boundedSingleLine(`Resume ${descriptor} on the target provider`, 280)],
    next_safe_action: boundedSingleLine(`Validate target readiness for ${descriptor}`, 280),
  };
}

function receiptMatchesPreview(receipt: ApprovalReceipt, preview: MutationPreview): boolean {
  return (
    receipt.preview_id === preview.preview_id &&
    receipt.spec_id === preview.spec_id &&
    receipt.project_id === preview.project_id &&
    receipt.operation === preview.operation &&
    receipt.resolved_target === preview.resolved_target &&
    receipt.target_digest === preview.target_digest &&
    receipt.scope_digest === preview.scope_digest &&
    receipt.command_digest === preview.command_digest &&
    receipt.source_epoch === preview.source_epoch &&
    receipt.projection_epoch === preview.projection_epoch &&
    receipt.requester === preview.requester &&
    receipt.expires_at === preview.expires_at
  );
}

function scopeMatches(preview: MutationPreview, checkpoint: ContinuityCheckpoint): boolean {
  if (typeof preview.scope !== "object" || preview.scope === null || Array.isArray(preview.scope)) return false;
  const actual = preview.scope as Record<string, unknown>;
  const expected: Record<string, unknown> = {
    checkpoint_id: checkpoint.checkpoint_id,
    task_id: checkpoint.task_id,
    source_run_id: checkpoint.source_run_id,
    target_provider: checkpoint.target_provider,
    target_account_pool_id: checkpoint.target_account_pool_id ?? null,
  };
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]) &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

function latestEvent(ledger: SqliteContinuityRunLedger, run: ContinuityRun): ContinuityRunEvent | null {
  if (run.last_event_sequence < 1) return null;
  return ledger.listEvents(run.run_id, run.last_event_sequence - 1, 1)[0] ?? null;
}

function assertPauseAcknowledged(ledger: SqliteContinuityRunLedger, run: ContinuityRun): void {
  if (run.status !== "paused") throw new Error("continuity_source_pause_ack_required");
  const event = latestEvent(ledger, run);
  if (!event || event.sequence !== run.last_event_sequence || event.event_type !== "runner.pause_acknowledged") {
    throw new Error("continuity_source_pause_ack_required");
  }
}

function parseAcceptedOutcome(outcome: StoredMutationOutcome): AcceptedOutcomeValue {
  if (outcome.status !== "succeeded") throw new Error("continuity_accept_outcome_corrupt");
  if (typeof outcome.value !== "object" || outcome.value === null || Array.isArray(outcome.value)) {
    throw new Error("continuity_accept_outcome_corrupt");
  }
  const value = outcome.value as Record<string, unknown>;
  const expectedKeys = ["checkpoint_id", "dispatch_id", "status", "target_run_id"];
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    !actualKeys.every((key, index) => key === expectedKeys[index]) ||
    value.status !== "created" ||
    typeof value.checkpoint_id !== "string" ||
    !value.checkpoint_id.trim() ||
    typeof value.target_run_id !== "string" ||
    !value.target_run_id.trim() ||
    typeof value.dispatch_id !== "string" ||
    !value.dispatch_id.trim()
  ) {
    throw new Error("continuity_accept_outcome_corrupt");
  }
  return {
    status: "created",
    checkpoint_id: value.checkpoint_id,
    target_run_id: value.target_run_id,
    dispatch_id: value.dispatch_id,
  };
}

export class ContinuityHandoffCoordinator {
  private readonly db: DatabaseSync;
  private readonly store: SqliteContinuityCheckpointStore;
  private readonly ledger: SqliteContinuityRunLedger;
  private readonly transfer: ContinuityTransferService;
  private readonly supervisor: ContinuitySupervisorPort | null;
  private readonly collectWorkspace: ContinuityHandoffCoordinatorOptions["collectWorkspace"];
  private readonly readiness: ContinuityHandoffCoordinatorOptions["readiness"];
  private readonly now: () => string;
  private readonly emit: (checkpoint: ContinuityCheckpoint) => void;
  private readonly failpoint: (name: ContinuityHandoffFailpoint) => void;

  constructor(options: ContinuityHandoffCoordinatorOptions) {
    this.db = options.db;
    this.store = options.store;
    this.ledger = options.ledger;
    this.transfer = options.transfer;
    this.supervisor = options.supervisor;
    this.collectWorkspace = options.collectWorkspace;
    this.readiness = options.readiness;
    this.now = options.now ?? (() => new Date().toISOString());
    this.emit = options.emit ?? (() => {});
    this.failpoint = options.failpoint ?? (() => {});
  }

  async capture(input: CreateTransferInput): Promise<SaveCheckpointResult> {
    const idempotencyKey = safeBoundedId(input.idempotency_key, "continuity_idempotency_key_invalid");
    const target = this.resolveTargetAuthority(input.target_provider, input.target_account_pool_id);
    const authority = this.resolveTaskAuthority(input.project_id, input.task_id, input.project_path);
    let source = this.requireLatestSourceRun(authority, input);
    if (source.status !== "paused") {
      if (!this.supervisor) throw new Error("runner_supervisor_unbound");
      source = await this.supervisor.pause(source.run_id, "continuity_checkpoint_capture");
    }
    assertPauseAcknowledged(this.ledger, source);

    // Workspace collection performs file-system I/O and must finish before the
    // synchronous BEGIN IMMEDIATE boundary below.
    const workspace = this.collectWorkspace(authority.projectPath);
    const result = this.ledger.withImmediateTransaction(() => {
      const liveAuthority = this.resolveTaskAuthority(input.project_id, input.task_id, authority.projectPath);
      const latest = this.requireLatestSourceRun(liveAuthority, input);
      if (latest.run_id !== source.run_id) throw new Error("continuity_source_run_changed");
      assertPauseAcknowledged(this.ledger, latest);
      return this.transfer.createWithAuthoritativeSourceInTransaction(
        {
          ...input,
          project_path: liveAuthority.projectPath,
          target_provider: target.provider,
          target_account_pool_id: target.account_pool_id,
          target_account_label: target.account_label,
          idempotency_key: idempotencyKey,
        },
        this.asAuthoritativeSource(latest),
        target,
        workspace,
        authoritativeCheckpointContext(liveAuthority),
      );
    });
    if (result.status !== "idempotency_conflict") this.emit(result.checkpoint);
    return result;
  }

  async acceptAndStart(input: {
    checkpoint_id: string;
    approval_ref: string;
    idempotency_key: string;
  }): Promise<AtomicAcceptResult> {
    const checkpointId = input.checkpoint_id.trim();
    const approvalId = input.approval_ref.trim();
    const idempotencyKey = safeBoundedId(input.idempotency_key, "continuity_idempotency_key_invalid");
    if (!checkpointId) throw new Error("continuity_checkpoint_required");
    if (!approvalId) throw new Error("continuity_approval_required");
    if (/^ui:/i.test(approvalId)) throw new Error("continuity_synthetic_approval_forbidden");
    const requestDigest = sha256(
      JSON.stringify({
        operation: "continuity_transfer_accept",
        checkpoint_id: checkpointId,
        approval_id: approvalId,
      }),
    );
    const fastReplay = this.readAcceptedReplay(idempotencyKey, requestDigest, checkpointId, approvalId);
    if (fastReplay) {
      return {
        status: "replay",
        checkpoint: fastReplay.checkpoint,
        target_run: fastReplay.run,
        spawn_requested: false,
      };
    }
    if (!this.supervisor) throw new Error("runner_supervisor_unbound");
    const supervisorReadiness = this.supervisor.getReadiness?.();
    if (supervisorReadiness && !supervisorReadiness.ready) {
      throw new Error(supervisorReadiness.reason?.trim() || "runner_supervisor_not_ready");
    }

    const approvalTarget = this.store.get(checkpointId);
    if (!approvalTarget) throw new Error("continuity_checkpoint_not_found");
    // Collect outside SQLite; the pure digest comparison is repeated inside.
    const observedWorkspace = this.collectWorkspace(approvalTarget.workspace.canonical_project_path);
    const targetRunId = `run:${randomUUID()}`;
    const dispatchId = `dispatch:${randomUUID()}`;
    const reservationId = `reservation:${randomUUID()}`;
    const acceptedCheckpointId = `checkpoint:${randomUUID()}`;
    const acceptedAt = this.now();

    const transactionResult = this.ledger.withImmediateTransaction(() => {
      const current = this.store.get(checkpointId);
      if (!current) throw new Error("continuity_checkpoint_not_found");
      const latestCheckpoint = this.store.latest(current.task_id);
      if (latestCheckpoint?.checkpoint_id !== current.checkpoint_id) {
        throw new Error("continuity_checkpoint_not_latest");
      }
      if (current.status !== "approval_required") throw new Error("continuity_accept_state_invalid");
      const authority = this.resolveTaskAuthority(
        current.project_id,
        current.task_id,
        current.workspace.canonical_project_path,
      );
      const source = this.requireLatestSourceRun(authority, {
        source_run_id: current.source_run_id,
        source_provider: current.source_provider,
        source_account_pool_id: current.source_account_pool_id ?? "",
      });
      assertPauseAcknowledged(this.ledger, source);
      if (source.run_id !== current.source_run_id) throw new Error("continuity_source_run_changed");
      const workspaceValidation = validateContinuityWorkspace(current.workspace, observedWorkspace);
      if (!workspaceValidation.ok) throw new Error(workspaceValidation.code);
      const targetAccountPoolId = current.target_account_pool_id?.trim() ?? "";
      if (!targetAccountPoolId) throw new Error("continuity_target_account_pool_id_required");
      const readiness = this.readiness(current.target_provider, targetAccountPoolId);
      if (readiness.state !== "ready") throw new Error(`continuity_target_${readiness.state}`);
      const verified = this.verifyApprovalInTransaction(approvalId, current, acceptedAt);

      const accepted = ContinuityCheckpointSchema.parse({
        ...current,
        checkpoint_id: acceptedCheckpointId,
        previous_checkpoint_id: current.checkpoint_id,
        sequence: current.sequence + 1,
        status: "accepted",
        target_run_id: targetRunId,
        dispatch_id: dispatchId,
        provider_native_session_id: null,
        target_account_label: readiness.account_label ?? current.target_account_label ?? targetAccountPoolId,
        approval_ref: approvalId,
        idempotency_key: idempotencyKey,
        blockers: [],
        created_at: acceptedAt,
      });
      const outcomeValue: AcceptedOutcomeValue = {
        status: "created",
        checkpoint_id: accepted.checkpoint_id,
        target_run_id: targetRunId,
        dispatch_id: dispatchId,
      };
      const outcome: StoredMutationOutcome = { status: "succeeded", value: outcomeValue };
      const persistence = new SqliteMutationAuthorizerPersistence(this.db);
      const completion = persistence.consumeApprovalAndCompleteInTransaction({
        idempotency_key: idempotencyKey,
        request_digest: requestDigest,
        reservation_id: reservationId,
        approval_id: approvalId,
        outcome,
        created_at: acceptedAt,
        completed_at: acceptedAt,
        audit_event: {
          event_id: `event:${randomUUID()}`,
          event_type: "execution_completed",
          occurred_at: acceptedAt,
          preview_id: verified.preview.preview_id,
          approval_id: approvalId,
          idempotency_key_digest: sha256(idempotencyKey),
          request_digest: requestDigest,
        },
      });
      if (completion.status === "replay") {
        const replay = parseAcceptedOutcome(completion.outcome);
        const resolved = this.readAcceptedReplay(idempotencyKey, requestDigest, checkpointId, approvalId);
        if (
          !resolved ||
          resolved.checkpoint.checkpoint_id !== replay.checkpoint_id ||
          resolved.run.run_id !== replay.target_run_id ||
          resolved.run.dispatch_id !== replay.dispatch_id
        ) {
          throw new Error("continuity_accept_outcome_corrupt");
        }
        return { kind: "replay" as const, checkpoint: resolved.checkpoint, run: resolved.run };
      }
      if (completion.status !== "completed") {
        throw new Error(`continuity_accept_${completion.status}`);
      }
      this.failpoint("after_approval_consume");

      const saved = this.store.saveInTransaction(accepted);
      if (saved.status !== "created") throw new Error("continuity_accept_checkpoint_reservation_conflict");
      this.failpoint("after_checkpoint_save");

      const reserved = this.ledger.reserve({
        run_id: targetRunId,
        project_id: current.project_id,
        task_id: current.task_id,
        checkpoint_id: accepted.checkpoint_id,
        parent_run_id: current.source_run_id,
        provider: current.target_provider,
        account_pool_id: targetAccountPoolId,
        dispatch_id: dispatchId,
        status: "reserved",
        created_at: acceptedAt,
      });
      if (reserved.status !== "reserved" || reserved.run.run_id !== targetRunId) {
        throw new Error("continuity_accept_dispatch_reservation_conflict");
      }
      this.failpoint("after_target_reserve");
      this.ledger.appendEvent({
        run_id: targetRunId,
        sequence: 1,
        event_type: "runner.dispatch_reserved",
        payload: {
          checkpoint_id: accepted.checkpoint_id,
          dispatch_id: dispatchId,
          source_run_id: current.source_run_id,
        },
        occurred_at: acceptedAt,
      });
      this.failpoint("after_initial_event");
      const run = this.ledger.get(targetRunId);
      if (!run) throw new Error("continuity_target_run_missing");
      return { kind: "winner" as const, checkpoint: saved.checkpoint, run };
    });

    if (transactionResult.kind === "replay") {
      return {
        status: "replay",
        checkpoint: transactionResult.checkpoint,
        target_run: transactionResult.run,
        spawn_requested: false,
      };
    }

    this.emit(transactionResult.checkpoint);
    this.failpoint("after_commit_before_start");
    try {
      const started = await this.supervisor.startReserved(
        transactionResult.run.run_id,
        transactionResult.run.dispatch_id,
      );
      return {
        status: "created",
        checkpoint: transactionResult.checkpoint,
        target_run: started,
        spawn_requested: true,
      };
    } catch (error) {
      const durable = this.ledger.get(transactionResult.run.run_id);
      if (durable?.status === "reserved") {
        try {
          this.ledger.transitionWithEvent({
            run_id: durable.run_id,
            expected_state_version: durable.state_version,
            expected_status: "reserved",
            status: "dispatch_uncertain",
            event_type: "runner.dispatch_start_uncertain",
            payload: { dispatch_id: durable.dispatch_id, reason: "supervisor_start_failed" },
            occurred_at: this.now(),
          });
        } catch {
          // A concurrent Supervisor transition is more authoritative.
        }
      }
      throw error;
    }
  }

  private readAcceptedReplay(
    idempotencyKey: string,
    requestDigest: string,
    checkpointId: string,
    approvalId: string,
  ): { checkpoint: ContinuityCheckpoint; run: ContinuityRun } | null {
    const row = this.db
      .prepare(
        `SELECT result.request_digest, result.reservation_id, result.approval_id,
                result.state, result.outcome_json,
                effect.outcome_json AS effect_outcome_json,
                effect.outcome_sha256 AS effect_outcome_sha256,
                approval.consumed_reservation_id
         FROM control_plane_idempotency_results result
         LEFT JOIN control_plane_execution_effects effect
           ON effect.reservation_id = result.reservation_id
         LEFT JOIN control_plane_approval_receipts approval
           ON approval.approval_id = result.approval_id
         WHERE result.idempotency_key = ?`,
      )
      .get(idempotencyKey) as Row | undefined;
    if (!row) return null;
    if (row.request_digest !== requestDigest) throw new Error("continuity_accept_idempotency_conflict");
    if (row.state === "in_flight") throw new Error("continuity_accept_in_flight");
    if (
      row.state !== "completed" ||
      row.approval_id !== approvalId ||
      typeof row.reservation_id !== "string" ||
      row.consumed_reservation_id !== row.reservation_id ||
      typeof row.outcome_json !== "string" ||
      typeof row.effect_outcome_json !== "string" ||
      row.effect_outcome_json !== row.outcome_json ||
      row.effect_outcome_sha256 !== sha256(row.effect_outcome_json)
    ) {
      throw new Error("continuity_accept_outcome_corrupt");
    }
    const outcome = parseAcceptedOutcome(
      parseJsonObject<StoredMutationOutcome>(row.outcome_json, "continuity_accept_outcome_corrupt"),
    );
    return this.resolveAcceptedReplay(outcome, checkpointId, approvalId, idempotencyKey);
  }

  private resolveAcceptedReplay(
    outcome: AcceptedOutcomeValue,
    checkpointId: string,
    approvalId: string,
    idempotencyKey: string,
  ): { checkpoint: ContinuityCheckpoint; run: ContinuityRun } {
    const parent = this.store.get(checkpointId);
    const accepted = this.store.get(outcome.checkpoint_id);
    const run = this.ledger.get(outcome.target_run_id);
    if (!parent || !accepted || !run) throw new Error("continuity_accept_outcome_corrupt");
    if (
      parent.status !== "approval_required" ||
      accepted.status !== "accepted" ||
      accepted.previous_checkpoint_id !== parent.checkpoint_id ||
      accepted.sequence !== parent.sequence + 1 ||
      accepted.project_id !== parent.project_id ||
      accepted.task_id !== parent.task_id ||
      accepted.source_run_id !== parent.source_run_id ||
      accepted.source_provider !== parent.source_provider ||
      accepted.source_account_pool_id !== parent.source_account_pool_id ||
      accepted.target_provider !== parent.target_provider ||
      accepted.target_account_pool_id !== parent.target_account_pool_id ||
      accepted.checkpoint_id !== outcome.checkpoint_id ||
      accepted.target_run_id !== outcome.target_run_id ||
      accepted.dispatch_id !== outcome.dispatch_id ||
      accepted.approval_ref !== approvalId ||
      accepted.idempotency_key !== idempotencyKey ||
      run.run_id !== outcome.target_run_id ||
      run.checkpoint_id !== accepted.checkpoint_id ||
      run.parent_run_id !== accepted.source_run_id ||
      run.project_id !== accepted.project_id ||
      run.task_id !== accepted.task_id ||
      run.provider !== accepted.target_provider ||
      run.account_pool_id !== accepted.target_account_pool_id ||
      run.dispatch_id !== outcome.dispatch_id
    ) {
      throw new Error("continuity_accept_outcome_corrupt");
    }
    return { checkpoint: accepted, run };
  }

  observeDispatch(dispatchId: string): { checkpoint: ContinuityCheckpoint; target_run: ContinuityRun } {
    const normalized = dispatchId.trim();
    if (!normalized) throw new Error("continuity_dispatch_id_required");
    const run = this.ledger.getByDispatchId(normalized);
    if (!run) throw new Error("continuity_dispatch_not_found");
    const checkpoint = run.checkpoint_id ? this.store.get(run.checkpoint_id) : null;
    if (!checkpoint) throw new Error("continuity_checkpoint_not_found");
    return { checkpoint, target_run: run };
  }

  private resolveTaskAuthority(projectId: string, taskId: string, claimedProjectPath: string): AuthoritativeTask {
    const normalizedProjectId = projectId.trim();
    const normalizedTaskId = taskId.trim();
    if (!normalizedProjectId) throw new Error("continuity_project_required");
    if (!normalizedTaskId) throw new Error("continuity_task_required");
    const project = this.db
      .prepare("SELECT id, project_path FROM projects WHERE id = ?")
      .get(normalizedProjectId) as Row | undefined;
    if (!project || typeof project.id !== "string" || typeof project.project_path !== "string") {
      throw new Error("continuity_project_not_found");
    }
    const task = this.db
      .prepare("SELECT id, project_id, project_path, title FROM tasks WHERE id = ?")
      .get(normalizedTaskId) as Row | undefined;
    if (!task || typeof task.id !== "string" || typeof task.title !== "string") {
      throw new Error("continuity_task_not_found");
    }
    if (task.project_id !== project.id) throw new Error("continuity_task_project_mismatch");
    if (findSensitiveCheckpointValues(task.title).length > 0) {
      throw new Error("continuity_task_title_sensitive");
    }
    const authoritativePath =
      typeof task.project_path === "string" && task.project_path.trim() ? task.project_path : project.project_path;
    if (claimedProjectPath.trim() && normalizePath(claimedProjectPath) !== normalizePath(authoritativePath)) {
      throw new Error("continuity_project_path_mismatch");
    }
    return { projectId: project.id, projectPath: authoritativePath, taskId: task.id, taskTitle: task.title };
  }

  private resolveTargetAuthority(
    claimedProvider: CreateTransferInput["target_provider"],
    claimedAccountPoolId: string,
  ): AuthoritativeContinuityTarget {
    if (claimedProvider !== "codex" && claimedProvider !== "claude") {
      throw new Error("continuity_target_provider_invalid");
    }
    const accountPoolId = safeBoundedId(claimedAccountPoolId, "continuity_target_account_pool_id_invalid");
    const rows = this.db
      .prepare(
        `SELECT provider, account_pool_id, label
         FROM cli_account_pools
         WHERE account_pool_id = ?
         ORDER BY provider`,
      )
      .all(accountPoolId) as Row[];
    if (rows.length === 0) throw new Error("continuity_target_account_pool_not_found");
    const target = rows.find((row) => row.provider === claimedProvider);
    if (
      !target ||
      typeof target.account_pool_id !== "string" ||
      typeof target.label !== "string" ||
      target.account_pool_id !== accountPoolId
    ) {
      throw new Error("continuity_target_provider_mismatch");
    }
    const accountLabel = boundedSingleLine(target.label, 120) || accountPoolId;
    if (findSensitiveCheckpointValues(accountLabel).length > 0) {
      throw new Error("continuity_target_account_label_sensitive");
    }
    return { provider: claimedProvider, account_pool_id: target.account_pool_id, account_label: accountLabel };
  }

  private requireLatestSourceRun(
    authority: AuthoritativeTask,
    claims: Pick<CreateTransferInput, "source_run_id" | "source_provider" | "source_account_pool_id">,
  ): ContinuityRun {
    const source = this.ledger.getLatestForTask(authority.projectId, authority.taskId, [
      "running",
      "pause_requested",
      "paused",
    ]);
    if (!source) throw new Error("continuity_source_run_not_found");
    if (
      claims.source_run_id.trim() !== source.run_id ||
      claims.source_provider !== source.provider ||
      claims.source_account_pool_id.trim() !== source.account_pool_id
    ) {
      throw new Error("continuity_source_claim_mismatch");
    }
    return source;
  }

  private asAuthoritativeSource(run: ContinuityRun): AuthoritativeContinuitySource {
    assertPauseAcknowledged(this.ledger, run);
    return {
      run_id: run.run_id,
      project_id: run.project_id,
      task_id: run.task_id,
      provider: run.provider,
      account_pool_id: run.account_pool_id,
      account_label: run.account_pool_id,
      status: "paused",
      pause_acknowledged: true,
    };
  }

  private verifyApprovalInTransaction(
    approvalId: string,
    checkpoint: ContinuityCheckpoint,
    observedAt: string,
  ): VerifiedApproval {
    const approvalRow = this.db
      .prepare(
        `SELECT approval_id, preview_id, receipt_json, receipt_sha256,
                projection_epoch, issued_at, expires_at
         FROM control_plane_approval_receipts WHERE approval_id = ?`,
      )
      .get(approvalId) as Row | undefined;
    if (!approvalRow) throw new Error("continuity_approval_not_found");
    const approval = parseJsonObject<ApprovalReceipt>(approvalRow.receipt_json, "continuity_approval_corrupt");
    if (
      approval.approval_id !== approvalRow.approval_id ||
      approval.preview_id !== approvalRow.preview_id ||
      approval.receipt_sha256 !== approvalRow.receipt_sha256 ||
      approval.projection_epoch !== approvalRow.projection_epoch ||
      approval.issued_at !== approvalRow.issued_at ||
      approval.expires_at !== approvalRow.expires_at ||
      !verifyApprovalReceiptSha256(approval)
    ) {
      throw new Error("continuity_approval_tampered");
    }
    const previewRow = this.db
      .prepare(
        `SELECT preview_id, preview_json, source_epoch, projection_epoch, issued_at, expires_at
         FROM control_plane_mutation_previews WHERE preview_id = ?`,
      )
      .get(approval.preview_id) as Row | undefined;
    if (!previewRow) throw new Error("continuity_approval_preview_not_found");
    const preview = parseJsonObject<MutationPreview>(previewRow.preview_json, "continuity_approval_preview_corrupt");
    if (
      preview.preview_id !== previewRow.preview_id ||
      preview.source_epoch !== previewRow.source_epoch ||
      preview.projection_epoch !== previewRow.projection_epoch ||
      preview.issued_at !== previewRow.issued_at ||
      preview.expires_at !== previewRow.expires_at ||
      !verifyMutationPreviewDigests(preview) ||
      !receiptMatchesPreview(approval, preview)
    ) {
      throw new Error("continuity_approval_preview_mismatch");
    }
    const expiresAt = Date.parse(approval.expires_at);
    const now = Date.parse(observedAt);
    if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now) {
      throw new Error("continuity_approval_expired");
    }
    if (
      approval.operation !== "continuity_transfer_accept" ||
      approval.project_id !== checkpoint.project_id ||
      approval.resolved_target !== checkpoint.checkpoint_id ||
      approval.source_epoch !== checkpoint.workspace.workspace_digest ||
      !scopeMatches(preview, checkpoint) ||
      preview.command.executable_id !== "continuity" ||
      preview.command.cwd_ref !== checkpoint.project_id ||
      preview.command.args.length !== 2 ||
      preview.command.args[0] !== "accept" ||
      preview.command.args[1] !== checkpoint.checkpoint_id
    ) {
      throw new Error("continuity_approval_scope_mismatch");
    }
    return { approval, preview };
  }
}
