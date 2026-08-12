import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type CandidateComponentReport, validateCandidateComponentReport } from "./certification-contract.ts";

export type VerifiedCandidateEvidenceFile = {
  descriptor_path: string;
  absolute_path: string;
  physical_path: string;
  sha256: string;
  bytes: number;
};

export type VerifiedCandidateComponentReport = {
  path: string;
  physical_path: string;
  sha256: string;
  bytes: number;
  report: CandidateComponentReport;
  verified_evidence_files: VerifiedCandidateEvidenceFile[];
};

type ReadCandidateComponentReportOptions = {
  report_path: string;
  report_root: string;
  evidence_roots: string[];
};

type WriteCandidateComponentReportOptions = {
  output_path: string;
  report_root: string;
  evidence_roots: string[];
  report: unknown;
};

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

function normalizeForComparison(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(normalizeForComparison(rootPath), normalizeForComparison(targetPath));
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function requireAbsolutePath(filePath: string, code: string): string {
  if (!path.isAbsolute(filePath)) throw new Error(`${code}_absolute_path_required`);
  return path.resolve(filePath);
}

function requireOrdinaryDirectory(directoryPath: string, code: string): string {
  const absolutePath = requireAbsolutePath(directoryPath, code);
  if (!fs.existsSync(absolutePath)) throw new Error(`${code}_missing`);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
  if (!stat.isDirectory()) throw new Error(`${code}_directory_required`);
  return absolutePath;
}

function assertExistingPathHasNoLinks(rootPath: string, targetPath: string, code: string): void {
  if (!isWithin(rootPath, targetPath)) throw new Error(`${code}_outside_root`);
  const relative = path.relative(rootPath, targetPath);
  let current = rootPath;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
  }
}

function resolveAllowedRoot(
  targetPath: string,
  roots: string[],
  code: string,
): {
  logical_root: string;
  physical_root: string;
} {
  const candidates = roots
    .map((root, index) => requireOrdinaryDirectory(root, `${code}_root_${index}`))
    .filter((root) => isWithin(root, targetPath));
  if (candidates.length === 0) throw new Error(`${code}_outside_allowed_roots`);

  const logicalRoot = candidates.sort((left, right) => right.length - left.length)[0];
  assertExistingPathHasNoLinks(logicalRoot, targetPath, code);
  return {
    logical_root: logicalRoot,
    physical_root: fs.realpathSync.native(logicalRoot),
  };
}

function verifyRegularFile(
  filePath: string,
  roots: string[],
  code: string,
): { absolute_path: string; physical_path: string; bytes: Buffer } {
  const absolutePath = requireAbsolutePath(filePath, code);
  const root = resolveAllowedRoot(absolutePath, roots, code);
  if (!fs.existsSync(absolutePath)) throw new Error(`${code}_missing`);
  const logicalStat = fs.lstatSync(absolutePath);
  if (logicalStat.isSymbolicLink()) throw new Error(`${code}_link_forbidden`);
  if (!logicalStat.isFile()) throw new Error(`${code}_regular_file_required`);

  const physicalPath = fs.realpathSync.native(absolutePath);
  if (!isWithin(root.physical_root, physicalPath)) throw new Error(`${code}_physical_path_outside_root`);
  const physicalStat = fs.statSync(physicalPath);
  if (!physicalStat.isFile()) throw new Error(`${code}_physical_regular_file_required`);
  return {
    absolute_path: absolutePath,
    physical_path: physicalPath,
    bytes: fs.readFileSync(physicalPath),
  };
}

function verifyEvidenceFiles(
  report: CandidateComponentReport,
  reportPath: string,
  evidenceRoots: string[],
): VerifiedCandidateEvidenceFile[] {
  if (evidenceRoots.length === 0) throw new Error("candidate_component_evidence_roots_required");
  const seen = new Set<string>();
  return report.evidence_files.map((descriptor, index) => {
    const logicalPath = path.isAbsolute(descriptor.path)
      ? path.resolve(descriptor.path)
      : path.resolve(path.dirname(reportPath), descriptor.path);
    const verified = verifyRegularFile(logicalPath, evidenceRoots, `candidate_component_evidence_${index}`);
    const physicalKey = normalizeForComparison(verified.physical_path);
    if (seen.has(physicalKey)) throw new Error("candidate_component_evidence_duplicate");
    seen.add(physicalKey);

    const actualSha256 = sha256(verified.bytes);
    if (verified.bytes.length !== descriptor.bytes) {
      throw new Error(`candidate_component_evidence_bytes_mismatch:${descriptor.path}`);
    }
    if (actualSha256 !== descriptor.sha256) {
      throw new Error(`candidate_component_evidence_sha256_mismatch:${descriptor.path}`);
    }
    return {
      descriptor_path: descriptor.path,
      absolute_path: verified.absolute_path,
      physical_path: verified.physical_path,
      sha256: actualSha256,
      bytes: verified.bytes.length,
    };
  });
}

export function readVerifiedCandidateComponentReport(
  options: ReadCandidateComponentReportOptions,
): VerifiedCandidateComponentReport {
  const reportPath = requireAbsolutePath(options.report_path, "candidate_component_report");
  const reportFile = verifyRegularFile(reportPath, [options.report_root], "candidate_component_report");
  let parsed: unknown;
  try {
    parsed = JSON.parse(reportFile.bytes.toString("utf8"));
  } catch {
    throw new Error("candidate_component_report_json_invalid");
  }
  const report = validateCandidateComponentReport(parsed);
  if (report.producer.authority === "independent_assessor") {
    throw new Error("candidate_component_external_attestation_verifier_required");
  }
  return {
    path: reportPath,
    physical_path: reportFile.physical_path,
    sha256: sha256(reportFile.bytes),
    bytes: reportFile.bytes.length,
    report,
    verified_evidence_files: verifyEvidenceFiles(report, reportPath, options.evidence_roots),
  };
}

export function writeCandidateComponentReport(
  options: WriteCandidateComponentReportOptions,
): VerifiedCandidateComponentReport {
  const report = validateCandidateComponentReport(options.report);
  if (report.producer.authority === "independent_assessor") {
    throw new Error("candidate_component_external_attestation_verifier_required");
  }
  const reportRoot = requireOrdinaryDirectory(options.report_root, "candidate_component_report_root");
  const outputPath = requireAbsolutePath(options.output_path, "candidate_component_report_output");
  if (path.extname(outputPath).toLowerCase() !== ".json") {
    throw new Error("candidate_component_report_output_json_required");
  }
  if (!isWithin(reportRoot, outputPath) || normalizeForComparison(reportRoot) === normalizeForComparison(outputPath)) {
    throw new Error("candidate_component_report_output_outside_root");
  }
  if (fs.existsSync(outputPath)) throw new Error("candidate_component_report_output_exists");

  const parentPath = path.dirname(outputPath);
  assertExistingPathHasNoLinks(reportRoot, parentPath, "candidate_component_report_output");
  verifyEvidenceFiles(report, outputPath, options.evidence_roots);
  fs.mkdirSync(parentPath, { recursive: true });
  assertExistingPathHasNoLinks(reportRoot, parentPath, "candidate_component_report_output");
  const physicalRoot = fs.realpathSync.native(reportRoot);
  const physicalParent = fs.realpathSync.native(parentPath);
  if (!isWithin(physicalRoot, physicalParent)) {
    throw new Error("candidate_component_report_output_physical_path_outside_root");
  }

  fs.writeFileSync(outputPath, canonicalJson(report), { encoding: "utf8", flag: "wx" });
  return readVerifiedCandidateComponentReport({
    report_path: outputPath,
    report_root: reportRoot,
    evidence_roots: options.evidence_roots,
  });
}
