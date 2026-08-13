/* global URL, process */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APPROVAL_ID_PATTERN = /^APR-V0?1-[A-Z0-9-]+$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function normalized(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalized(left) === normalized(right);
}

function exactApprovalSection(ledger, approvalId) {
  assert(APPROVAL_ID_PATTERN.test(approvalId), "smoke_authority_approval_id_invalid");
  const escaped = approvalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...ledger.matchAll(new RegExp(`(?:^|\\r?\\n)(## ${escaped})[ \\t]*(?=\\r?\\n|$)`, "g"))];
  assert(matches.length > 0, "smoke_authority_approval_not_recorded");
  assert(matches.length === 1, "smoke_authority_approval_heading_duplicate");
  const start = matches[0].index + matches[0][0].length;
  const tail = ledger.slice(start);
  const nextHeading = tail.search(/\r?\n#{2,3}[ \t]+/);
  return nextHeading < 0 ? tail : tail.slice(0, nextHeading);
}

function field(section, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...section.matchAll(new RegExp("^- " + escaped + ":[ \\t]*`([^\\r\\n`]*)`[ \\t]*$", "gm"))];
  assert(matches.length === 1, `smoke_authority_${name}_field_invalid`);
  return matches[0][1];
}

function listField(section, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headings = [...section.matchAll(new RegExp("^- " + escaped + ":[ \\t]*$", "gm"))];
  assert(headings.length === 1, `smoke_authority_${name}_field_invalid`);
  const tail = section.slice(headings[0].index + headings[0][0].length);
  const nextField = tail.search(/\r?\n- [a-z0-9_]+:/);
  const body = nextField < 0 ? tail : tail.slice(0, nextField);
  const values = [...body.matchAll(/^[ ]{2}- `([^\r\n`]*)`[ \t]*$/gm)].map((match) => match[1]);
  assert(values.length > 0, `smoke_authority_${name}_list_invalid`);
  return values;
}

function textField(section, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...section.matchAll(new RegExp("^- " + escaped + ":[ \\t]*(\\S.*)[ \\t]*$", "gm"))];
  assert(matches.length === 1, `smoke_authority_${name}_field_invalid`);
  return matches[0][1];
}

function expiryEndExclusive(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) KST$/.exec(value);
  assert(match, "smoke_authority_expiry_invalid");
  const parsed = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`);
  assert(Number.isFinite(parsed), "smoke_authority_expiry_invalid");
  return parsed + 24 * 60 * 60 * 1000;
}

function requireExactArray(actual, expected, message) {
  assert(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    message,
  );
}

function requireCandidateIdentity(actual, expected, prefix) {
  assert(actual && typeof actual === "object" && !Array.isArray(actual), `${prefix}_missing`);
  assert(actual.candidate_id === expected.candidate_id, `${prefix}_candidate_id_mismatch`);
  assert(actual.git_sha === expected.git_sha, `${prefix}_git_sha_mismatch`);
  assert(actual.source_epoch === expected.source_epoch, `${prefix}_source_epoch_mismatch`);
}

function componentContract(manifest, component) {
  const command = manifest.evidence_commands?.[component];
  assert(Array.isArray(command), "smoke_authority_component_command_missing");
  const separator = command.indexOf("--");
  assert(separator === 4, "smoke_authority_component_command_prefix_invalid");
  const script =
    component === "five_journey"
      ? "master95:ux-audit:v01:five-journey"
      : "master95:ux-audit:v01:accessibility:automate";
  requireExactArray(
    command.slice(0, 4),
    ["corepack", "pnpm", "run", script],
    "smoke_authority_component_command_prefix_invalid",
  );
  return command.slice(separator + 1);
}

function commandValue(command, flag) {
  const indexes = command.flatMap((value, index) => (value === flag ? [index] : []));
  assert(indexes.length === 1, `smoke_authority_${flag.slice(2).replaceAll("-", "_")}_command_field_invalid`);
  const value = command[indexes[0] + 1];
  assert(
    value && !value.startsWith("--"),
    `smoke_authority_${flag.slice(2).replaceAll("-", "_")}_command_value_invalid`,
  );
  return value;
}

function validateManifestSafety(manifest) {
  assert(manifest.schema_version === "donggri-v01-alpha2-smoke-boundary/v1", "smoke_authority_manifest_schema_invalid");
  assert(
    typeof manifest.attempt_id === "string" && manifest.attempt_id.length > 0,
    "smoke_authority_attempt_id_invalid",
  );
  requireExactArray(manifest.network_boundary?.allowed_hosts, ["127.0.0.1"], "smoke_authority_allowed_hosts_invalid");
  assert(
    manifest.network_boundary?.external_network_effects_allowed === false,
    "smoke_authority_external_network_enabled",
  );
  for (const [fieldName, origin] of [
    ["api", manifest.network_boundary?.api_origin],
    ["web", manifest.network_boundary?.web_origin],
  ]) {
    const parsed = new URL(origin);
    assert(
      parsed.protocol === "http:" &&
        parsed.hostname === "127.0.0.1" &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === "/" &&
        !parsed.search &&
        !parsed.hash,
      `smoke_authority_${fieldName}_origin_invalid`,
    );
  }
  assert(
    Number.isInteger(manifest.process_boundary?.maximum_runtime_seconds) &&
      manifest.process_boundary.maximum_runtime_seconds > 0 &&
      manifest.process_boundary.maximum_runtime_seconds <= 900,
    "smoke_authority_maximum_runtime_invalid",
  );
  assert(
    manifest.process_boundary?.persistent_autostart_allowed === false,
    "smoke_authority_persistent_autostart_enabled",
  );
  assert(manifest.storage_boundary?.overwrite_allowed === false, "smoke_authority_overwrite_enabled");
  assert(manifest.storage_boundary?.cleanup_allowed === false, "smoke_authority_cleanup_enabled");
}

function validateFreezeRecord(freezeRecordPath, manifestCandidate, candidate, nowMs) {
  assert(path.isAbsolute(freezeRecordPath), "smoke_authority_freeze_record_path_invalid");
  const bytes = fs.readFileSync(freezeRecordPath);
  assert(sha256(bytes) === manifestCandidate.freeze_file_sha256, "smoke_authority_freeze_file_sha256_mismatch");
  const record = JSON.parse(bytes.toString("utf8"));
  const { freeze_record_sha256: actualFreezeSha, ...unsigned } = record;
  assert(SHA256_PATTERN.test(String(actualFreezeSha ?? "")), "smoke_authority_freeze_record_sha256_invalid");
  assert(canonicalSha256(unsigned) === actualFreezeSha, "smoke_authority_freeze_record_integrity_mismatch");
  assert(actualFreezeSha === manifestCandidate.freeze_record_sha256, "smoke_authority_freeze_record_mismatch");
  assert(
    record.source_epoch === `sha256:${record.selection_manifest_sha256}`,
    "smoke_authority_freeze_source_epoch_invalid",
  );
  assert(
    canonicalSha256(record.candidate_identity) === record.candidate_identity_sha256,
    "smoke_authority_freeze_candidate_identity_hash_mismatch",
  );
  requireCandidateIdentity(record.candidate_identity, candidate, "smoke_authority_freeze");
  const approvedAt = Date.parse(record.approved_at);
  const frozenAt = Date.parse(record.frozen_at);
  const expiresAt = Date.parse(record.approval_expires_at);
  assert(
    Number.isFinite(approvedAt) && Number.isFinite(frozenAt) && Number.isFinite(expiresAt),
    "smoke_authority_freeze_window_invalid",
  );
  assert(approvedAt <= frozenAt && frozenAt < expiresAt, "smoke_authority_freeze_window_invalid");
  assert(nowMs >= frozenAt, "smoke_authority_freeze_not_active");
  assert(nowMs < expiresAt, "smoke_authority_freeze_expired");
  return record;
}

export function validateV01SmokeAuthority(input) {
  assert(input && typeof input === "object", "smoke_authority_input_invalid");
  assert(["five_journey", "accessibility_automation"].includes(input.component), "smoke_authority_component_invalid");
  const nowMs = input.now instanceof Date ? input.now.getTime() : Number(input.now ?? Date.now());
  assert(Number.isFinite(nowMs), "smoke_authority_now_invalid");

  const ledger = fs.readFileSync(input.ledgerPath, "utf8");
  const section = exactApprovalSection(ledger, input.approvalId);
  assert(field(section, "approval_id") === input.approvalId, "smoke_authority_approval_id_mismatch");
  assert(field(section, "policy_decision") === "approved", "smoke_authority_approval_not_approved");
  assert(
    /^bounded-isolated-local-[a-z0-9.-]+-smoke-runtime$/.test(field(section, "operation_class")),
    "smoke_authority_operation_class_invalid",
  );
  assert(nowMs < expiryEndExclusive(field(section, "expires_at")), "smoke_authority_approval_expired");

  const manifestPath = field(section, "boundary_manifest");
  assert(path.isAbsolute(manifestPath), "smoke_authority_manifest_path_invalid");
  assert(samePath(input.manifestPath, manifestPath), "smoke_authority_manifest_path_mismatch");
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  assert(manifestSha256 === field(section, "boundary_manifest_sha256"), "smoke_authority_manifest_sha256_mismatch");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateManifestSafety(manifest);

  assert(manifest.approval_id === input.approvalId, "smoke_authority_manifest_approval_mismatch");
  assert(field(section, "attempt_id") === manifest.attempt_id, "smoke_authority_attempt_id_mismatch");
  assert(field(section, "candidate") === manifest.candidate?.candidate_id, "smoke_authority_ledger_candidate_mismatch");
  assert(field(section, "git_sha") === manifest.candidate?.git_sha, "smoke_authority_ledger_git_sha_mismatch");
  assert(
    field(section, "source_epoch") === manifest.candidate?.source_epoch,
    "smoke_authority_ledger_source_epoch_mismatch",
  );
  assert(
    field(section, "freeze_record_sha256") === manifest.candidate?.freeze_record_sha256,
    "smoke_authority_ledger_freeze_record_mismatch",
  );

  const candidate = {
    candidate_id: String(input.candidate?.candidate_id ?? ""),
    git_sha: String(input.candidate?.git_sha ?? "").toLowerCase(),
    source_epoch: String(input.candidate?.source_epoch ?? "").toLowerCase(),
  };
  assert(/^dongri-grigri-v01-[a-z0-9.-]+$/.test(candidate.candidate_id), "smoke_authority_candidate_id_invalid");
  assert(GIT_SHA_PATTERN.test(candidate.git_sha), "smoke_authority_candidate_git_sha_invalid");
  assert(SOURCE_EPOCH_PATTERN.test(candidate.source_epoch), "smoke_authority_candidate_source_epoch_invalid");
  assert(input.candidate?.clean === true, "smoke_authority_candidate_worktree_dirty");
  requireCandidateIdentity(manifest.candidate, candidate, "smoke_authority_manifest");
  assert(manifest.repo?.clean_required === true, "smoke_authority_manifest_clean_not_required");
  assert(samePath(input.candidate.worktree, manifest.repo?.worktree), "smoke_authority_candidate_worktree_mismatch");
  assert(manifest.repo?.expected_head === candidate.git_sha, "smoke_authority_repo_head_mismatch");

  const freezeRecord = validateFreezeRecord(input.freezeRecordPath, manifest.candidate, candidate, nowMs);
  assert(
    freezeRecord.freeze_record_sha256 === field(section, "freeze_record_sha256"),
    "smoke_authority_freeze_ledger_mismatch",
  );

  const expectedCommand = componentContract(manifest, input.component);
  requireExactArray(input.commandArgs, expectedCommand, "smoke_authority_component_command_mismatch");
  assert(commandValue(expectedCommand, "--approval") === input.approvalId, "smoke_authority_command_approval_mismatch");
  assert(
    samePath(commandValue(expectedCommand, "--manifest"), manifestPath),
    "smoke_authority_command_manifest_mismatch",
  );
  assert(
    samePath(commandValue(expectedCommand, "--freeze-record"), input.freezeRecordPath),
    "smoke_authority_command_freeze_record_mismatch",
  );

  const outputPath = commandValue(expectedCommand, "--output");
  assert(path.isAbsolute(outputPath), "smoke_authority_output_path_invalid");
  assert(
    samePath(path.dirname(outputPath), manifest.storage_boundary?.g_report_root),
    "smoke_authority_output_parent_mismatch",
  );
  const outputName = path.basename(outputPath);
  assert(manifest.storage_boundary?.g_new_outputs?.includes(outputName), "smoke_authority_output_name_not_allowed");
  assert(
    manifest.storage_boundary.g_new_outputs.includes(`${outputName}.sha256`),
    "smoke_authority_sidecar_name_not_allowed",
  );

  const runtimeFlag = input.component === "five_journey" ? "--runtime-root" : "--artifact-root";
  const runtimePath = commandValue(expectedCommand, runtimeFlag);
  assert(
    manifest.storage_boundary?.e_runtime_paths?.some((entry) => samePath(entry, runtimePath)),
    "smoke_authority_runtime_path_not_allowed",
  );
  if (input.component === "accessibility_automation") {
    assert(
      commandValue(expectedCommand, "--base-url") === manifest.network_boundary.web_origin,
      "smoke_authority_base_url_mismatch",
    );
  }

  const exactRuntimePaths = [
    ...manifest.storage_boundary.e_runtime_paths,
    manifest.storage_boundary.f_supervisor_log_root,
    manifest.storage_boundary.g_report_root,
  ];
  requireExactArray(
    listField(section, "exact_runtime_paths"),
    exactRuntimePaths,
    "smoke_authority_ledger_runtime_paths_mismatch",
  );
  const apiHost = new URL(manifest.network_boundary.api_origin).host;
  const webHost = new URL(manifest.network_boundary.web_origin).host;
  assert(
    textField(section, "loopback_ports") === `API \`${apiHost}\`; web \`${webHost}\``,
    "smoke_authority_ledger_loopback_ports_mismatch",
  );

  return Object.freeze({
    approval_id: input.approvalId,
    attempt_id: manifest.attempt_id,
    boundary_manifest_path: manifestPath,
    boundary_manifest_sha256: manifestSha256,
    candidate_id: candidate.candidate_id,
    git_sha: candidate.git_sha,
    source_epoch: candidate.source_epoch,
    freeze_record_sha256: freezeRecord.freeze_record_sha256,
    component: input.component,
    output_path: outputPath,
    runtime_path: runtimePath,
  });
}
