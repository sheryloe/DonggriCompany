import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { CandidateScoreReportSchema, type CandidateScoreReport } from "./candidate-score.ts";

const ATTEMPT_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,95}$/;
const REPORT_NAME = "CANDIDATE_SCORE_REPORT.json";

export type CandidateScoreAttemptPaths = {
  attempt_root: string;
  report_path: string;
  sidecar_path: string;
};

export type WrittenCandidateScoreAttempt = CandidateScoreAttemptPaths & {
  report_sha256: string;
  bytes: number;
};

export type GitCommandRunner = (args: readonly string[]) => string;

function defaultGitRunner(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    encoding: "utf8",
    windowsHide: true,
  });
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

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalized(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function requireOrdinaryDirectory(directoryPath: string, code: string): string {
  if (!path.isAbsolute(directoryPath)) throw new Error(`${code}_absolute_path_required`);
  const absolutePath = path.resolve(directoryPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`${code}_missing`);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
  if (!stat.isDirectory()) throw new Error(`${code}_directory_required`);
  return absolutePath;
}

function ensureOrdinaryChild(parentPath: string, childName: string, code: string): string {
  const childPath = path.join(parentPath, childName);
  if (!fs.existsSync(childPath)) {
    fs.mkdirSync(childPath);
  }
  const stat = fs.lstatSync(childPath);
  if (stat.isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
  if (!stat.isDirectory()) throw new Error(`${code}_directory_required`);
  if (normalized(path.dirname(childPath)) !== normalized(parentPath)) {
    throw new Error(`${code}_parent_mismatch`);
  }
  return childPath;
}

export function assertCleanCandidateWorktree(
  projectRootInput: string,
  runGit: GitCommandRunner = defaultGitRunner,
): void {
  const projectRoot = requireOrdinaryDirectory(path.resolve(projectRootInput), "candidate_score_project_root");
  const physicalRoot = fs.realpathSync.native(projectRoot);
  const gitRootRaw = runGit(["-C", projectRoot, "rev-parse", "--show-toplevel"]).trim();
  if (!gitRootRaw) throw new Error("candidate_score_git_root_missing");
  const gitRoot = fs.realpathSync.native(path.resolve(gitRootRaw));
  if (normalized(gitRoot) !== normalized(physicalRoot)) {
    throw new Error("candidate_score_git_root_mismatch");
  }
  const status = runGit(["-C", projectRoot, "status", "--porcelain=v1", "--untracked-files=all"]).trim();
  if (status) throw new Error("candidate_score_candidate_worktree_not_clean");
}

export function resolveCandidateScoreAttemptPaths(
  candidateRootInput: string,
  attemptId: string,
): CandidateScoreAttemptPaths {
  if (!ATTEMPT_ID_PATTERN.test(attemptId)) throw new Error("candidate_score_attempt_id_invalid");
  const candidateRoot = path.resolve(candidateRootInput);
  const attemptRoot = path.join(candidateRoot, "score", "attempts", attemptId);
  return {
    attempt_root: attemptRoot,
    report_path: path.join(attemptRoot, REPORT_NAME),
    sidecar_path: path.join(attemptRoot, `${REPORT_NAME}.sha256`),
  };
}

export function writeCandidateScoreAttempt(input: {
  candidate_root: string;
  attempt_id: string;
  report: unknown;
}): WrittenCandidateScoreAttempt {
  const candidateRoot = requireOrdinaryDirectory(input.candidate_root, "candidate_score_candidate_root");
  const report = CandidateScoreReportSchema.parse(input.report);
  const paths = resolveCandidateScoreAttemptPaths(candidateRoot, input.attempt_id);
  const scoreRoot = ensureOrdinaryChild(candidateRoot, "score", "candidate_score_output_score_root");
  const attemptsRoot = ensureOrdinaryChild(scoreRoot, "attempts", "candidate_score_output_attempts_root");
  if (fs.existsSync(paths.attempt_root)) throw new Error("candidate_score_attempt_exists");
  fs.mkdirSync(paths.attempt_root);
  const attemptStat = fs.lstatSync(paths.attempt_root);
  if (attemptStat.isSymbolicLink() || !attemptStat.isDirectory()) {
    throw new Error("candidate_score_attempt_directory_invalid");
  }
  if (normalized(path.dirname(paths.attempt_root)) !== normalized(attemptsRoot)) {
    throw new Error("candidate_score_attempt_parent_mismatch");
  }

  const serialized = canonicalJson(report);
  const digest = sha256(serialized);
  fs.writeFileSync(paths.report_path, serialized, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(paths.sidecar_path, `${digest}  ${REPORT_NAME}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  const verified = readCandidateScoreAttempt(paths.attempt_root);
  if (verified.report_sha256 !== digest) throw new Error("candidate_score_output_postwrite_mismatch");
  return verified;
}

export function readCandidateScoreAttempt(attemptRootInput: string): WrittenCandidateScoreAttempt {
  const attemptRoot = requireOrdinaryDirectory(attemptRootInput, "candidate_score_attempt_root");
  const reportPath = path.join(attemptRoot, REPORT_NAME);
  const sidecarPath = path.join(attemptRoot, `${REPORT_NAME}.sha256`);
  for (const [filePath, code] of [
    [reportPath, "candidate_score_report"],
    [sidecarPath, "candidate_score_sidecar"],
  ] as const) {
    if (!fs.existsSync(filePath)) throw new Error(`${code}_missing`);
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
    if (!stat.isFile()) throw new Error(`${code}_regular_file_required`);
  }
  const reportBytes = fs.readFileSync(reportPath);
  const digest = sha256(reportBytes);
  const expectedSidecar = `${digest}  ${REPORT_NAME}\n`;
  if (fs.readFileSync(sidecarPath, "utf8") !== expectedSidecar) {
    throw new Error("candidate_score_sidecar_mismatch");
  }
  CandidateScoreReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  return {
    attempt_root: attemptRoot,
    report_path: reportPath,
    sidecar_path: sidecarPath,
    report_sha256: digest,
    bytes: reportBytes.length,
  };
}
