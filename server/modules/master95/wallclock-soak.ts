import { z } from "zod";

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
