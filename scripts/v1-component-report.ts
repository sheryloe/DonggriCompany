import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  assertCandidateEvidenceRoot,
  produceCandidateComponentReport,
} from "../server/modules/control-plane/candidate-component-producer.ts";
import { validateCandidateComponentApproval } from "../server/modules/control-plane/candidate-component-approval.ts";
import { assertCleanCandidateWorktree } from "../server/modules/control-plane/candidate-score-output.ts";
import { CandidateScoreRulesSchema } from "../server/modules/control-plane/candidate-score.ts";
import { validateFreezeRecord } from "../server/modules/control-plane/certification-contract.ts";
import { resolveReleaseIdentity } from "../server/modules/release/release-identity.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const CONTROL_ROOT = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(PROJECT_ROOT, "..", "..");
const RULES_PATH = path.join(PROJECT_ROOT, "contracts", "v1", "candidate-score-rules.json");
const APPROVAL_LEDGER_PATH = path.join(
  CONTROL_ROOT,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "approvals.md",
);
const CANDIDATES_ROOT = path.join(
  CONTROL_ROOT,
  "storage",
  "codex-control",
  "quality",
  "dongri-grigri-v1",
  "candidates",
);
const ATTEMPT_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,95}$/;

function fail(error: unknown): never {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exit(1);
}

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : (process.argv[index + 1] ?? null);
}

function valuesAfter(flag: string): string[] {
  return process.argv.flatMap((value, index) =>
    value === flag && process.argv[index + 1] ? [process.argv[index + 1]] : [],
  );
}

function required(flag: string): string {
  const value = valueAfter(flag);
  if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2).replaceAll("-", "_")}_required`);
  return value;
}

function currentGitSha(): string {
  const value = execFileSync("git", ["-C", PROJECT_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("candidate_component_producer_git_sha_invalid");
  return value;
}

function commandSha256(): string {
  return crypto.createHash("sha256").update(process.argv.slice(2).join("\u0000"), "utf8").digest("hex");
}

function main(): void {
  assertCleanCandidateWorktree(PROJECT_ROOT);
  const freezePath = required("--freeze-record");
  if (!path.isAbsolute(freezePath)) throw new Error("candidate_component_producer_freeze_absolute_path_required");
  const freezeRecord = validateFreezeRecord(JSON.parse(fs.readFileSync(path.resolve(freezePath), "utf8")));
  const gitSha = currentGitSha();
  const release = resolveReleaseIdentity(PROJECT_ROOT, {
    ...process.env,
    DONGGRI_RELEASE_GIT_SHA: gitSha,
    DONGGRI_SOURCE_EPOCH: freezeRecord.source_epoch,
  });
  if (
    freezeRecord.candidate_identity.candidate_id !== release.candidate_id ||
    freezeRecord.candidate_identity.git_sha !== release.git_sha ||
    freezeRecord.candidate_identity.source_epoch !== release.source_epoch ||
    freezeRecord.candidate_identity.product_version !== release.product_version
  ) {
    throw new Error("candidate_component_producer_freeze_identity_mismatch");
  }

  const expectedCandidateRoot = path.join(CANDIDATES_ROOT, release.candidate_id);
  const candidateRoot = path.resolve(valueAfter("--candidate-root") ?? expectedCandidateRoot);
  if (
    (process.platform === "win32" ? candidateRoot.toLowerCase() : candidateRoot) !==
    (process.platform === "win32" ? expectedCandidateRoot.toLowerCase() : expectedCandidateRoot)
  ) {
    throw new Error("candidate_component_producer_root_identity_mismatch");
  }
  if (!fs.existsSync(candidateRoot)) throw new Error("candidate_component_producer_candidate_root_missing");

  const rules = CandidateScoreRulesSchema.parse(JSON.parse(fs.readFileSync(RULES_PATH, "utf8")));
  const knownComponents = new Set([
    ...rules.dimensions.flatMap((dimension) => dimension.components),
    ...rules.hard_gates.flatMap((gate) => gate.components),
  ]);
  const component = required("--component");
  if (!knownComponents.has(component)) throw new Error("candidate_component_producer_component_unknown");
  const attemptId = required("--attempt-id");
  if (!ATTEMPT_ID_PATTERN.test(attemptId)) throw new Error("candidate_component_producer_attempt_id_invalid");
  const approvalId = required("--approval-id");
  validateCandidateComponentApproval({
    ledger: fs.readFileSync(APPROVAL_LEDGER_PATH, "utf8"),
    approval_id: approvalId,
    identity: {
      candidate_id: release.candidate_id,
      git_sha: release.git_sha,
      source_epoch: release.source_epoch,
    },
    component,
    attempt_id: attemptId,
    candidate_root: candidateRoot,
    now: new Date().toISOString(),
  });
  const status = required("--status");
  if (status !== "collecting" && status !== "pass" && status !== "fail") {
    throw new Error("candidate_component_producer_status_invalid");
  }
  const qualityScore = Number(required("--quality-score"));
  if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
    throw new Error("candidate_component_producer_quality_score_invalid");
  }
  const evidencePaths = valuesAfter("--evidence").map((filePath) => {
    if (!path.isAbsolute(filePath)) throw new Error("candidate_component_producer_evidence_absolute_path_required");
    const resolved = path.resolve(filePath);
    assertCandidateEvidenceRoot(candidateRoot, resolved);
    return resolved;
  });
  if (evidencePaths.length === 0) throw new Error("candidate_component_producer_evidence_required");
  const outputPath = path.join(
    candidateRoot,
    "inputs",
    "component-reports",
    "attempts",
    attemptId,
    `${component}.json`,
  );
  const report = produceCandidateComponentReport({
    output_path: outputPath,
    report_root: candidateRoot,
    evidence_roots: [candidateRoot],
    evidence_paths: evidencePaths,
    identity: {
      candidate_id: release.candidate_id,
      git_sha: release.git_sha,
      source_epoch: release.source_epoch,
    },
    component,
    component_status: status,
    quality_score: qualityScore,
    generated_at: new Date().toISOString(),
    summary: required("--summary"),
    producer: {
      id: valueAfter("--producer-id") ?? "v01-component-producer",
      version: "1.0.0",
      authority: "candidate_tooling",
    },
    provenance: {
      run_id: attemptId,
      approval_id: approvalId,
      command_sha256: commandSha256(),
      trust_root_sha256: null,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      output: outputPath,
      component: report.component,
      component_status: report.component_status,
      quality_score: report.quality_score,
      candidate_id: report.candidate_id,
      git_sha: report.git_sha,
      integrity_sha256: report.integrity.payload_sha256,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  fail(error);
}
