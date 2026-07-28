import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertV01NewReportPath, verifyV01EvidenceArtifact } from "./v01-evidence-file.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const WINDOWS_SCREEN_READERS = new Set(["Windows Narrator", "NVDA"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), message);
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  assert(
    actual.length === normalizedExpected.length && actual.every((key, index) => key === normalizedExpected[index]),
    message,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function bindingFromRepo() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const binding = {
    candidate_id: String(pkg.donggriRelease?.candidateId ?? ""),
    candidate_sha: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .trim()
      .toLowerCase(),
    source_epoch: String(pkg.donggriRelease?.sourceEpoch ?? "").toLowerCase(),
  };
  assert(/^dongri-grigri-v01(?:[-.][a-z0-9]+)*$/i.test(binding.candidate_id), "a11y_candidate_id_invalid");
  assert(/^[0-9a-f]{40}$/.test(binding.candidate_sha), "a11y_candidate_sha_invalid");
  assert(/^[0-9a-f]{64}$/.test(binding.source_epoch), "a11y_source_epoch_invalid");
  return binding;
}

function requireCleanCandidate() {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert(status.length === 0, "a11y_candidate_worktree_dirty");
}

function validateBinding(value, binding, prefix) {
  for (const field of ["candidate_id", "candidate_sha", "source_epoch"]) {
    assert(value[field] === binding[field], `${prefix}_binding_mismatch:${field}`);
  }
}

function validateArtifact(artifact, field) {
  exactKeys(artifact, ["absolute_path", "sha256"], `${field}_artifact_invalid`);
  assert(
    typeof artifact.absolute_path === "string" && /^[A-Za-z]:[\\/]/.test(artifact.absolute_path),
    `${field}_artifact_path_invalid`,
  );
  assert(
    typeof artifact.sha256 === "string" && SHA256_PATTERN.test(artifact.sha256),
    `${field}_artifact_sha256_invalid`,
  );
}

function findings(value, field) {
  assert(Array.isArray(value), `${field}_findings_invalid`);
  return value.map((finding) => {
    exactKeys(finding, ["code", "message", "severity", "target"], `${field}_finding_invalid`);
    assert(
      finding.severity === "critical" ||
        finding.severity === "high" ||
        finding.severity === "medium" ||
        finding.severity === "low",
      `${field}_finding_severity_invalid`,
    );
    for (const key of ["code", "message", "target"]) {
      assert(typeof finding[key] === "string" && finding[key].trim().length > 0, `${field}_finding_${key}_invalid`);
    }
    return finding;
  });
}

export function buildV01AccessibilityEvidence(automation, manual, binding, generatedAt) {
  exactKeys(
    automation,
    [
      "approval_id",
      "artifacts",
      "base_url",
      "candidate_id",
      "candidate_sha",
      "certification_claimed",
      "component_status",
      "generated_at",
      "measurement",
      "raw_results",
      "release_label",
      "schema_version",
      "source_epoch",
    ],
    "a11y_automation_top_level_keys_invalid",
  );
  exactKeys(
    manual,
    [
      "browser_zoom",
      "candidate_id",
      "candidate_sha",
      "certification_claimed",
      "operator",
      "release_label",
      "schema_version",
      "screen_reader",
      "source_epoch",
    ],
    "a11y_manual_top_level_keys_invalid",
  );
  assert(automation?.schema_version === "donggri-v01-accessibility-automation/v1", "a11y_automation_schema_invalid");
  assert(manual?.schema_version === "donggri-v01-accessibility-manual-attestation/v1", "a11y_manual_schema_invalid");
  for (const value of [automation, manual]) {
    assert(value.release_label === "V01", "a11y_release_label_mismatch");
    assert(value.certification_claimed === false, "a11y_certification_claim_forbidden");
  }
  validateBinding(automation, binding, "a11y_automation");
  validateBinding(manual, binding, "a11y_manual");
  assert(
    automation.component_status === "collecting" ||
      automation.component_status === "pass" ||
      automation.component_status === "fail",
    "a11y_automation_status_invalid",
  );
  exactKeys(
    automation.artifacts,
    ["desktop-1440x900.png", "mobile-390x844.png", "trace.log"],
    "a11y_automation_artifact_set_invalid",
  );
  for (const [name, artifact] of Object.entries(automation.artifacts)) {
    validateArtifact(artifact, `a11y_automation:${name}`);
  }
  exactKeys(manual.operator, ["operator_sha256", "personal_data_included"], "a11y_manual_operator_invalid");
  assert(
    typeof manual.operator.operator_sha256 === "string" && SHA256_PATTERN.test(manual.operator.operator_sha256),
    "a11y_manual_operator_sha256_invalid",
  );
  assert(manual.operator.personal_data_included === false, "a11y_manual_personal_data_forbidden");
  exactKeys(
    manual.browser_zoom,
    ["artifact", "browser_name", "browser_version", "horizontal_overflow_px", "reflow_pass", "zoom_percent"],
    "a11y_manual_zoom_invalid",
  );
  assert(manual.browser_zoom.zoom_percent === 200, "a11y_manual_zoom_percent_invalid");
  assert(
    typeof manual.browser_zoom.browser_name === "string" && manual.browser_zoom.browser_name.trim(),
    "a11y_manual_browser_name_invalid",
  );
  assert(
    typeof manual.browser_zoom.browser_version === "string" && manual.browser_zoom.browser_version.trim(),
    "a11y_manual_browser_version_invalid",
  );
  assert(
    Number.isFinite(manual.browser_zoom.horizontal_overflow_px) && manual.browser_zoom.horizontal_overflow_px >= 0,
    "a11y_manual_zoom_overflow_invalid",
  );
  assert(typeof manual.browser_zoom.reflow_pass === "boolean", "a11y_manual_zoom_reflow_invalid");
  validateArtifact(manual.browser_zoom.artifact, "a11y_manual_zoom");
  exactKeys(
    manual.screen_reader,
    ["artifact", "critical_journeys_completed", "findings", "pass", "tool_name", "tool_version"],
    "a11y_manual_screen_reader_invalid",
  );
  assert(
    typeof manual.screen_reader.tool_name === "string" && manual.screen_reader.tool_name.trim(),
    "a11y_manual_screen_reader_name_invalid",
  );
  assert(
    WINDOWS_SCREEN_READERS.has(manual.screen_reader.tool_name.trim()),
    "a11y_manual_screen_reader_name_unsupported",
  );
  assert(
    typeof manual.screen_reader.tool_version === "string" && manual.screen_reader.tool_version.trim(),
    "a11y_manual_screen_reader_version_invalid",
  );
  assert(
    Number.isInteger(manual.screen_reader.critical_journeys_completed) &&
      manual.screen_reader.critical_journeys_completed >= 5,
    "a11y_manual_screen_reader_journey_floor",
  );
  assert(typeof manual.screen_reader.pass === "boolean", "a11y_manual_screen_reader_pass_invalid");
  validateArtifact(manual.screen_reader.artifact, "a11y_manual_screen_reader");

  const automatedFindings = findings(automation.measurement?.critical_findings, "a11y_automation");
  const screenReaderFindings = findings(manual.screen_reader.findings, "a11y_manual_screen_reader");
  const criticalFindings = [...automatedFindings, ...screenReaderFindings].filter(
    (finding) => finding.severity === "critical",
  );
  const automationPass =
    automation.component_status !== "fail" &&
    automation.measurement.contrast_minimum_dark >= 4.5 &&
    automation.measurement.contrast_minimum_light >= 4.5 &&
    automation.measurement.keyboard_visible_focus === "pass" &&
    automation.measurement.focus_trap_count === 0 &&
    automation.measurement.mobile_390x844_overflow_px <= 0 &&
    automatedFindings.length === 0;
  const zoomPass = manual.browser_zoom.reflow_pass === true && manual.browser_zoom.horizontal_overflow_px === 0;
  const screenReaderPass = manual.screen_reader.pass === true && screenReaderFindings.length === 0;
  const pass = automationPass && zoomPass && screenReaderPass && criticalFindings.length === 0;
  return {
    schema_version: "donggri-v01-accessibility-evidence/v1",
    release_label: "V01",
    component_status: pass ? "pass" : "fail",
    certification_claimed: false,
    ...binding,
    generated_at: generatedAt,
    evidence_inputs: {
      automation_canonical_sha256: sha256(canonicalJson(automation)),
      manual_attestation_canonical_sha256: sha256(canonicalJson(manual)),
      automation_artifacts: automation.artifacts,
      zoom_artifact: manual.browser_zoom.artifact,
      screen_reader_artifact: manual.screen_reader.artifact,
    },
    measurement: {
      contrast_minimum_dark: automation.measurement.contrast_minimum_dark,
      contrast_minimum_light: automation.measurement.contrast_minimum_light,
      keyboard_visible_focus: automation.measurement.keyboard_visible_focus,
      focus_trap_count: automation.measurement.focus_trap_count,
      browser_zoom_200_reflow: zoomPass ? "pass" : "fail",
      mobile_390x844_overflow_px: automation.measurement.mobile_390x844_overflow_px,
      screen_reader: screenReaderPass ? "pass" : "fail",
      critical_findings: criticalFindings,
    },
  };
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2)}_value_required`);
  return value;
}

function readAbsoluteJson(flag) {
  const raw = argumentValue(flag);
  assert(path.isAbsolute(raw), `${flag.slice(2)}_path_must_be_absolute`);
  const absolutePath = path.resolve(raw);
  const bytes = fs.readFileSync(absolutePath);
  return {
    absolute_path: absolutePath,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function main() {
  const automationSource = readAbsoluteJson("--automation");
  const manualSource = readAbsoluteJson("--manual");
  const rawOutput = argumentValue("--output");
  const output = assertV01NewReportPath(rawOutput, "a11y_output");
  assert(!fs.existsSync(output) && !fs.existsSync(`${output}.sha256`), "a11y_output_already_exists");
  requireCleanCandidate();
  const binding = bindingFromRepo();
  verifyV01EvidenceArtifact(automationSource, "a11y_automation_source");
  verifyV01EvidenceArtifact(manualSource, "a11y_manual_source");
  const report = buildV01AccessibilityEvidence(
    automationSource.value,
    manualSource.value,
    binding,
    new Date().toISOString(),
  );
  for (const [name, artifact] of Object.entries(report.evidence_inputs.automation_artifacts)) {
    verifyV01EvidenceArtifact(artifact, `a11y_automation:${name}`);
  }
  verifyV01EvidenceArtifact(report.evidence_inputs.zoom_artifact, "a11y_manual_zoom");
  verifyV01EvidenceArtifact(report.evidence_inputs.screen_reader_artifact, "a11y_manual_screen_reader");
  const serialized = canonicalJson(report);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, serialized, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(`${output}.sha256`, `${sha256(serialized)}  ${path.basename(output)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: report.component_status === "pass",
      component_status: report.component_status,
      output,
      report_sha256: sha256(serialized),
    })}\n`,
  );
  if (report.component_status !== "pass") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
