import { z } from "zod";
import {
  Master95PilotWorkflowStageReceiptSchema,
  isCompleteMaster95IntegratedPilotWorkflow,
} from "./pilot-integrated-workflow.js";

const NonEmpty = z.string().trim().min(1);
export const Master95PilotRunSchema = z
  .object({
    run_id: NonEmpty,
    project_id: z.string().regex(/^project:[A-Za-z0-9._-]+$/),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime(),
    recorded_at: z.string().datetime(),
    status: z.enum(["pass", "fail"]),
    critical: z.boolean(),
    work_type: z.enum(["code", "document", "research", "image"]),
    scenario_type: z.enum(["normal", "failure", "cancel", "approval", "recovery"]),
    concurrency_group_id: NonEmpty,
    agent_version: NonEmpty,
    skill_version: NonEmpty,
    memory_version: NonEmpty,
    trace_id: NonEmpty,
    trace_span_count: z.number().int().positive(),
    artifact_refs: z.array(NonEmpty).min(1),
    evidence_refs: z.array(NonEmpty).min(1),
    workflow_stage_receipts: z.array(Master95PilotWorkflowStageReceiptSchema).default([]),
  })
  .strict();

export type Master95PilotRun = z.infer<typeof Master95PilotRunSchema>;

export const Master95IndependentAssessmentSchema = z
  .object({
    assessor_id: NonEmpty,
    design_score: z.number().min(0).max(100),
    implementation_score: z.number().min(0).max(100),
    aggregate_score: z.number().min(0).max(100),
    agy_axes: z.object({
      system: z.number().min(0).max(1000),
      functionality: z.number().min(0).max(1000),
      design: z.number().min(0).max(1000),
      stability: z.number().min(0).max(1000),
      implementation: z.number().min(0).max(1000),
    }),
    evidence_refs: z.array(NonEmpty).min(1),
  })
  .strict();

export type Master95IndependentAssessment = z.infer<typeof Master95IndependentAssessmentSchema>;

const ASSESSMENT_SCORE_FIELDS = ["design_score", "implementation_score", "aggregate_score"] as const;

export function evaluateMaster95AssessmentAgreement(
  assessments: Master95IndependentAssessment[],
  maximumScoreDelta = 2,
) {
  const assessorIds = assessments.map((assessment) => assessment.assessor_id);
  const distinctAssessorCount = new Set(assessorIds).size;
  const pairs = assessments.flatMap((left, leftIndex) =>
    assessments.slice(leftIndex + 1).map((right) => {
      const deltas = Object.fromEntries(
        ASSESSMENT_SCORE_FIELDS.map((field) => [field, Math.abs(left[field] - right[field])]),
      ) as Record<(typeof ASSESSMENT_SCORE_FIELDS)[number], number>;
      return {
        assessor_ids: [left.assessor_id, right.assessor_id] as [string, string],
        distinct_assessors: left.assessor_id !== right.assessor_id,
        score_deltas: deltas,
        maximum_score_delta: Math.max(...Object.values(deltas)),
      };
    }),
  );
  const firstPair = pairs[0] ?? null;
  const agreeingPair = pairs
    .filter((pair) => pair.distinct_assessors && pair.maximum_score_delta <= maximumScoreDelta)
    .sort((left, right) => left.maximum_score_delta - right.maximum_score_delta)[0];
  const adjudicationRequired = Boolean(firstPair && firstPair.maximum_score_delta > maximumScoreDelta);
  const adjudicationSatisfied = !adjudicationRequired || (assessments.length >= 3 && Boolean(agreeingPair));
  const gatePass =
    assessments.length >= 2 &&
    distinctAssessorCount === assessments.length &&
    Boolean(agreeingPair) &&
    adjudicationSatisfied;

  return {
    required_assessment_count: 2,
    received_assessment_count: assessments.length,
    distinct_assessor_count: distinctAssessorCount,
    maximum_allowed_score_delta: maximumScoreDelta,
    first_pair_maximum_score_delta: firstPair?.maximum_score_delta ?? null,
    agreement_pair_assessor_ids: agreeingPair?.assessor_ids ?? [],
    agreement_pair_score_deltas: agreeingPair?.score_deltas ?? null,
    adjudication_required: adjudicationRequired,
    adjudication_satisfied: adjudicationSatisfied,
    gate_pass: gatePass,
  };
}

export function evaluateMaster95PilotCertification(input: {
  runs: unknown[];
  assessments: unknown[];
  all_other_hard_gates_pass: boolean;
  observation: {
    started_at: string;
    evaluated_at: string;
    clock_source: "system-wall-clock";
    backdated_records_count: number;
  };
}) {
  const runs = input.runs.map((run) => Master95PilotRunSchema.parse(run));
  const assessments = input.assessments.map((item) => Master95IndependentAssessmentSchema.parse(item));
  const projects = new Set(runs.map((run) => run.project_id));
  const observationStart = Date.parse(z.string().datetime().parse(input.observation.started_at));
  const observationEnd = Date.parse(z.string().datetime().parse(input.observation.evaluated_at));
  if (observationEnd < observationStart) throw new Error("pilot_wall_clock_regression");
  const observedDays = (observationEnd - observationStart) / 86_400_000;
  const invalidTimestamps = runs.filter((run) => {
    const started = Date.parse(run.started_at);
    const completed = Date.parse(run.completed_at);
    const recorded = Date.parse(run.recorded_at);
    return (
      started < observationStart ||
      completed < started ||
      recorded < completed ||
      recorded - completed > 300_000 ||
      recorded > observationEnd
    );
  });
  const passed = runs.filter((run) => run.status === "pass").length;
  const critical = runs.filter((run) => run.critical);
  const criticalPassed = critical.filter((run) => run.status === "pass").length;
  const successRate = runs.length ? passed / runs.length : 0;
  const criticalSuccessRate = critical.length ? criticalPassed / critical.length : 0;
  const assessmentThresholdPass =
    assessments.length >= 2 &&
    assessments.every(
      (assessment) =>
        assessment.design_score >= 95 &&
        assessment.implementation_score >= 95 &&
        assessment.aggregate_score >= 95 &&
        Object.values(assessment.agy_axes).every((score) => score >= 950),
    );
  const assessmentAgreement = evaluateMaster95AssessmentAgreement(assessments);
  const workTypes = new Set(runs.map((run) => run.work_type));
  const scenarioTypes = new Set(runs.map((run) => run.scenario_type));
  const concurrentProjects = new Map<string, Set<string>>();
  for (const run of runs) {
    const projectsInGroup = concurrentProjects.get(run.concurrency_group_id) ?? new Set<string>();
    projectsInGroup.add(run.project_id);
    concurrentProjects.set(run.concurrency_group_id, projectsInGroup);
  }
  const gates = {
    project_count_minimum_3: projects.size >= 3,
    run_count_minimum_500: runs.length >= 500,
    observed_days_minimum_30: observedDays >= 30,
    success_rate_minimum_95_percent: successRate >= 0.95,
    critical_success_100_percent: criticalSuccessRate === 1,
    work_type_coverage_complete: ["code", "document", "research", "image"].every((type) =>
      workTypes.has(type as never),
    ),
    scenario_coverage_complete: ["normal", "failure", "cancel", "approval", "recovery"].every((type) =>
      scenarioTypes.has(type as never),
    ),
    concurrent_projects_minimum_2: [...concurrentProjects.values()].some((group) => group.size >= 2),
    agent_version_change_observed: new Set(runs.map((run) => run.agent_version)).size >= 2,
    skill_version_change_observed: new Set(runs.map((run) => run.skill_version)).size >= 2,
    memory_version_change_observed: new Set(runs.map((run) => run.memory_version)).size >= 2,
    trace_completeness_100_percent: runs.every((run) => run.trace_span_count > 0 && run.trace_id.length > 0),
    artifact_coverage_100_percent: runs.every((run) => run.artifact_refs.length > 0),
    integrated_e2e_scenario_observed: runs.some((run) =>
      isCompleteMaster95IntegratedPilotWorkflow(run.workflow_stage_receipts),
    ),
    no_backdated_or_invalid_records: input.observation.backdated_records_count === 0 && invalidTimestamps.length === 0,
    independent_assessments_minimum_2: assessmentThresholdPass,
    independent_assessors_distinct:
      assessments.length >= 2 && assessmentAgreement.distinct_assessor_count === assessments.length,
    independent_assessment_scores_within_two_points: assessmentAgreement.gate_pass,
    all_other_hard_gates_pass: input.all_other_hard_gates_pass,
  };
  return {
    status: Object.values(gates).every(Boolean) ? ("pass" as const) : ("pending" as const),
    project_count: projects.size,
    run_count: runs.length,
    observed_days: observedDays,
    success_rate: successRate,
    critical_success_rate: criticalSuccessRate,
    independent_assessment_count: assessments.length,
    assessment_agreement: assessmentAgreement,
    work_types: [...workTypes].sort(),
    scenario_types: [...scenarioTypes].sort(),
    invalid_timestamp_records: invalidTimestamps.length,
    gates,
  };
}
