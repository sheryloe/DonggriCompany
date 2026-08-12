import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CandidateScoreRulesSchema,
  evaluateCandidateScore,
  type CandidateScoreEvidence,
  type CandidateScoreIdentity,
  type CandidateScoreRejectedEvidence,
} from "../server/modules/control-plane/candidate-score.ts";
import { readVerifiedCandidateComponentReport } from "../server/modules/control-plane/candidate-component-report.ts";
import {
  assertCleanCandidateWorktree,
  writeCandidateScoreAttempt,
} from "../server/modules/control-plane/candidate-score-output.ts";
import { validateFreezeRecord, type FreezeRecord } from "../server/modules/control-plane/certification-contract.ts";
import { resolveReleaseIdentity } from "../server/modules/release/release-identity.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const CONTROL_ROOT = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(PROJECT_ROOT, "..", "..");
const RULES_PATH = path.join(PROJECT_ROOT, "contracts", "v1", "candidate-score-rules.json");
const FREEZE_RECORD_PATH = path.join(
  CONTROL_ROOT,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "CANDIDATE_FREEZE_RECORD.json",
);
const CANDIDATES_ROOT = path.join(
  CONTROL_ROOT,
  "storage",
  "codex-control",
  "quality",
  "dongri-grigri-v1",
  "candidates",
);

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : (process.argv[index + 1] ?? null);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function currentGitSha(): string {
  const value = execFileSync("git", ["-C", PROJECT_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("candidate_score_current_git_sha_invalid");
  return value;
}

function resolveIdentity(freezeRecord: FreezeRecord): CandidateScoreIdentity {
  const gitSha = currentGitSha();
  const identity = resolveReleaseIdentity(PROJECT_ROOT, {
    ...process.env,
    DONGRI_RELEASE_GIT_SHA: gitSha,
    DONGRI_SOURCE_EPOCH: freezeRecord.source_epoch,
  });
  const frozen = freezeRecord.candidate_identity;
  if (
    frozen.product_id !== identity.product_id ||
    frozen.release_epoch !== identity.release_epoch ||
    frozen.product_version !== identity.product_version ||
    frozen.channel !== identity.channel ||
    frozen.git_sha !== identity.git_sha ||
    frozen.candidate_id !== identity.candidate_id ||
    frozen.source_epoch !== identity.source_epoch
  ) {
    throw new Error("candidate_score_freeze_record_identity_mismatch");
  }
  return {
    candidate_id: identity.candidate_id,
    git_sha: identity.git_sha,
    source_epoch: identity.source_epoch,
    freeze_record_sha256: freezeRecord.freeze_record_sha256,
  };
}

function loadFreezeRecord(): FreezeRecord {
  const supplied = valueAfter("--freeze-record");
  const filePath = supplied ?? FREEZE_RECORD_PATH;
  if (!path.isAbsolute(filePath)) throw new Error("candidate_score_freeze_record_absolute_path_required");
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error("candidate_score_freeze_record_missing");
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("candidate_score_freeze_record_file_invalid");
  return validateFreezeRecord(JSON.parse(fs.readFileSync(absolutePath, "utf8")));
}

function candidateRoot(identity: CandidateScoreIdentity): string {
  const expected = path.resolve(CANDIDATES_ROOT, identity.candidate_id);
  const supplied = valueAfter("--candidate-root");
  const resolved = path.resolve(supplied ?? expected);
  if (resolved.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("candidate_score_root_identity_mismatch");
  }
  return resolved;
}

function reportFiles(root: string): string[] {
  const directories = [
    path.join(root, "inputs", "component-reports"),
    path.join(root, "inputs", "prerequisites"),
    path.join(root, "inputs", "assessments"),
  ];
  const files: string[] = [];
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("candidate_score_input_directory_invalid");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`candidate_score_input_link_forbidden:${entry.name}`);
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
      files.push(path.join(directory, entry.name));
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function loadEvidence(root: string): {
  evidence: CandidateScoreEvidence[];
  rejected_evidence: CandidateScoreRejectedEvidence[];
} {
  const evidence: CandidateScoreEvidence[] = [];
  const rejectedEvidence: CandidateScoreRejectedEvidence[] = [];
  for (const filePath of reportFiles(root)) {
    const bytes = fs.readFileSync(filePath);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed?.report_type !== "component") continue;
    if (parsed?.schema === "donggri-component-report/v1") {
      rejectedEvidence.push({
        path: filePath,
        sha256: sha256(bytes),
        bytes: bytes.length,
        code: "legacy_component_report_v1_not_admitted",
      });
      continue;
    }
    const verified = readVerifiedCandidateComponentReport({
      report_path: filePath,
      report_root: root,
      evidence_roots: [root],
    });
    evidence.push({
      path: verified.path,
      sha256: verified.sha256,
      bytes: verified.bytes,
      report: verified.report,
      verified_evidence_files: verified.verified_evidence_files,
    });
  }
  return { evidence, rejected_evidence: rejectedEvidence };
}

function runSelfTest(): void {
  const rules = CandidateScoreRulesSchema.parse(JSON.parse(fs.readFileSync(RULES_PATH, "utf8")));
  const identity: CandidateScoreIdentity = {
    candidate_id: "dongri-grigri-v01-alpha.2",
    git_sha: "1".repeat(40),
    source_epoch: `sha256:${"2".repeat(64)}`,
    freeze_record_sha256: "3".repeat(64),
  };
  const empty = evaluateCandidateScore({
    rules,
    identity,
    evidence: [],
    generated_at: "2026-07-29T00:00:00Z",
  });
  if (empty.aggregate !== 0 || empty.hard_gates.some((gate) => gate.status !== "collecting")) {
    throw new Error("candidate_score_empty_fixture_must_collect");
  }

  const manuallyPassed = {
    ...rules,
    hard_gates: rules.hard_gates.map((gate, index) => (index === 0 ? { ...gate, status: "pass" } : gate)),
  };
  let manualPassRejected = false;
  try {
    CandidateScoreRulesSchema.parse(manuallyPassed);
  } catch {
    manualPassRejected = true;
  }
  if (!manualPassRejected) throw new Error("candidate_score_manual_gate_pass_not_rejected");

  let staleSpecRejected = false;
  try {
    CandidateScoreRulesSchema.parse({
      ...rules,
      spec_id: "20260714-donggricompany-95-master-operating-system-v1",
    });
  } catch {
    staleSpecRejected = true;
  }
  if (!staleSpecRejected) throw new Error("candidate_score_stale_spec_not_rejected");

  const staleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-score-stale-"));
  let legacyRejected = false;
  try {
    const inputRoot = path.join(staleRoot, "inputs", "component-reports");
    fs.mkdirSync(inputRoot, { recursive: true });
    fs.writeFileSync(
      path.join(inputRoot, "legacy.json"),
      JSON.stringify({
        schema: "donggri-component-report/v1",
        report_type: "component",
        component: "api_and_event_schema",
      }),
    );
    const loaded = loadEvidence(staleRoot);
    legacyRejected =
      loaded.evidence.length === 0 &&
      loaded.rejected_evidence.length === 1 &&
      loaded.rejected_evidence[0]?.code === "legacy_component_report_v1_not_admitted";
  } finally {
    fs.rmSync(staleRoot, { recursive: true, force: true });
  }
  if (!legacyRejected) throw new Error("candidate_score_legacy_report_not_rejected_safely");

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: "self-test",
      empty_candidate_collecting: true,
      manual_gate_pass_rejected: true,
      stale_spec_rejected: true,
      legacy_component_report_rejected_without_abort: true,
      historical_baseline_credit: rules.historical_baseline.credit,
    })}\n`,
  );
}

function main(): void {
  if (hasFlag("--self-test")) {
    runSelfTest();
    return;
  }

  assertCleanCandidateWorktree(PROJECT_ROOT);
  const freezeRecord = loadFreezeRecord();
  const identity = resolveIdentity(freezeRecord);
  const root = candidateRoot(identity);
  const rules = CandidateScoreRulesSchema.parse(JSON.parse(fs.readFileSync(RULES_PATH, "utf8")));
  const loaded = loadEvidence(root);
  const report = evaluateCandidateScore({
    rules,
    identity,
    evidence: loaded.evidence,
    rejected_evidence: loaded.rejected_evidence,
    generated_at: new Date().toISOString(),
  });
  const serialized = canonicalJson(report);

  if (hasFlag("--write")) {
    const attemptId = valueAfter("--attempt-id");
    if (!attemptId) throw new Error("candidate_score_attempt_id_required");
    const written = writeCandidateScoreAttempt({
      candidate_root: root,
      attempt_id: attemptId,
      report,
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: "write",
        output: written.report_path,
        sidecar: written.sidecar_path,
        report_sha256: written.report_sha256,
        candidate_id: report.candidate_id,
        aggregate: report.aggregate,
        hard_gates_passed: report.hard_gates.filter((gate) => gate.status === "pass").length,
        certification_eligible: report.certification_eligible,
      })}\n`,
    );
  } else {
    process.stdout.write(serialized);
  }

  if (hasFlag("--require-certification") && !report.certification_eligible) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  fail(error);
}
