import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

import {
  CandidateScoreReportSchema,
  CandidateScoreRulesSchema,
  calculateCandidateScoreRulesSha256,
  type CandidateScoreReport,
} from "./candidate-score.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const CandidateCertificationDecisionSchema = z
  .object({
    schema: z.literal("donggri-certification-decision/v2"),
    report_type: z.literal("certification_decision"),
    candidate_id: z.string().regex(/^dongri-grigri-v01-[a-z0-9.-]+$/),
    git_sha: z.string().regex(/^[0-9a-f]{40}$/),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
    freeze_record_sha256: z.string().regex(SHA256_PATTERN),
    score_report_sha256: z.string().regex(SHA256_PATTERN),
    score_rules_sha256: z.string().regex(SHA256_PATTERN),
    score_aggregate: z.number().min(0).max(100),
    score_target: z.number().min(0).max(100),
    score_certification_eligible: z.boolean(),
    decided_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid_datetime"),
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
      value.score_certification_eligible &&
      value.score_aggregate >= value.score_target &&
      value.hard_gates.passed === value.hard_gates.total &&
      value.unresolved_critical === 0 &&
      value.unresolved_sev1 === 0;
    if (value.certification_claimed !== mayClaim) {
      context.addIssue({
        code: "custom",
        path: ["certification_claimed"],
        message: "candidate_certification_claim_must_match_bound_pass",
      });
    }
  });

export type CandidateCertificationDecision = z.infer<typeof CandidateCertificationDecisionSchema>;

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function requireEqual(actual: unknown, expected: unknown, code: string): void {
  if (actual !== expected) throw new Error(code);
}

export function validateCandidateCertificationDecision(
  input: unknown,
  filePath: string,
  scoreReportBytes: Buffer,
  scoreRulesBytes: Buffer,
): {
  decision: CandidateCertificationDecision;
  score_report: CandidateScoreReport;
} {
  if (path.basename(filePath) !== "CERTIFICATION_DECISION.json") {
    throw new Error("candidate_certification_decision_filename_invalid");
  }
  let scoreInput: unknown;
  try {
    scoreInput = JSON.parse(scoreReportBytes.toString("utf8"));
  } catch {
    throw new Error("candidate_certification_score_report_json_invalid");
  }
  const scoreReport = CandidateScoreReportSchema.parse(scoreInput);
  let scoreRulesInput: unknown;
  try {
    scoreRulesInput = JSON.parse(scoreRulesBytes.toString("utf8"));
  } catch {
    throw new Error("candidate_certification_score_rules_json_invalid");
  }
  const scoreRules = CandidateScoreRulesSchema.parse(scoreRulesInput);
  const decision = CandidateCertificationDecisionSchema.parse(input);
  requireEqual(decision.score_report_sha256, sha256(scoreReportBytes), "candidate_decision_score_sha_mismatch");
  requireEqual(decision.candidate_id, scoreReport.candidate_id, "candidate_decision_candidate_mismatch");
  requireEqual(decision.git_sha, scoreReport.git_sha, "candidate_decision_git_sha_mismatch");
  requireEqual(decision.source_epoch, scoreReport.source_epoch, "candidate_decision_source_epoch_mismatch");
  requireEqual(
    decision.freeze_record_sha256,
    scoreReport.freeze_record_sha256,
    "candidate_decision_freeze_record_mismatch",
  );
  requireEqual(decision.score_rules_sha256, scoreReport.score_rules_sha256, "candidate_decision_score_rules_mismatch");
  requireEqual(
    scoreReport.score_rules_sha256,
    calculateCandidateScoreRulesSha256(scoreRules),
    "candidate_decision_score_rules_artifact_mismatch",
  );
  requireEqual(scoreReport.score_version, scoreRules.score_version, "candidate_decision_score_version_mismatch");
  requireEqual(
    scoreReport.score_target,
    scoreRules.targets.aggregate,
    "candidate_decision_score_target_rules_mismatch",
  );
  const scoreDimensionIds = Object.keys(scoreReport.dimensions).sort();
  const ruleDimensionIds = scoreRules.dimensions.map((dimension) => dimension.id).sort();
  if (JSON.stringify(scoreDimensionIds) !== JSON.stringify(ruleDimensionIds)) {
    throw new Error("candidate_decision_score_dimensions_mismatch");
  }
  for (const dimension of scoreRules.dimensions) {
    requireEqual(
      scoreReport.dimensions[dimension.id]?.weight,
      dimension.weight,
      `candidate_decision_score_dimension_weight_mismatch:${dimension.id}`,
    );
  }
  for (const gate of scoreRules.hard_gates) {
    const reported = scoreReport.hard_gates.find((candidate) => candidate.id === gate.id);
    requireEqual(reported?.name, gate.name, `candidate_decision_hard_gate_rule_mismatch:${gate.id}`);
  }
  requireEqual(decision.score_aggregate, scoreReport.aggregate, "candidate_decision_score_aggregate_mismatch");
  requireEqual(decision.score_target, scoreReport.score_target, "candidate_decision_score_target_mismatch");
  requireEqual(
    decision.score_certification_eligible,
    scoreReport.certification_eligible,
    "candidate_decision_score_eligibility_mismatch",
  );
  const passed = scoreReport.hard_gates.filter((gate) => gate.status === "pass").length;
  requireEqual(decision.hard_gates.passed, passed, "candidate_decision_hard_gate_count_mismatch");
  if (decision.decision === "PASS" && !scoreReport.certification_eligible) {
    throw new Error("candidate_decision_pass_without_eligible_score");
  }
  return { decision, score_report: scoreReport };
}
