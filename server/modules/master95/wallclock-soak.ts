import { z } from "zod";
import { DonggriV1CandidateBindingSchema, type DonggriV1CandidateBinding } from "./candidate-observation.js";

export const Master95WallClockSoakPolicySchema = z
  .object({
    required_hours: z.literal(72),
    sample_interval_seconds: z.literal(60),
    coverage_minimum: z.number().min(0).max(1),
    availability_minimum: z.number().min(0).max(1),
    p95_latency_ms_maximum: z.number().positive(),
    maximum_gap_seconds: z.number().positive(),
  })
  .strict();

export const Master95WallClockSoakSampleSchema = z
  .object({
    sequence: z.number().int().positive(),
    sampled_at: z.string().datetime(),
    web: z.object({ ok: z.boolean(), status: z.number().int().nullable(), latency_ms: z.number().nonnegative() }),
    api: z.object({ ok: z.boolean(), status: z.number().int().nullable(), latency_ms: z.number().nonnegative() }),
  })
  .strict();

export type Master95WallClockSoakPolicy = z.infer<typeof Master95WallClockSoakPolicySchema>;
export type Master95WallClockSoakSample = z.infer<typeof Master95WallClockSoakSampleSchema>;

export const DonggriV1WallClockSoakSampleSchema = Master95WallClockSoakSampleSchema.extend({
  candidate_id: DonggriV1CandidateBindingSchema.shape.candidate_id,
  source_epoch: DonggriV1CandidateBindingSchema.shape.source_epoch,
  recovery_attempted: z.boolean(),
  recovery_succeeded: z.boolean(),
  critical_loss_count: z.number().int().nonnegative(),
  budget_exceeded_count: z.number().int().nonnegative(),
}).strict();

export type DonggriV1WallClockSoakSample = z.infer<typeof DonggriV1WallClockSoakSampleSchema>;

const DonggriV1WallClockSoakRecoveryStateSchema = z
  .object({
    candidate_id: DonggriV1CandidateBindingSchema.shape.candidate_id,
    source_epoch: DonggriV1CandidateBindingSchema.shape.source_epoch,
    collector_pid: z.number().int().positive(),
    sample_count: z.number().int().nonnegative(),
    last_sample_at: z.string().datetime().nullable(),
  })
  .passthrough();

export function validateDonggriV1WallClockSoakRecoveryResume(input: {
  binding: DonggriV1CandidateBinding;
  previous_state: unknown;
  samples: unknown[];
}) {
  const binding = DonggriV1CandidateBindingSchema.parse(input.binding);
  const previousState = DonggriV1WallClockSoakRecoveryStateSchema.parse(input.previous_state);
  if (previousState.candidate_id !== binding.candidate_id) throw new Error("soak_recovery_candidate_mismatch");
  if (previousState.source_epoch !== binding.source_epoch) throw new Error("soak_recovery_source_epoch_mismatch");

  const samples = input.samples.map((sample) => DonggriV1WallClockSoakSampleSchema.parse(sample));
  if (samples.length === 0) throw new Error("soak_recovery_journal_empty");
  const lastSample = samples.at(-1)!;
  evaluateDonggriV1WallClockSoak({
    binding,
    policy: {
      required_hours: 72,
      sample_interval_seconds: 60,
      coverage_minimum: 0.99,
      availability_minimum: 0.99,
      p95_latency_ms_maximum: 2000,
      maximum_gap_seconds: 180,
    },
    samples,
    evaluated_at: lastSample.sampled_at,
  });
  if (previousState.sample_count !== samples.length) throw new Error("soak_recovery_state_sample_count_mismatch");
  if (previousState.last_sample_at !== lastSample.sampled_at) {
    throw new Error("soak_recovery_state_last_sample_mismatch");
  }
  return {
    previous_collector_pid: previousState.collector_pid,
    sample_count: samples.length,
    last_sample_at: lastSample.sampled_at,
  };
}

export function evaluateMaster95WallClockSoak(input: {
  policy: Master95WallClockSoakPolicy;
  samples: unknown[];
  evaluated_at: string;
}) {
  const policy = Master95WallClockSoakPolicySchema.parse(input.policy);
  const evaluatedAt = Date.parse(z.string().datetime().parse(input.evaluated_at));
  const samples = input.samples.map((sample) => Master95WallClockSoakSampleSchema.parse(sample));
  if (samples.length === 0) {
    return emptyEvaluation(policy);
  }

  const timestamps = samples.map((sample) => Date.parse(sample.sampled_at));
  if (samples[0].sequence !== 1) throw new Error("soak_sequence_must_start_at_one");
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].sequence !== samples[index - 1].sequence + 1) throw new Error("soak_sequence_gap");
    if (timestamps[index] <= timestamps[index - 1]) throw new Error("non_monotonic_soak_sample");
  }
  if (evaluatedAt < timestamps.at(-1)!) throw new Error("wall_clock_regression");

  const requiredSamples = policy.required_hours * 60;
  const observedMs = timestamps.at(-1)! - timestamps[0];
  const observedHours = observedMs / 3_600_000;
  const minuteBuckets = new Set(
    timestamps
      .map((timestamp) => Math.floor((timestamp - timestamps[0]) / 60_000))
      .filter((bucket) => bucket >= 0 && bucket < requiredSamples),
  );
  const coverage = minuteBuckets.size / requiredSamples;
  const healthySamples = samples.filter((sample) => sample.web.ok && sample.api.ok).length;
  const availability = healthySamples / samples.length;
  const latencies = samples
    .map((sample) => Math.max(sample.web.latency_ms, sample.api.latency_ms))
    .sort((left, right) => left - right);
  const p95Latency = latencies[Math.ceil(latencies.length * 0.95) - 1];
  const gaps = timestamps.slice(1).map((timestamp, index) => (timestamp - timestamps[index]) / 1000);
  const maximumGap = gaps.length ? Math.max(...gaps) : 0;
  const complete = observedHours >= policy.required_hours;
  const gates = {
    actual_wall_clock_hours_complete: complete,
    sample_coverage_minimum: coverage >= policy.coverage_minimum,
    availability_minimum: availability >= policy.availability_minimum,
    p95_latency_within_slo: p95Latency <= policy.p95_latency_ms_maximum,
    maximum_gap_within_limit: maximumGap <= policy.maximum_gap_seconds,
  };

  return {
    status: complete
      ? Object.values(gates).every(Boolean)
        ? ("pass" as const)
        : ("fail" as const)
      : ("pending" as const),
    sample_count: samples.length,
    required_samples: requiredSamples,
    observed_hours: observedHours,
    coverage,
    availability,
    p95_latency_ms: p95Latency,
    maximum_gap_seconds: maximumGap,
    started_at: samples[0].sampled_at,
    last_sample_at: samples.at(-1)!.sampled_at,
    target_end_at: new Date(timestamps[0] + policy.required_hours * 3_600_000).toISOString(),
    gates,
  };
}

function emptyEvaluation(policy: Master95WallClockSoakPolicy) {
  return {
    status: "pending" as const,
    sample_count: 0,
    required_samples: policy.required_hours * 60,
    observed_hours: 0,
    coverage: 0,
    availability: 0,
    p95_latency_ms: null,
    maximum_gap_seconds: 0,
    started_at: null,
    last_sample_at: null,
    target_end_at: null,
    gates: {
      actual_wall_clock_hours_complete: false,
      sample_coverage_minimum: false,
      availability_minimum: false,
      p95_latency_within_slo: false,
      maximum_gap_within_limit: true,
    },
  };
}

export function evaluateDonggriV1WallClockSoak(input: {
  binding: DonggriV1CandidateBinding;
  policy: Master95WallClockSoakPolicy;
  samples: unknown[];
  evaluated_at: string;
  historical_sample_count?: number;
}) {
  const binding = DonggriV1CandidateBindingSchema.parse(input.binding);
  const candidateSamples = input.samples.map((sample) => DonggriV1WallClockSoakSampleSchema.parse(sample));
  for (const sample of candidateSamples) {
    if (sample.candidate_id !== binding.candidate_id) {
      throw new Error(`soak_candidate_mismatch:${sample.sequence}`);
    }
    if (sample.source_epoch !== binding.source_epoch) {
      throw new Error(`soak_source_epoch_mismatch:${sample.sequence}`);
    }
  }
  const evaluation = evaluateMaster95WallClockSoak({
    policy: input.policy,
    samples: candidateSamples.map((sample) => ({
      sequence: sample.sequence,
      sampled_at: sample.sampled_at,
      web: sample.web,
      api: sample.api,
    })),
    evaluated_at: input.evaluated_at,
  });
  const recoveryAttempts = candidateSamples.filter((sample) => sample.recovery_attempted);
  const recoverySuccesses = recoveryAttempts.filter((sample) => sample.recovery_succeeded).length;
  const recoveryRate = recoveryAttempts.length > 0 ? recoverySuccesses / recoveryAttempts.length : 0;
  const criticalLoss = candidateSamples.reduce((sum, sample) => sum + sample.critical_loss_count, 0);
  const budgetExceededCount = candidateSamples.reduce((sum, sample) => sum + sample.budget_exceeded_count, 0);
  const candidateGates = {
    ...evaluation.gates,
    recovery_rate_minimum_99_percent: recoveryAttempts.length > 0 && recoveryRate >= 0.99,
    critical_loss_zero: criticalLoss === 0,
    budget_exceeded_count_zero: budgetExceededCount === 0,
    historical_evidence_credit_zero: true,
  };
  const observationComplete = evaluation.observed_hours >= input.policy.required_hours;
  const componentStatus = Object.values(candidateGates).every(Boolean)
    ? ("pass" as const)
    : observationComplete
      ? ("fail" as const)
      : ("collecting" as const);

  return {
    ...evaluation,
    status: componentStatus,
    component_status: componentStatus,
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    sample_interval_seconds: input.policy.sample_interval_seconds,
    recovery_attempt_count: recoveryAttempts.length,
    recovery_success_count: recoverySuccesses,
    recovery_rate: recoveryRate,
    critical_loss: criticalLoss,
    budget_exceeded_count: budgetExceededCount,
    historical_sample_count_observed: input.historical_sample_count ?? 0,
    historical_sample_count_credited: 0,
    historical_evidence_credited: false,
    gates: candidateGates,
  };
}
