#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateUxAudit } from "./ux-audit-contract.mjs";
import { assertV01NewReportPath, verifyV01EvidenceArtifact } from "./v01-evidence-file.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const historicalAuditPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-granular-audit",
  "step18-19-audit.json",
);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function requireCleanCandidate() {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (status.length > 0) throw new Error("ux_audit_candidate_worktree_dirty");
}

const requireProven = process.argv.includes("--require-proven");
if (requireProven) requireCleanCandidate();
const requestedAuditPath = valueAfter("--audit") ?? process.env.DONGGRI_V01_UX_AUDIT_PATH ?? null;
if (requireProven && !requestedAuditPath) throw new Error("candidate_bound_audit_path_required");
const auditPath = requestedAuditPath ? path.resolve(requestedAuditPath) : historicalAuditPath;
if (!fs.existsSync(auditPath)) throw new Error(`granular_ux_audit_missing:${auditPath}`);
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
if (requireProven) {
  assertV01NewReportPath(auditPath, "ux_audit");
  verifyV01EvidenceArtifact(audit.historical_authority, "historical_audit_authority");
  for (const [name, source] of Object.entries(audit.evidence_sources ?? {})) {
    verifyV01EvidenceArtifact(source, `ux_evidence_source:${name}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const expectedCandidateSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
  windowsHide: true,
})
  .trim()
  .toLowerCase();
const expectedCandidateId =
  process.env.DONGGRI_V01_CANDIDATE_ID ??
  (audit.schema_version === "master95_granular_completion_audit_v2"
    ? packageJson.donggriRelease?.candidateId
    : undefined);
const expectedSourceEpoch =
  process.env.DONGGRI_SOURCE_EPOCH ??
  (audit.schema_version === "master95_granular_completion_audit_v2"
    ? packageJson.donggriRelease?.sourceEpoch
    : undefined);

const result = {
  audit_path: auditPath,
  ...evaluateUxAudit(audit, {
    requireCandidateBound: requireProven,
    expectedCandidateId,
    expectedCandidateSha,
    expectedSourceEpoch,
  }),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (requireProven && !result.certification_ready) process.exitCode = 2;
