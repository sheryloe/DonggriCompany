import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateUxAudit, evaluateUxMeasurements, v01HistoricalUxAuditAuthority } from "./ux-audit-contract.mjs";
import { assertV01NewReportPath, verifyV01EvidenceArtifact } from "./v01-evidence-file.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const componentSchemas = Object.freeze({
  five_journey: "donggri-v01-five-journey-evidence/v1",
  owner_discovery: "donggri-v01-owner-discovery-evidence/v1",
  accessibility: "donggri-v01-accessibility-evidence/v1",
});
const recordGroups = Object.freeze({
  "S18-J01": "five_journey",
  "S18-G01": "five_journey",
  "S18-Q01": "owner_discovery",
  "S18-G02": "owner_discovery",
  "S18-Q05": "accessibility",
  "S18-G06": "accessibility",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2)}_value_required`);
  return value;
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

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJsonAsset(absolutePath, field) {
  assert(path.isAbsolute(absolutePath), `${field}_path_must_be_absolute`);
  const resolved = path.resolve(absolutePath);
  assert(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `${field}_file_missing`);
  const bytes = fs.readFileSync(resolved);
  return {
    absolute_path: resolved,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function currentCandidateBinding() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const candidateId = String(pkg.donggriRelease?.candidateId ?? "");
  const sourceEpoch = String(pkg.donggriRelease?.sourceEpoch ?? "").toLowerCase();
  const candidateSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  assert(/^dongri-grigri-v01(?:[-.][a-z0-9]+)*$/i.test(candidateId), "candidate_id_invalid");
  assert(/^[0-9a-f]{40}$/.test(candidateSha), "candidate_sha_invalid");
  assert(/^sha256:[0-9a-f]{64}$/.test(sourceEpoch), "source_epoch_invalid");
  return { candidate_id: candidateId, candidate_sha: candidateSha, source_epoch: sourceEpoch };
}

function requireCleanCandidate() {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert(status.length === 0, "ux_audit_candidate_worktree_dirty");
}

function validateComponent(name, asset, binding) {
  const component = asset.value;
  assert(component && typeof component === "object", `component_object_required:${name}`);
  assert(component.schema_version === componentSchemas[name], `component_schema_mismatch:${name}`);
  assert(component.release_label === "V01", `component_release_label_mismatch:${name}`);
  assert(
    component.component_status === "collecting" ||
      component.component_status === "pass" ||
      component.component_status === "fail",
    `component_status_invalid:${name}`,
  );
  assert(component.certification_claimed === false, `component_certification_claim_forbidden:${name}`);
  for (const field of ["candidate_id", "candidate_sha", "source_epoch"]) {
    assert(component[field] === binding[field], `component_binding_mismatch:${name}:${field}`);
  }
  assert(!Number.isNaN(Date.parse(component.generated_at)), `component_generated_at_invalid:${name}`);
  assert(component.measurement && typeof component.measurement === "object", `component_measurement_required:${name}`);
  return component.measurement;
}

function withCandidateEvidence(record, groupName, asset, groupBlockers) {
  const evidence = [
    ...new Set([
      ...(Array.isArray(record.evidence) ? record.evidence : []),
      `${asset.absolute_path}#sha256=${asset.sha256}`,
    ]),
  ];
  return {
    ...record,
    status: groupBlockers[groupName].length === 0 ? "proven" : "partial",
    evidence,
  };
}

export function buildV01UxAudit({ legacyAudit, legacyAuthority, components, binding, generatedAt }) {
  assert(legacyAudit?.schema_version === "master95_granular_completion_audit_v1", "legacy_audit_schema_invalid");
  assert(Array.isArray(legacyAudit.stages), "legacy_audit_stages_required");
  assert(
    String(legacyAuthority?.absolute_path ?? "").toLowerCase() ===
      v01HistoricalUxAuditAuthority.absolute_path.toLowerCase(),
    "legacy_audit_authority_path_mismatch",
  );
  assert(
    String(legacyAuthority?.sha256 ?? "").toLowerCase() === v01HistoricalUxAuditAuthority.sha256,
    "legacy_audit_authority_sha256_mismatch",
  );
  const componentNames = Object.keys(components).sort();
  assert(
    JSON.stringify(componentNames) === JSON.stringify(Object.keys(componentSchemas).sort()),
    "ux_component_set_invalid",
  );
  const measurements = Object.fromEntries(
    Object.entries(components).map(([name, component]) => [name, validateComponent(name, component, binding)]),
  );
  const groupBlockers = evaluateUxMeasurements(measurements);
  for (const name of componentNames) {
    const status = components[name].value.component_status;
    if (status === "pass" && groupBlockers[name].length > 0) {
      throw new Error(`component_status_measurement_mismatch:${name}`);
    }
    if (status !== "pass") groupBlockers[name].push(`component_status_not_pass:${name}`);
  }
  groupBlockers.blockers = [
    ...new Set([...groupBlockers.blockers, ...componentNames.flatMap((name) => groupBlockers[name])]),
  ].sort();
  const stages = legacyAudit.stages.map((stage) => {
    const update = (record) => {
      const groupName = recordGroups[record.id];
      return groupName ? withCandidateEvidence(record, groupName, components[groupName], groupBlockers) : record;
    };
    const criteria = stage.criteria.map(update);
    const completionGates = stage.completion_gates.map(update);
    const records = [...criteria, ...completionGates];
    return {
      ...stage,
      status: records.every((record) => record.status === "proven") ? "proven" : "partial",
      criteria,
      completion_gates: completionGates,
    };
  });
  const audit = {
    schema_version: "master95_granular_completion_audit_v2",
    release_label: "V01",
    component_status:
      groupBlockers.blockers.length === 0 && stages.every((stage) => stage.status === "proven") ? "pass" : "collecting",
    certification_claimed: false,
    historical_authority: { ...v01HistoricalUxAuditAuthority },
    candidate_binding: {
      ...binding,
      generated_at: generatedAt,
    },
    evidence_sources: Object.fromEntries(
      Object.entries(components).map(([name, asset]) => [
        name,
        {
          absolute_path: asset.absolute_path,
          sha256: asset.sha256,
          component_status: asset.value.component_status,
        },
      ]),
    ),
    measurements,
    stages,
  };
  evaluateUxAudit(audit, {
    requireCandidateBound: true,
    expectedCandidateId: binding.candidate_id,
    expectedCandidateSha: binding.candidate_sha,
    expectedSourceEpoch: binding.source_epoch,
  });
  return audit;
}

function writeOrCheck(outputPath, bytes, check) {
  const resolved = assertV01NewReportPath(outputPath, "ux_audit_output");
  const sidecar = `${resolved}.sha256`;
  const checksum = `${sha256(Buffer.from(bytes, "utf8"))}  ${path.basename(resolved)}\n`;
  if (check) {
    assert(fs.existsSync(resolved) && fs.readFileSync(resolved, "utf8") === bytes, "ux_audit_output_drift");
    assert(fs.existsSync(sidecar) && fs.readFileSync(sidecar, "utf8") === checksum, "ux_audit_sidecar_drift");
    return;
  }
  assert(!fs.existsSync(resolved) && !fs.existsSync(sidecar), "ux_audit_output_already_exists");
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, bytes, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(sidecar, checksum, { encoding: "utf8", flag: "wx" });
}

function main() {
  const required = ["--legacy-audit", "--five-journey", "--owner-study", "--accessibility", "--output"];
  const missingFlag = required.find((flag) => !process.argv.includes(flag));
  if (missingFlag) throw new Error(`missing_required_flag:${missingFlag}`);
  requireCleanCandidate();
  const binding = currentCandidateBinding();
  const legacyAsset = readJsonAsset(valueAfter("--legacy-audit"), "legacy_audit");
  const components = {
    five_journey: readJsonAsset(valueAfter("--five-journey"), "five_journey"),
    owner_discovery: readJsonAsset(valueAfter("--owner-study"), "owner_discovery"),
    accessibility: readJsonAsset(valueAfter("--accessibility"), "accessibility"),
  };
  for (const [name, component] of Object.entries(components)) {
    verifyV01EvidenceArtifact(component, `ux_component:${name}`);
  }
  const generatedAt = valueAfter("--generated-at") ?? new Date().toISOString();
  assert(!Number.isNaN(Date.parse(generatedAt)), "generated_at_invalid");
  const audit = buildV01UxAudit({
    legacyAudit: legacyAsset.value,
    legacyAuthority: {
      absolute_path: legacyAsset.absolute_path,
      sha256: legacyAsset.sha256,
    },
    components,
    binding,
    generatedAt,
  });
  const rawOutput = valueAfter("--output");
  assert(path.isAbsolute(rawOutput), "ux_audit_output_must_be_absolute");
  const output = rawOutput;
  const serialized = canonicalJson(audit);
  writeOrCheck(output, serialized, process.argv.includes("--check"));
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: process.argv.includes("--check") ? "check" : "write",
      output,
      candidate_id: binding.candidate_id,
      candidate_sha: binding.candidate_sha,
      source_epoch: binding.source_epoch,
      component_status: audit.component_status,
      audit_sha256: sha256(Buffer.from(serialized, "utf8")),
    })}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
