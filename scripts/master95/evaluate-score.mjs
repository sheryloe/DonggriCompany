#!/usr/bin/env node

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
const rulesPath = path.join(qualityRoot, "SCORING_RULES.json");
const evidencePath = path.join(qualityRoot, "EVIDENCE_INDEX.yaml");

function unquote(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseEvidenceIndex(raw) {
  const evidence = new Map();
  const hardGates = new Map();
  let section = null;
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    if (line === "evidence:") {
      section = "evidence";
      current = null;
      continue;
    }
    if (line === "hard_gates:") {
      section = "hard_gates";
      current = null;
      continue;
    }
    if (/^[A-Za-z0-9_]+:/.test(line)) {
      section = null;
      current = null;
      continue;
    }
    if (section === "evidence") {
      const idMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
      if (idMatch) {
        current = { id: unquote(idMatch[1]), status: "missing", path: null };
        evidence.set(current.id, current);
        continue;
      }
      const fieldMatch = line.match(/^\s{4}(status|path):\s*(.*)$/);
      if (current && fieldMatch) current[fieldMatch[1]] = unquote(fieldMatch[2]);
      continue;
    }
    if (section === "hard_gates") {
      const gateMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*(.+)$/);
      if (gateMatch) hardGates.set(gateMatch[1], unquote(gateMatch[2]));
    }
  }
  return { evidence, hardGates };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scoreCriteria(criteria, evidence, acceptedStatuses) {
  let awarded = 0;
  const results = [];
  for (const criterion of criteria) {
    assert(typeof criterion.id === "string" && criterion.id, "criterion id is required");
    assert(Number.isFinite(criterion.points) && criterion.points > 0, `${criterion.id}: points must be positive`);
    assert(
      Array.isArray(criterion.evidence_refs) && criterion.evidence_refs.length > 0,
      `${criterion.id}: evidence_refs required`,
    );
    const refs = criterion.evidence_refs.map((id) => evidence.get(id) ?? { id, status: "missing", path: null });
    const accepted = criterion.accepted_statuses ?? acceptedStatuses;
    const passed = refs.every((item) => accepted.includes(item.status));
    if (passed) awarded += criterion.points;
    results.push({
      id: criterion.id,
      points: criterion.points,
      awarded: passed ? criterion.points : 0,
      evidence: refs,
    });
  }
  return { awarded, results };
}

function evaluate(rules, index) {
  assert(rules.spec_id, "spec_id is required");
  assert(
    Array.isArray(rules.evaluation_items) && rules.evaluation_items.length === 10,
    "exactly 10 evaluation_items are required",
  );
  assert(
    Array.isArray(rules.hard_gates) && rules.hard_gates.length === 10,
    "exactly 10 certification hard_gates are required",
  );
  const acceptedStatuses = rules.accepted_evidence_statuses ?? ["pass"];
  const seenIds = new Set();
  const itemResults = [];
  let design = 0;
  let implementation = 0;
  let designMax = 0;
  let implementationMax = 0;

  for (const item of rules.evaluation_items) {
    assert(!seenIds.has(item.id), `duplicate evaluation item: ${item.id}`);
    seenIds.add(item.id);
    const designResult = scoreCriteria(item.design_criteria ?? [], index.evidence, acceptedStatuses);
    const implementationResult = scoreCriteria(item.implementation_criteria ?? [], index.evidence, acceptedStatuses);
    const designCriteriaMax = (item.design_criteria ?? []).reduce((sum, criterion) => sum + criterion.points, 0);
    const implementationCriteriaMax = (item.implementation_criteria ?? []).reduce(
      (sum, criterion) => sum + criterion.points,
      0,
    );
    assert(designCriteriaMax === item.design_max, `${item.id}: design criteria sum must equal design_max`);
    assert(
      implementationCriteriaMax === item.implementation_max,
      `${item.id}: implementation criteria sum must equal implementation_max`,
    );
    design += designResult.awarded;
    implementation += implementationResult.awarded;
    designMax += item.design_max;
    implementationMax += item.implementation_max;
    itemResults.push({
      id: item.id,
      name: item.name,
      design: designResult.awarded,
      design_max: item.design_max,
      implementation: implementationResult.awarded,
      implementation_max: item.implementation_max,
      design_criteria: designResult.results,
      implementation_criteria: implementationResult.results,
    });
  }
  assert(designMax === 100, `design maximum must be 100, got ${designMax}`);
  assert(implementationMax === 100, `implementation maximum must be 100, got ${implementationMax}`);

  const hardGateResults = rules.hard_gates.map((gate) => ({
    id: gate.id,
    name: gate.name,
    status: index.hardGates.get(gate.name) ?? "missing",
    passed: index.hardGates.get(gate.name) === "pass",
  }));
  const weights = rules.aggregate_formula;
  const aggregate = Number(
    (
      design * Number(weights.design_specification_weight) +
      implementation * Number(weights.implementation_execution_evidence_weight)
    ).toFixed(2),
  );
  const targets = rules.targets;
  const hardGatesPassed = hardGateResults.every((gate) => gate.passed);
  const certificationEligible =
    design >= targets.design_specification &&
    implementation >= targets.implementation_execution_evidence &&
    aggregate >= targets.aggregate &&
    hardGatesPassed;

  return {
    spec_id: rules.spec_id,
    rules_version: rules.version,
    scores: { design_specification: design, implementation_execution_evidence: implementation, aggregate },
    targets,
    hard_gates_passed: hardGatesPassed,
    certification_eligible: certificationEligible,
    items: itemResults,
    hard_gates: hardGateResults,
  };
}

const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const index = parseEvidenceIndex(fs.readFileSync(evidencePath, "utf8"));
const result = evaluate(rules, index);
const jsonMode = process.argv.includes("--json");
const requireCertification = process.argv.includes("--require-certification");

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      `Master95 scoring rules: ${result.rules_version}`,
      `설계·명세: ${result.scores.design_specification}/100 (target ${result.targets.design_specification})`,
      `구현·실행 증빙: ${result.scores.implementation_execution_evidence}/100 (target ${result.targets.implementation_execution_evidence})`,
      `종합: ${result.scores.aggregate}/100 (target ${result.targets.aggregate})`,
      `인증 하드 게이트: ${result.hard_gates.filter((gate) => gate.passed).length}/${result.hard_gates.length} pass`,
      `인증 가능: ${result.certification_eligible ? "yes" : "no"}`,
    ].join("\n") + "\n",
  );
}

if (requireCertification && !result.certification_eligible) process.exitCode = 2;
