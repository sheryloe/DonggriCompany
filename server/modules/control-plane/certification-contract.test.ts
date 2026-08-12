import { describe, expect, it } from "vitest";
import {
  createCandidateComponentReport,
  createFreezeRecord,
  validateCandidateComponentReport,
  validateCertificationDecision,
  validateComponentReport,
  validateFreezeRecord,
} from "./certification-contract.ts";

const manifestSha = "a".repeat(64);
const sourceEpoch = `sha256:${manifestSha}`;

describe("V1 certification evidence contract", () => {
  it("allows only collecting/pass/fail component state and forbids component certification claims", () => {
    const report = {
      schema: "donggri-component-report/v1",
      report_type: "component",
      component: "journal",
      candidate_id: "candidate-alpha.0",
      source_epoch: sourceEpoch,
      generated_at: "2026-07-25T00:00:00Z",
      evidence_mode: "actual",
      component_status: "pass",
      certification_claimed: false,
      evidence_files: [{ path: "journal.jsonl", sha256: "b".repeat(64), bytes: 100 }],
      summary: "Hash chain verified.",
    };
    expect(validateComponentReport(report).component_status).toBe("pass");
    expect(() => validateComponentReport({ ...report, component_status: "certified" })).toThrow();
    expect(() => validateComponentReport({ ...report, certification_claimed: true })).toThrow();
    expect(validateComponentReport({ ...report, evidence_mode: "synthetic" }).evidence_mode).toBe("synthetic");
  });

  it("requires active candidate component reports to bind git SHA and reject historical credit", () => {
    const report = createCandidateComponentReport({
      schema: "donggri-component-report/v2",
      report_type: "component",
      component: "api_and_event_schema",
      candidate_id: "dongri-grigri-v01-alpha.2",
      git_sha: "1".repeat(40),
      source_epoch: sourceEpoch,
      generated_at: "2026-07-29T00:00:00Z",
      evidence_mode: "actual",
      component_status: "pass",
      quality_score: 97.45,
      certification_claimed: false,
      historical_evidence_credited: false,
      producer: {
        id: "v01-component-producer",
        version: "1.0.0",
        authority: "candidate_tooling",
      },
      provenance: {
        run_id: "run-api-contract",
        approval_id: "APR-V01-WAVE-B-PREPARATION-001",
        command_sha256: "d".repeat(64),
        trust_root_sha256: null,
      },
      attestation: {
        scheme: "integrity_only",
        key_id: null,
        signature_base64: null,
      },
      evidence_files: [{ path: "openapi.json", sha256: "b".repeat(64), bytes: 100 }],
      summary: "Candidate-bound API floor passed.",
    });
    const { integrity: _integrity, ...unsignedReport } = report;
    expect(validateCandidateComponentReport(report).git_sha).toBe("1".repeat(40));
    expect(() =>
      createCandidateComponentReport({
        ...unsignedReport,
        evidence_files: [],
      }),
    ).toThrow();
    expect(() => validateCandidateComponentReport({ ...report, git_sha: "unbound" })).toThrow();
    expect(() => validateCandidateComponentReport({ ...report, historical_evidence_credited: true })).toThrow();
    expect(() => validateCandidateComponentReport({ ...report, certification_claimed: true })).toThrow();
    expect(() =>
      validateCandidateComponentReport({
        ...report,
        summary: "Tampered after signing.",
      }),
    ).toThrow("candidate_component_report_integrity_mismatch");
    expect(() =>
      createCandidateComponentReport({
        ...unsignedReport,
        producer: { ...report.producer, authority: "independent_assessor" },
        provenance: { ...report.provenance, trust_root_sha256: null },
      }),
    ).toThrow();
  });

  it("permits a certification claim only in the exact final decision file with all hard gates passed", () => {
    const decision = {
      schema: "donggri-certification-decision/v1",
      report_type: "certification_decision",
      candidate_id: "candidate-rc.1",
      source_epoch: sourceEpoch,
      decided_at: "2026-07-25T00:00:00Z",
      decision: "PASS",
      certification_claimed: true,
      final_evidence_pack_sha256: "c".repeat(64),
      final_evidence_item_count: 16,
      assessor_ids: ["assessor-a", "assessor-b"],
      hard_gates: { passed: 10, total: 10 },
      unresolved_critical: 0,
      unresolved_sev1: 0,
      decision_reasons: ["All local certification gates passed."],
    };
    expect(validateCertificationDecision(decision, "CERTIFICATION_DECISION.json").decision).toBe("PASS");
    expect(() => validateCertificationDecision(decision, "component-report.json")).toThrow(
      "certification_decision_filename_invalid",
    );
    expect(() =>
      validateCertificationDecision(
        { ...decision, hard_gates: { passed: 9, total: 10 } },
        "CERTIFICATION_DECISION.json",
      ),
    ).toThrow();
  });

  it("binds approval, manifest, candidate identity, source epoch, and approval window in a freeze record", () => {
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
    expect(validateFreezeRecord(record)).toEqual(record);

    const calculatedExpected = (() => {
      try {
        validateFreezeRecord({ ...record, source_epoch: `sha256:${"d".repeat(64)}` });
        return true;
      } catch {
        return false;
      }
    })();
    const invertedExpectation = !calculatedExpected;
    expect(calculatedExpected).toBe(false);
    expect(invertedExpectation).toBe(true);
  });
});
