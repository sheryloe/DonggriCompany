import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid_datetime");

const ReleaseIdentityEvidenceSchema = z
  .object({
    product_id: z.literal("dongri-grigri"),
    release_epoch: z.literal("dongri-grigri-v1"),
    product_version: z.string().min(1),
    channel: z.enum(["alpha", "beta", "rc", "stable"]),
    git_sha: z.string().regex(/^[0-9a-f]{40}$/),
    candidate_id: z.string().min(1),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
  })
  .strict();

const EvidenceFileSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(SHA256_PATTERN),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export const ComponentReportSchema = z
  .object({
    schema: z.literal("donggri-component-report/v1"),
    report_type: z.literal("component"),
    component: z.string().min(1),
    candidate_id: z.string().min(1),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
    generated_at: ISO_DATE,
    evidence_mode: z.enum(["actual", "synthetic"]),
    component_status: z.enum(["collecting", "pass", "fail"]),
    certification_claimed: z.literal(false),
    evidence_files: z.array(EvidenceFileSchema),
    summary: z.string().min(1),
  })
  .strict();

export type ComponentReport = z.infer<typeof ComponentReportSchema>;

export const CertificationDecisionSchema = z
  .object({
    schema: z.literal("donggri-certification-decision/v1"),
    report_type: z.literal("certification_decision"),
    candidate_id: z.string().min(1),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
    decided_at: ISO_DATE,
    decision: z.enum(["PASS", "FAIL"]),
    certification_claimed: z.boolean(),
    final_evidence_pack_sha256: z.string().regex(SHA256_PATTERN),
    final_evidence_item_count: z.literal(16),
    assessor_ids: z.tuple([z.string().min(1), z.string().min(1)]),
    hard_gates: z
      .object({
        passed: z.number().int().min(0).max(10),
        total: z.literal(10),
      })
      .strict(),
    unresolved_critical: z.number().int().nonnegative(),
    unresolved_sev1: z.number().int().nonnegative(),
    decision_reasons: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assessor_ids[0] === value.assessor_ids[1]) {
      context.addIssue({ code: "custom", path: ["assessor_ids"], message: "assessors_must_be_distinct" });
    }
    const mayClaim =
      value.decision === "PASS" &&
      value.hard_gates.passed === value.hard_gates.total &&
      value.unresolved_critical === 0 &&
      value.unresolved_sev1 === 0;
    if (value.certification_claimed !== mayClaim) {
      context.addIssue({
        code: "custom",
        path: ["certification_claimed"],
        message: "certification_claim_must_match_final_pass",
      });
    }
  });

export type CertificationDecision = z.infer<typeof CertificationDecisionSchema>;

const FreezeRecordUnsignedSchema = z
  .object({
    schema: z.literal("donggri-source-epoch-freeze/v1"),
    approval_id: z.string().regex(/^APR-V1-[A-Z0-9-]+$/),
    selection_manifest_sha256: z.string().regex(SHA256_PATTERN),
    candidate_identity: ReleaseIdentityEvidenceSchema,
    candidate_identity_sha256: z.string().regex(SHA256_PATTERN),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
    approved_at: ISO_DATE,
    approval_expires_at: ISO_DATE,
    frozen_at: ISO_DATE,
  })
  .strict();

export const FreezeRecordSchema = FreezeRecordUnsignedSchema.extend({
  freeze_record_sha256: z.string().regex(SHA256_PATTERN),
}).strict();

export type FreezeRecord = z.infer<typeof FreezeRecordSchema>;
export type FreezeRecordUnsigned = z.infer<typeof FreezeRecordUnsignedSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashCanonical(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function calculateCandidateIdentitySha256(
  candidateIdentity: z.infer<typeof ReleaseIdentityEvidenceSchema>,
): string {
  return hashCanonical(candidateIdentity);
}

export function calculateFreezeRecordSha256(record: FreezeRecordUnsigned): string {
  return hashCanonical(record);
}

export function validateComponentReport(input: unknown): ComponentReport {
  return ComponentReportSchema.parse(input);
}

export function validateCertificationDecision(input: unknown, filePath: string): CertificationDecision {
  if (path.basename(filePath) !== "CERTIFICATION_DECISION.json") {
    throw new Error("certification_decision_filename_invalid");
  }
  return CertificationDecisionSchema.parse(input);
}

export function validateFreezeRecord(input: unknown): FreezeRecord {
  const record = FreezeRecordSchema.parse(input);
  const { freeze_record_sha256: actualRecordSha, ...unsigned } = record;
  if (record.source_epoch !== `sha256:${record.selection_manifest_sha256}`) {
    throw new Error("freeze_record_source_epoch_mismatch");
  }
  if (record.candidate_identity.source_epoch !== record.source_epoch) {
    throw new Error("freeze_record_candidate_source_epoch_mismatch");
  }
  if (record.candidate_identity_sha256 !== calculateCandidateIdentitySha256(record.candidate_identity)) {
    throw new Error("freeze_record_candidate_identity_hash_mismatch");
  }
  if (actualRecordSha !== calculateFreezeRecordSha256(unsigned)) {
    throw new Error("freeze_record_hash_mismatch");
  }
  const approvedAt = Date.parse(record.approved_at);
  const expiresAt = Date.parse(record.approval_expires_at);
  const frozenAt = Date.parse(record.frozen_at);
  if (!(approvedAt <= frozenAt && frozenAt < expiresAt)) {
    throw new Error("freeze_record_approval_window_invalid");
  }
  return record;
}

export function createFreezeRecord(input: Omit<FreezeRecordUnsigned, "candidate_identity_sha256">): FreezeRecord {
  const unsigned = FreezeRecordUnsignedSchema.parse({
    ...input,
    candidate_identity_sha256: calculateCandidateIdentitySha256(input.candidate_identity),
  });
  return {
    ...unsigned,
    freeze_record_sha256: calculateFreezeRecordSha256(unsigned),
  };
}
