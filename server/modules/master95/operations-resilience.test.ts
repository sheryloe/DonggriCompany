import { describe, expect, it } from "vitest";
import {
  Master95BudgetGate,
  Master95RateLimitGate,
  asMaster95CheckpointResilienceTrial,
  evaluateMaster95Operations,
  evaluateMaster95ResilienceRehearsal,
  runMaster95GuardBlockTrial,
  runMaster95ProviderIsolationTrial,
  runMaster95QueueRecoveryTrial,
  runMaster95RecoveryTrial,
  runMaster95ReleaseRollbackTrial,
  type Master95SoakSample,
  type Master95SloPolicy,
} from "./operations-resilience.js";

const policy: Master95SloPolicy = {
  soak_hours: 72,
  availability_minimum: 0.99,
  error_rate_maximum: 0.01,
  p95_latency_ms_maximum: 2000,
  recovery_rate_minimum: 0.99,
  critical_loss_maximum: 0,
  project_budget_units: 5000,
};

function samples(): Master95SoakSample[] {
  return Array.from({ length: 4320 }, (_, minute) => ({
    project_id: "project:BloggerGent",
    minute,
    status: "ok" as const,
    latency_ms: 100 + (minute % 100),
    cost_units: 1,
  }));
}

function recovery(recovered = true) {
  const trial = runMaster95RecoveryTrial({
    trial_id: "recovery:1",
    state: { critical_record_ids: ["critical:1"], status: "working" },
    critical_record_ids: ["critical:1"],
  });
  return recovered ? trial : { ...trial, recovered: false, critical_records_after: 0 };
}

describe("Master95 operations resilience", () => {
  it("passes complete 72-hour accelerated soak, recovery, and budget evidence", () => {
    expect(
      evaluateMaster95Operations({
        policy,
        samples: samples(),
        recovery_trials: [recovery()],
        budget_spent: { "project:BloggerGent": 4320 },
      }),
    ).toMatchObject({ status: "pass", availability: 1, recovery_rate: 1, critical_record_loss: 0 });
  });

  it("requires 72 hours of minute coverage", () => {
    expect(() =>
      evaluateMaster95Operations({
        policy,
        samples: samples().slice(0, -1),
        recovery_trials: [recovery()],
        budget_spent: {},
      }),
    ).toThrow("soak_sample_coverage_incomplete");
  });

  it("blocks budget reservations before overspend", () => {
    const gate = new Master95BudgetGate(10);
    expect(gate.reserve("project:BloggerGent", 8)).toMatchObject({ decision: "allow", spent: 8 });
    expect(gate.reserve("project:BloggerGent", 3)).toMatchObject({ decision: "block", spent: 8 });
  });

  it("fails recovery or Critical record loss below the gate", () => {
    const result = evaluateMaster95Operations({
      policy,
      samples: samples(),
      recovery_trials: [recovery(false)],
      budget_spent: { "project:BloggerGent": 4320 },
    });
    expect(result).toMatchObject({ status: "fail", recovery_rate: 0, critical_record_loss: 1 });
  });

  it("fails SLO latency and availability regressions", () => {
    const degraded = samples();
    for (let index = 0; index < 100; index += 1)
      degraded[index] = { ...degraded[index], status: "error", latency_ms: 5000 };
    expect(
      evaluateMaster95Operations({
        policy,
        samples: degraded,
        recovery_trials: [recovery()],
        budget_spent: { "project:BloggerGent": 4320 },
      }).status,
    ).toBe("fail");
  });

  it("recovers an idempotent queue after one-shot item failures", () => {
    expect(
      runMaster95QueueRecoveryTrial({
        trial_id: "queue:1",
        project_id: "project:BloggerGent",
        item_ids: ["task:1", "task:2", "task:2"],
        critical_item_ids: ["task:1"],
        fail_once_item_ids: ["task:1", "task:2"],
        max_retries: 1,
      }),
    ).toMatchObject({ passed: true, critical_records_before: 1, critical_records_after: 1, duplicate_effects: 0 });
  });

  it("isolates one Tool provider and falls back from one model provider", () => {
    for (const scenario of ["tool_provider_isolation", "model_provider_fallback"] as const) {
      expect(
        runMaster95ProviderIsolationTrial({
          trial_id: `provider:${scenario}`,
          scenario,
          failed_provider_id: "provider:a",
          providers: [
            { provider_id: "provider:a", healthy: false },
            { provider_id: "provider:b", healthy: true },
          ],
        }),
      ).toMatchObject({ passed: true, system_available: true, critical_records_after: 1 });
    }
  });

  it("fails closed when no healthy provider remains", () => {
    expect(
      runMaster95ProviderIsolationTrial({
        trial_id: "provider:none",
        scenario: "tool_provider_isolation",
        failed_provider_id: "provider:a",
        providers: [{ provider_id: "provider:a", healthy: false }],
      }),
    ).toMatchObject({ passed: false, system_available: false, critical_records_after: 0 });
  });

  it("automatically retains the previous release after a failed canary", () => {
    expect(
      runMaster95ReleaseRollbackTrial({
        trial_id: "rollback:1",
        previous_version: "1.0.0",
        candidate_version: "1.1.0",
        canary_checks: [true, false, true],
      }),
    ).toMatchObject({
      passed: true,
      evidence: { active_version: "1.0.0", rollback_triggered: true },
    });
  });

  it("blocks rate overrun without consuming the denied unit", () => {
    const gate = new Master95RateLimitGate(2);
    expect(gate.reserve("project:BloggerGent", 2)).toMatchObject({ decision: "allow", used: 2 });
    const blocked = gate.reserve("project:BloggerGent", 1);
    expect(blocked).toMatchObject({ decision: "block", used: 2 });
    expect(gate.snapshot()).toEqual({ "project:BloggerGent": 2 });
  });

  it("rejects recovery evidence with Critical loss or a mutated guard balance", () => {
    const failedQueue = runMaster95QueueRecoveryTrial({
      trial_id: "queue:loss",
      project_id: "project:BloggerGent",
      item_ids: ["critical:1"],
      critical_item_ids: ["critical:1"],
      fail_once_item_ids: ["critical:1"],
      max_retries: 0,
    });
    const mutatedGuard = runMaster95GuardBlockTrial({
      trial_id: "guard:mutated",
      scenario: "budget_overrun_block",
      decision: "block",
      before: 10,
      after: 11,
      reason_code: "invalid_mutation",
    });
    expect(failedQueue).toMatchObject({ passed: false, critical_records_after: 0 });
    expect(mutatedGuard.passed).toBe(false);
  });

  it("passes a complete multi-scenario resilience rehearsal", () => {
    const checkpoint = asMaster95CheckpointResilienceTrial(recovery());
    const queue = runMaster95QueueRecoveryTrial({
      trial_id: "queue:complete",
      project_id: "project:BloggerGent",
      item_ids: ["task:1"],
      critical_item_ids: ["task:1"],
      fail_once_item_ids: ["task:1"],
      max_retries: 1,
    });
    const providers = (["tool_provider_isolation", "model_provider_fallback"] as const).map((scenario) =>
      runMaster95ProviderIsolationTrial({
        trial_id: `provider:${scenario}:complete`,
        scenario,
        failed_provider_id: "provider:a",
        providers: [
          { provider_id: "provider:a", healthy: false },
          { provider_id: "provider:b", healthy: true },
        ],
      }),
    );
    const rollback = runMaster95ReleaseRollbackTrial({
      trial_id: "rollback:complete",
      previous_version: "1.0.0",
      candidate_version: "1.1.0",
      canary_checks: [false],
    });
    const guards = (["budget_overrun_block", "rate_limit_block"] as const).map((scenario) =>
      runMaster95GuardBlockTrial({
        trial_id: `guard:${scenario}`,
        scenario,
        decision: "block",
        before: 10,
        after: 10,
        reason_code: `${scenario}:verified`,
      }),
    );
    expect(
      evaluateMaster95ResilienceRehearsal({
        trials: [checkpoint, queue, ...providers, rollback, ...guards],
        minimum_trials_per_scenario: 1,
        recovery_rate_minimum: 0.99,
      }),
    ).toMatchObject({ status: "pass", trial_count: 7, recovery_rate: 1, critical_record_loss: 0 });
  });
});
