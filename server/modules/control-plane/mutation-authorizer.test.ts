import { describe, expect, it, vi } from "vitest";

import {
  InMemoryMutationAuthorizerPersistence,
  MutationAuthorizer,
  MutationInputError,
  verifyApprovalReceiptSha256,
  type ApprovalReceipt,
  type MutationAuthorizerPersistence,
  type MutationExecuteInput,
  type MutationPreview,
} from "./mutation-authorizer.ts";

const PROJECTION_EPOCH = "sha256:projection-epoch-001";

function createHarness(options?: {
  persistence?: MutationAuthorizerPersistence;
  allowed_origins?: string[];
  now?: () => Date;
}) {
  const persistence = options?.persistence ?? new InMemoryMutationAuthorizerPersistence();
  const authorizer = new MutationAuthorizer({
    persistence,
    allowed_origins: options?.allowed_origins ?? ["https://approved.example.test"],
    allowed_executable_ids: ["pnpm", "git"],
    allowed_cwd_refs: ["worktree:donggri-v1"],
    now: options?.now,
  });
  return { persistence, authorizer };
}

async function createApprovedMutation(
  authorizer: MutationAuthorizer,
): Promise<{ preview: MutationPreview; receipt: ApprovalReceipt; executeInput: MutationExecuteInput }> {
  const preview = await authorizer.createPreview({
    spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
    project_id: "DonggriCompany",
    operation: "run-contract-tests",
    resolved_target: "G:\\Donggri_DevDrive\\worktrees\\DonggriCompany-v1-stabilization",
    scope: { suites: ["control-plane", "mutation-authorizer"] },
    command: {
      executable_id: "pnpm",
      args: ["run", "test:api", "--", "mutation-authorizer"],
      cwd_ref: "worktree:donggri-v1",
    },
    source_epoch: "sha256:source-epoch-001",
    projection_epoch: PROJECTION_EPOCH,
    requester: "planning-master",
  });
  const receipt = await authorizer.issueApproval(preview.preview_id, "ops-approver");
  return {
    preview,
    receipt,
    executeInput: {
      preview_id: preview.preview_id,
      approval_id: receipt.approval_id,
      source_epoch: preview.source_epoch,
      current_projection_epoch: preview.projection_epoch,
      confirmation_text: preview.confirmation_text,
      idempotency_key: "idem-mutation-0001",
      guards: {
        authenticated: true,
        csrf_valid: true,
        origin: "http://127.0.0.1:8790",
      },
    },
  };
}

describe("MutationAuthorizer", () => {
  it("binds a server preview and receipt, then executes exactly once", async () => {
    const { authorizer, persistence } = createHarness();
    const approved = await createApprovedMutation(authorizer);
    const mutation = vi.fn(async ({ command }) => ({ executed: command.executable_id }));

    const result = await authorizer.execute(approved.executeInput, mutation);

    expect(result).toMatchObject({
      ok: true,
      status: "executed",
      value: { executed: "pnpm" },
    });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(approved.preview.confirmation_text).toMatch(/^승인 run-contract-tests [a-f0-9]{12}$/);
    expect(approved.receipt).toMatchObject({
      spec_id: approved.preview.spec_id,
      project_id: approved.preview.project_id,
      operation: approved.preview.operation,
      resolved_target: approved.preview.resolved_target,
      source_epoch: approved.preview.source_epoch,
      projection_epoch: approved.preview.projection_epoch,
      requester: approved.preview.requester,
      approver: "ops-approver",
    });
    expect(approved.receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyApprovalReceiptSha256(approved.receipt)).toBe(true);
    expect(
      verifyApprovalReceiptSha256({
        ...approved.receipt,
        projection_epoch: "sha256:projection-epoch-tampered",
      }),
    ).toBe(false);
    expect(
      (persistence as InMemoryMutationAuthorizerPersistence).listAudits().map((event) => event.event_type),
    ).toEqual([
      "preview_created",
      "approval_issued",
      "execution_started",
      "execution_effect_recorded",
      "execution_completed",
    ]);
  });

  it.each([
    ["not_authenticated", { authenticated: false, csrf_valid: true, origin: "http://localhost:8790" }],
    ["csrf_invalid", { authenticated: true, csrf_valid: false, origin: "http://localhost:8790" }],
    ["origin_not_allowed", { authenticated: true, csrf_valid: true, origin: "https://evil.ts.net" }],
  ] as const)("rejects %s before invoking a mutation", async (code, guards) => {
    const { authorizer } = createHarness();
    const approved = await createApprovedMutation(authorizer);
    const mutation = vi.fn(async () => ({ changed: true }));

    const result = await authorizer.execute({ ...approved.executeInput, guards }, mutation);

    expect(result).toEqual({ ok: false, code });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("permits only loopback or an exact configured non-loopback origin", async () => {
    const { authorizer } = createHarness();
    const first = await createApprovedMutation(authorizer);
    const allowed = await authorizer.execute(
      {
        ...first.executeInput,
        guards: { ...first.executeInput.guards, origin: "https://approved.example.test" },
      },
      async () => "allowed",
    );
    expect(allowed).toMatchObject({ ok: true, value: "allowed" });

    const second = await createApprovedMutation(authorizer);
    const callback = vi.fn(async () => "not-allowed");
    const suffixSpoof = await authorizer.execute(
      {
        ...second.executeInput,
        idempotency_key: "idem-mutation-0002",
        guards: { ...second.executeInput.guards, origin: "https://sub.approved.example.test" },
      },
      callback,
    );
    expect(suffixSpoof).toEqual({ ok: false, code: "origin_not_allowed" });
    expect(callback).not.toHaveBeenCalled();
  });

  it("rejects a tampered approval receipt before invoking a mutation", async () => {
    class TamperingPersistence extends InMemoryMutationAuthorizerPersistence {
      override async getApproval(approvalId: string): Promise<ApprovalReceipt | null> {
        const receipt = await super.getApproval(approvalId);
        return receipt ? { ...receipt, approver: "attacker" } : null;
      }
    }

    const persistence = new TamperingPersistence();
    const { authorizer } = createHarness({ persistence });
    const approved = await createApprovedMutation(authorizer);
    const mutation = vi.fn(async () => "changed");

    const result = await authorizer.execute(approved.executeInput, mutation);

    expect(result).toEqual({ ok: false, code: "approval_tampered" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("fails closed after preview or approval expiry", async () => {
    let currentMs = Date.parse("2026-07-25T00:00:00.000Z");
    const { authorizer } = createHarness({ now: () => new Date(currentMs) });
    const preview = await authorizer.createPreview({
      spec_id: "spec-v1",
      project_id: "DonggriCompany",
      operation: "build",
      resolved_target: "candidate-v1",
      scope: { target: "candidate" },
      command: { executable_id: "pnpm", args: ["run", "build"], cwd_ref: "worktree:donggri-v1" },
      source_epoch: "epoch-1",
      projection_epoch: PROJECTION_EPOCH,
      requester: "requester",
      expires_in_ms: 1_000,
    });
    const receipt = await authorizer.issueApproval(preview.preview_id, "approver");
    currentMs += 1_001;
    const mutation = vi.fn(async () => "changed");

    const result = await authorizer.execute(
      {
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        source_epoch: preview.source_epoch,
        current_projection_epoch: preview.projection_epoch,
        confirmation_text: preview.confirmation_text,
        idempotency_key: "idem-expired-0001",
        guards: { authenticated: true, csrf_valid: true, origin: "http://localhost:8790" },
      },
      mutation,
    );

    expect(result).toEqual({ ok: false, code: "preview_expired" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("replays the same idempotent result, rejects key conflicts, and prevents approval reuse", async () => {
    const { authorizer } = createHarness();
    const approved = await createApprovedMutation(authorizer);
    const mutation = vi.fn(async () => ({ run_id: "run-001" }));

    const first = await authorizer.execute(approved.executeInput, mutation);
    const replay = await authorizer.execute(approved.executeInput, mutation);
    const reusedApproval = await authorizer.execute(
      { ...approved.executeInput, idempotency_key: "idem-mutation-reuse-0002" },
      mutation,
    );
    expect(first).toMatchObject({ ok: true, status: "executed" });
    expect(replay).toMatchObject({ ok: true, status: "replayed", value: { run_id: "run-001" } });
    expect(reusedApproval).toEqual({ ok: false, code: "approval_reused" });
    expect(mutation).toHaveBeenCalledTimes(1);

    const second = await createApprovedMutation(authorizer);
    const conflictCallback = vi.fn(async () => "changed");
    const conflict = await authorizer.execute(
      {
        ...second.executeInput,
        idempotency_key: approved.executeInput.idempotency_key,
      },
      conflictCallback,
    );
    expect(conflict).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(conflictCallback).not.toHaveBeenCalled();
  });

  it("reconciles one durable effect after completion crash even when the preview TTL has elapsed", async () => {
    class CrashAfterEffectPersistence extends InMemoryMutationAuthorizerPersistence {
      reserveCalls = 0;
      private failCompletion = true;

      override async reserveExecution(input: Parameters<InMemoryMutationAuthorizerPersistence["reserveExecution"]>[0]) {
        const result = await super.reserveExecution(input);
        if (result.status === "reserved") this.reserveCalls += 1;
        return result;
      }

      override async completeExecution(
        input: Parameters<InMemoryMutationAuthorizerPersistence["completeExecution"]>[0],
      ) {
        if (this.failCompletion) {
          this.failCompletion = false;
          throw new Error("simulated_completion_crash");
        }
        return super.completeExecution(input);
      }
    }

    let currentMs = Date.parse("2026-07-25T00:00:00.000Z");
    const persistence = new CrashAfterEffectPersistence();
    const { authorizer } = createHarness({ persistence, now: () => new Date(currentMs) });
    const approved = await createApprovedMutation(authorizer);
    const effect = vi.fn(async () => ({ run_id: "durable-run-001" }));

    const first = await authorizer.execute(approved.executeInput, effect);
    expect(first).toEqual({ ok: false, code: "execution_reconciliation_required" });

    currentMs += 20 * 60 * 1_000;
    const recovered = await authorizer.execute(approved.executeInput, effect);

    expect(recovered).toMatchObject({
      ok: true,
      status: "replayed",
      value: { run_id: "durable-run-001" },
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(persistence.reserveCalls).toBe(1);
  });

  it.each([
    {
      executable_id: "pnpm && calc.exe",
      args: ["run", "build"],
      cwd_ref: "worktree:donggri-v1",
    },
    {
      executable_id: "pnpm",
      args: ["$(whoami)"],
      cwd_ref: "worktree:donggri-v1",
    },
    {
      executable_id: "pnpm",
      args: ["run", "build"],
      cwd_ref: "worktree:unknown",
    },
    {
      executable_id: "pnpm",
      args: ["run", "build"],
      cwd_ref: "worktree:donggri-v1",
      raw_shell: "pnpm run build && calc.exe",
    },
  ])("rejects raw shell, expansion, or unregistered command input", async (command) => {
    const { authorizer } = createHarness();

    await expect(
      authorizer.createPreview({
        spec_id: "spec-v1",
        project_id: "DonggriCompany",
        operation: "build",
        resolved_target: "candidate-v1",
        scope: { target: "candidate" },
        command,
        source_epoch: "epoch-1",
        projection_epoch: PROJECTION_EPOCH,
        requester: "requester",
      }),
    ).rejects.toBeInstanceOf(MutationInputError);
  });

  it("rejects source/projection epoch and manual-confirmation mismatches before mutation", async () => {
    const { authorizer } = createHarness();
    const approved = await createApprovedMutation(authorizer);
    const mutation = vi.fn(async () => "changed");

    expect(await authorizer.execute({ ...approved.executeInput, source_epoch: "epoch-tampered" }, mutation)).toEqual({
      ok: false,
      code: "source_epoch_mismatch",
    });
    expect(
      await authorizer.execute(
        { ...approved.executeInput, current_projection_epoch: "sha256:projection-epoch-tampered" },
        mutation,
      ),
    ).toEqual({
      ok: false,
      code: "projection_epoch_mismatch",
    });
    expect(
      await authorizer.execute({ ...approved.executeInput, confirmation_text: "자동 입력 승인" }, mutation),
    ).toEqual({ ok: false, code: "confirmation_mismatch" });
    expect(mutation).not.toHaveBeenCalled();
  });
});
