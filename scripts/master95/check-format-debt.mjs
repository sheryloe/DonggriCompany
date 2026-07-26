import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "../..");
const fingerprintPath = resolve(repoRoot, "scripts/master95/baselines/FORMAT_DEBT_FINGERPRINT.json");
const candidateBaselinePath = resolve(repoRoot, "contracts/v1/FORMAT_DEBT_BASELINE.json");

function fail(message) {
  process.stderr.write(`[format-debt] ${message}\n`);
  process.exit(1);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name.slice(2)}_required`);
  return value;
}

if (!existsSync(fingerprintPath)) fail("fingerprint_missing");

const fingerprint = JSON.parse(readFileSync(fingerprintPath, "utf8"));
const prettierCli = resolve(repoRoot, "node_modules/prettier/bin/prettier.cjs");
const result = spawnSync(process.execPath, [prettierCli, "--list-different", fingerprint.glob], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (result.status !== 0 && result.status !== 1) {
  fail(`prettier_inventory_failed:${result.stderr?.trim() || result.error?.message || "unknown"}`);
}

const files = (result.stdout ?? "")
  .split(/\r?\n/)
  .map((file) => file.trim().replaceAll("\\", "/"))
  .filter(Boolean)
  .sort();
const canonical = `${files.join("\n")}\n`;
const digest = createHash("sha256").update(canonical).digest("hex");

if (fingerprint.policy !== "exact-match-only-new-or-removed-drift-fails") {
  fail("fingerprint_policy_invalid");
}

if (process.argv.includes("--freeze")) {
  if (argumentValue("--approval") !== "APR-V1-IMPLEMENT-001") {
    fail("freeze_approval_invalid");
  }
  const capturedAt = new Date().toISOString();
  const nextBaseline = {
    schema_version: "2026-07-25.dongri-v1.format-debt-baseline.v1",
    captured_at: capturedAt,
    candidate_id: "dongri-grigri-v1-alpha.0",
    source_epoch: "sha256:867e09c08292ea677d8542d7a4a4b29a71c8fb4211fc2c995af44ec8322551c4",
    approval_id: "APR-V1-IMPLEMENT-001",
    prettier_version: fingerprint.prettier_version,
    glob: fingerprint.glob,
    file_count: files.length,
    canonical_list_sha256: digest,
    policy: fingerprint.policy,
    files,
  };
  const nextFingerprint = {
    ...fingerprint,
    source_ref: "contracts/v1/FORMAT_DEBT_BASELINE.json",
    file_count: files.length,
    canonical_list_sha256: digest,
  };
  writeFileSync(candidateBaselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`, "utf8");
  writeFileSync(fingerprintPath, `${JSON.stringify(nextFingerprint, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      status: "frozen",
      approval_id: "APR-V1-IMPLEMENT-001",
      file_count: files.length,
      canonical_list_sha256: digest,
      candidate_baseline: "contracts/v1/FORMAT_DEBT_BASELINE.json",
    })}\n`,
  );
  process.exit(0);
}

if (!existsSync(candidateBaselinePath)) fail("candidate_baseline_missing");
const baseline = JSON.parse(readFileSync(candidateBaselinePath, "utf8"));
if (baseline.policy !== fingerprint.policy) fail("baseline_policy_mismatch");
if (fingerprint.file_count !== files.length) fail("fingerprint_file_count_drift");
if (fingerprint.canonical_list_sha256 !== digest) fail("fingerprint_hash_drift");
if (baseline.file_count !== files.length) fail("candidate_baseline_file_count_drift");
if (baseline.canonical_list_sha256 !== digest) fail("candidate_baseline_hash_drift");
if (baseline.glob !== fingerprint.glob) fail("candidate_baseline_glob_mismatch");
if (JSON.stringify(baseline.files) !== JSON.stringify(files)) {
  fail("candidate_baseline_file_list_drift");
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    prettier_version: fingerprint.prettier_version,
    file_count: files.length,
    canonical_list_sha256: digest,
    policy: fingerprint.policy,
    candidate_baseline: "contracts/v1/FORMAT_DEBT_BASELINE.json",
  })}\n`,
);
