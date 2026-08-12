import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CandidateScoreReportSchema,
  CandidateScoreRulesSchema,
  calculateCandidateScoreRulesSha256,
  evaluateCandidateScore,
  type CandidateScoreEvidence,
  type CandidateScoreIdentity,
} from "./candidate-score.ts";
import { createCandidateComponentReport, type CandidateComponentReportUnsigned } from "./certification-contract.ts";

const rulesPath = path.resolve(import.meta.dirname, "../../../contracts/v1/candidate-score-rules.json");
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const identity: CandidateScoreIdentity = {
  candidate_id: "dongri-grigri-v01-alpha.2",
  git_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
  freeze_record_sha256: "6".repeat(64),
};

function componentNames(): string[] {
  const parsed = CandidateScoreRulesSchema.parse(rules);
  return [
    ...new Set([
      ...parsed.dimensions.flatMap((dimension) => dimension.components),
      ...parsed.hard_gates.flatMap((gate) => gate.components),
    ]),
  ];
}

function evidence(
  component: string,
  overrides: Partial<CandidateComponentReportUnsigned> = {},
): CandidateScoreEvidence {
  const artifactPath = path.resolve("candidate", component, "artifact.json");
  const artifact = {
    descriptor_path: artifactPath,
    absolute_path: artifactPath,
    physical_path: artifactPath,
    sha256: "4".repeat(64),
    bytes: 10,
  };
  return {
    path: path.resolve("candidate", `${component}.json`),
    sha256: "3".repeat(64),
    bytes: 100,
    report: createCandidateComponentReport({
      schema: "donggri-component-report/v2",
      report_type: "component",
      component,
      candidate_id: identity.candidate_id,
      git_sha: identity.git_sha,
      source_epoch: identity.source_epoch,
      generated_at: "2026-07-29T00:00:00Z",
      evidence_mode: "actual",
      component_status: "pass",
      quality_score: 100,
      certification_claimed: false,
      historical_evidence_credited: false,
      producer: {
        id: "v01-component-producer",
        version: "1.0.0",
        authority: "candidate_tooling",
      },
      provenance: {
        run_id: `run-${component.replaceAll("_", "-")}`,
        approval_id: "APR-V01-WAVE-B-PREPARATION-001",
        command_sha256: "5".repeat(64),
        trust_root_sha256: null,
      },
      attestation: {
        scheme: "integrity_only",
        key_id: null,
        signature_base64: null,
      },
      evidence_files: [{ path: artifact.descriptor_path, sha256: artifact.sha256, bytes: artifact.bytes }],
      summary: `${component} passed for the frozen candidate.`,
      ...overrides,
    }),
    verified_evidence_files: [artifact],
  };
}

function evaluate(items: CandidateScoreEvidence[]) {
  return evaluateCandidateScore({
    rules,
    identity,
    evidence: items,
    generated_at: "2026-07-29T01:00:00Z",
  });
}

describe("candidate-bound score authority", () => {
  it("validates nine weighted dimensions and ten computed hard gates", () => {
    const parsed = CandidateScoreRulesSchema.parse(rules);
    expect(parsed.dimensions).toHaveLength(9);
    expect(parsed.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(100);
    expect(parsed.hard_gates).toHaveLength(10);
    expect(parsed.historical_baseline.credit).toBe(0);
    expect(calculateCandidateScoreRulesSha256(parsed)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("starts missing evidence at zero with every hard gate collecting", () => {
    const report = evaluate([]);
    expect(report.aggregate).toBe(0);
    expect(report.hard_gates.every((gate) => gate.status === "collecting" && gate.computed)).toBe(true);
    expect(report.certification_eligible).toBe(false);
    expect(report.historical_baseline).toMatchObject({ score: 84.5, credit: 0 });
  });

  it("certifies only when every referenced component is actual pass for one identity", () => {
    const report = evaluate(componentNames().map((component) => evidence(component)));
    expect(report.aggregate).toBe(100);
    expect(report.hard_gates.filter((gate) => gate.status === "pass")).toHaveLength(10);
    expect(report.blockers).toEqual([]);
    expect(report.certification_eligible).toBe(true);
  });

  it("makes the 97.45 target exactly reachable with measured component scores", () => {
    const report = evaluate(componentNames().map((component) => evidence(component, { quality_score: 97.45 })));
    expect(report.aggregate).toBe(97.45);
    expect(Object.values(report.dimensions).every((dimension) => dimension.score === 97.45)).toBe(true);
    expect(report.hard_gates.filter((gate) => gate.status === "pass")).toHaveLength(10);
    expect(report.certification_eligible).toBe(true);
  });

  it("computes fail and collecting states instead of accepting declarations", () => {
    const items = componentNames().map((component) =>
      component === "security_and_permission_test_report"
        ? evidence(component, { component_status: "fail" })
        : component === "ui_usability_test"
          ? evidence(component, { evidence_mode: "synthetic" })
          : evidence(component),
    );
    const report = evaluate(items);
    expect(report.hard_gates.find((gate) => gate.id === "M95-G01")?.status).toBe("fail");
    expect(report.hard_gates.find((gate) => gate.id === "M95-G08")?.status).toBe("collecting");
    expect(report.blockers).toContain("component_failed:security_and_permission_test_report");
    expect(report.blockers).toContain("component_not_actual:ui_usability_test");
    expect(report.certification_eligible).toBe(false);
  });

  it("keeps a dimension-only missing component in the global blocker set", () => {
    const items = componentNames()
      .filter((component) => component !== "all_adrs")
      .map((component) => evidence(component));
    const report = evaluate(items);
    expect(report.blockers).toContain("component_missing:all_adrs");
    expect(report.dimensions.architecture_spec.blockers).toContain("component_missing:all_adrs");
    expect(report.certification_eligible).toBe(false);
  });

  it("rejects stale candidate, SHA, epoch, duplicate, and unknown component inputs", () => {
    const valid = evidence("api_and_event_schema");
    expect(() => evaluate([evidence("api_and_event_schema", { candidate_id: "dongri-grigri-v01-alpha.1" })])).toThrow(
      "component_report_candidate_mismatch",
    );
    expect(() => evaluate([evidence("api_and_event_schema", { git_sha: "4".repeat(40) })])).toThrow(
      "component_report_git_sha_mismatch",
    );
    expect(() => evaluate([evidence("api_and_event_schema", { source_epoch: `sha256:${"5".repeat(64)}` })])).toThrow(
      "component_report_source_epoch_mismatch",
    );
    expect(() => evaluate([valid, valid])).toThrow("component_report_duplicate");
    expect(() => evaluate([evidence("legacy_unmapped_component")])).toThrow("component_report_unexpected");
  });

  it("rejects reports without matching verified artifact evidence", () => {
    const valid = evidence("api_and_event_schema");
    expect(() => evaluate([{ ...valid, verified_evidence_files: [] }])).toThrow(
      "component_report_evidence_verification_count_mismatch",
    );
    expect(() =>
      evaluate([
        {
          ...valid,
          verified_evidence_files: valid.verified_evidence_files.map((file) => ({
            ...file,
            sha256: "5".repeat(64),
          })),
        },
      ]),
    ).toThrow("component_report_evidence_verification_mismatch");
  });

  it("rejects stale rules and manually supplied hard-gate status", () => {
    expect(() =>
      CandidateScoreRulesSchema.parse({
        ...rules,
        spec_id: "20260714-donggricompany-95-master-operating-system-v1",
      }),
    ).toThrow();
    expect(() =>
      CandidateScoreRulesSchema.parse({
        ...rules,
        hard_gates: rules.hard_gates.map((gate: object, index: number) =>
          index === 0 ? { ...gate, status: "pass" } : gate,
        ),
      }),
    ).toThrow();
  });

  it("rejects a forged aggregate, eligibility flag, or blocker omission", () => {
    const report = evaluate(componentNames().map((component) => evidence(component, { quality_score: 97.45 })));
    expect(() => CandidateScoreReportSchema.parse({ ...report, aggregate: 100 })).toThrow(
      "candidate_score_aggregate_not_computed",
    );
    expect(() => CandidateScoreReportSchema.parse({ ...report, certification_eligible: false })).toThrow(
      "candidate_score_eligibility_not_computed",
    );

    const incomplete = evaluate(
      componentNames()
        .filter((component) => component !== "all_adrs")
        .map((component) => evidence(component)),
    );
    expect(() => CandidateScoreReportSchema.parse({ ...incomplete, blockers: [] })).toThrow(
      "candidate_score_blockers_not_computed",
    );
  });
});
