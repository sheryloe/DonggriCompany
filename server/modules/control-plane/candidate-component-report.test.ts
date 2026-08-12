import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readVerifiedCandidateComponentReport, writeCandidateComponentReport } from "./candidate-component-report.ts";
import { createCandidateComponentReport, type CandidateComponentReportUnsigned } from "./certification-contract.ts";

function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

describe("candidate component report artifact authority", () => {
  let root = "";
  let outputPath = "";
  let artifactPath = "";
  let artifactBytes = Buffer.alloc(0);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-component-"));
    outputPath = path.join(root, "inputs", "component-reports", "api_and_event_schema.json");
    artifactPath = path.join(root, "artifacts", "openapi-floor.json");
    artifactBytes = Buffer.from('{"required":191,"current":203,"missing":0}\n', "utf8");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, artifactBytes);
  });

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  function report(overrides: Partial<CandidateComponentReportUnsigned> = {}) {
    return createCandidateComponentReport({
      schema: "donggri-component-report/v2",
      report_type: "component",
      component: "api_and_event_schema",
      candidate_id: "dongri-grigri-v01-alpha.2",
      git_sha: "1".repeat(40),
      source_epoch: `sha256:${"2".repeat(64)}`,
      generated_at: "2026-07-30T00:00:00Z",
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
        command_sha256: "5".repeat(64),
        trust_root_sha256: null,
      },
      attestation: {
        scheme: "integrity_only",
        key_id: null,
        signature_base64: null,
      },
      evidence_files: [
        {
          path: path.relative(path.dirname(outputPath), artifactPath).replaceAll("\\", "/"),
          sha256: sha256(artifactBytes),
          bytes: artifactBytes.length,
        },
      ],
      summary: "The frozen candidate preserves the API floor.",
      ...overrides,
    });
  }

  it("writes once and returns a physically verified report", () => {
    const written = writeCandidateComponentReport({
      output_path: outputPath,
      report_root: root,
      evidence_roots: [root],
      report: report(),
    });

    expect(written.path).toBe(outputPath);
    expect(written.report.component).toBe("api_and_event_schema");
    expect(written.verified_evidence_files).toEqual([
      expect.objectContaining({
        absolute_path: artifactPath,
        physical_path: fs.realpathSync.native(artifactPath),
        sha256: sha256(artifactBytes),
        bytes: artifactBytes.length,
      }),
    ]);
    expect(written.sha256).toBe(sha256(fs.readFileSync(outputPath)));

    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report(),
      }),
    ).toThrow("candidate_component_report_output_exists");
  });

  it("rejects a schema-valid replacement between the exclusive write and readback", () => {
    const originalReadFileSync = fs.readFileSync.bind(fs);
    let replaced = false;
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(((
      filePath: fs.PathOrFileDescriptor,
      options?: unknown,
    ) => {
      if (!replaced && path.resolve(String(filePath)) === path.resolve(outputPath)) {
        replaced = true;
        const current = JSON.parse(originalReadFileSync(outputPath, "utf8")) as Record<string, unknown>;
        const { integrity: _integrity, ...unsigned } = current;
        const substituted = createCandidateComponentReport({
          ...(unsigned as CandidateComponentReportUnsigned),
          summary: "A concurrent writer replaced the report after creation.",
        });
        fs.writeFileSync(outputPath, `${JSON.stringify(substituted)}\n`, "utf8");
      }
      return originalReadFileSync(filePath, options as never);
    }) as typeof fs.readFileSync);

    try {
      expect(() =>
        writeCandidateComponentReport({
          output_path: outputPath,
          report_root: root,
          evidence_roots: [root],
          report: report(),
        }),
      ).toThrow("candidate_component_report_postwrite_mismatch");
    } finally {
      readSpy.mockRestore();
    }
  });

  it("rejects missing, byte-mismatched, and hash-mismatched artifacts", () => {
    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report({
          evidence_files: [{ path: "../../artifacts/missing.json", sha256: "3".repeat(64), bytes: 1 }],
        }),
      }),
    ).toThrow("candidate_component_evidence_0_missing");
    expect(fs.existsSync(path.dirname(outputPath))).toBe(false);

    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report({
          evidence_files: [
            {
              path: path.relative(path.dirname(outputPath), artifactPath),
              sha256: sha256(artifactBytes),
              bytes: artifactBytes.length + 1,
            },
          ],
        }),
      }),
    ).toThrow("candidate_component_evidence_bytes_mismatch");

    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report({
          evidence_files: [
            {
              path: path.relative(path.dirname(outputPath), artifactPath),
              sha256: "4".repeat(64),
              bytes: artifactBytes.length,
            },
          ],
        }),
      }),
    ).toThrow("candidate_component_evidence_sha256_mismatch");
  });

  it("rejects path escapes and linked evidence even when the target stays inside the root", () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-outside-"));
    try {
      const outsideArtifact = path.join(outsideRoot, "outside.json");
      fs.writeFileSync(outsideArtifact, artifactBytes);
      expect(() =>
        writeCandidateComponentReport({
          output_path: outputPath,
          report_root: root,
          evidence_roots: [root],
          report: report({
            evidence_files: [{ path: outsideArtifact, sha256: sha256(artifactBytes), bytes: artifactBytes.length }],
          }),
        }),
      ).toThrow("candidate_component_evidence_0_outside_allowed_roots");
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }

    const linkPath = path.join(root, "linked-artifacts");
    fs.symlinkSync(path.dirname(artifactPath), linkPath, process.platform === "win32" ? "junction" : "dir");
    const linkedArtifact = path.join(linkPath, path.basename(artifactPath));
    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report({
          evidence_files: [{ path: linkedArtifact, sha256: sha256(artifactBytes), bytes: artifactBytes.length }],
        }),
      }),
    ).toThrow("candidate_component_evidence_0_link_forbidden");

    const realOutputDirectory = path.join(root, "real-output");
    const linkedOutputDirectory = path.join(root, "linked-output");
    fs.mkdirSync(realOutputDirectory);
    fs.symlinkSync(realOutputDirectory, linkedOutputDirectory, process.platform === "win32" ? "junction" : "dir");
    expect(() =>
      writeCandidateComponentReport({
        output_path: path.join(linkedOutputDirectory, "component.json"),
        report_root: root,
        evidence_roots: [root],
        report: report({
          evidence_files: [{ path: artifactPath, sha256: sha256(artifactBytes), bytes: artifactBytes.length }],
        }),
      }),
    ).toThrow("candidate_component_report_output_link_forbidden");
  });

  it("rejects a schema-valid report when its referenced artifact disappears", () => {
    writeCandidateComponentReport({
      output_path: outputPath,
      report_root: root,
      evidence_roots: [root],
      report: report(),
    });
    fs.rmSync(artifactPath);

    expect(() =>
      readVerifiedCandidateComponentReport({
        report_path: outputPath,
        report_root: root,
        evidence_roots: [root],
      }),
    ).toThrow("candidate_component_evidence_0_missing");
  });

  it("fails closed on assessor signatures until the repo-external trust-root verifier is supplied", () => {
    expect(() =>
      writeCandidateComponentReport({
        output_path: outputPath,
        report_root: root,
        evidence_roots: [root],
        report: report({
          producer: {
            id: "assessor-external-01",
            version: "1.0.0",
            authority: "independent_assessor",
          },
          provenance: {
            run_id: "assessment-001",
            approval_id: "APR-V01-ASSESS-001",
            command_sha256: "5".repeat(64),
            trust_root_sha256: "6".repeat(64),
          },
          attestation: {
            scheme: "ed25519",
            key_id: "assessor-external-01-key-2026",
            signature_base64: `${"A".repeat(86)}==`,
          },
        }),
      }),
    ).toThrow("candidate_component_external_attestation_verifier_required");
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
