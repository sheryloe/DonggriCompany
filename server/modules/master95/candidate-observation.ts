import path from "node:path";
import { z } from "zod";

export const MASTER95_V1_CANDIDATE_RUNTIME_ROOT = "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v1\\candidates";

export const DonggriV1CandidateBindingSchema = z
  .object({
    candidate_id: z.string().regex(/^[A-Za-z0-9._-]+$/),
    source_epoch: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  })
  .strict();

export const DonggriV1HeartbeatSchema = DonggriV1CandidateBindingSchema.extend({
  schema_version: z.literal("dongri-grigri-v1.heartbeat.v1"),
  sequence: z.number().int().positive(),
  recorded_at: z.string().datetime(),
  collector_instance_id: z.string().trim().min(1),
}).strict();

export type DonggriV1CandidateBinding = z.infer<typeof DonggriV1CandidateBindingSchema>;
export type DonggriV1Heartbeat = z.infer<typeof DonggriV1HeartbeatSchema>;

function safeCandidateSegment(candidateId: string): string {
  return DonggriV1CandidateBindingSchema.shape.candidate_id.parse(candidateId);
}

export function sourceEpochPathSegment(sourceEpoch: string): string {
  const parsed = DonggriV1CandidateBindingSchema.shape.source_epoch.parse(sourceEpoch);
  return parsed.replace(":", "-");
}

export function resolveDonggriV1CandidateRuntimeRoot(
  binding: DonggriV1CandidateBinding,
  runtimeRoot = MASTER95_V1_CANDIDATE_RUNTIME_ROOT,
): string {
  const parsed = DonggriV1CandidateBindingSchema.parse(binding);
  return path.join(
    path.resolve(runtimeRoot),
    safeCandidateSegment(parsed.candidate_id),
    "source-epochs",
    sourceEpochPathSegment(parsed.source_epoch),
  );
}

export function evaluateDonggriV1HeartbeatObservation(input: {
  binding: DonggriV1CandidateBinding;
  heartbeats: unknown[];
  started_at: string;
  evaluated_at: string;
  heartbeat_interval_seconds?: 60;
  maximum_gap_seconds?: 180;
}) {
  const binding = DonggriV1CandidateBindingSchema.parse(input.binding);
  const heartbeatIntervalSeconds = z.literal(60).parse(input.heartbeat_interval_seconds ?? 60);
  const maximumAllowedGapSeconds = z.literal(180).parse(input.maximum_gap_seconds ?? 180);
  const observationStart = Date.parse(z.string().datetime().parse(input.started_at));
  const observationEnd = Date.parse(z.string().datetime().parse(input.evaluated_at));
  if (observationEnd < observationStart) throw new Error("heartbeat_wall_clock_regression");

  const heartbeats = input.heartbeats.map((heartbeat) => DonggriV1HeartbeatSchema.parse(heartbeat));
  const timestamps = heartbeats.map((heartbeat) => Date.parse(heartbeat.recorded_at));
  for (let index = 0; index < heartbeats.length; index += 1) {
    const heartbeat = heartbeats[index];
    if (heartbeat.candidate_id !== binding.candidate_id) {
      throw new Error(`heartbeat_candidate_mismatch:${heartbeat.sequence}`);
    }
    if (heartbeat.source_epoch !== binding.source_epoch) {
      throw new Error(`heartbeat_source_epoch_mismatch:${heartbeat.sequence}`);
    }
    if (heartbeat.sequence !== index + 1) {
      throw new Error(index === 0 ? "heartbeat_sequence_must_start_at_one" : "heartbeat_sequence_gap");
    }
    if (timestamps[index] < observationStart || timestamps[index] > observationEnd) {
      throw new Error(`heartbeat_outside_observation:${heartbeat.sequence}`);
    }
    if (index > 0 && timestamps[index] <= timestamps[index - 1]) {
      throw new Error("non_monotonic_heartbeat");
    }
  }

  const intervalMs = heartbeatIntervalSeconds * 1000;
  const elapsedMs = observationEnd - observationStart;
  const expectedHeartbeatCount = Math.floor(elapsedMs / intervalMs) + 1;
  const coveredBuckets = new Set(
    timestamps.map((timestamp) => Math.floor((timestamp - observationStart) / intervalMs)),
  );
  const heartbeatCoverage = expectedHeartbeatCount > 0 ? coveredBuckets.size / expectedHeartbeatCount : 0;

  const boundaryAndInternalGapsMs: number[] = [];
  if (timestamps.length === 0) {
    boundaryAndInternalGapsMs.push(elapsedMs);
  } else {
    boundaryAndInternalGapsMs.push(timestamps[0] - observationStart);
    for (let index = 1; index < timestamps.length; index += 1) {
      boundaryAndInternalGapsMs.push(timestamps[index] - timestamps[index - 1]);
    }
    boundaryAndInternalGapsMs.push(observationEnd - timestamps.at(-1)!);
  }
  const maximumHeartbeatGapSeconds =
    boundaryAndInternalGapsMs.length > 0 ? Math.max(...boundaryAndInternalGapsMs) / 1000 : 0;

  let creditedObservationMs = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    const gapMs = timestamps[index] - timestamps[index - 1];
    if (gapMs <= maximumAllowedGapSeconds * 1000) creditedObservationMs += gapMs;
  }

  return {
    heartbeat_interval_seconds: heartbeatIntervalSeconds,
    maximum_allowed_heartbeat_gap_seconds: maximumAllowedGapSeconds,
    heartbeat_count: heartbeats.length,
    expected_heartbeat_count: expectedHeartbeatCount,
    heartbeat_coverage: heartbeatCoverage,
    maximum_heartbeat_gap_seconds: maximumHeartbeatGapSeconds,
    credited_observation_seconds: creditedObservationMs / 1000,
    credited_observation_days: creditedObservationMs / 86_400_000,
    observation_wall_clock_days: elapsedMs / 86_400_000,
    first_heartbeat_at: heartbeats[0]?.recorded_at ?? null,
    last_heartbeat_at: heartbeats.at(-1)?.recorded_at ?? null,
    gates: {
      heartbeat_coverage_minimum_99_percent: heartbeatCoverage >= 0.99,
      maximum_heartbeat_gap_within_180_seconds: maximumHeartbeatGapSeconds <= maximumAllowedGapSeconds,
    },
  };
}
