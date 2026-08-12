import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createFreezeRecord,
  validateCertificationDecision,
  validateComponentReport,
  validateFreezeRecord,
} from "../server/modules/control-plane/certification-contract.ts";
import { validateCandidateCertificationDecision } from "../server/modules/control-plane/candidate-certification-decision.ts";
import { resolveReleaseIdentity } from "../server/modules/release/release-identity.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SPEC_ROOT = path.resolve(
  "G:\\Donggri_DevDrive\\storage\\codex-control\\specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
);
const SELECTION_MANIFEST_PATH = path.join(SPEC_ROOT, "SELECTION_MANIFEST.json");
const SELECTION_CHECKSUM_PATH = path.join(SPEC_ROOT, "SELECTION_MANIFEST.sha256");
const APPROVAL_LEDGER_PATH = path.join(SPEC_ROOT, "approvals.md");
const SCORE_RULES_PATH = path.join(PROJECT_ROOT, "contracts", "v1", "candidate-score-rules.json");

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function currentGitSha(): string {
  const value = execFileSync("git", ["-C", PROJECT_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("freeze_record_current_git_sha_invalid");
  return value;
}

function requireCleanCandidate(): void {
  const status = execFileSync("git", ["-C", PROJECT_ROOT, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (status) throw new Error("freeze_record_candidate_worktree_not_clean");
}

function approvalSection(approvalId: string): string {
  const ledger = fs.readFileSync(APPROVAL_LEDGER_PATH, "utf8");
  const heading = `## ${approvalId}`;
  const start = ledger.indexOf(heading);
  if (start < 0) throw new Error("freeze_record_approval_not_found");
  const rest = ledger.slice(start + heading.length);
  const nextHeading = rest.search(/\r?\n##\s+/);
  return nextHeading < 0 ? ledger.slice(start) : ledger.slice(start, start + heading.length + nextHeading);
}

function fieldFromApproval(section: string, field: string): string {
  const prefix = `- ${field}: `;
  const line = section.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  const raw = line?.slice(prefix.length).trim() ?? "";
  if (raw.length < 3 || !raw.startsWith("`") || !raw.endsWith("`")) {
    throw new Error(`freeze_record_approval_${field}_missing`);
  }
  return raw.slice(1, -1).trim();
}

function kstDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("freeze_record_approval_datetime_invalid");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ledgerDate(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+KST$/);
  if (!match?.[1]) throw new Error("freeze_record_approval_ledger_date_invalid");
  return match[1];
}

function validateFreezeAuthorities(record: ReturnType<typeof validateFreezeRecord>): void {
  requireCleanCandidate();

  const manifestBytes = fs.readFileSync(SELECTION_MANIFEST_PATH);
  const actualManifestSha = sha256(manifestBytes);
  const recordedManifestSha = fs.readFileSync(SELECTION_CHECKSUM_PATH, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
  if (record.selection_manifest_sha256 !== actualManifestSha || recordedManifestSha !== actualManifestSha) {
    throw new Error("freeze_record_selection_manifest_authority_mismatch");
  }

  const section = approvalSection(record.approval_id);
  if (fieldFromApproval(section, "policy_decision") !== "approved") {
    throw new Error("freeze_record_approval_not_approved");
  }
  if (kstDate(record.approved_at) !== ledgerDate(fieldFromApproval(section, "created_at"))) {
    throw new Error("freeze_record_approval_issued_at_mismatch");
  }
  if (kstDate(record.approval_expires_at) !== ledgerDate(fieldFromApproval(section, "expires_at"))) {
    throw new Error("freeze_record_approval_expires_at_mismatch");
  }

  const gitSha = currentGitSha();
  const identity = resolveReleaseIdentity(PROJECT_ROOT, {
    ...process.env,
    DONGRI_RELEASE_GIT_SHA: gitSha,
    DONGRI_SOURCE_EPOCH: record.source_epoch,
  });
  const currentIdentity = {
    product_id: identity.product_id,
    release_epoch: identity.release_epoch,
    product_version: identity.product_version,
    channel: identity.channel,
    git_sha: identity.git_sha,
    candidate_id: identity.candidate_id,
    source_epoch: identity.source_epoch,
  };
  if (JSON.stringify(currentIdentity) !== JSON.stringify(record.candidate_identity)) {
    throw new Error("freeze_record_current_candidate_identity_mismatch");
  }
}

function selfTest(): void {
  const manifestSha = "a".repeat(64);
  const sourceEpoch = `sha256:${manifestSha}`;
  const record = createFreezeRecord({
    schema: "donggri-source-epoch-freeze/v1",
    approval_id: "APR-V1-IMPLEMENT-001",
    selection_manifest_sha256: manifestSha,
    candidate_identity: {
      product_id: "dongri-grigri",
      release_epoch: "dongri-grigri-v1",
      product_version: "1.0.0-alpha.0",
      channel: "alpha",
      git_sha: "1".repeat(40),
      candidate_id: "candidate-alpha.0",
      source_epoch: sourceEpoch,
    },
    source_epoch: sourceEpoch,
    approved_at: "2026-07-25T00:00:00Z",
    approval_expires_at: "2026-07-26T00:00:00Z",
    frozen_at: "2026-07-25T01:00:00Z",
  });
  const expected = (() => {
    try {
      validateFreezeRecord(record);
      return true;
    } catch {
      return false;
    }
  })();
  const tampered = { ...record, candidate_identity: { ...record.candidate_identity, candidate_id: "tampered" } };
  const tamperedExpected = !expected;
  let tamperedAccepted = true;
  try {
    validateFreezeRecord(tampered);
  } catch {
    tamperedAccepted = false;
  }
  if (!expected || tamperedAccepted !== tamperedExpected) throw new Error("computed_tamper_self_test_failed");
  process.stdout.write(`${JSON.stringify({ ok: true, mode: "self-test", tamper_rejected: !tamperedAccepted })}\n`);
}

try {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else if (valueAfter("--component")) {
    const filePath = path.resolve(valueAfter("--component")!);
    const report = validateComponentReport(readJson(filePath));
    process.stdout.write(
      `${JSON.stringify({ ok: true, mode: "component", component_status: report.component_status })}\n`,
    );
  } else if (valueAfter("--decision")) {
    const filePath = path.resolve(valueAfter("--decision")!);
    const decisionInput = readJson(filePath);
    const schema = (decisionInput as { schema?: unknown } | null)?.schema;
    const decision =
      schema === "donggri-certification-decision/v2"
        ? (() => {
            const scoreReportPath = valueAfter("--score-report");
            if (!scoreReportPath || !path.isAbsolute(scoreReportPath)) {
              throw new Error("candidate_certification_score_report_absolute_path_required");
            }
            const scoreRulesPath = valueAfter("--score-rules") ?? SCORE_RULES_PATH;
            if (!path.isAbsolute(scoreRulesPath)) {
              throw new Error("candidate_certification_score_rules_absolute_path_required");
            }
            return validateCandidateCertificationDecision(
              decisionInput,
              filePath,
              fs.readFileSync(path.resolve(scoreReportPath)),
              fs.readFileSync(path.resolve(scoreRulesPath)),
            ).decision;
          })()
        : validateCertificationDecision(decisionInput, filePath);
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "decision", decision: decision.decision })}\n`);
  } else if (valueAfter("--freeze-record")) {
    const filePath = valueAfter("--freeze-record")!;
    if (!path.isAbsolute(filePath)) throw new Error("freeze_record_path_must_be_absolute");
    const record = validateFreezeRecord(readJson(filePath));
    validateFreezeAuthorities(record);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: "freeze-record",
        approval_id: record.approval_id,
        candidate_id: record.candidate_identity.candidate_id,
        source_epoch: record.source_epoch,
      })}\n`,
    );
  } else {
    throw new Error(
      "usage: --self-test | --component <path> | --decision <path> [--score-report <absolute-path>] [--score-rules <absolute-path>] | --freeze-record <absolute-path>",
    );
  }
} catch (error) {
  fail(error);
}
