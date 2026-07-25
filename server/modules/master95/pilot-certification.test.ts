import { describe, expect, it } from "vitest";
import { Master95CooOrchestrator } from "./coo-orchestrator.js";
import { Master95DurableStateStore, Master95MemoryEventJournal } from "./durable-state-store.js";
import {
  evaluateDonggriV1CandidatePilotCertification,
  evaluateMaster95AssessmentAgreement,
  evaluateMaster95PilotCertification,
} from "./pilot-certification.js";
import { MASTER95_INTEGRATED_E2E_STAGES, runMaster95IntegratedPilotWorkflow } from "./pilot-integrated-workflow.js";
import {
  MASTER95_PILOT_SCENARIO_TYPES,
  MASTER95_PILOT_WORK_TYPES,
  calculateMaster95PilotNextBatchDelay,
  createMaster95PilotScenarioPlan,
} from "./pilot-scenario-plan.js";

function runs(count = 500, days = 31) {
  const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
  return Array.from({ length: count }, (_, index) => {
    const elapsed = (index / Math.max(count - 1, 1)) * days * 86_400_000;
    const started = new Date(Date.parse("2026-07-14T00:00:00.000Z") + elapsed);
    const runId = `pilot:${index + 1}`;
    return {
      run_id: runId,
      project_id: projects[index % projects.length],
      started_at: started.toISOString(),
      completed_at: new Date(started.getTime() + 1000).toISOString(),
      recorded_at: new Date(started.getTime() + 2000).toISOString(),
      status: "pass",
      critical: index < 50,
      work_type: ["code", "document", "research", "image"][index % 4],
      scenario_type: ["normal", "failure", "cancel", "approval", "recovery"][index % 5],
      concurrency_group_id: `batch:${Math.floor(index / 3)}`,
      agent_version: index < count / 2 ? "agent-v1" : "agent-v2",
      skill_version: index < count / 2 ? "skill-v1" : "skill-v2",
      memory_version: index < count / 2 ? "memory-v1" : "memory-v2",
      trace_id: `trace:pilot:${index + 1}`,
      trace_span_count: 6,
      artifact_refs: [`artifact:pilot:${index + 1}`],
      evidence_refs: [`EV-PILOT-${index + 1}`],
      workflow_stage_receipts:
        index === 0
          ? runMaster95IntegratedPilotWorkflow({
              run_id: runId,
              project_id: projects[index % projects.length],
              occurred_at: new Date(started.getTime() + 2000).toISOString(),
            })
          : [],
    };
  });
}

function observation(days = 31) {
  const started = Date.parse("2026-07-14T00:00:00.000Z");
  return {
    started_at: new Date(started).toISOString(),
    evaluated_at: new Date(started + days * 86_400_000 + (days > 0 ? 10_000 : 0)).toISOString(),
    clock_source: "system-wall-clock" as const,
    backdated_records_count: 0,
  };
}

function assessments() {
  return ["reviewer-a", "reviewer-b"].map((assessor_id) => ({
    assessor_id,
    design_score: 96,
    implementation_score: 96,
    aggregate_score: 96,
    agy_axes: { system: 960, functionality: 960, design: 960, stability: 960, implementation: 960 },
    evidence_refs: [`EV-${assessor_id}`],
  }));
}

const candidateBinding = {
  candidate_id: "dongri-grigri-v1-alpha.0",
  source_epoch: `sha256:${"8".repeat(64)}`,
};

function candidateRuns(count = 500, days = 30) {
  const requiredProjects = ["project:DonggriCompany", "project:BloggerGent", "project:DonggrolGameBook"];
  return runs(count, days).map((run, index) => ({
    ...run,
    ...candidateBinding,
    project_id: requiredProjects[index % requiredProjects.length],
  }));
}

function candidateHeartbeats(days = 30) {
  const startedAt = Date.parse("2026-07-14T00:00:00.000Z");
  const count = days * 24 * 60 + 1;
  return Array.from({ length: count }, (_, index) => ({
    schema_version: "dongri-grigri-v1.heartbeat.v1",
    ...candidateBinding,
    sequence: index + 1,
    recorded_at: new Date(startedAt + index * 60_000).toISOString(),
    collector_instance_id: "pilot-collector-v1",
  }));
}

function candidateAssessments() {
  return ["reviewer-a", "reviewer-b"].map((assessor_id) => ({
    assessor_id,
    design_score: 98,
    implementation_score: 97,
    aggregate_score: 97.5,
    agy_axes: { system: 950, functionality: 950, design: 950, stability: 950, implementation: 950 },
    evidence_refs: [`EV-${assessor_id}`],
  }));
}

describe("Master95 pilot certification gate", () => {
  it("passes only a 3-project, 500-run, 30-day, independently reviewed pilot", () => {
    expect(
      evaluateMaster95PilotCertification({
        runs: runs(),
        assessments: assessments(),
        all_other_hard_gates_pass: true,
        observation: observation(),
      }),
    ).toMatchObject({
      status: "pass",
      project_count: 3,
      run_count: 500,
      success_rate: 1,
      critical_success_rate: 1,
      assessment_agreement: { gate_pass: true, first_pair_maximum_score_delta: 0 },
    });
  });

  it("keeps an empty readiness package pending", () => {
    const result = evaluateMaster95PilotCertification({
      runs: [],
      assessments: [],
      all_other_hard_gates_pass: false,
      observation: observation(0),
    });
    expect(result).toMatchObject({
      status: "pending",
      run_count: 0,
      observed_days: 0,
    });
    expect(result.gates.independent_assessors_distinct).toBe(false);
    expect(result.gates.independent_assessment_scores_within_two_points).toBe(false);
  });

  it("does not count a simulated 500-run suite without 30 observed days", () => {
    const result = evaluateMaster95PilotCertification({
      runs: runs(500, 0),
      assessments: assessments(),
      all_other_hard_gates_pass: true,
      observation: observation(0),
    });
    expect(result.status).toBe("pending");
    expect(result.gates.observed_days_minimum_30).toBe(false);
  });

  it("blocks any Critical failure regardless of aggregate rate", () => {
    const candidate = runs();
    candidate[0] = { ...candidate[0], status: "fail" };
    const result = evaluateMaster95PilotCertification({
      runs: candidate,
      assessments: assessments(),
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(result.status).toBe("pending");
    expect(result.gates.critical_success_100_percent).toBe(false);
  });

  it("requires every independent score and AGY axis to meet its gate", () => {
    const reviews = assessments();
    reviews[1] = { ...reviews[1], implementation_score: 94 };
    const result = evaluateMaster95PilotCertification({
      runs: runs(),
      assessments: reviews,
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(result.gates.independent_assessments_minimum_2).toBe(false);
    expect(result.status).toBe("pending");
  });

  it("requires distinct assessor identities", () => {
    const reviews = assessments();
    reviews[1] = { ...reviews[1], assessor_id: reviews[0].assessor_id };
    const result = evaluateMaster95PilotCertification({
      runs: runs(),
      assessments: reviews,
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(result.gates.independent_assessors_distinct).toBe(false);
    expect(result.gates.independent_assessment_scores_within_two_points).toBe(false);
    expect(result.status).toBe("pending");
  });

  it("requires adjudication when the first two scores differ by more than two points", () => {
    const reviews = assessments();
    reviews[1] = {
      ...reviews[1],
      design_score: 99,
      implementation_score: 99,
      aggregate_score: 99,
    };
    const result = evaluateMaster95PilotCertification({
      runs: runs(),
      assessments: reviews,
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(result.assessment_agreement).toMatchObject({
      first_pair_maximum_score_delta: 3,
      adjudication_required: true,
      adjudication_satisfied: false,
      gate_pass: false,
    });
    expect(result.status).toBe("pending");
  });

  it("accepts a third independent adjudicator only when an agreeing pair is within two points", () => {
    const reviews = assessments();
    reviews[1] = {
      ...reviews[1],
      design_score: 99,
      implementation_score: 99,
      aggregate_score: 99,
    };
    reviews.push({
      ...reviews[0],
      assessor_id: "reviewer-c",
      design_score: 96.5,
      implementation_score: 96.5,
      aggregate_score: 96.5,
      evidence_refs: ["EV-reviewer-c"],
    });
    const agreement = evaluateMaster95AssessmentAgreement(reviews);
    expect(agreement).toMatchObject({
      distinct_assessor_count: 3,
      first_pair_maximum_score_delta: 3,
      adjudication_required: true,
      adjudication_satisfied: true,
      gate_pass: true,
    });
    expect(agreement.agreement_pair_assessor_ids).toEqual(["reviewer-a", "reviewer-c"]);
    const result = evaluateMaster95PilotCertification({
      runs: runs(),
      assessments: reviews,
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(result.gates.independent_assessment_scores_within_two_points).toBe(true);
    expect(result.status).toBe("pass");
  });

  it("requires the complete ordered CEO-to-artifact integrated E2E chain", () => {
    const candidate = runs();
    candidate.forEach((run) => {
      run.workflow_stage_receipts = [];
    });
    const missing = evaluateMaster95PilotCertification({
      runs: candidate,
      assessments: assessments(),
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(missing.gates.integrated_e2e_scenario_observed).toBe(false);
    expect(missing.status).toBe("pending");

    candidate[0].workflow_stage_receipts = runMaster95IntegratedPilotWorkflow({
      run_id: candidate[0].run_id,
      project_id: candidate[0].project_id,
      occurred_at: candidate[0].recorded_at,
    });
    const complete = evaluateMaster95PilotCertification({
      runs: candidate,
      assessments: assessments(),
      all_other_hard_gates_pass: true,
      observation: observation(),
    });
    expect(candidate[0].workflow_stage_receipts.map((receipt) => receipt.stage)).toEqual(
      MASTER95_INTEGRATED_E2E_STAGES,
    );
    expect(complete.gates.integrated_e2e_scenario_observed).toBe(true);
    expect(complete.status).toBe("pass");
  });

  it("executes all 20 work/scenario combinations with the planned terminal status", () => {
    let index = 0;
    for (const workType of MASTER95_PILOT_WORK_TYPES) {
      for (const scenario of MASTER95_PILOT_SCENARIO_TYPES) {
        index += 1;
        const plan = createMaster95PilotScenarioPlan(workType, scenario);
        const orchestrator = new Master95CooOrchestrator(
          new Master95DurableStateStore(new Master95MemoryEventJournal()),
          undefined,
          undefined,
          scenario === "failure"
            ? () => ({ ok: false as const, reason: "pilot_injected_failure", retryable: false })
            : () => ({ ok: true as const, evidence_refs: [`pilot:matrix:${index}`] }),
        );
        const result = orchestrator.execute({
          project_id: "project:BloggerGent",
          task_id: `task:pilot:matrix:${index}`,
          run_id: `run:pilot:matrix:${index}`,
          trace_id: `trace:pilot:matrix:${index}`,
          occurred_at: "2026-07-15T00:00:00.000Z",
          objective: `${workType} ${scenario} matrix check`,
          operation_class: plan.operation_class,
          target_path: plan.target_path,
          allowed_paths: plan.allowed_paths,
          approvals: plan.approvals,
          cancel_after_step: plan.cancel_after_step,
        });
        expect(result.status, `${workType}/${scenario}`).toBe(plan.expected_status);
      }
    }
    expect(index).toBe(20);
  });

  it("binds code Pilot plans to the frozen candidate worktree and V1 approvals", () => {
    const plan = createMaster95PilotScenarioPlan("code", "normal");
    expect(plan.target_path).toContain("G:/Donggri_DevDrive/worktrees/DonggriCompany-v1-stabilization/");
    expect(plan.target_path).not.toContain("/repos/DonggriCompany/");
    expect(plan.allowed_paths).toEqual([
      "G:/Donggri_DevDrive/worktrees/DonggriCompany-v1-stabilization/server/modules/master95/*",
    ]);
    expect(plan.approvals).toEqual(["APR-M95-RUNTIME-ALPHA-001"]);
  });

  it("resumes the four-hour cadence after a collector restart without adding an immediate batch", () => {
    const completedAt = "2026-07-15T00:00:00.000Z";
    const interval = 4 * 60 * 60 * 1000;
    expect(
      calculateMaster95PilotNextBatchDelay({
        completed_at: [completedAt],
        now_ms: Date.parse("2026-07-15T01:00:00.000Z"),
        batch_interval_ms: interval,
      }),
    ).toBe(3 * 60 * 60 * 1000);
    expect(
      calculateMaster95PilotNextBatchDelay({
        completed_at: [completedAt],
        now_ms: Date.parse("2026-07-15T05:00:00.000Z"),
        batch_interval_ms: interval,
      }),
    ).toBe(0);
    expect(
      calculateMaster95PilotNextBatchDelay({ completed_at: [], now_ms: Date.now(), batch_interval_ms: interval }),
    ).toBe(0);
  });

  it("keeps the uncollected V1 candidate collecting and gives the historical 111 runs zero credit", () => {
    const result = evaluateDonggriV1CandidatePilotCertification({
      binding: candidateBinding,
      runs: [],
      heartbeats: [],
      assessments: [],
      all_other_hard_gates_pass: false,
      observation: observation(0),
      unresolved_critical: 0,
      unresolved_sev1: 0,
      historical_run_count: 111,
    });

    expect(result).toMatchObject({
      component_status: "collecting",
      run_count: 0,
      credited_observation_days: 0,
      historical_run_count_observed: 111,
      historical_run_count_credited: 0,
      historical_evidence_credited: false,
    });
  });

  it("passes only the exact three-project V1 scope with 30 heartbeat-credited days", () => {
    const result = evaluateDonggriV1CandidatePilotCertification({
      binding: candidateBinding,
      runs: candidateRuns(),
      heartbeats: candidateHeartbeats(),
      assessments: candidateAssessments(),
      all_other_hard_gates_pass: true,
      observation: observation(30),
      unresolved_critical: 0,
      unresolved_sev1: 0,
      historical_run_count: 111,
    });

    expect(result).toMatchObject({
      component_status: "pass",
      run_count: 500,
      credited_observation_days: 30,
      heartbeat_coverage: 1,
      maximum_heartbeat_gap_seconds: 60,
      project_ids: ["BloggerGent", "DonggriCompany", "DonggrolGameBook"],
      historical_run_count_credited: 0,
      gates: {
        project_scope_exact: true,
        heartbeat_coverage_minimum_99_percent: true,
        maximum_heartbeat_gap_within_180_seconds: true,
      },
    });
  });

  it("does not accept CardNewsAgent as a V1 Pilot project", () => {
    const wrongScope = candidateRuns(3, 0);
    wrongScope[2] = { ...wrongScope[2], project_id: "project:CardNewsAgent" };
    const result = evaluateDonggriV1CandidatePilotCertification({
      binding: candidateBinding,
      runs: wrongScope,
      heartbeats: [],
      assessments: [],
      all_other_hard_gates_pass: false,
      observation: observation(0),
      unresolved_critical: 0,
      unresolved_sev1: 0,
      historical_run_count: 111,
    });

    expect(result.gates.project_scope_exact).toBe(false);
    expect(result.project_ids).toEqual(["BloggerGent", "CardNewsAgent", "DonggriCompany"]);
  });
});
