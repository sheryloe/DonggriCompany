import assert from "node:assert/strict";
import test from "node:test";
import { summarizeV01AccessibilityAutomation } from "./run-v01-accessibility-automation.mjs";

function input() {
  return {
    darkContrast: { pass: true, min_contrast_ratio: 7.1 },
    lightContrast: { pass: true, min_contrast_ratio: 7 },
    focus: { missing_visible_focus_count: 0, focus_trap_count: 0, focus_cycle_complete: true },
    mobile: { maximum_overflow_px: 0 },
    criticalFindings: [],
    consoleErrors: [],
    pageErrors: [],
  };
}

test("keeps a clean automated run collecting until manual zoom and screen-reader evidence exists", () => {
  const result = summarizeV01AccessibilityAutomation(input());
  assert.equal(result.component_status, "collecting");
  assert.equal(result.measurement.keyboard_visible_focus, "pass");
  assert.equal(result.measurement.mobile_390x844_overflow_px, 0);
});

test("fails on one pixel of mobile overflow", () => {
  const value = input();
  value.mobile.maximum_overflow_px = 1;
  const result = summarizeV01AccessibilityAutomation(value);
  assert.equal(result.component_status, "fail");
  assert.equal(result.measurement.mobile_390x844_overflow_px, 1);
});

test("fails when forward keyboard traversal does not complete one exact focus cycle", () => {
  const value = input();
  value.focus.focus_cycle_complete = false;
  const result = summarizeV01AccessibilityAutomation(value);
  assert.equal(result.component_status, "fail");
  assert.equal(result.measurement.focus_cycle_complete, "fail");
});

test("promotes browser errors to critical findings", () => {
  const value = input();
  value.pageErrors.push("render crash");
  const result = summarizeV01AccessibilityAutomation(value);
  assert.equal(result.component_status, "fail");
  assert.equal(result.measurement.critical_findings[0].code, "browser-page-error");
});
