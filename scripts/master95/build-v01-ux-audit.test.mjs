import assert from "node:assert/strict";
import test from "node:test";
import { buildV01UxAudit } from "./build-v01-ux-audit.mjs";
import { v01HistoricalUxAuditAuthority } from "./ux-audit-contract.mjs";

const binding = {
  candidate_id: "dongri-grigri-v01-alpha.1",
  candidate_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
};
const journeys = ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"];

function component(name, schemaVersion, measurement) {
  return {
    absolute_path: `G:\\Donggri_DevDrive\\evidence\\${name}.json`,
    sha256: "3".repeat(64),
    value: {
      schema_version: schemaVersion,
      release_label: "V01",
      component_status: "pass",
      certification_claimed: false,
      ...binding,
      generated_at: "2026-07-28T05:00:00.000Z",
      measurement,
    },
  };
}

function legacyRecord(id, status = "proven") {
  return { id, requirement: `requirement ${id}`, status, evidence: [`legacy:${id}`] };
}

function input() {
  return {
    legacyAudit: {
      schema_version: "master95_granular_completion_audit_v1",
      stages: [
        {
          step: 18,
          status: "partial",
          criteria: [
            legacyRecord("S18-J01", "partial"),
            legacyRecord("S18-Q01", "partial"),
            legacyRecord("S18-Q05", "partial"),
          ],
          completion_gates: [
            legacyRecord("S18-G01", "partial"),
            legacyRecord("S18-G02", "partial"),
            legacyRecord("S18-G06", "partial"),
          ],
        },
        {
          step: 19,
          status: "proven",
          criteria: [legacyRecord("S19-T01")],
          completion_gates: [legacyRecord("S19-G01")],
        },
      ],
    },
    legacyAuthority: {
      absolute_path: v01HistoricalUxAuditAuthority.absolute_path,
      sha256: v01HistoricalUxAuditAuthority.sha256,
    },
    components: {
      five_journey: component("five", "donggri-v01-five-journey-evidence/v1", {
        attempt_count: 20,
        success_count: 20,
        success_rate: 1,
        per_journey: Object.fromEntries(journeys.map((journey) => [journey, { attempts: 4, successes: 4 }])),
        approval_receipt_sha256: Array.from({ length: 20 }, (_, index) => (index + 1).toString(16).padStart(64, "0")),
        idempotency_replay_count: 20,
        sqlite_restart_verified: true,
        journal_event_ranges: Array.from({ length: 20 }, (_, index) => {
          const receipt = (index + 1).toString(16).padStart(64, "0");
          return {
            journey_id: journeys[index % journeys.length],
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
      }),
      owner_discovery: component("owner", "donggri-v01-owner-discovery-evidence/v1", {
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
      }),
      accessibility: component("a11y", "donggri-v01-accessibility-evidence/v1", {
        contrast_minimum_dark: 7.277,
        contrast_minimum_light: 7.19,
        keyboard_visible_focus: "pass",
        focus_trap_count: 0,
        browser_zoom_200_reflow: "pass",
        mobile_390x844_overflow_px: 0,
        screen_reader: "pass",
        critical_findings: [],
      }),
    },
    binding,
    generatedAt: "2026-07-28T06:00:00.000Z",
  };
}

test("promotes only the six mapped legacy partials when all candidate components pass", () => {
  const audit = buildV01UxAudit(input());
  assert.equal(audit.component_status, "pass");
  assert(audit.stages.every((stage) => stage.status === "proven"));
  const records = audit.stages.flatMap((stage) => [...stage.criteria, ...stage.completion_gates]);
  assert(records.every((record) => record.status === "proven"));
  assert(records.find((record) => record.id === "S18-G01").evidence.some((value) => value.includes("#sha256=")));
});

test("keeps accessibility records partial when screen-reader evidence is incomplete", () => {
  const value = input();
  value.components.accessibility.value.component_status = "collecting";
  value.components.accessibility.value.measurement.screen_reader = "not_run";
  const audit = buildV01UxAudit(value);
  assert.equal(audit.component_status, "collecting");
  const records = audit.stages.flatMap((stage) => [...stage.criteria, ...stage.completion_gates]);
  assert.equal(records.find((record) => record.id === "S18-Q05").status, "partial");
  assert.equal(records.find((record) => record.id === "S18-G06").status, "partial");
  assert.equal(records.find((record) => record.id === "S18-G01").status, "proven");
});

test("rejects a component from another candidate", () => {
  const value = input();
  value.components.owner_discovery.value.candidate_sha = "4".repeat(40);
  assert.throws(() => buildV01UxAudit(value), /component_binding_mismatch:owner_discovery:candidate_sha/);
});

test("does not promote a non-pass component whose measurements look complete", () => {
  const value = input();
  value.components.five_journey.value.component_status = "collecting";
  const audit = buildV01UxAudit(value);
  assert.equal(audit.component_status, "collecting");
  const records = audit.stages.flatMap((stage) => [...stage.criteria, ...stage.completion_gates]);
  assert.equal(records.find((record) => record.id === "S18-G01").status, "partial");
});
