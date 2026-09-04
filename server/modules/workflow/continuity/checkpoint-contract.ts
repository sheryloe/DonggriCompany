import { z } from "zod";

import { findSensitiveCheckpointValues } from "./checkpoint-safety.js";

export const CONTINUITY_PROVIDERS = ["codex", "claude"] as const;
export const CONTINUITY_CHECKPOINT_STATUSES = [
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
] as const;

const NonEmpty = z.string().trim().min(1);
const SafeIdempotencyKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/, "safe_idempotency_key_required");
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "sha256_required");
const GitHead = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, "git_head_required");
const RelativeGitPath = NonEmpty.refine(
  (value) => !value.includes("\\") && !value.startsWith("/") && !value.split("/").includes(".."),
  "relative_git_path_required",
);

export const ContinuityVerificationSchema = z
  .object({
    command: NonEmpty,
    status: z.enum(["passed", "failed", "skipped", "unavailable"]),
    summary: NonEmpty,
  })
  .strict();

export const ContinuityWorkspaceSchema = z
  .object({
    canonical_project_path: NonEmpty,
    git_root: NonEmpty,
    branch: NonEmpty.nullable(),
    head: GitHead,
    dirty: z.boolean(),
    changed_paths: z.array(RelativeGitPath),
    workspace_digest: Sha256,
    captured_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((workspace, context) => {
    if (new Set(workspace.changed_paths).size !== workspace.changed_paths.length) {
      context.addIssue({ code: "custom", path: ["changed_paths"], message: "changed_paths_must_be_unique" });
    }
    if (!workspace.dirty && workspace.changed_paths.length > 0) {
      context.addIssue({ code: "custom", path: ["changed_paths"], message: "clean_workspace_has_changes" });
    }
  });

export const ContinuityCheckpointSchema = z
  .object({
    schema_version: z.literal(1),
    checkpoint_id: NonEmpty,
    previous_checkpoint_id: NonEmpty.nullable(),
    sequence: z.number().int().positive(),
    project_id: NonEmpty,
    task_id: NonEmpty,
    source_run_id: NonEmpty,
    source_provider: z.enum(CONTINUITY_PROVIDERS),
    source_account_pool_id: NonEmpty.optional(),
    source_account_label: NonEmpty.optional(),
    target_provider: z.enum(CONTINUITY_PROVIDERS),
    target_account_pool_id: NonEmpty.optional(),
    target_account_label: NonEmpty.optional(),
    target_run_id: NonEmpty.nullable().optional(),
    provider_native_session_id: NonEmpty.nullable().optional(),
    dispatch_id: NonEmpty.nullable().optional(),
    status: z.enum(CONTINUITY_CHECKPOINT_STATUSES),
    objective: NonEmpty,
    acceptance_criteria: z.array(NonEmpty).min(1),
    completed: z.array(NonEmpty),
    pending: z.array(NonEmpty),
    blockers: z.array(NonEmpty),
    next_safe_action: NonEmpty,
    workspace: ContinuityWorkspaceSchema,
    verification: z.array(ContinuityVerificationSchema),
    evidence_refs: z.array(NonEmpty),
    approval_ref: NonEmpty.nullable(),
    idempotency_key: SafeIdempotencyKey,
    created_by: NonEmpty,
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    for (const finding of findSensitiveCheckpointValues(checkpoint)) {
      context.addIssue({ code: "custom", path: finding.path, message: finding.reason });
    }
  });

export type ContinuityCheckpoint = z.infer<typeof ContinuityCheckpointSchema>;
export type ContinuityWorkspace = z.infer<typeof ContinuityWorkspaceSchema>;
export type ContinuityVerification = z.infer<typeof ContinuityVerificationSchema>;
