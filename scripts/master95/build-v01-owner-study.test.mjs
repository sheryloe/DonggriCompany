import assert from "node:assert/strict";
import test from "node:test";
import { buildV01OwnerStudy } from "./build-v01-owner-study.mjs";

const binding = {
  candidate_id: "dongri-grigri-v01-alpha.1",
  candidate_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
};

function log() {
  return {
    schema_version: "donggri-v01-owner-study-session-log/v1",
    release_label: "V01",
    certification_claimed: false,
    ...binding,
    study_protocol: {
      project_id: "project:BloggerGent",
      task_prompt_sha256: "3".repeat(64),
      coaching_allowed: false,
    },
    sessions: [2.1, 2.4, 3, 3.2, 4.1].map((duration, index) => ({
      session_id: `session-${index + 1}`,
      participant_sha256: index < 3 ? "4".repeat(64) : "5".repeat(64),
      started_at: `2026-07-28T05:00:${String(index * 10).padStart(2, "0")}.000Z`,
      completed_at: new Date(
        Date.parse(`2026-07-28T05:00:${String(index * 10).padStart(2, "0")}.000Z`) + duration * 1_000,
      ).toISOString(),
      expected_owner: "OPS",
      identified_owner: "OPS",
      coached: false,
      observation_artifact: {
        absolute_path: `G:\\Donggri_DevDrive\\evidence\\session-${index + 1}.webm`,
        sha256: (index + 6).toString(16).repeat(64).slice(0, 64),
      },
    })),
  };
}

test("computes an uncoached two-participant p95 from raw timestamps", () => {
  const report = buildV01OwnerStudy(log(), binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "pass");
  assert.equal(report.measurement.participant_count, 2);
  assert.equal(report.measurement.p95_seconds, 4.1);
  assert.equal(report.measurement.accuracy_rate, 1);
  assert.equal(report.measurement.failed_session_count, 0);
  assert.deepEqual(
    report.measurement.participant_sessions.map((item) => item.session_count),
    [3, 2],
  );
});

test("fails when one participant supplies every session", () => {
  const input = log();
  for (const session of input.sessions) session.participant_sha256 = "4".repeat(64);
  const report = buildV01OwnerStudy(input, binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "fail");
  assert.equal(report.measurement.participant_count, 1);
});

test("fails instead of excluding an incorrect owner identification", () => {
  const input = log();
  input.sessions[4].identified_owner = "REVIEW";
  const report = buildV01OwnerStudy(input, binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "fail");
  assert.equal(report.session_results[4].owner_correct, false);
  assert.equal(report.measurement.accuracy_rate, 0.8);
  assert.equal(report.measurement.failed_session_count, 1);
});

test("rejects a coached session", () => {
  const input = log();
  input.sessions[0].coached = true;
  assert.throws(
    () => buildV01OwnerStudy(input, binding, "2026-07-28T06:00:00.000Z"),
    /owner_study_coached_session_forbidden/,
  );
});
