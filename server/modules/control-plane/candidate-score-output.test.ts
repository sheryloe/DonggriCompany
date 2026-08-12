import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertCleanCandidateWorktree,
  readCandidateScoreAttempt,
  writeCandidateScoreAttempt,
  type GitCommandRunner,
} from "./candidate-score-output.ts";

function scoreReport() {
  return {
    schema: "donggri-candidate-score-report/v2",
    report_type: "candidate_score",
    spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
    candidate_id: "dongri-grigri-v01-alpha.2",
    git_sha: "1".repeat(40),
    source_epoch: `sha256:${"2".repeat(64)}`,
    freeze_record_sha256: "3".repeat(64),
    score_rules_sha256: "4".repeat(64),
    score_version: "test.v2",
    score_target: 97.45,
    generated_at: "2026-07-30T00:00:00Z",
    dimensions: Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `dimension-${index + 1}`,
        {
          weight: index === 0 ? 20 : 10,
          score: 97.45,
          evidence_sha256: ["5".repeat(64)],
          blockers: [],
        },
      ]),
    ),
    hard_gates: Array.from({ length: 10 }, (_, index) => ({
      id: `M95-G${String(index + 1).padStart(2, "0")}`,
      name: `gate-${index + 1}`,
      status: "pass",
      computed: true,
      evidence_refs: ["5".repeat(64)],
      blockers: [],
    })),
    rejected_evidence: [],
    aggregate: 97.45,
    certification_eligible: true,
    blockers: [],
    historical_baseline: {
      score: 84.5,
      hard_gates_declared_passed: 8,
      credit: 0,
      reason: "historical only",
    },
  };
}

describe("candidate score output authority", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-score-output-"));
  });

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes one immutable attempt and verifies its sidecar", () => {
    const written = writeCandidateScoreAttempt({
      candidate_root: root,
      attempt_id: "alpha2-static-001",
      report: scoreReport(),
    });
    expect(readCandidateScoreAttempt(written.attempt_root)).toEqual(written);
    expect(() =>
      writeCandidateScoreAttempt({
        candidate_root: root,
        attempt_id: "alpha2-static-001",
        report: scoreReport(),
      }),
    ).toThrow("candidate_score_attempt_exists");
  });

  it("uses code-unit key ordering for reproducible score bytes", () => {
    const report = scoreReport();
    report.dimensions = Object.fromEntries(
      ["ab", "a_b", "a", "A", "z", "m", "b", "aa", "a-"].map((key, index) => [
        key,
        {
          weight: index === 0 ? 20 : 10,
          score: 97.45,
          evidence_sha256: ["5".repeat(64)],
          blockers: [],
        },
      ]),
    );
    const written = writeCandidateScoreAttempt({
      candidate_root: root,
      attempt_id: "alpha2-canonical-order-001",
      report,
    });
    const serialized = fs.readFileSync(written.report_path, "utf8");
    const positions = ["A", "a", "a-", "a_b", "aa", "ab", "b", "m", "z"].map((key) =>
      serialized.indexOf(`"${key}":`, serialized.indexOf(`"dimensions":`)),
    );
    expect(positions.every((position, index) => index === 0 || position > positions[index - 1]!)).toBe(true);
  });

  it("rejects unsafe attempt IDs and a tampered sidecar", () => {
    expect(() =>
      writeCandidateScoreAttempt({
        candidate_root: root,
        attempt_id: "../overwrite",
        report: scoreReport(),
      }),
    ).toThrow("candidate_score_attempt_id_invalid");
    const written = writeCandidateScoreAttempt({
      candidate_root: root,
      attempt_id: "alpha2-static-002",
      report: scoreReport(),
    });
    fs.writeFileSync(written.sidecar_path, `${"0".repeat(64)}  CANDIDATE_SCORE_REPORT.json\n`);
    expect(() => readCandidateScoreAttempt(written.attempt_root)).toThrow("candidate_score_sidecar_mismatch");
  });

  it("requires the exact Git root and a clean tracked plus untracked state", () => {
    const cleanRunner: GitCommandRunner = (args) => (args.includes("--show-toplevel") ? `${root}\n` : "");
    expect(() => assertCleanCandidateWorktree(root, cleanRunner)).not.toThrow();

    const dirtyRunner: GitCommandRunner = (args) =>
      args.includes("--show-toplevel") ? `${root}\n` : "?? untracked.json\n";
    expect(() => assertCleanCandidateWorktree(root, dirtyRunner)).toThrow(
      "candidate_score_candidate_worktree_not_clean",
    );

    const wrongRoot = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-score-other-"));
    try {
      const wrongRootRunner: GitCommandRunner = (args) => (args.includes("--show-toplevel") ? `${wrongRoot}\n` : "");
      expect(() => assertCleanCandidateWorktree(root, wrongRootRunner)).toThrow("candidate_score_git_root_mismatch");
    } finally {
      fs.rmSync(wrongRoot, { recursive: true, force: true });
    }
  });
});
