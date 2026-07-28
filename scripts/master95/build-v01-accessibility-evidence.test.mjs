import assert from "node:assert/strict";
import test from "node:test";
import { buildV01AccessibilityEvidence } from "./build-v01-accessibility-evidence.mjs";

const binding = {
  candidate_id: "dongri-grigri-v01-alpha.1",
  candidate_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
};

function inputs() {
  const common = {
    release_label: "V01",
    certification_claimed: false,
    ...binding,
  };
  return {
    automation: {
      schema_version: "donggri-v01-accessibility-automation/v1",
      ...common,
      component_status: "collecting",
      approval_id: "APR-V1-ALPHA1-SMOKE-001",
      generated_at: "2026-07-28T05:30:00.000Z",
      base_url: "http://127.0.0.1:8800",
      measurement: {
        contrast_minimum_dark: 7.1,
        contrast_minimum_light: 7,
        keyboard_visible_focus: "pass",
        focus_trap_count: 0,
        mobile_390x844_overflow_px: 0,
        critical_findings: [],
      },
      raw_results: {},
      artifacts: {
        "desktop-1440x900.png": {
          absolute_path: "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01\\a11y\\desktop-1440x900.png",
          sha256: "6".repeat(64),
        },
        "mobile-390x844.png": {
          absolute_path: "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01\\a11y\\mobile-390x844.png",
          sha256: "7".repeat(64),
        },
        "trace.log": {
          absolute_path: "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01\\a11y\\trace.log",
          sha256: "8".repeat(64),
        },
      },
    },
    manual: {
      schema_version: "donggri-v01-accessibility-manual-attestation/v1",
      ...common,
      operator: {
        operator_sha256: "3".repeat(64),
        personal_data_included: false,
      },
      browser_zoom: {
        browser_name: "Chrome",
        browser_version: "140.0",
        zoom_percent: 200,
        reflow_pass: true,
        horizontal_overflow_px: 0,
        artifact: {
          absolute_path: "G:\\Donggri_DevDrive\\evidence\\zoom.webm",
          sha256: "4".repeat(64),
        },
      },
      screen_reader: {
        tool_name: "Windows Narrator",
        tool_version: "Windows 11",
        critical_journeys_completed: 5,
        pass: true,
        findings: [],
        artifact: {
          absolute_path: "G:\\Donggri_DevDrive\\evidence\\narrator.webm",
          sha256: "5".repeat(64),
        },
      },
    },
  };
}

test("requires both automation and real manual attestation for accessibility pass", () => {
  const value = inputs();
  const report = buildV01AccessibilityEvidence(value.automation, value.manual, binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "pass");
  assert.equal(report.measurement.browser_zoom_200_reflow, "pass");
  assert.equal(report.measurement.screen_reader, "pass");
});

test("fails when the manual 200 percent zoom still overflows", () => {
  const value = inputs();
  value.manual.browser_zoom.horizontal_overflow_px = 1;
  const report = buildV01AccessibilityEvidence(value.automation, value.manual, binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "fail");
  assert.equal(report.measurement.browser_zoom_200_reflow, "fail");
});

test("fails when screen-reader findings are not empty", () => {
  const value = inputs();
  value.manual.screen_reader.findings.push({
    code: "unlabelled-control",
    severity: "high",
    target: "업무",
    message: "control name missing",
  });
  const report = buildV01AccessibilityEvidence(value.automation, value.manual, binding, "2026-07-28T06:00:00.000Z");
  assert.equal(report.component_status, "fail");
  assert.equal(report.measurement.screen_reader, "fail");
});

test("rejects a screen-reader attestation with fewer than five journeys", () => {
  const value = inputs();
  value.manual.screen_reader.critical_journeys_completed = 4;
  assert.throws(
    () => buildV01AccessibilityEvidence(value.automation, value.manual, binding, "2026-07-28T06:00:00.000Z"),
    /a11y_manual_screen_reader_journey_floor/,
  );
});

test("rejects an unrecognized screen-reader product name", () => {
  const value = inputs();
  value.manual.screen_reader.tool_name = "Fake Reader";
  assert.throws(
    () => buildV01AccessibilityEvidence(value.automation, value.manual, binding, "2026-07-28T06:00:00.000Z"),
    /a11y_manual_screen_reader_name_unsupported/,
  );
});
