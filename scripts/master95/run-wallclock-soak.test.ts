import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  classifyDonggriV1SoakCollectorStart,
  didDonggriV1SoakRecoverySucceed,
  parseDonggriV1SoakSampleJournal,
  resolveDonggriV1SoakEndpoints,
} from "./run-wallclock-soak.js";

const binding = {
  candidate_id: "dongri-grigri-v01-alpha.2",
  source_epoch: `sha256:${"8".repeat(64)}`,
};

function journalSamples() {
  return [0, 1].map((index) => ({
    ...binding,
    sequence: index + 1,
    sampled_at: new Date(Date.parse("2026-08-13T00:00:00.000Z") + index * 60_000).toISOString(),
    web: { ok: true, status: 200, latency_ms: 20 },
    api: { ok: true, status: 200, latency_ms: 25 },
    recovery_attempted: false,
    recovery_succeeded: false,
    critical_loss_count: 0,
    budget_exceeded_count: 0,
  }));
}

function previousState(samples = journalSamples()) {
  return {
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    collector_pid: 4100,
    sample_count: samples.length,
    last_sample_at: samples.at(-1)!.sampled_at,
  };
}

describe("V01 wall-clock Soak runner contract", () => {
  it("locks the formal endpoints to exact loopback ports 8790 and 8810", () => {
    assert.deepEqual(resolveDonggriV1SoakEndpoints({}), {
      api: "http://127.0.0.1:8790/api/health",
      web: "http://127.0.0.1:8810/",
    });
    assert.throws(
      () => resolveDonggriV1SoakEndpoints({ DONGGRI_V1_SOAK_API_ENDPOINT: "http://localhost:8790/api/health" }),
      /soak_api_endpoint_must_be_exact_loopback_8790/,
    );
    assert.throws(
      () => resolveDonggriV1SoakEndpoints({ DONGGRI_V1_SOAK_WEB_ENDPOINT: "http://127.0.0.1:8800/" }),
      /soak_web_endpoint_must_be_exact_loopback_8810/,
    );
  });

  it("binds the bounded Master95 resilient supervisors to web 8810 and API 8790", () => {
    const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    for (const scriptName of ["master95:dev:web:resilient", "master95:dev:local:resilient"]) {
      const command = String(packageJson.scripts[scriptName]);
      assert.match(command, /--host 127\.0\.0\.1 --port 8810 --strictPort/);
      assert.match(command, /VITE_API_PROXY_TARGET=http:\/\/127\.0\.0\.1:8790/);
      assert.doesNotMatch(command, /--port 8800(?:\s|$)/);
    }
  });

  it("does not claim recovery on a first clean collector start", () => {
    assert.deepEqual(
      classifyDonggriV1SoakCollectorStart({
        binding,
        previous_state: null,
        samples: [],
        current_pid: 4200,
        is_process_running: () => false,
      }),
      { recovery_attempted: false, previous_collector_pid: null },
    );
  });

  it("claims one attempt only for a validated dead-collector resume", () => {
    const samples = journalSamples();
    assert.deepEqual(
      classifyDonggriV1SoakCollectorStart({
        binding,
        previous_state: previousState(samples),
        samples,
        current_pid: 4200,
        is_process_running: () => false,
      }),
      { recovery_attempted: true, previous_collector_pid: 4100 },
    );
  });

  it("marks recovery success only when an actual attempt restores both endpoints", () => {
    assert.equal(
      didDonggriV1SoakRecoverySucceed({ recovery_attempted: true, web: { ok: true }, api: { ok: true } }),
      true,
    );
    assert.equal(
      didDonggriV1SoakRecoverySucceed({ recovery_attempted: false, web: { ok: true }, api: { ok: true } }),
      false,
    );
    assert.equal(
      didDonggriV1SoakRecoverySucceed({ recovery_attempted: true, web: { ok: false }, api: { ok: true } }),
      false,
    );
    assert.equal(
      didDonggriV1SoakRecoverySucceed({ recovery_attempted: true, web: { ok: true }, api: { ok: false } }),
      false,
    );
  });

  it("fails closed for live, current, mismatched, or discontinuous collector state", () => {
    const samples = journalSamples();
    assert.throws(
      () =>
        classifyDonggriV1SoakCollectorStart({
          binding,
          previous_state: previousState(samples),
          samples,
          current_pid: 4200,
          is_process_running: () => true,
        }),
      /wallclock_soak_collector_already_running/,
    );
    assert.throws(
      () =>
        classifyDonggriV1SoakCollectorStart({
          binding,
          previous_state: { ...previousState(samples), collector_pid: 4200 },
          samples,
          current_pid: 4200,
          is_process_running: () => false,
        }),
      /wallclock_soak_state_references_current_collector/,
    );
    assert.throws(
      () =>
        classifyDonggriV1SoakCollectorStart({
          binding,
          previous_state: { ...previousState(samples), candidate_id: "wrong-candidate" },
          samples,
          current_pid: 4200,
          is_process_running: () => false,
        }),
      /soak_recovery_candidate_mismatch/,
    );

    const sequenceGap = structuredClone(samples);
    sequenceGap[1].sequence = 3;
    assert.throws(
      () =>
        classifyDonggriV1SoakCollectorStart({
          binding,
          previous_state: previousState(samples),
          samples: sequenceGap,
          current_pid: 4200,
          is_process_running: () => false,
        }),
      /soak_sequence_gap/,
    );

    const timeRegression = structuredClone(samples);
    timeRegression[1].sampled_at = timeRegression[0].sampled_at;
    assert.throws(
      () =>
        classifyDonggriV1SoakCollectorStart({
          binding,
          previous_state: previousState(samples),
          samples: timeRegression,
          current_pid: 4200,
          is_process_running: () => false,
        }),
      /non_monotonic_soak_sample/,
    );
  });

  it("rejects malformed JSONL instead of discarding journal history", () => {
    assert.throws(() => parseDonggriV1SoakSampleJournal('{"sequence":1}\nnot-json\n'));
  });
});
