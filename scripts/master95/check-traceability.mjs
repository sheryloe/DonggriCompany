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
const workbookPath = path.join(qualityRoot, "REQUIREMENTS_TRACEABILITY_MATRIX.xlsx");
const inspectPath = `${workbookPath}.inspect.ndjson`;
const evidencePath = path.join(qualityRoot, "EVIDENCE_INDEX.yaml");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseEvidenceStatuses(raw) {
  const statuses = new Map();
  let inEvidence = false;
  let currentId = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line === "evidence:") {
      inEvidence = true;
      continue;
    }
    if (inEvidence && /^[A-Za-z0-9_]+:/.test(line)) break;
    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (inEvidence && idMatch) {
      currentId = idMatch[1].trim();
      statuses.set(currentId, "missing");
      continue;
    }
    const statusMatch = line.match(/^\s{4}status:\s*(.+)$/);
    if (inEvidence && currentId && statusMatch) statuses.set(currentId, statusMatch[1].trim());
  }
  return statuses;
}

function loadMatrixTable(raw) {
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"kind":"table"') || !line.includes('"sheet":"Requirements Matrix"')) continue;
    const record = JSON.parse(line);
    if (record.address === "A1:Q23") return record.values;
  }
  throw new Error("Requirements Matrix A1:Q23 table inspection was not found");
}

assert(fs.existsSync(workbookPath), `workbook missing: ${workbookPath}`);
assert(fs.existsSync(inspectPath), `workbook inspection missing: ${inspectPath}`);
const values = loadMatrixTable(fs.readFileSync(inspectPath, "utf8"));
const evidenceStatuses = parseEvidenceStatuses(fs.readFileSync(evidencePath, "utf8"));
const headers = values[2];
const rows = values.slice(3);
const requiredHeaders = [
  "Requirement ID",
  "Priority",
  "Step",
  "Requirement",
  "Acceptance Criteria",
  "Design / Interface Refs",
  "Owner",
  "Skills / Tools",
  "Test Refs",
  "Trace Requirement",
  "Artifact",
  "Evidence ID",
  "Evidence Status",
  "Implementation Status",
  "Link Gate",
  "Proof Gate",
  "Notes",
];
assert(
  JSON.stringify(headers) === JSON.stringify(requiredHeaders),
  "matrix headers do not match the canonical contract",
);
assert(rows.length === 20, `exactly 20 stage requirements are required, got ${rows.length}`);

const ids = new Set();
const priorities = new Set();
const linkGaps = [];
const proofOpen = [];
const evidenceMismatches = [];
const missingEvidenceIds = [];

for (const [index, row] of rows.entries()) {
  const rowNumber = index + 4;
  const [id, priority, step] = row;
  assert(typeof id === "string" && /^M95-S\d{2}$/.test(id), `row ${rowNumber}: invalid requirement id`);
  assert(!ids.has(id), `row ${rowNumber}: duplicate requirement id ${id}`);
  ids.add(id);
  priorities.add(priority);
  assert(Number(step) === index + 1, `row ${rowNumber}: expected step ${index + 1}, got ${step}`);
  const missingRequired = [];
  for (let column = 4; column <= 11; column += 1) {
    if (row[column] === null || row[column] === undefined || String(row[column]).trim() === "")
      missingRequired.push(headers[column]);
  }
  if (missingRequired.length > 0 || row[14] !== "LINKED")
    linkGaps.push({ id, missing: missingRequired, gate: row[14] });
  if (row[15] !== "PROVEN") proofOpen.push(id);

  const evidenceIds = String(row[11])
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const evidenceId of evidenceIds) {
    if (!evidenceStatuses.has(evidenceId)) missingEvidenceIds.push({ id, evidence_id: evidenceId });
  }
  const canonicalStatuses = evidenceIds.map((evidenceId) => evidenceStatuses.get(evidenceId) ?? "missing");
  const expectedStatus = canonicalStatuses.every((status) => status === canonicalStatuses[0])
    ? canonicalStatuses[0]
    : "mixed";
  if (
    expectedStatus !== row[12] &&
    !(row[12] === "pending" && canonicalStatuses.every((status) => status === "pending"))
  ) {
    evidenceMismatches.push({ id, workbook: row[12], canonical: canonicalStatuses });
  }
}

assert(
  ["P0", "P1", "P2"].every((priority) => priorities.has(priority)),
  "P0, P1 and P2 priorities must all be represented",
);
assert(linkGaps.length === 0, `link gaps detected: ${JSON.stringify(linkGaps)}`);
assert(missingEvidenceIds.length === 0, `unknown evidence ids detected: ${JSON.stringify(missingEvidenceIds)}`);
assert(evidenceMismatches.length === 0, `evidence status mismatches detected: ${JSON.stringify(evidenceMismatches)}`);

const result = {
  requirements: rows.length,
  priority_counts: Object.fromEntries(
    ["P0", "P1", "P2"].map((priority) => [priority, rows.filter((row) => row[1] === priority).length]),
  ),
  linked: rows.length - linkGaps.length,
  proven: rows.length - proofOpen.length,
  proof_open: proofOpen,
  structural_traceability_passed: true,
  execution_proof_complete: proofOpen.length === 0,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (process.argv.includes("--require-proven") && proofOpen.length > 0) process.exitCode = 2;
