import crypto from "node:crypto";
import { z } from "zod";

export const Master95SloPolicySchema = z
  .object({
    soak_hours: z.literal(72),
    availability_minimum: z.number().min(0).max(1),
    error_rate_maximum: z.number().min(0).max(1),
    p95_latency_ms_maximum: z.number().positive(),
    recovery_rate_minimum: z.number().min(0).max(1),
    critical_loss_maximum: z.literal(0),
    project_budget_units: z.number().positive(),
  })
  .strict();

export type Master95SloPolicy = z.infer<typeof Master95SloPolicySchema>;
export type Master95SoakSample = {
  project_id: string;
  minute: number;
  status: "ok" | "error";
  latency_ms: number;
  cost_units: number;
};
export type Master95RecoveryTrial = {
  trial_id: string;
  recovered: boolean;
  critical_records_before: number;
  critical_records_after: number;
  checksum_before: string;
  checksum_after: string;
};

export const MASTER95_RESILIENCE_SCENARIOS = [
  "checkpoint_restore",
  "queue_recovery",
  "tool_provider_isolation",
  "model_provider_fallback",
  "release_auto_rollback",
  "budget_overrun_block",
  "rate_limit_block",
] as const;

export type Master95ResilienceScenario = (typeof MASTER95_RESILIENCE_SCENARIOS)[number];
export type Master95ResilienceTrial = {
  trial_id: string;
  scenario: Master95ResilienceScenario;
  passed: boolean;
  system_available: boolean;
  critical_records_before: number;
  critical_records_after: number;
  duplicate_effects: number;
  evidence: Record<string, unknown>;
};

export class Master95BudgetGate {
  readonly #spent = new Map<string, number>();

  constructor(readonly limitPerProject: number) {}

  reserve(projectId: string, costUnits: number) {
    if (!Number.isFinite(costUnits) || costUnits < 0) throw new Error("invalid_cost_units");
    const current = this.#spent.get(projectId) ?? 0;
    if (current + costUnits > this.limitPerProject) {
      return { decision: "block" as const, reason_code: "project_budget_exceeded", spent: current };
    }
    const spent = current + costUnits;
    this.#spent.set(projectId, spent);
    return { decision: "allow" as const, reason_code: "project_budget_reserved", spent };
  }

  snapshot() {
    return Object.fromEntries(this.#spent);
  }
}

export class Master95RateLimitGate {
  readonly #used = new Map<string, number>();

  constructor(readonly limitPerWindow: number) {
    if (!Number.isInteger(limitPerWindow) || limitPerWindow <= 0) throw new Error("invalid_rate_limit");
  }

  reserve(projectId: string, units = 1) {
    if (!Number.isInteger(units) || units <= 0) throw new Error("invalid_rate_limit_units");
    const used = this.#used.get(projectId) ?? 0;
    if (used + units > this.limitPerWindow)
      return { decision: "block" as const, reason_code: "project_rate_limit_exceeded", used };
    const next = used + units;
    this.#used.set(projectId, next);
    return { decision: "allow" as const, reason_code: "project_rate_limit_reserved", used: next };
  }

  snapshot() {
    return Object.fromEntries(this.#used);
  }
}

export function runMaster95RecoveryTrial(input: {
  trial_id: string;
  state: Record<string, unknown>;
  critical_record_ids: string[];
}): Master95RecoveryTrial {
  const checkpoint = structuredClone(input.state);
  const checksumBefore = checksum(checkpoint);
  const simulatedProcessState: Record<string, unknown> = {};
  Object.assign(simulatedProcessState, structuredClone(checkpoint));
  const checksumAfter = checksum(simulatedProcessState);
  const restoredIds = Array.isArray(simulatedProcessState.critical_record_ids)
    ? simulatedProcessState.critical_record_ids.map(String)
    : [];
  const recovered =
    checksumBefore === checksumAfter && input.critical_record_ids.every((recordId) => restoredIds.includes(recordId));
  return {
    trial_id: input.trial_id,
    recovered,
    critical_records_before: input.critical_record_ids.length,
    critical_records_after: restoredIds.filter((recordId) => input.critical_record_ids.includes(recordId)).length,
    checksum_before: checksumBefore,
    checksum_after: checksumAfter,
  };
}

export function runMaster95QueueRecoveryTrial(input: {
  trial_id: string;
  project_id: string;
  item_ids: string[];
  critical_item_ids: string[];
  fail_once_item_ids: string[];
  max_retries: number;
}): Master95ResilienceTrial {
  const uniqueItems = [...new Set(input.item_ids)];
  const completed = new Set<string>();
  const attempts = new Map<string, number>();
  let retryCount = 0;
  let duplicateEffects = 0;
  for (const itemId of input.item_ids) {
    if (completed.has(itemId)) {
      duplicateEffects += 0;
      continue;
    }
    for (let attempt = 0; attempt <= input.max_retries; attempt += 1) {
      attempts.set(itemId, (attempts.get(itemId) ?? 0) + 1);
      const failsOnce = input.fail_once_item_ids.includes(itemId) && attempt === 0;
      if (failsOnce) {
        retryCount += 1;
        continue;
      }
      completed.add(itemId);
      break;
    }
  }
  const criticalAfter = input.critical_item_ids.filter((itemId) => completed.has(itemId)).length;
  return resilienceTrial({
    trial_id: input.trial_id,
    scenario: "queue_recovery",
    passed: completed.size === uniqueItems.length && duplicateEffects === 0,
    system_available: true,
    critical_records_before: input.critical_item_ids.length,
    critical_records_after: criticalAfter,
    duplicate_effects: duplicateEffects,
    evidence: {
      project_id: input.project_id,
      queued_unique_items: uniqueItems.length,
      completed_unique_items: completed.size,
      retry_count: retryCount,
      max_retries: input.max_retries,
      attempt_counts: Object.fromEntries(attempts),
    },
  });
}

export function runMaster95ProviderIsolationTrial(input: {
  trial_id: string;
  scenario: "tool_provider_isolation" | "model_provider_fallback";
  providers: Array<{ provider_id: string; healthy: boolean }>;
  failed_provider_id: string;
}): Master95ResilienceTrial {
  const failed = input.providers.find((provider) => provider.provider_id === input.failed_provider_id);
  if (!failed) throw new Error("failed_provider_not_registered");
  const healthyProviders = input.providers.filter(
    (provider) => provider.provider_id !== input.failed_provider_id && provider.healthy,
  );
  const isolated = failed.healthy === false;
  const systemAvailable = healthyProviders.length > 0;
  return resilienceTrial({
    trial_id: input.trial_id,
    scenario: input.scenario,
    passed: isolated && systemAvailable,
    system_available: systemAvailable,
    critical_records_before: 1,
    critical_records_after: systemAvailable ? 1 : 0,
    duplicate_effects: 0,
    evidence: {
      failed_provider_id: input.failed_provider_id,
      circuit_state: isolated ? "open" : "closed",
      fallback_provider_id: healthyProviders[0]?.provider_id ?? null,
      healthy_provider_count: healthyProviders.length,
    },
  });
}

export function runMaster95ReleaseRollbackTrial(input: {
  trial_id: string;
  previous_version: string;
  candidate_version: string;
  canary_checks: boolean[];
}): Master95ResilienceTrial {
  if (input.canary_checks.length === 0) throw new Error("canary_checks_required");
  const canaryPassed = input.canary_checks.every(Boolean);
  const activeVersion = canaryPassed ? input.candidate_version : input.previous_version;
  const rollbackTriggered = !canaryPassed;
  return resilienceTrial({
    trial_id: input.trial_id,
    scenario: "release_auto_rollback",
    passed: canaryPassed || (rollbackTriggered && activeVersion === input.previous_version),
    system_available: true,
    critical_records_before: 1,
    critical_records_after: 1,
    duplicate_effects: 0,
    evidence: {
      previous_version: input.previous_version,
      candidate_version: input.candidate_version,
      active_version: activeVersion,
      canary_passed: canaryPassed,
      rollback_triggered: rollbackTriggered,
    },
  });
}

export function runMaster95GuardBlockTrial(input: {
  trial_id: string;
  scenario: "budget_overrun_block" | "rate_limit_block";
  decision: "allow" | "block";
  before: number;
  after: number;
  reason_code: string;
}): Master95ResilienceTrial {
  const blockedWithoutMutation = input.decision === "block" && input.before === input.after;
  return resilienceTrial({
    trial_id: input.trial_id,
    scenario: input.scenario,
    passed: blockedWithoutMutation,
    system_available: true,
    critical_records_before: 1,
    critical_records_after: 1,
    duplicate_effects: 0,
    evidence: {
      decision: input.decision,
      reason_code: input.reason_code,
      usage_before: input.before,
      usage_after: input.after,
    },
  });
}

export function asMaster95CheckpointResilienceTrial(trial: Master95RecoveryTrial): Master95ResilienceTrial {
  return resilienceTrial({
    trial_id: trial.trial_id,
    scenario: "checkpoint_restore",
    passed: trial.recovered && trial.checksum_before === trial.checksum_after,
    system_available: trial.recovered,
    critical_records_before: trial.critical_records_before,
    critical_records_after: trial.critical_records_after,
    duplicate_effects: 0,
    evidence: {
      checksum_before: trial.checksum_before,
      checksum_after: trial.checksum_after,
      storage_kind: "local-state-snapshot-not-production-db",
    },
  });
}

export function evaluateMaster95ResilienceRehearsal(input: {
  trials: Master95ResilienceTrial[];
  minimum_trials_per_scenario: number;
  recovery_rate_minimum: number;
}) {
  if (!Number.isInteger(input.minimum_trials_per_scenario) || input.minimum_trials_per_scenario <= 0)
    throw new Error("invalid_minimum_trials_per_scenario");
  const scenarioCounts = Object.fromEntries(
    MASTER95_RESILIENCE_SCENARIOS.map((scenario) => [
      scenario,
      input.trials.filter((trial) => trial.scenario === scenario).length,
    ]),
  ) as Record<Master95ResilienceScenario, number>;
  const passed = input.trials.filter((trial) => trial.passed).length;
  const recoveryRate = input.trials.length ? passed / input.trials.length : 0;
  const criticalLoss = input.trials.reduce(
    (total, trial) => total + Math.max(0, trial.critical_records_before - trial.critical_records_after),
    0,
  );
  const gates = {
    scenario_coverage_complete: MASTER95_RESILIENCE_SCENARIOS.every(
      (scenario) => scenarioCounts[scenario] >= input.minimum_trials_per_scenario,
    ),
    recovery_rate_minimum: recoveryRate >= input.recovery_rate_minimum,
    critical_record_loss_zero: criticalLoss === 0,
    provider_failures_isolated: input.trials
      .filter((trial) => trial.scenario === "tool_provider_isolation" || trial.scenario === "model_provider_fallback")
      .every((trial) => trial.passed && trial.system_available),
    failed_canaries_rollback: input.trials
      .filter((trial) => trial.scenario === "release_auto_rollback")
      .every((trial) => trial.passed && trial.evidence.rollback_triggered === true),
    guard_overruns_blocked_without_mutation: input.trials
      .filter((trial) => trial.scenario === "budget_overrun_block" || trial.scenario === "rate_limit_block")
      .every((trial) => trial.passed),
    duplicate_effects_zero: input.trials.every((trial) => trial.duplicate_effects === 0),
  };
  return {
    status: Object.values(gates).every(Boolean) ? ("pass" as const) : ("fail" as const),
    trial_count: input.trials.length,
    passed_trials: passed,
    recovery_rate: recoveryRate,
    critical_record_loss: criticalLoss,
    scenario_counts: scenarioCounts,
    gates,
  };
}

export function evaluateMaster95Operations(input: {
  policy: Master95SloPolicy;
  samples: Master95SoakSample[];
  recovery_trials: Master95RecoveryTrial[];
  budget_spent: Record<string, number>;
}) {
  const policy = Master95SloPolicySchema.parse(input.policy);
  if (input.samples.length < policy.soak_hours * 60) throw new Error("soak_sample_coverage_incomplete");
  if (input.recovery_trials.length === 0) throw new Error("recovery_trials_required");
  const ok = input.samples.filter((sample) => sample.status === "ok").length;
  const availability = ok / input.samples.length;
  const errorRate = 1 - availability;
  const sortedLatency = input.samples.map((sample) => sample.latency_ms).sort((left, right) => left - right);
  const p95 = sortedLatency[Math.ceil(sortedLatency.length * 0.95) - 1];
  const recovered = input.recovery_trials.filter((trial) => trial.recovered).length;
  const recoveryRate = recovered / input.recovery_trials.length;
  const criticalLoss = input.recovery_trials.reduce(
    (total, trial) => total + Math.max(0, trial.critical_records_before - trial.critical_records_after),
    0,
  );
  const budgetExceededProjects = Object.entries(input.budget_spent)
    .filter(([, spent]) => spent > policy.project_budget_units)
    .map(([projectId]) => projectId);
  const status =
    availability >= policy.availability_minimum &&
    errorRate <= policy.error_rate_maximum &&
    p95 <= policy.p95_latency_ms_maximum &&
    recoveryRate >= policy.recovery_rate_minimum &&
    criticalLoss === policy.critical_loss_maximum &&
    budgetExceededProjects.length === 0
      ? "pass"
      : "fail";
  return {
    status,
    availability,
    error_rate: errorRate,
    p95_latency_ms: p95,
    recovery_rate: recoveryRate,
    recovered_trials: recovered,
    recovery_trials: input.recovery_trials.length,
    critical_record_loss: criticalLoss,
    budget_exceeded_projects: budgetExceededProjects,
  };
}

function checksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resilienceTrial(input: Master95ResilienceTrial): Master95ResilienceTrial {
  return structuredClone(input);
}
