import { describe, expect, it } from "vitest";

import { ContinuityCheckpointSchema, type ContinuityCheckpoint } from "./checkpoint-contract.ts";

function validCheckpoint(): ContinuityCheckpoint {
  return {
    schema_version: 1,
    checkpoint_id: "checkpoint:day02:1",
    previous_checkpoint_id: null,
    sequence: 1,
    project_id: "project:DonggriCompany",
    task_id: "task:continuity:day02",
    source_run_id: "run:codex:day02",
    source_provider: "codex",
    source_account_pool_id: "codex-primary",
    source_account_label: "Codex primary",
    target_provider: "claude",
    target_account_pool_id: "claude-primary",
    target_account_label: "Claude primary",
    target_run_id: null,
    provider_native_session_id: null,
    dispatch_id: null,
    status: "ready_for_transfer",
    objective: "Continue the same project task across providers",
    acceptance_criteria: ["workspace identity matches"],
    completed: ["checkpoint contract frozen"],
    pending: ["persist checkpoint"],
    blockers: [],
    next_safe_action: "Validate the target workspace",
    workspace: {
      canonical_project_path: "G:\\Donggri_DevDrive\\worktrees\\DonggriCompany-provider-continuity-live-map",
      git_root: "G:\\Donggri_DevDrive\\worktrees\\DonggriCompany-provider-continuity-live-map",
      branch: "codex/provider-continuity-live-map-v1",
      head: "ebcfcd7e78465594d543ffefb14f0d8e6e693cec",
      dirty: true,
      changed_paths: ["README.md", "server/modules/workflow/continuity/checkpoint-contract.ts"],
      workspace_digest: "a".repeat(64),
      captured_at: "2026-08-26T09:00:00+09:00",
    },
    verification: [{ command: "pnpm test:api", status: "passed", summary: "focused tests passed" }],
    evidence_refs: ["evidence.md#day-02"],
    approval_ref: "APR-PROVIDER-CONTINUITY-DAY02-03-003",
    idempotency_key: "continuity:day02:checkpoint:1",
    created_by: "IMPLEMENT",
    created_at: "2026-08-26T09:01:00+09:00",
  };
}

describe("ContinuityCheckpointSchema", () => {
  it("accepts a cross-provider checkpoint", () => {
    expect(ContinuityCheckpointSchema.parse(validCheckpoint())).toMatchObject({
      source_provider: "codex",
      target_provider: "claude",
      status: "ready_for_transfer",
    });
  });

  it("accepts a same-provider resume checkpoint", () => {
    const checkpoint = validCheckpoint();
    checkpoint.target_provider = "codex";
    checkpoint.target_account_pool_id = "codex-recovery";
    checkpoint.target_account_label = "Codex recovery";

    expect(ContinuityCheckpointSchema.parse(checkpoint)).toMatchObject({
      source_provider: "codex",
      source_account_pool_id: "codex-primary",
      target_provider: "codex",
      target_account_pool_id: "codex-recovery",
    });
  });

  it("keeps legacy schema-v1 records readable while accepting additive execution identity", () => {
    const legacy = validCheckpoint();
    delete legacy.source_account_pool_id;
    delete legacy.target_account_pool_id;
    delete legacy.target_run_id;
    delete legacy.provider_native_session_id;
    delete legacy.dispatch_id;
    expect(ContinuityCheckpointSchema.safeParse(legacy).success).toBe(true);

    const active = validCheckpoint();
    active.target_run_id = "run:claude:target";
    active.provider_native_session_id = "claude-session-target";
    active.dispatch_id = "dispatch:target";
    expect(ContinuityCheckpointSchema.parse(active)).toMatchObject({
      source_run_id: "run:codex:day02",
      target_run_id: "run:claude:target",
      provider_native_session_id: "claude-session-target",
      dispatch_id: "dispatch:target",
    });
  });

  it("rejects workspace contradictions independently of the provider pair", () => {
    const checkpoint = validCheckpoint();
    checkpoint.target_provider = "codex";
    checkpoint.workspace.dirty = false;

    const result = ContinuityCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(["clean_workspace_has_changes"]),
      );
    }
  });

  it("rejects unknown credential fields and credential-like text without echoing the secret", () => {
    const unknownField = { ...validCheckpoint(), access_token: "not-allowed" };
    expect(ContinuityCheckpointSchema.safeParse(unknownField).success).toBe(false);

    const checkpoint = validCheckpoint();
    const fakeCredential = `Bearer ${"abcdefghijklmnopqrstuvwxyz"}${"0123456789"}`;
    checkpoint.blockers = [fakeCredential];
    const result = ContinuityCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) {
      const rendered = JSON.stringify(result.error.issues);
      expect(rendered).toContain("credential_like_value");
      expect(rendered).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    }
  });

  it.each([
    "oauth_token=opaque-checkpoint-secret",
    "-----BEGIN OPENSSH PRIVATE KEY-----\nopaque-private-key-material\n-----END OPENSSH PRIVATE KEY-----",
    "-----BEGIN PGP PRIVATE KEY BLOCK-----\nopaque-pgp-key-material\n-----END PGP PRIVATE KEY BLOCK-----",
  ])("fails closed on a high-confidence secret before persistence", (secret) => {
    const checkpoint = validCheckpoint();
    checkpoint.objective = secret;
    const result = ContinuityCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) {
      const rendered = JSON.stringify(result.error.issues);
      expect(rendered).toContain("credential_like_value");
      expect(rendered).not.toContain("opaque-checkpoint-secret");
      expect(rendered).not.toContain("opaque-private-key-material");
      expect(rendered).not.toContain("opaque-pgp-key-material");
    }
  });

  it("requires a bounded identifier-safe idempotency key", () => {
    const unsafe = validCheckpoint();
    unsafe.idempotency_key = "RAW PROMPT oauth_token=opaque-idempotency-secret";
    expect(ContinuityCheckpointSchema.safeParse(unsafe).success).toBe(false);

    const oversized = validCheckpoint();
    oversized.idempotency_key = `capture:${"a".repeat(128)}`;
    expect(ContinuityCheckpointSchema.safeParse(oversized).success).toBe(false);
  });

  it("requires unique relative changed paths and a SHA-256 workspace digest", () => {
    const checkpoint = validCheckpoint();
    checkpoint.workspace.changed_paths = ["../outside.txt", "README.md", "README.md"];
    checkpoint.workspace.workspace_digest = "short";

    const result = ContinuityCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(["relative_git_path_required", "changed_paths_must_be_unique", "sha256_required"]),
      );
    }
  });
});
