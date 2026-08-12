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
const auditPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-granular-audit",
  "step18-19-audit.json",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(fs.existsSync(auditPath), `granular UX audit missing: ${auditPath}`);
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
assert(audit.schema_version === "master95_granular_completion_audit_v1", "unexpected audit schema");
assert(Array.isArray(audit.stages) && audit.stages.length === 2, "Step 18 and Step 19 audits are required");

const validStatuses = new Set(["proven", "partial", "missing"]);
const seenIds = new Set();
const stages = audit.stages.map((stage) => {
  assert(stage.step === 18 || stage.step === 19, `unexpected audited step: ${stage.step}`);
  assert(stage.status === "proven" || stage.status === "partial", `invalid stage status: ${stage.status}`);
  assert(Array.isArray(stage.criteria) && stage.criteria.length > 0, `Step ${stage.step} criteria are required`);
  assert(
    Array.isArray(stage.completion_gates) && stage.completion_gates.length > 0,
    `Step ${stage.step} gates are required`,
  );

  const records = [...stage.criteria, ...stage.completion_gates];
  for (const record of records) {
    assert(typeof record.id === "string" && record.id.startsWith(`S${stage.step}-`), `invalid criterion id`);
    assert(!seenIds.has(record.id), `duplicate criterion id: ${record.id}`);
    seenIds.add(record.id);
    assert(typeof record.requirement === "string" && record.requirement.trim(), `missing requirement: ${record.id}`);
    assert(validStatuses.has(record.status), `invalid status for ${record.id}: ${record.status}`);
  }

  const counts = Object.fromEntries(
    [...validStatuses].map((status) => [status, records.filter((record) => record.status === status).length]),
  );
  const computedStatus = counts.partial === 0 && counts.missing === 0 ? "proven" : "partial";
  assert(stage.status === computedStatus, `Step ${stage.step} status does not match granular records`);
  return {
    step: stage.step,
    status: stage.status,
    criteria: stage.criteria.length,
    completion_gates: stage.completion_gates.length,
    counts,
  };
});

const result = {
  audit_path: auditPath,
  structurally_valid: true,
  certification_ready: stages.every((stage) => stage.status === "proven"),
  stages,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (process.argv.includes("--require-proven") && !result.certification_ready) process.exitCode = 2;
