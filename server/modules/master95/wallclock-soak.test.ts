import { describe, expect, it } from "vitest";
import {
  evaluateDonggriV1WallClockSoak,
  evaluateMaster95WallClockSoak,
  type DonggriV1WallClockSoakSample,
  type Master95WallClockSoakSample,
} from "./wallclock-soak.js";

const policy = {
  required_hours: 72 as const,
  sample_interval_seconds: 60 as const,
  coverage_minimum: 0.99,
  availability_minimum: 0.99,
  p95_latency_ms_maximum: 2000,
  maximum_gap_seconds: 180,
};
const binding = {
  candidate_id: "dongri-grigri-v1-alpha.0",
  source_epoch: `sha256:${"8".repeat(64)}`,
};

function samples(count: number, stepMs = 60_000): Master95WallClockSoakSample[] {
  const start = Date.parse("2026-07-15T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    sampled_at: new Date(start + index * stepMs).toISOString(),
    web: { ok: true, status: 200, latency_ms: 20 + (index % 11) },
    api: { ok: true, status: 200, latency_ms: 30 + (index % 13) },
  }));
}

describe("Master95 wall-clock soak", () => {
  it("keeps an incomplete observation pending", () => {
    const fixture = samples(120);
    const result = evaluateMaster95WallClockSoak({
      policy,
      samples: fixture,
      evaluated_at: fixture.at(-1)!.sampled_at,
    });
    expect(result.status).toBe("pending");
    expect(result.gates.actual_wall_clock_hours_complete).toBe(false);
  });

  it("passes only after 72 real hours with continuous healthy samples", () => {
    const fixture = samples(4321);
    const result = evaluateMaster95WallClockSoak({
      policy,
      samples: fixture,
      evaluated_at: fixture.at(-1)!.sampled_at,
    });
    expect(result.status).toBe("pass");
    expect(result.coverage).toBe(1);
    expect(result.availability).toBe(1);
  });

  it("fails a completed observation with a large collection gap", () => {
    const fixture = samples(4321, 120_000);
    const result = evaluateMaster95WallClockSoak({
      policy,
      samples: fixture,
      evaluated_at: fixture.at(-1)!.sampled_at,
    });
    expect(result.status).toBe("fail");
    expect(result.gates.maximum_gap_within_limit).toBe(true);
    expect(result.gates.sample_coverage_minimum).toBe(false);
  });

  it("rejects sequence gaps and wall-clock regression", () => {
    const sequenceGap = samples(3);
    sequenceGap[2].sequence = 4;
    expect(() =>
      evaluateMaster95WallClockSoak({ policy, samples: sequenceGap, evaluated_at: sequenceGap.at(-1)!.sampled_at }),
    ).toThrow("soak_sequence_gap");

    const fixture = samples(3);
    expect(() =>
      evaluateMaster95WallClockSoak({ policy, samples: fixture, evaluated_at: fixture[1].sampled_at }),
    ).toThrow("wall_clock_regression");
  });

  it("keeps an uncollected V1 candidate soak collecting with zero historical credit", () => {
    const result = evaluateDonggriV1WallClockSoak({
      binding,
      policy,
      samples: [],
      evaluated_at: "2026-07-25T00:00:00.000Z",
      historical_sample_count: 4321,
    });

    expect(result).toMatchObject({
      component_status: "collecting",
      recovery_rate: 0,
      historical_sample_count_observed: 4321,
      historical_sample_count_credited: 0,
      historical_evidence_credited: false,
    });
  });

  it("passes a candidate-bound 72-hour soak only with recovery, loss, and budget gates", () => {
    const fixture: DonggriV1WallClockSoakSample[] = samples(4321).map((sample, index) => ({
      ...sample,
      ...binding,
      recovery_attempted: index % 60 === 0,
      recovery_succeeded: true,
      critical_loss_count: 0,
      budget_exceeded_count: 0,
    }));
    const result = evaluateDonggriV1WallClockSoak({
      binding,
      policy,
      samples: fixture,
      evaluated_at: fixture.at(-1)!.sampled_at,
    });

    expect(result).toMatchObject({
      component_status: "pass",
      observed_hours: 72,
      coverage: 1,
      recovery_rate: 1,
      critical_loss: 0,
      budget_exceeded_count: 0,
    });
  });
});
