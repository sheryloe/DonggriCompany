import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { writeCandidateComponentReport } from "./candidate-component-report.ts";
import { createCandidateComponentReport, type CandidateComponentReport } from "./certification-contract.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type CandidateComponentProductionIdentity = {
  candidate_id: string;
  git_sha: string;
  source_epoch: string;
};

export type CandidateComponentProductionInput = {
  output_path: string;
  report_root: string;
  evidence_roots: string[];
  evidence_paths: string[];
  identity: CandidateComponentProductionIdentity;
  component: string;
  component_status: "collecting" | "pass" | "fail";
  quality_score: number;
  generated_at: string;
  summary: string;
  producer: {
    id: string;
    version: string;
    authority: "candidate_tooling" | "human_attestation";
  };
  provenance: {
    run_id: string;
    approval_id: string;
    command_sha256: string;
    trust_root_sha256: string | null;
  };
};

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalize(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(normalize(rootPath), normalize(targetPath));
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function requireEvidenceFile(filePath: string): { absolute_path: string; bytes: Buffer } {
  if (!path.isAbsolute(filePath)) throw new Error("candidate_component_producer_evidence_absolute_path_required");
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error("candidate_component_producer_evidence_missing");
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error("candidate_component_producer_evidence_link_forbidden");
  if (!stat.isFile()) throw new Error("candidate_component_producer_evidence_regular_file_required");
  return { absolute_path: absolutePath, bytes: fs.readFileSync(absolutePath) };
}

function hasExactCandidateBinding(value: unknown, identity: CandidateComponentProductionIdentity): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const gitSha = record.git_sha ?? record.candidate_sha;
  return (
    record.candidate_id === identity.candidate_id &&
    gitSha === identity.git_sha &&
    record.source_epoch === identity.source_epoch
  );
}

function descriptorPath(outputPath: string, evidencePath: string): string {
  const relative = path.relative(path.dirname(outputPath), evidencePath);
  return relative && !path.isAbsolute(relative) ? relative.replaceAll("\\", "/") : evidencePath;
}

export function produceCandidateComponentReport(input: CandidateComponentProductionInput): CandidateComponentReport {
  if (input.evidence_paths.length === 0) throw new Error("candidate_component_producer_evidence_required");
  if (new Set(input.evidence_paths.map(normalize)).size !== input.evidence_paths.length) {
    throw new Error("candidate_component_producer_evidence_duplicate");
  }
  if (!SHA256_PATTERN.test(input.provenance.command_sha256)) {
    throw new Error("candidate_component_producer_command_sha256_invalid");
  }
  const evidence = input.evidence_paths.map(requireEvidenceFile);
  const bindingEvidence = evidence.some((file) => {
    if (path.extname(file.absolute_path).toLowerCase() !== ".json") return false;
    try {
      return hasExactCandidateBinding(JSON.parse(file.bytes.toString("utf8")), input.identity);
    } catch {
      return false;
    }
  });
  if (!bindingEvidence) throw new Error("candidate_component_producer_binding_evidence_required");

  const report = createCandidateComponentReport({
    schema: "donggri-component-report/v2",
    report_type: "component",
    component: input.component,
    candidate_id: input.identity.candidate_id,
    git_sha: input.identity.git_sha,
    source_epoch: input.identity.source_epoch,
    generated_at: input.generated_at,
    evidence_mode: "actual",
    component_status: input.component_status,
    quality_score: input.quality_score,
    certification_claimed: false,
    historical_evidence_credited: false,
    producer: input.producer,
    provenance: input.provenance,
    attestation: {
      scheme: "integrity_only",
      key_id: null,
      signature_base64: null,
    },
    evidence_files: evidence.map((file) => ({
      path: descriptorPath(input.output_path, file.absolute_path),
      sha256: sha256(file.bytes),
      bytes: file.bytes.length,
    })),
    summary: input.summary,
  });
  return writeCandidateComponentReport({
    output_path: input.output_path,
    report_root: input.report_root,
    evidence_roots: input.evidence_roots,
    report,
  }).report;
}

export function assertCandidateEvidenceRoot(candidateRootInput: string, evidencePathInput: string): void {
  const candidateRoot = path.resolve(candidateRootInput);
  const evidencePath = path.resolve(evidencePathInput);
  if (!isWithin(candidateRoot, evidencePath)) {
    throw new Error("candidate_component_producer_evidence_outside_candidate_root");
  }
}
