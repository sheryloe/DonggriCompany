import { describe, expect, it } from "vitest";
import { evaluateDonggriV1HeartbeatObservation, type DonggriV1Heartbeat } from "./candidate-observation.js";

const binding = {
  candidate_id: "dongri-grigri-v1-alpha.0",
  source_epoch: `sha256:${"8".repeat(64)}`,
};

function heartbeats(minutes: number, stepMs = 60_000): DonggriV1Heartbeat[] {
  const startedAt = Date.parse("2026-07-25T00:00:00.000Z");
  return Array.from({ length: minutes + 1 }, (_, index) => ({
    schema_version: "dongri-grigri-v1.heartbeat.v1",
    ...binding,
    sequence: index + 1,
    recorded_at: new Date(startedAt + index * stepMs).toISOString(),
    collector_instance_id: "collector-v1",
  }));
}

describe("Dongri-grigri V1 candidate heartbeat observation", () => {
  it("credits only the intervals proven by consecutive heartbeats", () => {
    const fixture = heartbeats(10);
    const result = evaluateDonggriV1HeartbeatObservation({
      binding,
      heartbeats: fixture,
      started_at: fixture[0].recorded_at,
      evaluated_at: fixture.at(-1)!.recorded_at,
    });

    expect(result).toMatchObject({
      heartbeat_count: 11,
      expected_heartbeat_count: 11,
      heartbeat_coverage: 1,
      maximum_heartbeat_gap_seconds: 60,
      credited_observation_seconds: 600,
    });
  });

  it("does not credit an interval across a gap larger than 180 seconds", () => {
    const fixture = heartbeats(2);
    fixture.push({
      ...fixture.at(-1)!,
      sequence: 4,
      recorded_at: "2026-07-25T00:10:00.000Z",
    });
    const result = evaluateDonggriV1HeartbeatObservation({
      binding,
      heartbeats: fixture,
      started_at: fixture[0].recorded_at,
      evaluated_at: fixture.at(-1)!.recorded_at,
    });

    expect(result.credited_observation_seconds).toBe(120);
    expect(result.maximum_heartbeat_gap_seconds).toBe(480);
    expect(result.gates.maximum_heartbeat_gap_within_180_seconds).toBe(false);
    expect(result.gates.heartbeat_coverage_minimum_99_percent).toBe(false);
  });

  it("rejects a heartbeat from another source epoch", () => {
    const fixture = heartbeats(1);
    fixture[1] = { ...fixture[1], source_epoch: `sha256:${"7".repeat(64)}` };
    expect(() =>
      evaluateDonggriV1HeartbeatObservation({
        binding,
        heartbeats: fixture,
        started_at: fixture[0].recorded_at,
        evaluated_at: fixture.at(-1)!.recorded_at,
      }),
    ).toThrow("heartbeat_source_epoch_mismatch:2");
  });
});
