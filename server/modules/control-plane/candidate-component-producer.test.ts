import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertCandidateEvidenceRoot, produceCandidateComponentReport } from "./candidate-component-producer.ts";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("candidate component production", () => {
  let root = "";
  let artifactPath = "";
  let outputPath = "";
  const identity = {
    candidate_id: "dongri-grigri-v01-alpha.2",
    git_sha: "1".repeat(40),
    source_epoch: `sha256:${"2".repeat(64)}`,
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-producer-"));
    artifactPath = path.join(root, "artifacts", "api-floor.json");
    outputPath = path.join(root, "inputs", "component-reports", "attempts", "static-001", "api.json");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(
      artifactPath,
      `${JSON.stringify({
        schema: "donggri-v01-api-floor-evidence/v1",
        ...identity,
        required: 191,
        current: 203,
        missing: 0,
      })}\n`,
    );
  });

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  function produce(overrides: Record<string, unknown> = {}) {
    return produceCandidateComponentReport({
      output_path: outputPath,
      report_root: root,
      evidence_roots: [root],
      evidence_paths: [artifactPath],
      identity,
      component: "api_and_event_schema",
      component_status: "pass",
      quality_score: 97.45,
      generated_at: "2026-07-30T00:00:00Z",
      summary: "The exact candidate preserves the API floor.",
      producer: {
        id: "v01-component-producer",
        version: "1.0.0",
        authority: "candidate_tooling",
      },
      provenance: {
        run_id: "static-001",
        approval_id: "APR-V01-WAVE-B-PREPARATION-001",
        command_sha256: sha256("component-producer-static-001"),
        trust_root_sha256: null,
      },
      ...overrides,
    });
  }

  it("writes an actual v2 report only from exact candidate-bound evidence", () => {
    const report = produce();
    expect(report).toMatchObject({
      schema: "donggri-component-report/v2",
      candidate_id: identity.candidate_id,
      git_sha: identity.git_sha,
      quality_score: 97.45,
      historical_evidence_credited: false,
    });
    expect(() => produce()).toThrow("candidate_component_report_output_exists");
  });

  it("rejects historical, stale-SHA, and unbound evidence", () => {
    fs.writeFileSync(
      artifactPath,
      `${JSON.stringify({
        candidate_id: "dongri-grigri-v01-alpha.1",
        candidate_sha: identity.git_sha,
        source_epoch: identity.source_epoch,
      })}\n`,
    );
    expect(() => produce()).toThrow("candidate_component_producer_binding_evidence_required");

    fs.writeFileSync(artifactPath, '{"required":191,"current":203,"missing":0}\n');
    expect(() => produce()).toThrow("candidate_component_producer_binding_evidence_required");
  });

  it("enforces the candidate evidence root before production", () => {
    expect(() => assertCandidateEvidenceRoot(root, artifactPath)).not.toThrow();
    expect(() => assertCandidateEvidenceRoot(root, path.join(path.dirname(root), "outside.json"))).toThrow(
      "candidate_component_producer_evidence_outside_candidate_root",
    );
  });
});
