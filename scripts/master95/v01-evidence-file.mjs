import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const V01_REPORT_ROOT = "G:\\Donggri_DevDrive\\storage\\codex-control\\reports\\DonggriCompany";
const V01_RUNTIME_ROOT = "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01";
const ALLOWED_EVIDENCE_ROOTS = Object.freeze([V01_REPORT_ROOT, V01_RUNTIME_ROOT]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isStrictChild(candidate, root) {
  const relative = path.relative(normalizeForComparison(root), normalizeForComparison(candidate));
  return (
    relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
  );
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertNewPathWithinRoot(absolutePath, root, field) {
  assert(path.isAbsolute(absolutePath), `${field}_path_must_be_absolute`);
  const logicalPath = path.resolve(absolutePath);
  assert(isStrictChild(logicalPath, root), `${field}_path_outside_boundary`);
  assert(fs.existsSync(root) && fs.statSync(root).isDirectory(), `${field}_boundary_missing`);

  let existingAncestor = logicalPath;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    assert(parent !== existingAncestor, `${field}_existing_ancestor_missing`);
    existingAncestor = parent;
  }
  const physicalAncestor = fs.realpathSync.native(existingAncestor);
  const physicalRoot = fs.realpathSync.native(root);
  const physicalTarget = path.resolve(physicalAncestor, path.relative(existingAncestor, logicalPath));
  assert(isStrictChild(physicalTarget, physicalRoot), `${field}_physical_path_outside_boundary`);
  return logicalPath;
}

export function assertV01NewReportPath(absolutePath, field) {
  return assertNewPathWithinRoot(absolutePath, V01_REPORT_ROOT, field);
}

export function assertV01NewRuntimePath(absolutePath, field) {
  return assertNewPathWithinRoot(absolutePath, V01_RUNTIME_ROOT, field);
}

export function verifyV01EvidenceArtifact(artifact, field) {
  assert(artifact && typeof artifact === "object" && !Array.isArray(artifact), `${field}_artifact_invalid`);
  assert(path.isAbsolute(artifact.absolute_path), `${field}_artifact_path_must_be_absolute`);
  const logicalPath = path.resolve(artifact.absolute_path);
  assert(SHA256_PATTERN.test(String(artifact.sha256 ?? "").toLowerCase()), `${field}_artifact_sha256_invalid`);

  const logicalRoots = ALLOWED_EVIDENCE_ROOTS.filter((root) => isStrictChild(logicalPath, root));
  assert(logicalRoots.length > 0, `${field}_artifact_path_outside_v01_evidence_roots`);
  assert(fs.existsSync(logicalPath), `${field}_artifact_missing`);
  const artifactStat = fs.statSync(logicalPath);
  assert(artifactStat.isFile(), `${field}_artifact_not_file`);

  const physicalPath = fs.realpathSync.native(logicalPath);
  const physicalRoots = logicalRoots.filter((root) => fs.existsSync(root)).map((root) => fs.realpathSync.native(root));
  assert(
    physicalRoots.some((root) => isStrictChild(physicalPath, root)),
    `${field}_artifact_physical_path_outside_v01_evidence_roots`,
  );

  const actualSha256 = sha256(fs.readFileSync(physicalPath));
  assert(actualSha256 === artifact.sha256.toLowerCase(), `${field}_artifact_sha256_mismatch`);
  return {
    absolute_path: logicalPath,
    physical_path: physicalPath,
    sha256: actualSha256,
    size_bytes: artifactStat.size,
  };
}

export const v01EvidenceFileContract = Object.freeze({
  allowed_roots: [...ALLOWED_EVIDENCE_ROOTS],
  report_root: V01_REPORT_ROOT,
  runtime_root: V01_RUNTIME_ROOT,
});
