import assert from "node:assert/strict";
import test from "node:test";
import { evaluateUxAudit, v01HistoricalUxAuditAuthority } from "./ux-audit-contract.mjs";

const candidateSha = "1".repeat(40);
const sourceEpoch = `sha256:${"2".repeat(64)}`;
const journeyIds = ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"];

function records(step, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `S${step}-T${String(index + 1).padStart(2, "0")}`,
    requirement: `Step ${step} requirement ${index + 1}`,
    status: "proven",
    evidence: [`evidence:${step}:${index + 1}`],
  }));
}

function completeAudit() {
  return {
    schema_version: "master95_granular_completion_audit_v2",
    release_label: "V01",
    component_status: "pass",
    certification_claimed: false,
    historical_authority: { ...v01HistoricalUxAuditAuthority },
    candidate_binding: {
      candidate_id: "dongri-grigri-v01-alpha.1",
      candidate_sha: candidateSha,
      source_epoch: sourceEpoch,
      generated_at: "2026-07-28T05:00:00.000Z",
    },
    evidence_sources: Object.fromEntries(
      ["five_journey", "owner_discovery", "accessibility"].map((name, index) => [
        name,
        {
          absolute_path: `G:\\Donggri_DevDrive\\evidence\\${name}.json`,
          sha256: (index + 7).toString(16).repeat(64).slice(0, 64),
          component_status: "pass",
        },
      ]),
    ),
    measurements: {
      five_journey: {
        attempt_count: 20,
        success_count: 20,
        success_rate: 1,
        per_journey: Object.fromEntries(journeyIds.map((journeyId) => [journeyId, { attempts: 4, successes: 4 }])),
        approval_receipt_sha256: Array.from({ length: 20 }, (_, index) => (index + 1).toString(16).padStart(64, "0")),
        idempotency_replay_count: 20,
        sqlite_restart_verified: true,
        journal_event_ranges: Array.from({ length: 20 }, (_, index) => {
          const receipt = (index + 1).toString(16).padStart(64, "0");
          return {
            journey_id: journeyIds[index % journeyIds.length],
            approval_receipt_sha256: receipt,
            first_sequence: index * 2 + 1,
            last_sequence: index * 2 + 2,
          };
        }),
        journal_event_count: 40,
        journal_sha256: "a".repeat(64),
        checkpoint_sha256: "b".repeat(64),
        mutation_db_sha256: "c".repeat(64),
        last_event_hash: "d".repeat(64),
        external_effect_count: 0,
        cross_project_leak_count: 0,
      },
      owner_discovery: {
        mode: "human_timed_study",
        participant_count: 2,
        total_session_count: 5,
        correct_session_count: 5,
        failed_session_count: 0,
        accuracy_rate: 1,
        durations_seconds: [2.1, 2.4, 3, 3.2, 4.1],
        p95_seconds: 4.1,
        coached_session_count: 0,
        personal_data_included: false,
        participant_sessions: [
          { participant_sha256: "e".repeat(64), session_count: 3 },
          { participant_sha256: "f".repeat(64), session_count: 2 },
        ],
      },
      accessibility: {
        contrast_minimum_dark: 7.277,
        contrast_minimum_light: 7.19,
        keyboard_visible_focus: "pass",
        focus_trap_count: 0,
        browser_zoom_200_reflow: "pass",
        mobile_390x844_overflow_px: 0,
        screen_reader: "pass",
        critical_findings: [],
      },
    },
    stages: [
      {
        step: 18,
        status: "proven",
        criteria: records(18, 2),
        completion_gates: records(18, 1).map((r) => ({ ...r, id: "S18-G01" })),
      },
      {
        step: 19,
        status: "proven",
        criteria: records(19, 2),
        completion_gates: records(19, 1).map((r) => ({ ...r, id: "S19-G01" })),
      },
    ],
  };
}

test("accepts one fully candidate-bound V01 audit", () => {
  const result = evaluateUxAudit(completeAudit(), {
    requireCandidateBound: true,
    expectedCandidateId: "dongri-grigri-v01-alpha.1",
    expectedCandidateSha: candidateSha,
    expectedSourceEpoch: sourceEpoch,
  });
  assert.equal(result.certification_ready, true);
  assert.deepEqual(result.blockers, []);
});

test("rejects a candidate SHA mismatch", () => {
  assert.throws(
    () =>
      evaluateUxAudit(completeAudit(), {
        requireCandidateBound: true,
        expectedCandidateSha: "3".repeat(40),
      }),
    /candidate_sha_mismatch/,
  );
});

test("keeps an incomplete screen-reader measurement collecting", () => {
  const audit = completeAudit();
  audit.component_status = "collecting";
  audit.measurements.accessibility.screen_reader = "not_run";
  const result = evaluateUxAudit(audit, { requireCandidateBound: true });
  assert.equal(result.certification_ready, false);
  assert(result.blockers.includes("accessibility_screen_reader"));
});

test("rejects legacy audit promotion", () => {
  const legacy = {
    schema_version: "master95_granular_completion_audit_v1",
    stages: [
      {
        step: 18,
        status: "proven",
        criteria: records(18, 1),
        completion_gates: [{ ...records(18, 1)[0], id: "S18-G01" }],
      },
      {
        step: 19,
        status: "proven",
        criteria: records(19, 1),
        completion_gates: [{ ...records(19, 1)[0], id: "S19-G01" }],
      },
    ],
  };
  assert.throws(() => evaluateUxAudit(legacy, { requireCandidateBound: true }), /candidate_bound_audit_required/);
});

test("rejects computed owner p95 inflation", () => {
  const audit = completeAudit();
  audit.measurements.owner_discovery.p95_seconds = 1;
  assert.throws(() => evaluateUxAudit(audit, { requireCandidateBound: true }), /owner_discovery_p95_mismatch/);
});

test("rejects duplicate receipt hashes even when their letter case differs", () => {
  const audit = completeAudit();
  const duplicate = audit.measurements.five_journey.approval_receipt_sha256[9].toUpperCase();
  audit.measurements.five_journey.approval_receipt_sha256[10] = duplicate;
  audit.measurements.five_journey.journal_event_ranges[10].approval_receipt_sha256 = duplicate;
  assert.throws(() => evaluateUxAudit(audit, { requireCandidateBound: true }), /component_status_measurement_mismatch/);
});

test("rejects an owner study with a failed identification even when its status says pass", () => {
  const audit = completeAudit();
  audit.measurements.owner_discovery.correct_session_count = 4;
  audit.measurements.owner_discovery.failed_session_count = 1;
  audit.measurements.owner_discovery.accuracy_rate = 0.8;
  assert.throws(() => evaluateUxAudit(audit, { requireCandidateBound: true }), /component_status_measurement_mismatch/);
});

test("rejects a substituted historical audit authority", () => {
  const audit = completeAudit();
  audit.historical_authority.sha256 = "9".repeat(64);
  assert.throws(
    () => evaluateUxAudit(audit, { requireCandidateBound: true }),
    /historical_audit_authority_sha256_mismatch/,
  );
});
