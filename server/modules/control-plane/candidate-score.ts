import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

import type { VerifiedCandidateEvidenceFile } from "./candidate-component-report.ts";
import { type CandidateComponentReport, validateCandidateComponentReport } from "./certification-contract.ts";

const ACTIVE_SPEC_ID = "20260725-donggricompany-v1-stabilization-certification-v1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const RuleDimensionSchema = z
  .object({
    id: z.string().min(1),
    weight: z.number().positive(),
    components: z.array(z.string().min(1)).min(1),
  })
  .strict();

const RuleHardGateSchema = z
  .object({
    id: z.string().regex(/^M95-G\d{2}$/),
    name: z.string().min(1),
    components: z.array(z.string().min(1)).min(1),
  })
  .strict();

const HistoricalBaselineSchema = z
  .object({
    score: z.number().min(0).max(100),
    hard_gates_declared_passed: z.number().int().min(0).max(10),
    credit: z.literal(0),
    reason: z.string().min(1),
  })
  .strict();

export const CandidateScoreRulesSchema = z
  .object({
    schema: z.literal("donggri-candidate-score-rules/v1"),
    spec_id: z.literal(ACTIVE_SPEC_ID),
    release_epoch: z.literal("dongri-grigri-v1"),
    score_version: z.string().min(1),
    component_score_model: z.literal("actual_pass_quality_score_mean"),
    hard_gate_model: z.literal("binary_component_status"),
    targets: z
      .object({
        aggregate: z.number().min(0).max(100),
        hard_gates_required: z.literal(10),
      })
      .strict(),
    historical_baseline: HistoricalBaselineSchema,
    dimensions: z.array(RuleDimensionSchema).length(9),
    hard_gates: z.array(RuleHardGateSchema).length(10),
  })
  .strict()
  .superRefine((value, context) => {
    const weight = value.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (weight !== 100) {
      context.addIssue({ code: "custom", path: ["dimensions"], message: "dimension_weight_total_must_equal_100" });
    }
    for (const [field, values] of [
      ["dimensions", value.dimensions.map((item) => item.id)],
      ["hard_gates.id", value.hard_gates.map((item) => item.id)],
      ["hard_gates.name", value.hard_gates.map((item) => item.name)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", path: [field], message: `${field}_must_be_unique` });
      }
    }
  });

export type CandidateScoreRules = z.infer<typeof CandidateScoreRulesSchema>;

export type CandidateScoreIdentity = {
  candidate_id: string;
  git_sha: string;
  source_epoch: string;
  freeze_record_sha256: string;
};

export type CandidateScoreEvidence = {
  path: string;
  sha256: string;
  bytes: number;
  report: CandidateComponentReport;
  verified_evidence_files: VerifiedCandidateEvidenceFile[];
};

export type HardGateResult = {
  id: string;
  name: string;
  status: "collecting" | "pass" | "fail";
  computed: true;
  evidence_refs: string[];
  blockers: string[];
};

const CandidateScoreRejectedEvidenceSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(SHA256_PATTERN),
    bytes: z.number().int().positive(),
    code: z.string().min(1),
  })
  .strict();

export type CandidateScoreRejectedEvidence = z.infer<typeof CandidateScoreRejectedEvidenceSchema>;

const CandidateDimensionResultSchema = z
  .object({
    weight: z.number().positive(),
    score: z.number().min(0).max(100),
    evidence_sha256: z.array(z.string().regex(SHA256_PATTERN)),
    blockers: z.array(z.string().min(1)),
  })
  .strict();

const HardGateResultSchema = z
  .object({
    id: z.string().regex(/^M95-G\d{2}$/),
    name: z.string().min(1),
    status: z.enum(["collecting", "pass", "fail"]),
    computed: z.literal(true),
    evidence_refs: z.array(z.string().regex(SHA256_PATTERN)),
    blockers: z.array(z.string().min(1)),
  })
  .strict();

export const CandidateScoreReportSchema = z
  .object({
    schema: z.literal("donggri-candidate-score-report/v2"),
    report_type: z.literal("candidate_score"),
    spec_id: z.literal(ACTIVE_SPEC_ID),
    candidate_id: z.string().regex(/^dongri-grigri-v01-[a-z0-9.-]+$/),
    git_sha: z.string().regex(GIT_SHA_PATTERN),
    source_epoch: z.string().regex(SOURCE_EPOCH_PATTERN),
    freeze_record_sha256: z.string().regex(SHA256_PATTERN),
    score_rules_sha256: z.string().regex(SHA256_PATTERN),
    score_version: z.string().min(1),
    score_target: z.number().min(0).max(100),
    generated_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid_datetime"),
    dimensions: z.record(z.string().min(1), CandidateDimensionResultSchema),
    hard_gates: z.array(HardGateResultSchema).length(10),
    rejected_evidence: z.array(CandidateScoreRejectedEvidenceSchema),
    aggregate: z.number().min(0).max(100),
    certification_eligible: z.boolean(),
    blockers: z.array(z.string().min(1)),
    historical_baseline: HistoricalBaselineSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const dimensions = Object.values(value.dimensions);
    const weightTotal = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (dimensions.length !== 9 || Math.abs(weightTotal - 100) > 0.000001) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "candidate_score_dimension_weight_invalid",
      });
    }
    const computedAggregate = roundScore(
      dimensions.reduce((sum, dimension) => sum + dimension.score * (dimension.weight / 100), 0),
    );
    if (computedAggregate !== value.aggregate) {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "candidate_score_aggregate_not_computed",
      });
    }
    const gateIds = value.hard_gates.map((gate) => gate.id);
    if (new Set(gateIds).size !== gateIds.length) {
      context.addIssue({
        code: "custom",
        path: ["hard_gates"],
        message: "candidate_score_hard_gate_ids_not_unique",
      });
    }
    const expectedBlockers = [
      ...new Set([
        ...dimensions.flatMap((dimension) => dimension.blockers),
        ...value.hard_gates.flatMap((gate) => gate.blockers),
        ...value.rejected_evidence.map((item) => `evidence_rejected:${item.code}:${item.path}`),
      ]),
    ].sort();
    if (JSON.stringify(expectedBlockers) !== JSON.stringify([...new Set(value.blockers)].sort())) {
      context.addIssue({
        code: "custom",
        path: ["blockers"],
        message: "candidate_score_blockers_not_computed",
      });
    }
    const eligible =
      value.aggregate >= value.score_target &&
      value.hard_gates.every((gate) => gate.status === "pass") &&
      expectedBlockers.length === 0;
    if (eligible !== value.certification_eligible) {
      context.addIssue({
        code: "custom",
        path: ["certification_eligible"],
        message: "candidate_score_eligibility_not_computed",
      });
    }
  });

export type CandidateScoreReport = z.infer<typeof CandidateScoreReportSchema>;

type ResolvedComponent = {
  state: "collecting" | "pass" | "fail";
  evidence: CandidateScoreEvidence | null;
  quality_score: number;
  blockers: string[];
};

function assertIdentity(identity: CandidateScoreIdentity): void {
  if (!/^dongri-grigri-v01-[a-z0-9.-]+$/.test(identity.candidate_id)) {
    throw new Error("candidate_score_candidate_id_invalid");
  }
  if (!GIT_SHA_PATTERN.test(identity.git_sha)) throw new Error("candidate_score_git_sha_invalid");
  if (!SOURCE_EPOCH_PATTERN.test(identity.source_epoch)) throw new Error("candidate_score_source_epoch_invalid");
  if (!SHA256_PATTERN.test(identity.freeze_record_sha256)) {
    throw new Error("candidate_score_freeze_record_sha256_invalid");
  }
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

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

export function calculateCandidateScoreRulesSha256(input: unknown): string {
  const rules = CandidateScoreRulesSchema.parse(input);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(rules)), "utf8")
    .digest("hex");
}

function evidenceDescriptorKey(value: { descriptor_path: string; sha256: string; bytes: number }): string {
  return `${value.descriptor_path}\u0000${value.sha256}\u0000${value.bytes}`;
}

function assertVerifiedEvidenceFiles(item: CandidateScoreEvidence, report: CandidateComponentReport): void {
  if (item.verified_evidence_files.length !== report.evidence_files.length) {
    throw new Error(`component_report_evidence_verification_count_mismatch:${report.component}`);
  }
  const expected = report.evidence_files
    .map((file) => evidenceDescriptorKey({ descriptor_path: file.path, sha256: file.sha256, bytes: file.bytes }))
    .sort();
  const actual = item.verified_evidence_files.map((file) => {
    if (!path.isAbsolute(file.absolute_path) || !path.isAbsolute(file.physical_path)) {
      throw new Error(`component_report_evidence_verification_path_invalid:${report.component}`);
    }
    if (!SHA256_PATTERN.test(file.sha256) || !Number.isInteger(file.bytes) || file.bytes < 0) {
      throw new Error(`component_report_evidence_verification_invalid:${report.component}`);
    }
    return evidenceDescriptorKey(file);
  });
  if (new Set(actual).size !== actual.length) {
    throw new Error(`component_report_evidence_verification_duplicate:${report.component}`);
  }
  actual.sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`component_report_evidence_verification_mismatch:${report.component}`);
  }
}

function resolveComponent(component: string, evidence: Map<string, CandidateScoreEvidence>): ResolvedComponent {
  const item = evidence.get(component) ?? null;
  if (!item) {
    return {
      state: "collecting",
      evidence: null,
      quality_score: 0,
      blockers: [`component_missing:${component}`],
    };
  }
  if (item.report.evidence_mode !== "actual") {
    return {
      state: "collecting",
      evidence: item,
      quality_score: 0,
      blockers: [`component_not_actual:${component}`],
    };
  }
  if (item.report.component_status === "fail") {
    return {
      state: "fail",
      evidence: item,
      quality_score: 0,
      blockers: [`component_failed:${component}`],
    };
  }
  if (item.report.component_status !== "pass") {
    return {
      state: "collecting",
      evidence: item,
      quality_score: 0,
      blockers: [`component_not_pass:${component}:${item.report.component_status}`],
    };
  }
  return { state: "pass", evidence: item, quality_score: item.report.quality_score, blockers: [] };
}

export function evaluateCandidateScore(input: {
  rules: unknown;
  identity: CandidateScoreIdentity;
  evidence: CandidateScoreEvidence[];
  rejected_evidence?: CandidateScoreRejectedEvidence[];
  generated_at: string;
}): CandidateScoreReport {
  const rules = CandidateScoreRulesSchema.parse(input.rules);
  const scoreRulesSha256 = calculateCandidateScoreRulesSha256(rules);
  assertIdentity(input.identity);
  if (Number.isNaN(Date.parse(input.generated_at))) throw new Error("candidate_score_generated_at_invalid");
  const rejectedEvidence = (input.rejected_evidence ?? []).map((item) =>
    CandidateScoreRejectedEvidenceSchema.parse(item),
  );
  if (new Set(rejectedEvidence.map((item) => item.path)).size !== rejectedEvidence.length) {
    throw new Error("candidate_score_rejected_evidence_duplicate");
  }

  const knownComponents = new Set([
    ...rules.dimensions.flatMap((dimension) => dimension.components),
    ...rules.hard_gates.flatMap((gate) => gate.components),
  ]);
  const evidence = new Map<string, CandidateScoreEvidence>();
  for (const item of input.evidence) {
    const report = validateCandidateComponentReport(item.report);
    if (!SHA256_PATTERN.test(item.sha256)) throw new Error(`component_report_sha256_invalid:${report.component}`);
    if (!Number.isInteger(item.bytes) || item.bytes <= 0) {
      throw new Error(`component_report_bytes_invalid:${report.component}`);
    }
    if (!knownComponents.has(report.component)) throw new Error(`component_report_unexpected:${report.component}`);
    if (evidence.has(report.component)) throw new Error(`component_report_duplicate:${report.component}`);
    if (report.candidate_id !== input.identity.candidate_id) {
      throw new Error(`component_report_candidate_mismatch:${report.component}`);
    }
    if (report.git_sha !== input.identity.git_sha) {
      throw new Error(`component_report_git_sha_mismatch:${report.component}`);
    }
    if (report.source_epoch !== input.identity.source_epoch) {
      throw new Error(`component_report_source_epoch_mismatch:${report.component}`);
    }
    assertVerifiedEvidenceFiles(item, report);
    evidence.set(report.component, { ...item, report });
  }

  const dimensions = Object.fromEntries(
    rules.dimensions.map((dimension) => {
      const resolved = dimension.components.map((component) => resolveComponent(component, evidence));
      return [
        dimension.id,
        {
          weight: dimension.weight,
          score: roundScore(resolved.reduce((sum, component) => sum + component.quality_score, 0) / resolved.length),
          evidence_sha256: resolved
            .flatMap((component) => (component.evidence ? [component.evidence.sha256] : []))
            .sort(),
          blockers: [...new Set(resolved.flatMap((component) => component.blockers))].sort(),
        },
      ];
    }),
  );

  const hardGates = rules.hard_gates.map((gate): HardGateResult => {
    const resolved = gate.components.map((component) => resolveComponent(component, evidence));
    const status = resolved.some((component) => component.state === "fail")
      ? "fail"
      : resolved.every((component) => component.state === "pass")
        ? "pass"
        : "collecting";
    return {
      id: gate.id,
      name: gate.name,
      status,
      computed: true,
      evidence_refs: resolved.flatMap((component) => (component.evidence ? [component.evidence.sha256] : [])).sort(),
      blockers: resolved.flatMap((component) => component.blockers).sort(),
    };
  });

  const aggregate = roundScore(
    rules.dimensions.reduce((sum, dimension) => sum + dimensions[dimension.id].score * (dimension.weight / 100), 0),
  );
  const blockers = [
    ...new Set([
      ...Object.values(dimensions).flatMap((dimension) => dimension.blockers),
      ...hardGates.flatMap((gate) => gate.blockers),
      ...rejectedEvidence.map((item) => `evidence_rejected:${item.code}:${item.path}`),
    ]),
  ].sort();
  const hardGatesPassed = hardGates.filter((gate) => gate.status === "pass").length;

  return CandidateScoreReportSchema.parse({
    schema: "donggri-candidate-score-report/v2",
    report_type: "candidate_score",
    spec_id: rules.spec_id,
    candidate_id: input.identity.candidate_id,
    git_sha: input.identity.git_sha,
    source_epoch: input.identity.source_epoch,
    freeze_record_sha256: input.identity.freeze_record_sha256,
    score_rules_sha256: scoreRulesSha256,
    score_version: rules.score_version,
    score_target: rules.targets.aggregate,
    generated_at: input.generated_at,
    dimensions,
    hard_gates: hardGates,
    rejected_evidence: rejectedEvidence,
    aggregate,
    certification_eligible:
      aggregate >= rules.targets.aggregate &&
      hardGatesPassed === rules.targets.hard_gates_required &&
      blockers.length === 0,
    blockers,
    historical_baseline: rules.historical_baseline,
  });
}
