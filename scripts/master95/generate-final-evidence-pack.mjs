#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95");
const evidenceIndexPath = path.join(qualityRoot, "EVIDENCE_INDEX.yaml");
const packRoot = path.join(qualityRoot, "final-evidence-pack");
const manifestPath = path.join(packRoot, "FINAL_EVIDENCE_PACK_MANIFEST.json");

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~" || trimmed === "") return null;
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function parseEvidenceIndex(raw) {
  const versionMatch = raw.match(/^version:\s*(.+)$/m);
  const specMatch = raw.match(/^spec_id:\s*(.+)$/m);
  const evidence = new Map();
  let inEvidence = false;
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    if (line === "evidence:") {
      inEvidence = true;
      continue;
    }
    if (inEvidence && /^[A-Za-z0-9_]+:/.test(line)) break;
    if (!inEvidence) continue;

    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: parseScalar(idMatch[1]), kind: null, status: "missing", path: null };
      evidence.set(current.id, current);
      continue;
    }
    const fieldMatch = line.match(/^\s{4}(kind|status|path):\s*(.*)$/);
    if (current && fieldMatch) current[fieldMatch[1]] = parseScalar(fieldMatch[2]);
  }

  return {
    version: parseScalar(versionMatch?.[1] ?? "unknown"),
    specId: parseScalar(specMatch?.[1] ?? "unknown"),
    evidence,
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function artifactRecord(filePath, source) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { source, path: resolved, exists: false, sha256: null, bytes: null };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { source, path: resolved, exists: false, sha256: null, bytes: null, error: "not_a_file" };
  }
  return {
    source,
    path: resolved,
    exists: true,
    sha256: sha256File(resolved),
    bytes: stat.size,
  };
}

function adrPaths(root = qualityRoot) {
  const architectureRoot = path.join(root, "architecture");
  if (!fs.existsSync(architectureRoot)) return [];
  return fs
    .readdirSync(architectureRoot)
    .filter((name) => /^ADR-\d{3}-.+\.md$/.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(architectureRoot, name));
}

function componentDefinitions(root = qualityRoot) {
  const q = (...segments) => path.join(root, ...segments);
  return [
    {
      id: "final_system_architecture",
      original_requirement: true,
      evidence_refs: ["EV-M95-ARCHITECTURE-001"],
      files: [q("architecture", "ARCHITECTURE_MASTER.md")],
    },
    {
      id: "all_adrs",
      original_requirement: true,
      evidence_refs: ["EV-M95-ARCHITECTURE-001"],
      files: adrPaths(root),
      minimum_file_count: 4,
    },
    {
      id: "requirements_traceability_matrix",
      original_requirement: true,
      evidence_refs: ["EV-M95-TRACEABILITY-MATRIX-001"],
      files: [q("REQUIREMENTS_TRACEABILITY_MATRIX.xlsx")],
    },
    {
      id: "all_agent_manifests",
      original_requirement: true,
      evidence_refs: ["EV-M95-AGENT-REGISTRY-001", "EV-M95-SPECIALIST-AGENTS-001"],
      files: [
        q("agents", "AGENT_MANIFEST.schema.json"),
        q("agents", "AGENT_REGISTRY_BASELINE.json"),
        q("specialists", "SPECIALIST_AGENT.schema.json"),
        q("specialists", "SPECIALIST_AGENT_BASELINE.json"),
      ],
    },
    {
      id: "project_registry_snapshot",
      original_requirement: true,
      evidence_refs: ["EV-M95-PROJECT-ISOLATION-001"],
      files: [q("projects", "PROJECT_REGISTRY_BASELINE.json")],
    },
    {
      id: "skill_registry_snapshot",
      original_requirement: true,
      evidence_refs: ["EV-M95-SKILL-MCP-001"],
      files: [q("skills", "SKILL_MCP_BASELINE.json")],
    },
    {
      id: "memory_schema_and_retrieval_evaluation",
      original_requirement: true,
      evidence_refs: ["EV-M95-MEMORY-001"],
      files: [q("memory", "MEMORY_GOVERNANCE_BASELINE.json"), q("memory", "MEMORY_GOVERNANCE_POLICY.md")],
    },
    {
      id: "api_and_event_schema",
      original_requirement: true,
      evidence_refs: ["EV-M95-CONTRACTS-001"],
      files: [q("contracts", "MASTER95_CONTRACTS.schema.json"), q("contracts", "MASTER95_EVENTS.schema.json")],
    },
    {
      id: "e2e_execution_trace",
      original_requirement: true,
      evidence_refs: ["EV-M95-TRACE-EVAL-001", "EV-M95-PILOT-001"],
      files: [],
    },
    {
      id: "security_and_permission_test_report",
      original_requirement: true,
      evidence_refs: ["EV-M95-POLICY-001", "EV-M95-TRACE-COVERAGE-001"],
      files: [q("policy", "POLICY_APPROVAL_SANDBOX_BASELINE.json")],
    },
    {
      id: "failure_and_recovery_rehearsal_report",
      original_requirement: true,
      evidence_refs: ["EV-M95-RESILIENCE-REHEARSAL-001", "EV-M95-SLO-RECOVERY-001"],
      files: [],
    },
    {
      id: "performance_and_cost_report",
      original_requirement: true,
      evidence_refs: ["EV-M95-TRACE-EVAL-001", "EV-M95-SLO-RECOVERY-001"],
      files: [q("observability", "OBSERVABILITY_BASELINE.json")],
    },
    {
      id: "ui_usability_test",
      original_requirement: true,
      evidence_refs: ["EV-M95-CONTROL-TOWER-001", "EV-M95-CONTROL-TOWER-A11Y-001", "EV-M95-CONTROL-TOWER-JOURNEYS-001"],
      files: [],
    },
    {
      id: "image_workbench_test",
      original_requirement: true,
      evidence_refs: ["EV-M95-IMAGE-WORKBENCH-001"],
      files: [q("image-workbench", "IMAGE_WORKBENCH_BASELINE.json")],
    },
    {
      id: "thirty_day_pilot_report",
      original_requirement: true,
      evidence_refs: ["EV-M95-PILOT-001"],
      files: [],
    },
    {
      id: "independent_evaluator_reassessment_sheet",
      original_requirement: true,
      evidence_refs: ["EV-M95-EVALUATOR-AGREEMENT-001", "EV-M95-AGY-FINAL-001"],
      files: [q("EVALUATOR_CHECKLIST.md")],
    },
    {
      id: "reproducible_delivery_and_rollback",
      original_requirement: false,
      evidence_refs: ["EV-M95-DELIVERY-001"],
      files: [q("delivery", "DELIVERY_REHEARSAL.json")],
    },
  ];
}

function evaluateComponent(definition, evidence) {
  const evidenceResults = definition.evidence_refs.map((id) => {
    const item = evidence.get(id);
    if (!item) return { id, kind: null, status: "missing", path: null, accepted: false };
    return { ...item, accepted: item.status === "pass" };
  });
  const artifacts = [];
  for (const item of evidenceResults) {
    if (item.path) artifacts.push(artifactRecord(item.path, `evidence:${item.id}`));
  }
  for (const filePath of definition.files) artifacts.push(artifactRecord(filePath, "required_file"));

  const uniqueArtifacts = [...new Map(artifacts.map((item) => [item.path, item])).values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const minimumSatisfied =
    definition.minimum_file_count === undefined || definition.files.length >= definition.minimum_file_count;
  const ready =
    evidenceResults.every((item) => item.accepted) &&
    uniqueArtifacts.length > 0 &&
    uniqueArtifacts.every((item) => item.exists) &&
    minimumSatisfied;
  const blockers = [];
  for (const item of evidenceResults) {
    if (!item.accepted) blockers.push(`${item.id}:status=${item.status}`);
  }
  for (const item of uniqueArtifacts) {
    if (!item.exists) blockers.push(`${item.path}:${item.error ?? "missing"}`);
  }
  if (!minimumSatisfied) {
    blockers.push(`required_file_count=${definition.files.length}<${definition.minimum_file_count}`);
  }

  return {
    id: definition.id,
    original_requirement: definition.original_requirement,
    status: ready ? "ready" : "pending",
    evidence: evidenceResults,
    artifacts: uniqueArtifacts,
    blockers,
  };
}

function deriveReportDate(index) {
  const dates = [];
  for (const item of index.evidence.values()) {
    for (const match of item.path?.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g) ?? []) dates.push(match[1]);
  }
  return dates.sort().at(-1) ?? "undated";
}

function buildManifest(index, definitions = componentDefinitions()) {
  const components = definitions.map((definition) => evaluateComponent(definition, index.evidence));
  const original = components.filter((item) => item.original_requirement);
  const prerequisites = components.filter((item) => !item.original_requirement);
  const pending = components.filter((item) => item.status !== "ready").map((item) => item.id);
  return {
    schema_version: "2026-07-15.master95.final-evidence-pack.v1",
    spec_id: index.specId,
    source_evidence_index: evidenceIndexPath,
    source_evidence_version: index.version,
    source_report_date: deriveReportDate(index),
    pack_status: pending.length === 0 ? "ready_for_independent_assessment" : "pending",
    certification_claimed: false,
    completion_rule: "all 16 original components and every certification prerequisite must be ready",
    counts: {
      original_required: original.length,
      original_ready: original.filter((item) => item.status === "ready").length,
      prerequisites_required: prerequisites.length,
      prerequisites_ready: prerequisites.filter((item) => item.status === "ready").length,
      pending: pending.length,
    },
    pending_components: pending,
    components,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reportPath(manifest) {
  return path.join(
    controlRoot,
    "storage",
    "codex-control",
    "reports",
    "DonggriCompany",
    manifest.source_report_date,
    "master95-final-evidence-pack",
    "evidence-pack-status.json",
  );
}

function writeOutputs(manifest) {
  fs.mkdirSync(packRoot, { recursive: true });
  fs.writeFileSync(manifestPath, stableJson(manifest), "utf8");
  const outputReportPath = reportPath(manifest);
  fs.mkdirSync(path.dirname(outputReportPath), { recursive: true });
  fs.writeFileSync(outputReportPath, stableJson(manifest), "utf8");
  return outputReportPath;
}

function checkOutput(filePath, expected) {
  if (!fs.existsSync(filePath)) throw new Error(`missing generated output: ${filePath}`);
  const actual = fs.readFileSync(filePath, "utf8");
  if (actual !== stableJson(expected)) throw new Error(`generated output drift: ${filePath}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTests(currentManifest) {
  const first = path.join(packRoot, "FINAL_EVIDENCE_PACK_POLICY.md");
  const second = path.resolve(fileURLToPath(import.meta.url));
  assert(sha256File(first) === sha256File(first), "repeated reads must have deterministic hashes");

  const readyEvidence = new Map([["EV-TEST-001", { id: "EV-TEST-001", status: "pass", path: first }]]);
  const definition = {
    id: "synthetic",
    original_requirement: true,
    evidence_refs: ["EV-TEST-001"],
    files: [second],
  };
  assert(evaluateComponent(definition, readyEvidence).status === "ready", "synthetic all-pass pack must be ready");

  const partialEvidence = new Map([["EV-TEST-001", { id: "EV-TEST-001", status: "partial", path: first }]]);
  assert(evaluateComponent(definition, partialEvidence).status === "pending", "non-pass evidence must fail closed");

  const missingEvidence = new Map([["EV-TEST-001", { id: "EV-TEST-001", status: "pass", path: first }]]);
  assert(
    evaluateComponent({ ...definition, files: [path.join(packRoot, "INTENTIONALLY_MISSING.fixture")] }, missingEvidence)
      .status === "pending",
    "missing artifacts must fail closed",
  );

  assert(currentManifest.counts.original_required === 16, "the original Evidence Pack must contain 16 components");
  assert(currentManifest.certification_claimed === false, "the generator must never claim certification");
  assert(currentManifest.pack_status === "pending", "the current incomplete pack must remain pending");
  for (const expected of [
    "e2e_execution_trace",
    "failure_and_recovery_rehearsal_report",
    "performance_and_cost_report",
    "ui_usability_test",
    "thirty_day_pilot_report",
    "independent_evaluator_reassessment_sheet",
    "reproducible_delivery_and_rollback",
  ]) {
    assert(currentManifest.pending_components.includes(expected), `current pack must expose blocker: ${expected}`);
  }
}

const args = new Set(process.argv.slice(2));
const validArgs = new Set(["--write", "--check", "--self-test"]);
for (const arg of args) assert(validArgs.has(arg), `unknown argument: ${arg}`);
assert(args.size > 0, "use --write, --check, or --self-test");

const index = parseEvidenceIndex(fs.readFileSync(evidenceIndexPath, "utf8"));
const manifest = buildManifest(index);
if (args.has("--self-test")) runSelfTests(manifest);
let outputReportPath = reportPath(manifest);
if (args.has("--write")) outputReportPath = writeOutputs(manifest);
if (args.has("--check")) {
  checkOutput(manifestPath, manifest);
  checkOutput(outputReportPath, manifest);
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    mode: [...args],
    pack_status: manifest.pack_status,
    certification_claimed: manifest.certification_claimed,
    counts: manifest.counts,
    pending_components: manifest.pending_components,
    manifest_path: manifestPath,
    report_path: outputReportPath,
  })}\n`,
);
