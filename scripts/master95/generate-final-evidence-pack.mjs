#!/usr/bin/env node

import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const ASSESSOR_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ASSESSOR_REGISTRY_APPROVAL_ID = "APR-V1-ASSESS-001";
const ASSESSOR_SIGNATURE_ALGORITHM = "Ed25519";
const DEFAULT_ASSESSOR_REGISTRY_PATH = path.join(repoRoot, "contracts", "v1", "independent-assessor-registry.json");
const DEFAULT_ASSESSOR_TRUST_ROOT_AUTHORITY = path.join(controlRoot, "storage", "codex-control");
const REQUIRED_PROJECTS = ["BloggerGent", "DonggriCompany", "DonggrolGameBook"];
const ORIGINAL_COMPONENT_IDS = [
  "final_system_architecture",
  "all_adrs",
  "requirements_traceability_matrix",
  "all_agent_manifests",
  "project_registry_snapshot",
  "skill_registry_snapshot",
  "memory_schema_and_retrieval_evaluation",
  "api_and_event_schema",
  "e2e_execution_trace",
  "security_and_permission_test_report",
  "failure_and_recovery_rehearsal_report",
  "performance_and_cost_report",
  "ui_usability_test",
  "image_workbench_test",
  "thirty_day_pilot_report",
];
const DELIVERY_COMPONENT_ID = "reproducible_delivery_and_rollback";
const ASSESSOR_SHEET_COMPONENT_ID = "independent_evaluator_reassessment_sheet";
const OUTPUT_NAMES = {
  status: "EVIDENCE_PACK_STATUS.json",
  assessmentReady: "ASSESSMENT_READY_MANIFEST.json",
  finalPack: "FINAL_EVIDENCE_PACK_MANIFEST.json",
  decision: "CERTIFICATION_DECISION.json",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  assert(isObject(value), `${label}:object_required`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}:unexpected_fields`);
}

function assertString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label}:non_empty_string_required`);
  return value;
}

function assertIsoDate(value, label) {
  assertString(value, label);
  assert(!Number.isNaN(Date.parse(value)), `${label}:invalid_datetime`);
  return value;
}

function assertNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label}:finite_number_required`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashBuffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashCanonical(value) {
  return hashBuffer(Buffer.from(JSON.stringify(canonicalize(value)), "utf8"));
}

function canonicalBuffer(value) {
  return Buffer.from(JSON.stringify(canonicalize(value)), "utf8");
}

function sha256File(filePath) {
  return hashBuffer(fs.readFileSync(filePath));
}

function publicKeyFingerprint(publicKey) {
  const keyObject = isObject(publicKey) && publicKey.type === "public" ? publicKey : crypto.createPublicKey(publicKey);
  return hashBuffer(
    keyObject.export({
      type: "spki",
      format: "der",
    }),
  );
}

function assessorRegistrySidecarPath(registryPath) {
  return path.join(path.dirname(registryPath), `${path.basename(registryPath, path.extname(registryPath))}.sha256`);
}

function decodeCanonicalBase64(value, label) {
  assertString(value, label);
  assert(BASE64_PATTERN.test(value), `${label}:invalid_base64`);
  const decoded = Buffer.from(value, "base64");
  assert(decoded.toString("base64") === value, `${label}:non_canonical_base64`);
  return decoded;
}

function normalizedPath(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/");
}

function pathIsWithin(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function resolveExternalAssessorTrustRootPath(filePath, authorityRoot) {
  assertString(filePath, "assessor_trust_root.path");
  assert(path.isAbsolute(filePath), "assessor_trust_root:absolute_path_required");
  assert(path.isAbsolute(authorityRoot), "assessor_trust_root:authority_root_absolute_required");
  assert(fs.existsSync(filePath), "assessor_trust_root:file_missing");
  assert(fs.existsSync(authorityRoot), "assessor_trust_root:authority_root_missing");

  const canonicalPath = fs.realpathSync.native(filePath);
  const canonicalAuthorityRoot = fs.realpathSync.native(authorityRoot);
  const canonicalRepoRoot = fs.realpathSync.native(repoRoot);
  assert(fs.statSync(canonicalPath).isFile(), "assessor_trust_root:file_required");
  assert(pathIsWithin(canonicalAuthorityRoot, canonicalPath), "assessor_trust_root:outside_control_plane_authority");
  assert(!pathIsWithin(canonicalRepoRoot, canonicalPath), "assessor_trust_root:repo_local_authority_forbidden");
  return canonicalPath;
}

function resolveEvidencePath(reportPath, evidencePath, allowedRoot) {
  assertString(evidencePath, "evidence_file.path");
  const resolved = path.isAbsolute(evidencePath)
    ? path.resolve(evidencePath)
    : path.resolve(path.dirname(reportPath), evidencePath);
  assert(fs.existsSync(allowedRoot), "evidence_file:allowed_root_missing");
  assert(fs.existsSync(resolved), "evidence_file:artifact_missing");
  const canonicalRoot = fs.realpathSync.native(allowedRoot);
  const canonicalResolved = fs.realpathSync.native(resolved);
  const relative = path.relative(canonicalRoot, canonicalResolved);
  assert(relative !== ".." && !relative.startsWith(`..${path.sep}`), "evidence_file:path_traversal");
  return canonicalResolved;
}

function artifactRecord(filePath, relativeRoot = null) {
  const resolved = path.resolve(filePath);
  assert(fs.existsSync(resolved), `artifact_missing:${resolved}`);
  const stat = fs.statSync(resolved);
  assert(stat.isFile(), `artifact_not_file:${resolved}`);
  const relative =
    relativeRoot && !path.relative(relativeRoot, resolved).startsWith("..")
      ? path.relative(relativeRoot, resolved).replaceAll("\\", "/")
      : normalizedPath(resolved);
  return {
    path: relative,
    sha256: sha256File(resolved),
    bytes: stat.size,
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`invalid_json:${filePath}:${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateEvidenceFile(input, reportPath, allowedRoot) {
  assertExactKeys(input, ["path", "sha256", "bytes"], "evidence_file");
  assert(SHA256_PATTERN.test(input.sha256), "evidence_file:invalid_sha256");
  assert(Number.isInteger(input.bytes) && input.bytes >= 0, "evidence_file:invalid_bytes");
  const resolved = resolveEvidencePath(reportPath, input.path, allowedRoot);
  const actual = artifactRecord(resolved);
  assert(actual.sha256 === input.sha256, `evidence_file:sha256_mismatch:${input.path}`);
  assert(actual.bytes === input.bytes, `evidence_file:bytes_mismatch:${input.path}`);
  return {
    path: normalizedPath(resolved),
    sha256: input.sha256,
    bytes: input.bytes,
  };
}

function validateComponentReport(input, reportPath, context, expectedComponent) {
  assertExactKeys(
    input,
    [
      "schema",
      "report_type",
      "component",
      "candidate_id",
      "source_epoch",
      "generated_at",
      "evidence_mode",
      "component_status",
      "certification_claimed",
      "evidence_files",
      "summary",
    ],
    `component_report:${expectedComponent}`,
  );
  assert(input.schema === "donggri-component-report/v1", `${expectedComponent}:invalid_schema`);
  assert(input.report_type === "component", `${expectedComponent}:invalid_report_type`);
  assert(input.component === expectedComponent, `${expectedComponent}:component_mismatch`);
  assert(input.candidate_id === context.candidateId, `${expectedComponent}:candidate_mismatch`);
  assert(input.source_epoch === context.sourceEpoch, `${expectedComponent}:source_epoch_mismatch`);
  assertIsoDate(input.generated_at, `${expectedComponent}.generated_at`);
  assert(["actual", "synthetic"].includes(input.evidence_mode), `${expectedComponent}:invalid_evidence_mode`);
  assert(
    ["collecting", "pass", "fail"].includes(input.component_status),
    `${expectedComponent}:invalid_component_status`,
  );
  assert(input.certification_claimed === false, `${expectedComponent}:component_certification_forbidden`);
  assert(Array.isArray(input.evidence_files), `${expectedComponent}:evidence_files_required`);
  assert(input.evidence_files.length > 0, `${expectedComponent}:evidence_files_empty`);
  const evidenceFiles = input.evidence_files.map((item) => validateEvidenceFile(item, reportPath, context.inputRoot));
  assertString(input.summary, `${expectedComponent}.summary`);
  return {
    report: input,
    report_artifact: artifactRecord(reportPath, context.inputRoot),
    evidence_files: evidenceFiles,
    acceptable: input.evidence_mode === "actual" && input.component_status === "pass",
  };
}

function validateElapsedPrerequisites(input, reportPath, context) {
  assertExactKeys(
    input,
    [
      "schema",
      "candidate_id",
      "source_epoch",
      "generated_at",
      "evidence_mode",
      "certification_claimed",
      "soak_72h",
      "pilot_30d",
    ],
    "elapsed_prerequisites",
  );
  assert(input.schema === "donggri-elapsed-prerequisites/v1", "elapsed_prerequisites:invalid_schema");
  assert(input.candidate_id === context.candidateId, "elapsed_prerequisites:candidate_mismatch");
  assert(input.source_epoch === context.sourceEpoch, "elapsed_prerequisites:source_epoch_mismatch");
  const generatedAt = Date.parse(assertIsoDate(input.generated_at, "elapsed_prerequisites.generated_at"));
  assert(["actual", "synthetic"].includes(input.evidence_mode), "elapsed_prerequisites:invalid_evidence_mode");
  assert(input.certification_claimed === false, "elapsed_prerequisites:certification_forbidden");

  const soak = input.soak_72h;
  assertExactKeys(
    soak,
    [
      "status",
      "started_at",
      "evaluated_at",
      "observed_hours",
      "sample_interval_seconds",
      "recovery_rate",
      "critical_loss",
      "budget_exceeded_count",
      "evidence_file",
    ],
    "elapsed_prerequisites.soak_72h",
  );
  const soakStart = Date.parse(assertIsoDate(soak.started_at, "soak_72h.started_at"));
  const soakEnd = Date.parse(assertIsoDate(soak.evaluated_at, "soak_72h.evaluated_at"));
  assert(soakEnd >= soakStart, "soak_72h:wall_clock_regression");
  assertNumber(soak.observed_hours, "soak_72h.observed_hours");
  assert(Number.isInteger(soak.sample_interval_seconds), "soak_72h:sample_interval_integer_required");
  assertNumber(soak.recovery_rate, "soak_72h.recovery_rate");
  assert(Number.isInteger(soak.critical_loss), "soak_72h:critical_loss_integer_required");
  assert(Number.isInteger(soak.budget_exceeded_count), "soak_72h:budget_count_integer_required");
  const soakEvidence = validateEvidenceFile(soak.evidence_file, reportPath, context.inputRoot);
  const soakWallClockHours = (soakEnd - soakStart) / 3_600_000;
  const soakPass =
    soak.status === "pass" &&
    soakWallClockHours >= 72 &&
    soak.observed_hours >= 72 &&
    soak.sample_interval_seconds === 60 &&
    soak.recovery_rate >= 0.99 &&
    soak.critical_loss === 0 &&
    soak.budget_exceeded_count === 0;

  const pilot = input.pilot_30d;
  assertExactKeys(
    pilot,
    [
      "status",
      "started_at",
      "evaluated_at",
      "credited_observation_days",
      "heartbeat_interval_seconds",
      "heartbeat_coverage",
      "maximum_heartbeat_gap_seconds",
      "production_like_run_count",
      "success_rate",
      "critical_run_count",
      "critical_success_rate",
      "project_ids",
      "agent_version_change_observed",
      "skill_version_change_observed",
      "memory_version_change_observed",
      "unresolved_critical",
      "unresolved_sev1",
      "evidence_file",
    ],
    "elapsed_prerequisites.pilot_30d",
  );
  const pilotStart = Date.parse(assertIsoDate(pilot.started_at, "pilot_30d.started_at"));
  const pilotEnd = Date.parse(assertIsoDate(pilot.evaluated_at, "pilot_30d.evaluated_at"));
  assert(pilotEnd >= pilotStart, "pilot_30d:wall_clock_regression");
  for (const [name, value] of [
    ["credited_observation_days", pilot.credited_observation_days],
    ["heartbeat_coverage", pilot.heartbeat_coverage],
    ["maximum_heartbeat_gap_seconds", pilot.maximum_heartbeat_gap_seconds],
    ["success_rate", pilot.success_rate],
    ["critical_success_rate", pilot.critical_success_rate],
  ]) {
    assertNumber(value, `pilot_30d.${name}`);
  }
  for (const [name, value] of [
    ["heartbeat_interval_seconds", pilot.heartbeat_interval_seconds],
    ["production_like_run_count", pilot.production_like_run_count],
    ["critical_run_count", pilot.critical_run_count],
    ["unresolved_critical", pilot.unresolved_critical],
    ["unresolved_sev1", pilot.unresolved_sev1],
  ]) {
    assert(Number.isInteger(value), `pilot_30d.${name}:integer_required`);
  }
  assert(Array.isArray(pilot.project_ids), "pilot_30d:project_ids_required");
  const projectIds = [...pilot.project_ids].sort((left, right) => String(left).localeCompare(String(right), "en"));
  assert(JSON.stringify(projectIds) === JSON.stringify(REQUIRED_PROJECTS), "pilot_30d:project_scope_mismatch");
  const pilotEvidence = validateEvidenceFile(pilot.evidence_file, reportPath, context.inputRoot);
  const pilotWallClockDays = (pilotEnd - pilotStart) / 86_400_000;
  const pilotPass =
    pilot.status === "pass" &&
    pilotWallClockDays >= 30 &&
    pilot.credited_observation_days >= 30 &&
    pilot.heartbeat_interval_seconds === 60 &&
    pilot.heartbeat_coverage >= 0.99 &&
    pilot.maximum_heartbeat_gap_seconds <= 180 &&
    pilot.production_like_run_count >= 500 &&
    pilot.success_rate >= 0.95 &&
    pilot.critical_run_count > 0 &&
    pilot.critical_success_rate === 1 &&
    pilot.agent_version_change_observed === true &&
    pilot.skill_version_change_observed === true &&
    pilot.memory_version_change_observed === true &&
    pilot.unresolved_critical === 0 &&
    pilot.unresolved_sev1 === 0;
  assert(generatedAt >= soakEnd && generatedAt >= pilotEnd, "elapsed_prerequisites:generated_before_evaluation");

  return {
    report: input,
    report_artifact: artifactRecord(reportPath, context.inputRoot),
    soak_evidence: soakEvidence,
    pilot_evidence: pilotEvidence,
    acceptable: input.evidence_mode === "actual" && soakPass && pilotPass,
    gates: {
      evidence_mode_actual: input.evidence_mode === "actual",
      actual_72_hour_soak_pass: soakPass,
      actual_30_credited_day_pilot_pass: pilotPass,
    },
  };
}

function validateAssessorRegistry(input, registryPath, context) {
  assertExactKeys(
    input,
    [
      "schema",
      "registry_id",
      "candidate_id",
      "source_epoch",
      "registry_status",
      "approval_id",
      "approved_at",
      "expires_at",
      "immutable",
      "assessors",
    ],
    "assessor_registry",
  );
  assert(input.schema === "donggri-independent-assessor-registry/v1", "assessor_registry:invalid_schema");
  assertString(input.registry_id, "assessor_registry.registry_id");
  assert(input.candidate_id === context.candidateId, "assessor_registry:candidate_mismatch");
  assert(input.source_epoch === context.sourceEpoch, "assessor_registry:source_epoch_mismatch");
  assert(input.registry_status === "approved", "assessor_registry:registry_status_not_approved");
  assert(input.approval_id === ASSESSOR_REGISTRY_APPROVAL_ID, "assessor_registry:approval_id_mismatch");
  const approvedAt = Date.parse(assertIsoDate(input.approved_at, "assessor_registry.approved_at"));
  const expiresAt = Date.parse(assertIsoDate(input.expires_at, "assessor_registry.expires_at"));
  assert(expiresAt > approvedAt, "assessor_registry:invalid_approval_window");
  assert(input.immutable === true, "assessor_registry:immutable_registry_required");
  assert(Array.isArray(input.assessors), "assessor_registry:assessors_required");
  assert(input.assessors.length >= 2, "assessor_registry:at_least_two_assessors_required");

  const sidecarPath = assessorRegistrySidecarPath(registryPath);
  assert(fs.existsSync(sidecarPath), "assessor_registry:digest_sidecar_missing");
  const sidecarLines = fs
    .readFileSync(sidecarPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert(sidecarLines.length === 1, "assessor_registry:digest_sidecar_single_line_required");
  const sidecarMatch = sidecarLines[0].match(/^([0-9a-f]{64})\s{2}(.+)$/u);
  assert(sidecarMatch, "assessor_registry:digest_sidecar_invalid");
  assert(sidecarMatch[2] === path.basename(registryPath), "assessor_registry:digest_sidecar_filename_mismatch");
  const registrySha256 = sha256File(registryPath);
  assert(sidecarMatch[1] === registrySha256, "assessor_registry:digest_mismatch");
  // The repo-local sidecar proves only file consistency. The external Control Plane
  // trust-root record validated below is the authority for this digest.

  const assessorsById = new Map();
  const keyIds = new Set();
  const publicKeyFingerprints = new Set();
  for (const assessor of input.assessors) {
    assertExactKeys(
      assessor,
      ["assessor_id", "key_id", "signature_algorithm", "public_key_pem", "public_key_sha256", "status"],
      "assessor_registry.assessor",
    );
    assert(ASSESSOR_ID_PATTERN.test(assessor.assessor_id ?? ""), "assessor_registry.assessor:invalid_assessor_id");
    assertString(assessor.key_id, "assessor_registry.assessor.key_id");
    assert(
      assessor.signature_algorithm === ASSESSOR_SIGNATURE_ALGORITHM,
      "assessor_registry.assessor:unsupported_signature_algorithm",
    );
    assert(assessor.status === "active", "assessor_registry.assessor:not_active");
    assert(SHA256_PATTERN.test(assessor.public_key_sha256), "assessor_registry.assessor:invalid_key_sha256");
    let publicKey;
    try {
      publicKey = crypto.createPublicKey(assessor.public_key_pem);
    } catch {
      throw new Error("assessor_registry.assessor:invalid_public_key");
    }
    assert(publicKey.asymmetricKeyType === "ed25519", "assessor_registry.assessor:ed25519_key_required");
    assert(
      publicKeyFingerprint(publicKey) === assessor.public_key_sha256,
      "assessor_registry.assessor:public_key_fingerprint_mismatch",
    );
    assert(!assessorsById.has(assessor.assessor_id), "assessor_registry:duplicate_assessor_id");
    assert(!keyIds.has(assessor.key_id), "assessor_registry:duplicate_key_id");
    assert(!publicKeyFingerprints.has(assessor.public_key_sha256), "assessor_registry:duplicate_public_key");
    assessorsById.set(assessor.assessor_id, {
      ...assessor,
      publicKey,
    });
    keyIds.add(assessor.key_id);
    publicKeyFingerprints.add(assessor.public_key_sha256);
  }

  return {
    registry: input,
    registry_artifact: artifactRecord(registryPath, repoRoot),
    registry_sha256: registrySha256,
    approved_at_ms: approvedAt,
    expires_at_ms: expiresAt,
    assessorsById,
  };
}

function validateAssessorTrustRoot(input, trustRootPath, registryPath, context, registry) {
  assertExactKeys(
    input,
    [
      "schema",
      "record_id",
      "authority",
      "approval_id",
      "candidate_id",
      "source_epoch",
      "assessor_registry_id",
      "assessor_registry_sha256",
      "assessor_registry_path",
      "approved_at",
      "expires_at",
      "frozen_at",
      "immutable",
    ],
    "assessor_trust_root",
  );
  assert(input.schema === "donggri-independent-assessor-trust-root/v1", "assessor_trust_root:invalid_schema");
  assertString(input.record_id, "assessor_trust_root.record_id");
  assert(input.authority === "donggri-root-control-plane", "assessor_trust_root:invalid_authority");
  assert(input.approval_id === ASSESSOR_REGISTRY_APPROVAL_ID, "assessor_trust_root:approval_id_mismatch");
  assert(input.candidate_id === context.candidateId, "assessor_trust_root:candidate_mismatch");
  assert(input.source_epoch === context.sourceEpoch, "assessor_trust_root:source_epoch_mismatch");
  assert(input.assessor_registry_id === registry.registry.registry_id, "assessor_trust_root:registry_id_mismatch");
  assert(input.assessor_registry_sha256 === registry.registry_sha256, "assessor_trust_root:registry_sha_mismatch");
  assertString(input.assessor_registry_path, "assessor_trust_root.assessor_registry_path");
  assert(
    normalizedPath(input.assessor_registry_path) === normalizedPath(fs.realpathSync.native(registryPath)),
    "assessor_trust_root:registry_path_mismatch",
  );
  assert(input.approved_at === registry.registry.approved_at, "assessor_trust_root:approved_at_mismatch");
  assert(input.expires_at === registry.registry.expires_at, "assessor_trust_root:expires_at_mismatch");
  const frozenAt = Date.parse(assertIsoDate(input.frozen_at, "assessor_trust_root.frozen_at"));
  assert(
    frozenAt >= registry.approved_at_ms && frozenAt <= registry.expires_at_ms,
    "assessor_trust_root:freeze_outside_approval_window",
  );
  assert(frozenAt >= Date.parse(context.builtAt), "assessor_trust_root:freeze_predates_candidate");
  assert(input.immutable === true, "assessor_trust_root:immutable_record_required");
  return {
    record: input,
    record_artifact: artifactRecord(trustRootPath),
    canonical_path: normalizedPath(trustRootPath),
    frozen_at_ms: frozenAt,
  };
}

function validateAssessorEnvelope(input, envelopePath, context, bundleSha, registry, trustRoot) {
  assertExactKeys(
    input,
    [
      "schema",
      "report_type",
      "candidate_id",
      "source_epoch",
      "assessed_bundle_sha256",
      "assessor_id",
      "assessor_registry_id",
      "assessor_registry_sha256",
      "assessor_role",
      "independence_attested",
      "advisory_model_only",
      "assessed_at",
      "scores",
      "agy_axes",
      "evidence_files",
      "signature",
    ],
    "assessor_envelope",
  );
  assert(input.schema === "donggri-independent-assessment/v1", "assessor_envelope:invalid_schema");
  assert(input.report_type === "independent_assessment", "assessor_envelope:invalid_report_type");
  assert(input.candidate_id === context.candidateId, "assessor_envelope:candidate_mismatch");
  assert(input.source_epoch === context.sourceEpoch, "assessor_envelope:source_epoch_mismatch");
  assert(input.assessed_bundle_sha256 === bundleSha, "assessor_envelope:bundle_sha_mismatch");
  assert(ASSESSOR_ID_PATTERN.test(input.assessor_id ?? ""), "assessor_envelope:invalid_assessor_id");
  assert(
    !/(?:^|[-_.:])(agy|claude|gemini|opus|sonnet|haiku|flash)(?:$|[-_.:])/i.test(input.assessor_id),
    "assessor_envelope:advisory_tool_identity_not_independent_assessor",
  );
  assert(input.assessor_registry_id === registry.registry.registry_id, "assessor_envelope:registry_id_mismatch");
  assert(input.assessor_registry_sha256 === registry.registry_sha256, "assessor_envelope:registry_sha_mismatch");
  const registeredAssessor = registry.assessorsById.get(input.assessor_id);
  assert(registeredAssessor, "assessor_envelope:unknown_assessor");
  assert(input.assessor_role === "independent_assessor", "assessor_envelope:independent_role_required");
  assert(input.independence_attested === true, "assessor_envelope:independence_attestation_required");
  assert(input.advisory_model_only === false, "assessor_envelope:advisory_model_not_independent");
  const assessedAt = Date.parse(assertIsoDate(input.assessed_at, "assessor_envelope.assessed_at"));
  assert(
    assessedAt >= registry.approved_at_ms && assessedAt <= registry.expires_at_ms,
    "assessor_envelope:outside_registry_approval_window",
  );
  assert(assessedAt >= trustRoot.frozen_at_ms, "assessor_envelope:assessed_before_trust_root_freeze");
  assertExactKeys(input.scores, ["design", "implementation", "aggregate"], "assessor_envelope.scores");
  for (const [name, value] of Object.entries(input.scores)) {
    assertNumber(value, `assessor_envelope.scores.${name}`);
    assert(value >= 0 && value <= 100, `assessor_envelope.scores.${name}:out_of_range`);
  }
  assertExactKeys(
    input.agy_axes,
    ["system", "functionality", "design", "stability", "implementation"],
    "assessor_envelope.agy_axes",
  );
  for (const [name, value] of Object.entries(input.agy_axes)) {
    assertNumber(value, `assessor_envelope.agy_axes.${name}`);
    assert(value >= 0 && value <= 1000, `assessor_envelope.agy_axes.${name}:out_of_range`);
  }
  assert(Array.isArray(input.evidence_files), "assessor_envelope:evidence_files_required");
  assert(input.evidence_files.length > 0, "assessor_envelope:evidence_files_empty");
  const evidenceFiles = input.evidence_files.map((item) => validateEvidenceFile(item, envelopePath, context.inputRoot));
  assertExactKeys(
    input.signature,
    ["algorithm", "key_id", "payload_sha256", "value_base64"],
    "assessor_envelope.signature",
  );
  assert(
    input.signature.algorithm === ASSESSOR_SIGNATURE_ALGORITHM,
    "assessor_envelope.signature:unsupported_algorithm",
  );
  assert(input.signature.key_id === registeredAssessor.key_id, "assessor_envelope.signature:key_id_mismatch");
  assert(SHA256_PATTERN.test(input.signature.payload_sha256), "assessor_envelope.signature:invalid_payload_sha256");
  const unsignedEnvelope = { ...input };
  delete unsignedEnvelope.signature;
  const payload = canonicalBuffer(unsignedEnvelope);
  assert(hashBuffer(payload) === input.signature.payload_sha256, "assessor_envelope.signature:payload_sha256_mismatch");
  const signature = decodeCanonicalBase64(input.signature.value_base64, "assessor_envelope.signature.value_base64");
  assert(signature.length === 64, "assessor_envelope.signature:invalid_signature_length");
  assert(
    crypto.verify(null, payload, registeredAssessor.publicKey, signature),
    "assessor_envelope.signature:invalid_signature",
  );
  const scoresPass =
    input.scores.design >= 98 &&
    input.scores.implementation >= 97 &&
    input.scores.aggregate >= 97.45 &&
    Object.values(input.agy_axes).every((score) => score >= 950);
  return {
    envelope: input,
    envelope_artifact: artifactRecord(envelopePath, context.inputRoot),
    evidence_files: evidenceFiles,
    assessor_registry_sha256: registry.registry_sha256,
    acceptable: scoresPass,
  };
}

function validateAssessorSheet(input, sheetPath, context, envelopeArtifacts) {
  const validated = validateComponentReport(input, sheetPath, context, ASSESSOR_SHEET_COMPONENT_ID);
  assert(validated.report.evidence_mode === "actual", "assessor_sheet:actual_evidence_required");
  assert(validated.report.component_status === "pass", "assessor_sheet:pass_required");
  const actualRefs = validated.report.evidence_files.map((item) => `${item.sha256}:${item.bytes}`).sort();
  const expectedRefs = envelopeArtifacts.map((item) => `${item.sha256}:${item.bytes}`).sort();
  assert(
    JSON.stringify(actualRefs) === JSON.stringify(expectedRefs),
    "assessor_sheet:must_reference_exactly_two_envelopes",
  );
  return validated;
}

function safeReadValidation(filePath, validator, blockers, blockerPrefix) {
  if (!fs.existsSync(filePath)) {
    blockers.push(`${blockerPrefix}:missing`);
    return null;
  }
  try {
    return validator(readJson(filePath));
  } catch (error) {
    blockers.push(`${blockerPrefix}:${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function buildAssessmentReadyManifest(context, originals, delivery, elapsed, registry, trustRoot, generatedAt) {
  const unsigned = {
    schema: "donggri-assessment-ready-manifest/v1",
    report_type: "assessment_ready_manifest",
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: generatedAt,
    evidence_mode: "actual",
    manifest_status: "pass",
    certification_claimed: false,
    original_input_count: 15,
    original_inputs: ORIGINAL_COMPONENT_IDS.map((component) => ({
      component,
      ...originals.get(component).report_artifact,
    })),
    delivery_prerequisite: {
      component: DELIVERY_COMPONENT_ID,
      ...delivery.report_artifact,
    },
    elapsed_prerequisites: {
      ...elapsed.report_artifact,
      soak_evidence_sha256: elapsed.soak_evidence.sha256,
      pilot_evidence_sha256: elapsed.pilot_evidence.sha256,
    },
    assessor_registry: {
      registry_id: registry.registry.registry_id,
      approval_id: registry.registry.approval_id,
      approved_at: registry.registry.approved_at,
      expires_at: registry.registry.expires_at,
      ...registry.registry_artifact,
    },
    assessor_trust_root: {
      record_id: trustRoot.record.record_id,
      authority: trustRoot.record.authority,
      approval_id: trustRoot.record.approval_id,
      frozen_at: trustRoot.record.frozen_at,
      canonical_path: trustRoot.canonical_path,
      ...trustRoot.record_artifact,
    },
  };
  return {
    ...unsigned,
    bundle_sha256: hashCanonical(unsigned),
  };
}

function buildFinalPackManifest(context, readyManifestPath, readyManifest, originals, sheet, envelopes, generatedAt) {
  const originalItems = [
    ...ORIGINAL_COMPONENT_IDS.map((component) => ({
      component,
      ...originals.get(component).report_artifact,
    })),
    {
      component: ASSESSOR_SHEET_COMPONENT_ID,
      ...sheet.report_artifact,
    },
  ];
  const unsigned = {
    schema: "donggri-final-evidence-pack/v1",
    report_type: "final_evidence_pack",
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: generatedAt,
    evidence_mode: "actual",
    pack_status: "pass",
    certification_claimed: false,
    assessment_ready_manifest: {
      ...artifactRecord(readyManifestPath, context.outputRoot),
      bundle_sha256: readyManifest.bundle_sha256,
    },
    original_item_count: 16,
    original_items: originalItems,
    assessor_envelopes: envelopes.map((item) => ({
      assessor_id: item.envelope.assessor_id,
      assessed_bundle_sha256: item.envelope.assessed_bundle_sha256,
      assessor_registry_sha256: item.envelope.assessor_registry_sha256,
      ...item.envelope_artifact,
    })),
    assessor_registry: readyManifest.assessor_registry,
    assessor_trust_root: readyManifest.assessor_trust_root,
    delivery_prerequisite: readyManifest.delivery_prerequisite,
    elapsed_prerequisites: readyManifest.elapsed_prerequisites,
    certification_decision_required: true,
  };
  return {
    ...unsigned,
    final_evidence_pack_sha256: hashCanonical(unsigned),
  };
}

function latestIso(values, fallback) {
  const parsed = values
    .filter((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)))
    .map((value) => Date.parse(value));
  return new Date(parsed.length > 0 ? Math.max(...parsed) : Date.parse(fallback)).toISOString();
}

export function buildEvidencePipeline(context) {
  const blockers = [];
  const originals = new Map();
  const componentDir = path.join(context.inputRoot, "component-reports");
  const discoveredComponents = listJsonFiles(componentDir);
  const expectedComponentPaths = new Set(
    ORIGINAL_COMPONENT_IDS.map((component) => path.resolve(componentDir, `${component}.json`).toLowerCase()),
  );
  for (const discovered of discoveredComponents) {
    if (!expectedComponentPaths.has(path.resolve(discovered).toLowerCase())) {
      blockers.push(`component_report:unexpected:${path.basename(discovered)}`);
    }
  }
  for (const component of ORIGINAL_COMPONENT_IDS) {
    const reportPath = path.join(componentDir, `${component}.json`);
    const validated = safeReadValidation(
      reportPath,
      (input) => validateComponentReport(input, reportPath, context, component),
      blockers,
      `component_report:${component}`,
    );
    if (!validated) continue;
    originals.set(component, validated);
    if (!validated.acceptable) {
      blockers.push(
        `component_report:${component}:requires_actual_pass:mode=${validated.report.evidence_mode}:status=${validated.report.component_status}`,
      );
    }
  }

  const deliveryPath = path.join(context.inputRoot, "prerequisites", `${DELIVERY_COMPONENT_ID}.json`);
  const delivery = safeReadValidation(
    deliveryPath,
    (input) => validateComponentReport(input, deliveryPath, context, DELIVERY_COMPONENT_ID),
    blockers,
    "delivery_prerequisite",
  );
  if (delivery && !delivery.acceptable) {
    blockers.push(
      `delivery_prerequisite:requires_actual_pass:mode=${delivery.report.evidence_mode}:status=${delivery.report.component_status}`,
    );
  }

  const elapsedPath = path.join(context.inputRoot, "prerequisites", "elapsed-prerequisites.json");
  const elapsed = safeReadValidation(
    elapsedPath,
    (input) => validateElapsedPrerequisites(input, elapsedPath, context),
    blockers,
    "elapsed_prerequisites",
  );
  if (elapsed && !elapsed.acceptable) {
    for (const [gate, passed] of Object.entries(elapsed.gates)) {
      if (!passed) blockers.push(`elapsed_prerequisites:${gate}:failed`);
    }
  }

  const registryPath = path.resolve(context.assessorRegistryPath ?? DEFAULT_ASSESSOR_REGISTRY_PATH);
  const registry = safeReadValidation(
    registryPath,
    (input) => validateAssessorRegistry(input, registryPath, context),
    blockers,
    "assessor_registry",
  );
  let trustRootPath = null;
  if (typeof context.assessorTrustRootPath !== "string" || !context.assessorTrustRootPath.trim()) {
    blockers.push("assessor_trust_root:absolute_path_required");
  } else {
    try {
      trustRootPath = resolveExternalAssessorTrustRootPath(
        context.assessorTrustRootPath,
        context.assessorTrustRootAuthorityRoot ?? DEFAULT_ASSESSOR_TRUST_ROOT_AUTHORITY,
      );
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }
  const trustRoot =
    registry && trustRootPath
      ? safeReadValidation(
          trustRootPath,
          (input) => validateAssessorTrustRoot(input, trustRootPath, registryPath, context, registry),
          blockers,
          "assessor_trust_root",
        )
      : null;

  const generatedAt = latestIso(
    [
      ...[...originals.values()].map((item) => item.report.generated_at),
      delivery?.report.generated_at,
      elapsed?.report.generated_at,
    ],
    context.builtAt,
  );
  const readyEligible =
    blockers.length === 0 &&
    originals.size === ORIGINAL_COMPONENT_IDS.length &&
    Boolean(delivery?.acceptable) &&
    Boolean(elapsed?.acceptable) &&
    Boolean(registry) &&
    Boolean(trustRoot);
  const assessmentReady = readyEligible
    ? buildAssessmentReadyManifest(context, originals, delivery, elapsed, registry, trustRoot, generatedAt)
    : null;

  const assessmentDir = path.join(context.inputRoot, "assessments");
  const sheetPath = path.join(assessmentDir, "INDEPENDENT_ASSESSOR_SHEET.json");
  const envelopePaths = listJsonFiles(assessmentDir).filter(
    (filePath) => path.resolve(filePath).toLowerCase() !== path.resolve(sheetPath).toLowerCase(),
  );
  let envelopes = [];
  let sheet = null;
  let scoreDeltas = null;
  if (assessmentReady) {
    if (envelopePaths.length !== 2) {
      blockers.push(`assessor_envelopes:exactly_two_required:found=${envelopePaths.length}`);
    } else {
      envelopes = envelopePaths
        .map((envelopePath, index) =>
          safeReadValidation(
            envelopePath,
            (input) =>
              validateAssessorEnvelope(
                input,
                envelopePath,
                context,
                assessmentReady.bundle_sha256,
                registry,
                trustRoot,
              ),
            blockers,
            `assessor_envelope:${index + 1}`,
          ),
        )
        .filter(Boolean);
      if (envelopes.length === 2) {
        const assessorIds = envelopes.map((item) => item.envelope.assessor_id);
        if (new Set(assessorIds).size !== 2) blockers.push("assessor_envelopes:assessors_must_be_distinct");
        for (const envelope of envelopes) {
          if (!envelope.acceptable) {
            blockers.push(`assessor_envelope:${envelope.envelope.assessor_id}:score_threshold_failed`);
          }
        }
        scoreDeltas = Object.fromEntries(
          ["design", "implementation", "aggregate"].map((name) => [
            name,
            Math.abs(envelopes[0].envelope.scores[name] - envelopes[1].envelope.scores[name]),
          ]),
        );
        for (const [name, delta] of Object.entries(scoreDeltas)) {
          if (delta > 2) blockers.push(`assessor_envelopes:${name}_score_delta_exceeds_2`);
        }
        sheet = safeReadValidation(
          sheetPath,
          (input) =>
            validateAssessorSheet(
              input,
              sheetPath,
              context,
              envelopes.map((item) => item.envelope_artifact),
            ),
          blockers,
          "assessor_sheet",
        );
      }
    }
  } else if (envelopePaths.length > 0 || fs.existsSync(sheetPath)) {
    blockers.push("assessment_inputs:assessment_ready_manifest_not_eligible");
  }

  const finalEligible =
    Boolean(assessmentReady) &&
    Boolean(registry) &&
    Boolean(trustRoot) &&
    envelopes.length === 2 &&
    envelopes.every((item) => item.acceptable) &&
    new Set(envelopes.map((item) => item.envelope.assessor_id)).size === 2 &&
    scoreDeltas &&
    Object.values(scoreDeltas).every((delta) => delta <= 2) &&
    Boolean(sheet?.acceptable) &&
    !blockers.some((blocker) => blocker.startsWith("assessor_") || blocker.startsWith("assessment_inputs:"));

  const finalGeneratedAt = latestIso(
    [generatedAt, ...envelopes.map((item) => item.envelope.assessed_at), sheet?.report.generated_at],
    generatedAt,
  );
  const status = {
    schema: "donggri-evidence-pack-status/v1",
    report_type: "evidence_pack_status",
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: finalGeneratedAt,
    pipeline_status: finalEligible
      ? "ready_for_decision"
      : assessmentReady
        ? "ready_for_independent_assessment"
        : "collecting",
    certification_claimed: false,
    evidence_modes_observed: [
      ...new Set(
        [
          ...[...originals.values()].map((item) => item.report.evidence_mode),
          delivery?.report.evidence_mode,
          elapsed?.report.evidence_mode,
          sheet?.report.evidence_mode,
        ].filter(Boolean),
      ),
    ].sort(),
    counts: {
      assessment_originals_required: 15,
      assessment_originals_actual_pass: [...originals.values()].filter((item) => item.acceptable).length,
      final_originals_required: 16,
      final_originals_actual_pass:
        [...originals.values()].filter((item) => item.acceptable).length + (sheet?.acceptable ? 1 : 0),
      independent_assessors_required: 2,
      independent_assessors_accepted: envelopes.filter((item) => item.acceptable).length,
    },
    assessment_ready_bundle_sha256: assessmentReady?.bundle_sha256 ?? null,
    final_evidence_pack_sha256: null,
    blockers: [...new Set(blockers)].sort((left, right) => left.localeCompare(right, "en")),
    historical_evidence_credited: false,
    certification_decision_generated: false,
  };
  return {
    status,
    originals,
    delivery,
    elapsed,
    registry,
    trustRoot,
    assessmentReady,
    envelopes,
    sheet,
    scoreDeltas,
    finalEligible: Boolean(finalEligible),
  };
}

function materializePipeline(context, pipeline) {
  fs.mkdirSync(context.outputRoot, { recursive: true });
  const readyPath = path.join(context.outputRoot, OUTPUT_NAMES.assessmentReady);
  const finalPath = path.join(context.outputRoot, OUTPUT_NAMES.finalPack);
  if (!pipeline.assessmentReady && fs.existsSync(readyPath)) {
    throw new Error("stale_assessment_ready_manifest_requires_quarantine");
  }
  if (!pipeline.finalEligible && fs.existsSync(finalPath)) {
    throw new Error("stale_final_evidence_pack_requires_quarantine");
  }
  if (fs.existsSync(path.join(context.outputRoot, OUTPUT_NAMES.decision)) && !pipeline.finalEligible) {
    throw new Error("certification_decision_present_without_eligible_final_pack");
  }

  let finalPack = null;
  if (pipeline.assessmentReady) {
    fs.writeFileSync(readyPath, stableJson(pipeline.assessmentReady), "utf8");
  }
  if (pipeline.finalEligible) {
    finalPack = buildFinalPackManifest(
      context,
      readyPath,
      pipeline.assessmentReady,
      pipeline.originals,
      pipeline.sheet,
      pipeline.envelopes,
      pipeline.status.generated_at,
    );
    fs.writeFileSync(finalPath, stableJson(finalPack), "utf8");
  }
  const status = {
    ...pipeline.status,
    final_evidence_pack_sha256: finalPack?.final_evidence_pack_sha256 ?? null,
  };
  fs.writeFileSync(path.join(context.outputRoot, OUTPUT_NAMES.status), stableJson(status), "utf8");
  return { status, assessmentReady: pipeline.assessmentReady, finalPack };
}

function validateSeparateDecision(context, finalPack, assessorIds) {
  const decisionPath = path.join(context.outputRoot, OUTPUT_NAMES.decision);
  if (!fs.existsSync(decisionPath)) return null;
  assert(finalPack, "certification_decision_present_without_final_pack");
  const decision = readJson(decisionPath);
  assertExactKeys(
    decision,
    [
      "schema",
      "report_type",
      "candidate_id",
      "source_epoch",
      "decided_at",
      "decision",
      "certification_claimed",
      "final_evidence_pack_sha256",
      "final_evidence_item_count",
      "assessor_ids",
      "hard_gates",
      "unresolved_critical",
      "unresolved_sev1",
      "decision_reasons",
    ],
    "certification_decision",
  );
  assert(decision.schema === "donggri-certification-decision/v1", "certification_decision:invalid_schema");
  assert(decision.report_type === "certification_decision", "certification_decision:invalid_report_type");
  assert(decision.candidate_id === context.candidateId, "certification_decision:candidate_mismatch");
  assert(decision.source_epoch === context.sourceEpoch, "certification_decision:source_epoch_mismatch");
  assertIsoDate(decision.decided_at, "certification_decision.decided_at");
  assert(["PASS", "FAIL"].includes(decision.decision), "certification_decision:invalid_decision");
  assert(
    decision.final_evidence_pack_sha256 === finalPack.final_evidence_pack_sha256,
    "certification_decision:final_pack_sha_mismatch",
  );
  assert(decision.final_evidence_item_count === 16, "certification_decision:item_count_mismatch");
  assert(
    Array.isArray(decision.assessor_ids) && decision.assessor_ids.length === 2,
    "certification_decision:assessors",
  );
  assert(new Set(decision.assessor_ids).size === 2, "certification_decision:assessors_must_be_distinct");
  assert(
    JSON.stringify([...decision.assessor_ids].sort()) === JSON.stringify([...assessorIds].sort()),
    "certification_decision:assessor_ids_mismatch",
  );
  assertExactKeys(decision.hard_gates, ["passed", "total"], "certification_decision.hard_gates");
  const mayClaim =
    decision.decision === "PASS" &&
    decision.hard_gates.passed === 10 &&
    decision.hard_gates.total === 10 &&
    decision.unresolved_critical === 0 &&
    decision.unresolved_sev1 === 0;
  assert(decision.certification_claimed === mayClaim, "certification_decision:claim_mismatch");
  assert(
    Array.isArray(decision.decision_reasons) &&
      decision.decision_reasons.length > 0 &&
      decision.decision_reasons.every((reason) => typeof reason === "string" && reason.trim().length > 0),
    "certification_decision:reasons",
  );
  return decision;
}

function checkNoUnauthorizedCertificationClaims(context) {
  if (!fs.existsSync(context.outputRoot)) return;
  for (const filePath of listJsonFiles(context.outputRoot)) {
    const value = readJson(filePath);
    if (path.basename(filePath) === OUTPUT_NAMES.decision) continue;
    assert(value.certification_claimed !== true, `certification_claim_forbidden:${path.basename(filePath)}`);
  }
}

function checkOutputs(context, pipeline) {
  const statusPath = path.join(context.outputRoot, OUTPUT_NAMES.status);
  assert(fs.existsSync(statusPath), `generated_output_missing:${statusPath}`);
  const expectedStatus = {
    ...pipeline.status,
    final_evidence_pack_sha256: null,
  };
  const readyPath = path.join(context.outputRoot, OUTPUT_NAMES.assessmentReady);
  const finalPath = path.join(context.outputRoot, OUTPUT_NAMES.finalPack);
  let expectedFinal = null;
  if (pipeline.assessmentReady) {
    assert(fs.existsSync(readyPath), `generated_output_missing:${readyPath}`);
    assert(
      fs.readFileSync(readyPath, "utf8") === stableJson(pipeline.assessmentReady),
      "assessment_ready_manifest_drift",
    );
  } else {
    assert(!fs.existsSync(readyPath), "ineligible_assessment_ready_manifest_present");
  }
  if (pipeline.finalEligible) {
    assert(fs.existsSync(finalPath), `generated_output_missing:${finalPath}`);
    expectedFinal = buildFinalPackManifest(
      context,
      readyPath,
      pipeline.assessmentReady,
      pipeline.originals,
      pipeline.sheet,
      pipeline.envelopes,
      pipeline.status.generated_at,
    );
    assert(fs.readFileSync(finalPath, "utf8") === stableJson(expectedFinal), "final_evidence_pack_drift");
    expectedStatus.final_evidence_pack_sha256 = expectedFinal.final_evidence_pack_sha256;
  } else {
    assert(!fs.existsSync(finalPath), "ineligible_final_evidence_pack_present");
  }
  assert(fs.readFileSync(statusPath, "utf8") === stableJson(expectedStatus), "evidence_pack_status_drift");
  checkNoUnauthorizedCertificationClaims(context);
  validateSeparateDecision(
    context,
    expectedFinal,
    pipeline.envelopes.map((item) => item.envelope.assessor_id),
  );
  return { status: expectedStatus, finalPack: expectedFinal };
}

function loadCandidateContext(overrides = {}) {
  const pkg = readJson(path.join(repoRoot, "package.json"));
  const release = pkg.donggriRelease ?? {};
  const candidateId = overrides.candidateId ?? process.env.DONGGRI_V1_CANDIDATE_ID ?? release.candidateId;
  const sourceEpoch = overrides.sourceEpoch ?? process.env.DONGGRI_V1_SOURCE_EPOCH ?? release.sourceEpoch;
  const builtAt = overrides.builtAt ?? release.builtAt ?? new Date(0).toISOString();
  assert(CANDIDATE_ID_PATTERN.test(candidateId ?? ""), "candidate_id_missing_or_invalid");
  assert(SOURCE_EPOCH_PATTERN.test(sourceEpoch ?? ""), "source_epoch_missing_or_invalid");
  assertIsoDate(builtAt, "candidate.built_at");
  const candidateRoot = path.join(
    controlRoot,
    "storage",
    "codex-control",
    "quality",
    "dongri-grigri-v1",
    "candidates",
    candidateId,
  );
  return {
    candidateId,
    sourceEpoch,
    builtAt,
    inputRoot: path.resolve(
      overrides.inputRoot ?? process.env.DONGGRI_V1_EVIDENCE_INPUT_ROOT ?? path.join(candidateRoot, "inputs"),
    ),
    outputRoot: path.resolve(
      overrides.outputRoot ?? process.env.DONGGRI_V1_EVIDENCE_OUTPUT_ROOT ?? path.join(candidateRoot, "evidence-pack"),
    ),
    assessorRegistryPath: path.resolve(
      overrides.assessorRegistryPath ?? process.env.DONGGRI_V1_ASSESSOR_REGISTRY_PATH ?? DEFAULT_ASSESSOR_REGISTRY_PATH,
    ),
    assessorTrustRootPath: overrides.assessorTrustRootPath ?? process.env.DONGGRI_V1_ASSESSOR_TRUST_ROOT_PATH ?? null,
    assessorTrustRootAuthorityRoot: DEFAULT_ASSESSOR_TRUST_ROOT_AUTHORITY,
  };
}

function parseArgs(argv) {
  const modes = new Set();
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--write", "--check", "--self-test"].includes(arg)) {
      modes.add(arg.slice(2));
      continue;
    }
    if (
      [
        "--input-root",
        "--output-root",
        "--candidate-id",
        "--source-epoch",
        "--assessor-registry",
        "--assessor-trust-root",
      ].includes(arg)
    ) {
      const value = argv[index + 1];
      assert(value && !value.startsWith("--"), `${arg}:value_required`);
      index += 1;
      const key = {
        "--input-root": "inputRoot",
        "--output-root": "outputRoot",
        "--candidate-id": "candidateId",
        "--source-epoch": "sourceEpoch",
        "--assessor-registry": "assessorRegistryPath",
        "--assessor-trust-root": "assessorTrustRootPath",
      }[arg];
      overrides[key] = value;
      continue;
    }
    throw new Error(`unknown_argument:${arg}`);
  }
  assert(modes.size > 0, "use --write, --check, or --self-test");
  return { modes, overrides };
}

function makeEvidenceRef(filePath, reportPath) {
  const artifact = artifactRecord(filePath);
  return {
    path: path.relative(path.dirname(reportPath), filePath).replaceAll("\\", "/"),
    sha256: artifact.sha256,
    bytes: artifact.bytes,
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(value), "utf8");
}

function writeAssessorRegistryFixture(registryPath, context, authorities) {
  writeJson(registryPath, {
    schema: "donggri-independent-assessor-registry/v1",
    registry_id: "dongri-grigri-v1-self-test-assessor-registry",
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    registry_status: "approved",
    approval_id: ASSESSOR_REGISTRY_APPROVAL_ID,
    approved_at: "2026-03-01T00:00:00.000Z",
    expires_at: "2026-04-01T00:00:00.000Z",
    immutable: true,
    assessors: authorities.map((authority) => ({
      assessor_id: authority.assessorId,
      key_id: authority.keyId,
      signature_algorithm: ASSESSOR_SIGNATURE_ALGORITHM,
      public_key_pem: authority.publicKey.export({ type: "spki", format: "pem" }),
      public_key_sha256: publicKeyFingerprint(authority.publicKey),
      status: "active",
    })),
  });
  fs.writeFileSync(
    assessorRegistrySidecarPath(registryPath),
    `${sha256File(registryPath)}  ${path.basename(registryPath)}\n`,
    "utf8",
  );
}

function writeAssessorTrustRootFixture(context) {
  const registry = readJson(context.assessorRegistryPath);
  writeJson(context.assessorTrustRootPath, {
    schema: "donggri-independent-assessor-trust-root/v1",
    record_id: "dongri-grigri-v1-self-test-assessor-trust-root",
    authority: "donggri-root-control-plane",
    approval_id: ASSESSOR_REGISTRY_APPROVAL_ID,
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    assessor_registry_id: registry.registry_id,
    assessor_registry_sha256: sha256File(context.assessorRegistryPath),
    assessor_registry_path: normalizedPath(fs.realpathSync.native(context.assessorRegistryPath)),
    approved_at: registry.approved_at,
    expires_at: registry.expires_at,
    frozen_at: "2026-03-02T00:00:00.000Z",
    immutable: true,
  });
}

function signAssessorEnvelope(unsignedEnvelope, authority) {
  const payload = canonicalBuffer(unsignedEnvelope);
  return {
    ...unsignedEnvelope,
    signature: {
      algorithm: ASSESSOR_SIGNATURE_ALGORITHM,
      key_id: authority.keyId,
      payload_sha256: hashBuffer(payload),
      value_base64: crypto.sign(null, payload, authority.privateKey).toString("base64"),
    },
  };
}

function createSelfTestFixture(root) {
  const candidateRoot = path.join(root, "candidate");
  const trustRootAuthority = path.join(root, "control-plane-authority");
  const context = {
    candidateId: "dongri-grigri-v1-self-test",
    sourceEpoch: `sha256:${"a".repeat(64)}`,
    builtAt: "2026-01-01T00:00:00.000Z",
    inputRoot: path.join(candidateRoot, "inputs"),
    outputRoot: path.join(candidateRoot, "outputs"),
    assessorRegistryPath: path.join(candidateRoot, "independent-assessor-registry.json"),
    assessorTrustRootPath: path.join(trustRootAuthority, "APR-V1-ASSESS-001.freeze.json"),
    assessorTrustRootAuthorityRoot: trustRootAuthority,
  };
  const authorities = ["assessor-a", "assessor-b"].map((assessorId) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    return {
      assessorId,
      keyId: `${assessorId}-ed25519-2026`,
      publicKey,
      privateKey,
    };
  });
  writeAssessorRegistryFixture(context.assessorRegistryPath, context, authorities);
  writeAssessorTrustRootFixture(context);
  const generatedAt = "2026-03-05T00:00:00.000Z";
  for (const component of ORIGINAL_COMPONENT_IDS) {
    const reportPath = path.join(context.inputRoot, "component-reports", `${component}.json`);
    const evidencePath = path.join(context.inputRoot, "raw", `${component}.txt`);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${component}\n`, "utf8");
    writeJson(reportPath, {
      schema: "donggri-component-report/v1",
      report_type: "component",
      component,
      candidate_id: context.candidateId,
      source_epoch: context.sourceEpoch,
      generated_at: generatedAt,
      evidence_mode: "actual",
      component_status: "pass",
      certification_claimed: false,
      evidence_files: [makeEvidenceRef(evidencePath, reportPath)],
      summary: `${component} actual evidence passed.`,
    });
  }
  const deliveryPath = path.join(context.inputRoot, "prerequisites", `${DELIVERY_COMPONENT_ID}.json`);
  const deliveryEvidence = path.join(context.inputRoot, "raw", "delivery.txt");
  fs.writeFileSync(deliveryEvidence, "delivery\n", "utf8");
  writeJson(deliveryPath, {
    schema: "donggri-component-report/v1",
    report_type: "component",
    component: DELIVERY_COMPONENT_ID,
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: generatedAt,
    evidence_mode: "actual",
    component_status: "pass",
    certification_claimed: false,
    evidence_files: [makeEvidenceRef(deliveryEvidence, deliveryPath)],
    summary: "Reproducible delivery and rollback rehearsal passed.",
  });
  const elapsedPath = path.join(context.inputRoot, "prerequisites", "elapsed-prerequisites.json");
  const soakEvidence = path.join(context.inputRoot, "raw", "soak.txt");
  const pilotEvidence = path.join(context.inputRoot, "raw", "pilot.txt");
  fs.writeFileSync(soakEvidence, "72-hour actual soak\n", "utf8");
  fs.writeFileSync(pilotEvidence, "30 credited day actual pilot with 500 runs\n", "utf8");
  writeJson(elapsedPath, {
    schema: "donggri-elapsed-prerequisites/v1",
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: generatedAt,
    evidence_mode: "actual",
    certification_claimed: false,
    soak_72h: {
      status: "pass",
      started_at: "2026-01-01T00:00:00.000Z",
      evaluated_at: "2026-01-04T00:00:00.000Z",
      observed_hours: 72,
      sample_interval_seconds: 60,
      recovery_rate: 0.99,
      critical_loss: 0,
      budget_exceeded_count: 0,
      evidence_file: makeEvidenceRef(soakEvidence, elapsedPath),
    },
    pilot_30d: {
      status: "pass",
      started_at: "2026-02-01T00:00:00.000Z",
      evaluated_at: "2026-03-03T00:00:00.000Z",
      credited_observation_days: 30,
      heartbeat_interval_seconds: 60,
      heartbeat_coverage: 0.99,
      maximum_heartbeat_gap_seconds: 180,
      production_like_run_count: 500,
      success_rate: 0.95,
      critical_run_count: 10,
      critical_success_rate: 1,
      project_ids: [...REQUIRED_PROJECTS],
      agent_version_change_observed: true,
      skill_version_change_observed: true,
      memory_version_change_observed: true,
      unresolved_critical: 0,
      unresolved_sev1: 0,
      evidence_file: makeEvidenceRef(pilotEvidence, elapsedPath),
    },
  });
  return { context, authorities };
}

function createAssessmentFixtures(context, readyManifest, authorities) {
  const assessmentDir = path.join(context.inputRoot, "assessments");
  const envelopePaths = [];
  const registrySha256 = sha256File(context.assessorRegistryPath);
  const registry = readJson(context.assessorRegistryPath);
  for (const [index, authority] of authorities.entries()) {
    const assessorId = authority.assessorId;
    const envelopePath = path.join(assessmentDir, `${assessorId}.json`);
    const evidencePath = path.join(context.inputRoot, "raw", `${assessorId}.txt`);
    fs.writeFileSync(evidencePath, `${assessorId} signed assessment\n`, "utf8");
    const unsignedEnvelope = {
      schema: "donggri-independent-assessment/v1",
      report_type: "independent_assessment",
      candidate_id: context.candidateId,
      source_epoch: context.sourceEpoch,
      assessed_bundle_sha256: readyManifest.bundle_sha256,
      assessor_id: assessorId,
      assessor_registry_id: registry.registry_id,
      assessor_registry_sha256: registrySha256,
      assessor_role: "independent_assessor",
      independence_attested: true,
      advisory_model_only: false,
      assessed_at: `2026-03-06T0${index}:00:00.000Z`,
      scores: {
        design: 98 + index,
        implementation: 97 + index,
        aggregate: 97.5 + index,
      },
      agy_axes: {
        system: 950 + index,
        functionality: 950 + index,
        design: 950 + index,
        stability: 950 + index,
        implementation: 950 + index,
      },
      evidence_files: [makeEvidenceRef(evidencePath, envelopePath)],
    };
    writeJson(envelopePath, signAssessorEnvelope(unsignedEnvelope, authority));
    envelopePaths.push(envelopePath);
  }
  const sheetPath = path.join(assessmentDir, "INDEPENDENT_ASSESSOR_SHEET.json");
  writeJson(sheetPath, {
    schema: "donggri-component-report/v1",
    report_type: "component",
    component: ASSESSOR_SHEET_COMPONENT_ID,
    candidate_id: context.candidateId,
    source_epoch: context.sourceEpoch,
    generated_at: "2026-03-06T02:00:00.000Z",
    evidence_mode: "actual",
    component_status: "pass",
    certification_claimed: false,
    evidence_files: envelopePaths.map((envelopePath) => makeEvidenceRef(envelopePath, sheetPath)),
    summary: "Two distinct independent assessors evaluated the identical frozen bundle.",
  });
  return envelopePaths;
}

export function runSelfTests() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v1-evidence-pack-self-test-"));
  try {
    const { context, authorities } = createSelfTestFixture(root);
    const authoritiesById = new Map(authorities.map((authority) => [authority.assessorId, authority]));
    const assessmentReadyPipeline = buildEvidencePipeline(context);
    assert(
      assessmentReadyPipeline.assessmentReady,
      `self_test:assessment_ready_manifest_expected:${assessmentReadyPipeline.status.blockers.join("|")}`,
    );
    assert(
      assessmentReadyPipeline.assessmentReady.original_input_count === 15,
      "self_test:assessment_ready_must_have_15_originals",
    );
    assert(
      assessmentReadyPipeline.assessmentReady.assessor_trust_root.sha256 === sha256File(context.assessorTrustRootPath),
      "self_test:assessment_ready_must_bind_external_trust_root",
    );
    assert(!assessmentReadyPipeline.finalEligible, "self_test:final_pack_must_wait_for_assessors");

    const relativeTrustRootPipeline = buildEvidencePipeline({
      ...context,
      assessorTrustRootPath: "APR-V1-ASSESS-001.freeze.json",
    });
    assert(
      relativeTrustRootPipeline.assessmentReady === null &&
        relativeTrustRootPipeline.status.blockers.includes("assessor_trust_root:absolute_path_required"),
      "self_test:relative_trust_root_must_fail_closed",
    );

    const originalTrustRoot = readJson(context.assessorTrustRootPath);
    fs.unlinkSync(context.assessorTrustRootPath);
    const missingTrustRootPipeline = buildEvidencePipeline(context);
    assert(
      missingTrustRootPipeline.assessmentReady === null &&
        missingTrustRootPipeline.status.blockers.includes("assessor_trust_root:file_missing"),
      "self_test:missing_external_trust_root_must_fail_closed",
    );
    writeJson(context.assessorTrustRootPath, originalTrustRoot);

    createAssessmentFixtures(context, assessmentReadyPipeline.assessmentReady, authorities);
    const validPipeline = buildEvidencePipeline(context);
    const calculatedUntamperedExpectation = validPipeline.finalEligible;
    assert(calculatedUntamperedExpectation, "self_test:valid_final_pipeline_expected");
    const written = materializePipeline(context, validPipeline);
    assert(written.finalPack.original_item_count === 16, "self_test:final_pack_must_have_16_originals");
    assert(written.finalPack.certification_claimed === false, "self_test:pack_must_not_claim_certification");
    assert(
      !fs.existsSync(path.join(context.outputRoot, OUTPUT_NAMES.decision)),
      "self_test:generator_must_not_create_decision",
    );
    checkOutputs(context, validPipeline);

    const tamperedEnvelopePath = path.join(context.inputRoot, "assessments", "assessor-b.json");
    const originalEnvelope = readJson(tamperedEnvelopePath);
    const originalUnsignedEnvelope = { ...originalEnvelope };
    delete originalUnsignedEnvelope.signature;
    writeJson(
      tamperedEnvelopePath,
      signAssessorEnvelope(
        {
          ...originalUnsignedEnvelope,
          assessed_bundle_sha256: "b".repeat(64),
        },
        authoritiesById.get("assessor-b"),
      ),
    );
    const mismatchedBundlePipeline = buildEvidencePipeline(context);
    const invertedComputedExpectation = !calculatedUntamperedExpectation;
    assert(
      mismatchedBundlePipeline.finalEligible === invertedComputedExpectation &&
        mismatchedBundlePipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_envelope:bundle_sha_mismatch"),
        ),
      "self_test:tampered_bundle_must_invert_computed_expectation",
    );
    writeJson(tamperedEnvelopePath, originalEnvelope);

    const invalidSignature = Buffer.from(originalEnvelope.signature.value_base64, "base64");
    invalidSignature[0] ^= 0xff;
    writeJson(tamperedEnvelopePath, {
      ...originalEnvelope,
      signature: {
        ...originalEnvelope.signature,
        value_base64: invalidSignature.toString("base64"),
      },
    });
    const invalidSignaturePipeline = buildEvidencePipeline(context);
    assert(
      invalidSignaturePipeline.finalEligible === invertedComputedExpectation &&
        invalidSignaturePipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_envelope.signature:invalid_signature"),
        ),
      "self_test:invalid_signature_must_fail_closed",
    );
    writeJson(tamperedEnvelopePath, originalEnvelope);

    writeJson(
      tamperedEnvelopePath,
      signAssessorEnvelope(
        {
          ...originalUnsignedEnvelope,
          assessor_id: "unknown-assessor",
        },
        authoritiesById.get("assessor-b"),
      ),
    );
    const unknownAssessorPipeline = buildEvidencePipeline(context);
    assert(
      unknownAssessorPipeline.finalEligible === invertedComputedExpectation &&
        unknownAssessorPipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_envelope:unknown_assessor"),
        ),
      "self_test:unknown_assessor_must_fail_closed",
    );
    writeJson(tamperedEnvelopePath, originalEnvelope);

    writeJson(
      tamperedEnvelopePath,
      signAssessorEnvelope(
        {
          ...originalUnsignedEnvelope,
          assessor_id: "assessor-a",
        },
        authoritiesById.get("assessor-a"),
      ),
    );
    const duplicateAssessorPipeline = buildEvidencePipeline(context);
    assert(
      duplicateAssessorPipeline.finalEligible === invertedComputedExpectation &&
        duplicateAssessorPipeline.status.blockers.includes("assessor_envelopes:assessors_must_be_distinct"),
      "self_test:duplicate_assessor_must_fail_closed",
    );
    writeJson(tamperedEnvelopePath, originalEnvelope);

    const originalRegistry = readJson(context.assessorRegistryPath);
    writeJson(context.assessorRegistryPath, {
      ...originalRegistry,
      assessors: originalRegistry.assessors.map((assessor, index) =>
        index === 0 ? { ...assessor, key_id: `${assessor.key_id}-rotated` } : assessor,
      ),
    });
    fs.writeFileSync(
      assessorRegistrySidecarPath(context.assessorRegistryPath),
      `${sha256File(context.assessorRegistryPath)}  ${path.basename(context.assessorRegistryPath)}\n`,
      "utf8",
    );
    const selfTrustedRegistryReplacementPipeline = buildEvidencePipeline(context);
    assert(
      selfTrustedRegistryReplacementPipeline.assessmentReady === null &&
        selfTrustedRegistryReplacementPipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_trust_root:registry_sha_mismatch"),
        ),
      "self_test:repo_registry_and_sidecar_replacement_must_fail_external_trust_root",
    );
    writeAssessorRegistryFixture(context.assessorRegistryPath, context, authorities);

    writeJson(context.assessorRegistryPath, {
      ...originalRegistry,
      registry_id: `${originalRegistry.registry_id}-tampered`,
    });
    const tamperedRegistryPipeline = buildEvidencePipeline(context);
    assert(
      tamperedRegistryPipeline.assessmentReady === null &&
        tamperedRegistryPipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_registry:digest_mismatch"),
        ),
      "self_test:tampered_registry_digest_must_fail_closed",
    );
    writeJson(context.assessorRegistryPath, originalRegistry);

    writeJson(context.assessorRegistryPath, {
      ...originalRegistry,
      registry_status: "pending_approval",
      approved_at: null,
      expires_at: null,
    });
    fs.writeFileSync(
      assessorRegistrySidecarPath(context.assessorRegistryPath),
      `${sha256File(context.assessorRegistryPath)}  ${path.basename(context.assessorRegistryPath)}\n`,
      "utf8",
    );
    const unapprovedRegistryPipeline = buildEvidencePipeline(context);
    assert(
      unapprovedRegistryPipeline.assessmentReady === null &&
        unapprovedRegistryPipeline.status.blockers.some((blocker) =>
          blocker.includes("assessor_registry:registry_status_not_approved"),
        ),
      "self_test:unapproved_registry_must_fail_closed",
    );
    writeAssessorRegistryFixture(context.assessorRegistryPath, context, authorities);

    writeJson(tamperedEnvelopePath, {
      ...originalEnvelope,
      assessor_id: "agy-pro",
    });
    const advisoryAssessorPipeline = buildEvidencePipeline(context);
    assert(
      advisoryAssessorPipeline.finalEligible === invertedComputedExpectation &&
        advisoryAssessorPipeline.status.blockers.some((blocker) =>
          blocker.includes("advisory_tool_identity_not_independent_assessor"),
        ),
      "self_test:agy_advisory_call_must_not_count_as_independent_assessor",
    );
    writeJson(tamperedEnvelopePath, originalEnvelope);

    const pilotPath = path.join(context.inputRoot, "prerequisites", "elapsed-prerequisites.json");
    const elapsed = readJson(pilotPath);
    fs.unlinkSync(pilotPath);
    const missingElapsedPipeline = buildEvidencePipeline(context);
    assert(
      missingElapsedPipeline.status.pipeline_status === "collecting" && missingElapsedPipeline.assessmentReady === null,
      "self_test:missing_elapsed_prerequisites_must_fail_closed",
    );
    writeJson(pilotPath, elapsed);

    writeJson(pilotPath, {
      ...elapsed,
      pilot_30d: {
        ...elapsed.pilot_30d,
        production_like_run_count: 111,
      },
    });
    const historicalPipeline = buildEvidencePipeline(context);
    assert(
      historicalPipeline.status.pipeline_status === "collecting",
      "self_test:historical_111_runs_must_not_be_credited",
    );
    assert(
      historicalPipeline.status.historical_evidence_credited === false,
      "self_test:historical_evidence_credit_must_remain_false",
    );
    writeJson(pilotPath, elapsed);

    const syntheticPath = path.join(context.inputRoot, "component-reports", `${ORIGINAL_COMPONENT_IDS[0]}.json`);
    const actualReport = readJson(syntheticPath);
    writeJson(syntheticPath, { ...actualReport, evidence_mode: "synthetic" });
    const syntheticPipeline = buildEvidencePipeline(context);
    assert(syntheticPipeline.status.pipeline_status === "collecting", "self_test:synthetic_component_must_not_qualify");
    assert(
      syntheticPipeline.status.evidence_modes_observed.includes("synthetic"),
      "self_test:synthetic_mode_must_be_visible",
    );

    const outsideEvidencePath = path.join(root, "outside-evidence.txt");
    fs.writeFileSync(outsideEvidencePath, "outside\n", "utf8");
    let absoluteEscapeRejected = false;
    try {
      resolveEvidencePath(syntheticPath, outsideEvidencePath, context.inputRoot);
    } catch (error) {
      absoluteEscapeRejected = error instanceof Error && error.message.includes("evidence_file:path_traversal");
    }
    assert(absoluteEscapeRejected, "self_test:absolute_evidence_escape_must_fail_closed");

    return {
      ok: true,
      assessment_original_count: assessmentReadyPipeline.assessmentReady.original_input_count,
      final_original_count: written.finalPack.original_item_count,
      valid_two_assessor_case_passed: true,
      unknown_assessor_rejected: true,
      duplicate_assessor_rejected: true,
      invalid_signature_rejected: true,
      mismatched_bundle_rejected: true,
      registry_digest_bound_to_bundle: true,
      external_trust_root_bound_to_bundle: true,
      external_trust_root_required: true,
      relative_trust_root_rejected: true,
      repo_registry_sidecar_self_trust_rejected: true,
      registry_digest_tamper_rejected: true,
      unapproved_registry_rejected: true,
      tamper_expectation_derived_by_inversion: true,
      advisory_model_counted_as_assessor: false,
      missing_elapsed_prerequisites_failed_closed: true,
      historical_111_runs_credited: false,
      synthetic_evidence_distinguished: true,
      absolute_evidence_escape_rejected: true,
      certification_decision_generated: false,
    };
  } finally {
    const resolved = path.resolve(root);
    const expectedParent = path.resolve(os.tmpdir());
    assert(
      path.dirname(resolved) === expectedParent &&
        path.basename(resolved).startsWith("donggri-v1-evidence-pack-self-test-"),
      "self_test_cleanup_boundary_invalid",
    );
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const { modes, overrides } = parseArgs(argv);
  const result = { ok: true, modes: [...modes].sort() };
  if (modes.has("self-test")) result.self_test = runSelfTests();
  if (modes.has("write") || modes.has("check")) {
    const context = loadCandidateContext(overrides);
    const pipeline = buildEvidencePipeline(context);
    if (modes.has("write")) result.write = materializePipeline(context, pipeline);
    if (modes.has("check")) result.check = checkOutputs(context, pipeline);
    result.pipeline_status = pipeline.status.pipeline_status;
    result.certification_claimed = false;
    result.input_root = context.inputRoot;
    result.output_root = context.outputRoot;
    result.blockers = pipeline.status.blockers;
  }
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath.toLowerCase() === path.resolve(scriptPath).toLowerCase()) {
  try {
    process.stdout.write(`${JSON.stringify(runCli())}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
