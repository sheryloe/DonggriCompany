import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyContinuityCheckpointSchema } from "../../bootstrap/schema/continuity-checkpoint-schema.ts";
import type { ContinuityCheckpoint } from "./checkpoint-contract.ts";
import { continuityCheckpointFixture } from "./checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.ts";
import type { ProviderReadiness } from "./provider-readiness.ts";
import {
  ContinuityTransferService,
  type ContinuityDispatchReconciliation,
  type ContinuityDispatchResult,
  type CreateTransferInput,
} from "./transfer-service.ts";

function input(direction: "codex-to-claude" | "claude-to-codex", suffix: number): CreateTransferInput {
  const source = direction === "codex-to-claude" ? "codex" : "claude";
  const target = source === "codex" ? "claude" : "codex";
  return {
    project_id: "project:DonggriCompany",
    project_path: "C:\\fixture",
    task_id: `task:${direction}:${suffix}`,
    source_run_id: `run:${source}:${suffix}`,
    source_provider: source,
    source_account_pool_id: `${source}-fixture`,
    source_account_label: `${source} display`,
    target_provider: target,
    target_account_pool_id: `${target}-fixture`,
    target_account_label: "untrusted display label",
    objective: "Continue task",
    acceptance_criteria: ["same identity"],
    completed: ["paused"],
    pending: ["resume"],
    next_safe_action: "validate",
    idempotency_key: `create:${direction}:${suffix}`,
    created_by: "IMPLEMENT",
  };
}

function ready(provider: "codex" | "claude", accountPoolId: string): ProviderReadiness {
  return {
    provider,
    account_pool_id: accountPoolId,
    account_label: `${provider} authoritative`,
    state: "ready",
    observed_at: null,
    reason: null,
  };
}

describe("ContinuityTransferService", () => {
  let db: DatabaseSync;
  let store: SqliteContinuityCheckpointStore;
  let workspace: ContinuityCheckpoint["workspace"];

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyContinuityCheckpointSchema(db);
    store = new SqliteContinuityCheckpointStore(db);
    workspace = continuityCheckpointFixture().workspace;
  });

  function service(
    options: {
      readiness?: (provider: "codex" | "claude", accountPoolId: string) => ProviderReadiness;
      dispatch?: (checkpoint: ContinuityCheckpoint) => Promise<ContinuityDispatchResult>;
      reconcile?: (
        dispatchId: string,
        checkpoint: ContinuityCheckpoint,
      ) => Promise<ContinuityDispatchReconciliation>;
      emit?: (checkpoint: ContinuityCheckpoint) => void;
    } = {},
  ) {
    return new ContinuityTransferService(
      store,
      () => workspace,
      options.readiness ?? ready,
      options.dispatch ??
        (async (checkpoint) => ({
          ok: true,
          dispatch_id: checkpoint.dispatch_id!,
          target_run_id: checkpoint.target_run_id!,
          provider_native_session_id: `session:${checkpoint.target_provider}:${checkpoint.task_id}`,
        })),
      () => "2026-08-28T09:00:00+09:00",
      options.emit,
      options.reconcile,
    );
  }

  async function reachAccepted(flow: ContinuityTransferService, transferInput: CreateTransferInput) {
    const created = flow.create(transferInput);
    if (created.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const validated = flow.validate(
      created.checkpoint.checkpoint_id,
      "C:\\fixture",
      `validate:${transferInput.task_id}`,
    );
    if (validated.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const accepted = flow.accept(
      validated.checkpoint.checkpoint_id,
      "APR-FIXTURE",
      `accept:${transferInput.task_id}`,
    );
    if (accepted.status === "idempotency_conflict") throw new Error("unexpected conflict");
    return accepted.checkpoint;
  }

  it("ignores every caller-owned free-text field when building the initial checkpoint", () => {
    const sentinel = "SENTINEL_CALLER_SECRET oauth_token=opaque-transfer-secret";
    const transferInput: CreateTransferInput = {
      ...input("codex-to-claude", 0),
      source_account_label: sentinel,
      target_account_label: sentinel,
      objective: sentinel,
      acceptance_criteria: [sentinel],
      completed: [sentinel],
      pending: [sentinel],
      blockers: [sentinel],
      next_safe_action: sentinel,
      verification: [{ command: sentinel, status: "passed", summary: sentinel }],
      evidence_refs: [sentinel],
      approval_ref: sentinel,
      created_by: sentinel,
    };

    const created = service().create(transferInput);
    if (created.status === "idempotency_conflict") throw new Error("unexpected conflict");

    expect(created.checkpoint).toMatchObject({
      source_account_label: "codex-fixture",
      target_account_label: "claude-fixture",
      objective: "Continue authoritative task task:codex-to-claude:0 across providers",
      acceptance_criteria: ["Preserve authoritative ownership for task:codex-to-claude:0"],
      completed: ["Source run pause acknowledgement verified"],
      pending: ["Resume authoritative task task:codex-to-claude:0 on the target provider"],
      blockers: [],
      next_safe_action: "Validate target readiness for task:codex-to-claude:0",
      verification: [],
      evidence_refs: [],
      approval_ref: null,
      created_by: "continuity-handoff-coordinator",
    });
    expect(JSON.stringify(created.checkpoint)).not.toContain(sentinel);
    expect(JSON.stringify(created.checkpoint)).not.toContain("opaque-transfer-secret");
  });

  it.each(["codex-to-claude", "claude-to-codex"] as const)(
    "passes 20 deterministic %s transfers without overwriting source identity",
    async (direction) => {
      for (let index = 1; index <= 20; index += 1) {
        const flow = service();
        const transferInput = input(direction, index);
        const accepted = await reachAccepted(flow, transferInput);
        const resumed = await flow.resume(accepted.checkpoint_id, `resume:${direction}:${index}`);
        expect(resumed.status).not.toBe("idempotency_conflict");
        if (resumed.status !== "idempotency_conflict") {
          expect(resumed.checkpoint).toMatchObject({
            status: "running",
            source_run_id: transferInput.source_run_id,
            target_account_label: `${transferInput.target_provider} authoritative`,
          });
          expect(resumed.checkpoint.target_run_id).toMatch(/^run:/);
          expect(resumed.checkpoint.target_run_id).not.toBe(transferInput.source_run_id);
          expect(resumed.checkpoint.provider_native_session_id).toContain(`session:${transferInput.target_provider}`);
          expect(resumed.checkpoint.dispatch_id).toMatch(/^dispatch:/);
        }
      }
    },
  );

  it("fails closed on validation drift, auth requirements and uncertain dispatch", async () => {
    const flow = service();
    const created = flow.create(input("codex-to-claude", 1));
    if (created.status === "idempotency_conflict") throw new Error("unexpected conflict");
    workspace = { ...workspace, workspace_digest: "c".repeat(64) };
    const conflict = flow.validate(created.checkpoint.checkpoint_id, "C:\\fixture", "validate:drift");
    expect(conflict.status === "idempotency_conflict" ? null : conflict.checkpoint.status).toBe("checkpoint_conflict");

    workspace = continuityCheckpointFixture().workspace;
    const authFlow = service({
      readiness: (provider, accountPoolId) => ({
        ...ready(provider, accountPoolId),
        state: "auth_required",
      }),
    });
    const authCreated = authFlow.create(input("claude-to-codex", 2));
    if (authCreated.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const auth = authFlow.validate(authCreated.checkpoint.checkpoint_id, "C:\\fixture", "validate:auth");
    expect(auth.status === "idempotency_conflict" ? null : auth.checkpoint.status).toBe("auth_required");

    const uncertainFlow = service({
      dispatch: async (checkpoint) => ({ ok: false, dispatch_id: checkpoint.dispatch_id! }),
    });
    const accepted = await reachAccepted(uncertainFlow, input("codex-to-claude", 3));
    const uncertain = await uncertainFlow.resume(accepted.checkpoint_id, "resume:uncertain");
    expect(uncertain.status === "idempotency_conflict" ? null : uncertain.checkpoint).toMatchObject({
      status: "dispatch_uncertain",
      source_run_id: "run:codex:3",
    });
  });

  it("rechecks workspace and readiness after reservation and before dispatch", async () => {
    const dispatch = vi.fn(async (checkpoint: ContinuityCheckpoint): Promise<ContinuityDispatchResult> => ({
      ok: true,
      dispatch_id: checkpoint.dispatch_id!,
      target_run_id: checkpoint.target_run_id!,
      provider_native_session_id: "should-not-run",
    }));
    const driftFlow = service({ dispatch });
    const accepted = await reachAccepted(driftFlow, input("codex-to-claude", 10));
    workspace = { ...workspace, workspace_digest: "d".repeat(64) };
    const drift = await driftFlow.resume(accepted.checkpoint_id, "resume:drift-before-dispatch");
    expect(drift.status === "idempotency_conflict" ? null : drift.checkpoint.status).toBe("checkpoint_conflict");
    expect(dispatch).not.toHaveBeenCalled();

    workspace = continuityCheckpointFixture().workspace;
    let readinessCalls = 0;
    const readinessFlow = service({
      dispatch,
      readiness: (provider, accountPoolId) => {
        readinessCalls += 1;
        return {
          ...ready(provider, accountPoolId),
          state: readinessCalls >= 3 ? "auth_required" : "ready",
        };
      },
    });
    const readinessAccepted = await reachAccepted(readinessFlow, input("claude-to-codex", 11));
    const unavailable = await readinessFlow.resume(readinessAccepted.checkpoint_id, "resume:readiness-race");
    expect(unavailable.status === "idempotency_conflict" ? null : unavailable.checkpoint.status).toBe("auth_required");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("reconciles an uncertain dispatch by reservation ID without redispatching", async () => {
    const dispatch = vi.fn(async (checkpoint: ContinuityCheckpoint): Promise<ContinuityDispatchResult> => ({
      ok: false,
      dispatch_id: checkpoint.dispatch_id!,
    }));
    const reconcile = vi.fn(
      async (dispatchId: string, checkpoint: ContinuityCheckpoint): Promise<ContinuityDispatchReconciliation> => ({
        state: "running",
        dispatch_id: dispatchId,
        target_run_id: checkpoint.target_run_id!,
        provider_native_session_id: "claude-session-reconciled",
      }),
    );
    const flow = service({ dispatch, reconcile });
    const accepted = await reachAccepted(flow, input("codex-to-claude", 20));
    const uncertain = await flow.resume(accepted.checkpoint_id, "resume:reconcile");
    if (uncertain.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const reconciled = await flow.reconcile(uncertain.checkpoint.dispatch_id!, "reconcile:running");
    expect(reconciled.status === "idempotency_conflict" ? null : reconciled.checkpoint).toMatchObject({
      status: "running",
      source_run_id: "run:codex:20",
      provider_native_session_id: "claude-session-reconciled",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown reconciliation uncertain and rejects returned identity drift", async () => {
    const dispatch = vi.fn(async (checkpoint: ContinuityCheckpoint): Promise<ContinuityDispatchResult> => ({
      ok: false,
      dispatch_id: checkpoint.dispatch_id!,
    }));
    const unknownFlow = service({
      dispatch,
      reconcile: async (dispatchId) => ({ state: "unknown", dispatch_id: dispatchId }),
    });
    const accepted = await reachAccepted(unknownFlow, input("claude-to-codex", 21));
    const uncertain = await unknownFlow.resume(accepted.checkpoint_id, "resume:unknown");
    if (uncertain.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const stillUncertain = await unknownFlow.reconcile(uncertain.checkpoint.dispatch_id!, "reconcile:unknown");
    expect(stillUncertain.status === "idempotency_conflict" ? null : stillUncertain.checkpoint).toMatchObject({
      status: "dispatch_uncertain",
      blockers: ["dispatch_reconcile_unknown"],
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    const mismatchedFlow = service({
      dispatch: async (checkpoint) => ({
        ok: true,
        dispatch_id: checkpoint.dispatch_id!,
        target_run_id: "run:wrong-target",
        provider_native_session_id: "wrong-session",
      }),
    });
    const mismatchedAccepted = await reachAccepted(mismatchedFlow, input("codex-to-claude", 22));
    const mismatch = await mismatchedFlow.resume(mismatchedAccepted.checkpoint_id, "resume:mismatch");
    expect(mismatch.status === "idempotency_conflict" ? null : mismatch.checkpoint).toMatchObject({
      status: "dispatch_uncertain",
      source_run_id: "run:codex:22",
      blockers: ["dispatch_identity_mismatch"],
    });
  });

  it("rejects duplicate accept and emits monotonic checkpoints", () => {
    const emit = vi.fn();
    const flow = service({ emit });
    const created = flow.create(input("codex-to-claude", 30));
    if (created.status === "idempotency_conflict") throw new Error("unexpected conflict");
    const valid = flow.validate(created.checkpoint.checkpoint_id, "C:\\fixture", "validate:30");
    if (valid.status === "idempotency_conflict") throw new Error("unexpected conflict");
    flow.accept(valid.checkpoint.checkpoint_id, "APR", "accept:30");
    expect(() => flow.accept(valid.checkpoint.checkpoint_id, "APR", "accept:31")).toThrow(
      "continuity_checkpoint_not_latest",
    );
    expect(emit.mock.calls.map(([checkpoint]) => checkpoint.sequence)).toEqual([1, 2, 3]);
  });
});
