import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateCandidateCertificationDecision } from "./candidate-certification-decision.ts";
import { CandidateScoreRulesSchema, calculateCandidateScoreRulesSha256 } from "./candidate-score.ts";

const scoreRulesBytes = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../../contracts/v1/candidate-score-rules.json"),
);
const scoreRules = CandidateScoreRulesSchema.parse(JSON.parse(scoreRulesBytes.toString("utf8")));
const scoreRulesSha256 = calculateCandidateScoreRulesSha256(scoreRules);

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function scoreReport(eligible = true) {
  return {
    schema: "donggri-candidate-score-report/v2",
    report_type: "candidate_score",
    spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
    candidate_id: "dongri-grigri-v01-rc.1",
    git_sha: "1".repeat(40),
    source_epoch: `sha256:${"2".repeat(64)}`,
    freeze_record_sha256: "3".repeat(64),
    score_rules_sha256: scoreRulesSha256,
    score_version: scoreRules.score_version,
    score_target: scoreRules.targets.aggregate,
    generated_at: "2026-07-30T00:00:00Z",
    dimensions: Object.fromEntries(
      scoreRules.dimensions.map((dimension) => [
        dimension.id,
        {
          weight: dimension.weight,
          score: eligible ? 97.45 : 90,
          evidence_sha256: ["5".repeat(64)],
          blockers: eligible ? [] : ["component_missing:test"],
        },
      ]),
    ),
    hard_gates: scoreRules.hard_gates.map((gate, index) => ({
      id: gate.id,
      name: gate.name,
      status: eligible ? "pass" : index === 0 ? "collecting" : "pass",
      computed: true,
      evidence_refs: ["5".repeat(64)],
      blockers: eligible || index !== 0 ? [] : ["component_missing:test"],
    })),
    rejected_evidence: [],
    aggregate: eligible ? 97.45 : 90,
    certification_eligible: eligible,
    blockers: eligible ? [] : ["component_missing:test"],
    historical_baseline: {
      score: 84.5,
      hard_gates_declared_passed: 8,
      credit: 0,
      reason: "historical only",
    },
  };
}

function decision(bytes: Buffer, overrides: Record<string, unknown> = {}) {
  return {
    schema: "donggri-certification-decision/v2",
    report_type: "certification_decision",
    candidate_id: "dongri-grigri-v01-rc.1",
    git_sha: "1".repeat(40),
    source_epoch: `sha256:${"2".repeat(64)}`,
    freeze_record_sha256: "3".repeat(64),
    score_report_sha256: sha256(bytes),
    score_rules_sha256: scoreRulesSha256,
    score_aggregate: 97.45,
    score_target: scoreRules.targets.aggregate,
    score_certification_eligible: true,
    decided_at: "2026-07-30T01:00:00Z",
    decision: "PASS",
    certification_claimed: true,
    final_evidence_pack_sha256: "6".repeat(64),
    final_evidence_item_count: 16,
    assessor_ids: ["assessor-external-01", "assessor-external-02"],
    hard_gates: { passed: 10, total: 10 },
    unresolved_critical: 0,
    unresolved_sev1: 0,
    decision_reasons: ["All candidate-bound gates passed."],
    ...overrides,
  };
}

describe("candidate certification decision binding", () => {
  it("binds PASS to the exact score bytes, candidate SHA, rules, freeze, and computed gates", () => {
    const bytes = Buffer.from(`${JSON.stringify(scoreReport(), null, 2)}\n`);
    expect(
      validateCandidateCertificationDecision(decision(bytes), "CERTIFICATION_DECISION.json", bytes, scoreRulesBytes)
        .decision.decision,
    ).toBe("PASS");
    expect(() =>
      validateCandidateCertificationDecision(
        decision(bytes, { git_sha: "9".repeat(40) }),
        "CERTIFICATION_DECISION.json",
        bytes,
        scoreRulesBytes,
      ),
    ).toThrow("candidate_decision_git_sha_mismatch");
    expect(() =>
      validateCandidateCertificationDecision(
        decision(bytes, { score_report_sha256: "8".repeat(64) }),
        "CERTIFICATION_DECISION.json",
        bytes,
        scoreRulesBytes,
      ),
    ).toThrow("candidate_decision_score_sha_mismatch");
  });

  it("rejects a PASS claim when the bound score is not eligible", () => {
    const bytes = Buffer.from(`${JSON.stringify(scoreReport(false), null, 2)}\n`);
    expect(() =>
      validateCandidateCertificationDecision(
        decision(bytes, {
          score_aggregate: 90,
          score_certification_eligible: false,
          hard_gates: { passed: 9, total: 10 },
        }),
        "CERTIFICATION_DECISION.json",
        bytes,
        scoreRulesBytes,
      ),
    ).toThrow();
  });
});
