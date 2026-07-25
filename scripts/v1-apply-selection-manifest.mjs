import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SPEC_ROOT =
  "G:\\Donggri_DevDrive\\storage\\codex-control\\specs\\20260725-donggricompany-v1-stabilization-certification-v1";
const MANIFEST_PATH = path.join(SPEC_ROOT, "SELECTION_MANIFEST.json");
const MANIFEST_SHA_PATH = path.join(SPEC_ROOT, "SELECTION_MANIFEST.sha256");
const RECEIPT_PATH = path.join(SPEC_ROOT, "SELECTION_APPLICATION_RECEIPT.json");
const RECEIPT_SHA_PATH = path.join(SPEC_ROOT, "SELECTION_APPLICATION_RECEIPT.sha256");
const EXPECTED_MANIFEST_SHA256 = "867e09c08292ea677d8542d7a4a4b29a71c8fb4211fc2c995af44ec8322551c4";
const EXPECTED_HEAD = "9519f4036ec8e9380d044a4ff65e737485256a3b";
const EXPECTED_BRANCH = "codex/dongri-grigri-v1";
const APPROVAL_ID = "APR-V1-IMPLEMENT-001";
const SKIPPED_PATHS = new Map([
  ["docs/openapi.json", "derived-regenerate"],
  ["package.json", "manual-merge-release-identity"],
  ["server/modules/routes/ops/control-plane.ts", "manual-merge-source-adapter-and-master95"],
  ["server/modules/routes/ops/control-plane.test.ts", "manual-merge-source-adapter-and-master95"],
]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fail(error, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error, ...details })}\n`);
  process.exit(1);
}

function normalizeRelative(value) {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function insideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function verifyNoReparseBoundary(root, targetParent) {
  const relative = path.relative(root, targetParent);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail("destination_boundary_escape", { targetParent });
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail("destination_reparse_boundary", { path: cursor });
  }
}

function git(...args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true }).trim();
}

function parseDirtyPaths() {
  const output = git("-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall");
  const paths = new Set();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const body = line.slice(3);
    const destination = body.includes(" -> ") ? body.split(" -> ").at(-1) : body;
    if (destination) paths.add(normalizeRelative(destination.replace(/^"|"$/g, "")));
  }
  return paths;
}

function verifyManifest() {
  const manifestBytes = fs.readFileSync(MANIFEST_PATH);
  const actualManifestSha = sha256(manifestBytes);
  if (actualManifestSha !== EXPECTED_MANIFEST_SHA256) {
    fail("selection_manifest_hash_drift", {
      expected: EXPECTED_MANIFEST_SHA256,
      actual: actualManifestSha,
    });
  }
  const declaredSha = fs.readFileSync(MANIFEST_SHA_PATH, "utf8").trim().split(/\s+/)[0];
  if (declaredSha !== actualManifestSha) {
    fail("selection_manifest_sidecar_mismatch", { declared: declaredSha, actual: actualManifestSha });
  }
  return JSON.parse(manifestBytes.toString("utf8"));
}

function main() {
  const applyRequested = process.argv.includes("--apply");
  const approvalIndex = process.argv.indexOf("--approval");
  const approval = approvalIndex >= 0 ? process.argv[approvalIndex + 1] : "";
  if (!applyRequested || approval !== APPROVAL_ID) {
    fail("explicit_apply_approval_required", {
      required_arguments: ["--apply", "--approval", APPROVAL_ID],
    });
  }
  if (path.resolve(REPO_ROOT) !== path.resolve("G:\\Donggri_DevDrive\\worktrees\\DonggriCompany-v1-stabilization")) {
    fail("destination_root_mismatch", { actual: REPO_ROOT });
  }
  if (git("branch", "--show-current") !== EXPECTED_BRANCH) {
    fail("destination_branch_drift", { expected: EXPECTED_BRANCH, actual: git("branch", "--show-current") });
  }
  if (git("rev-parse", "HEAD").toLowerCase() !== EXPECTED_HEAD) {
    fail("destination_head_drift", { expected: EXPECTED_HEAD, actual: git("rev-parse", "HEAD") });
  }

  execFileSync(
    process.execPath,
    [path.join(SPEC_ROOT, "selection-manifest-generator.mjs"), "--verify-only", "--check-existing"],
    { cwd: SPEC_ROOT, stdio: "inherit", windowsHide: true },
  );

  const manifest = verifyManifest();
  if (manifest?.schema !== "donggri-selection-manifest/v1") fail("selection_manifest_schema_invalid");
  if (path.resolve(manifest?.destination?.root ?? "") !== REPO_ROOT) {
    fail("selection_manifest_destination_mismatch", { manifest_destination: manifest?.destination?.root });
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 657) {
    fail("selection_manifest_entry_count_invalid", { actual: manifest?.entries?.length });
  }

  const selected = manifest.entries.filter((entry) => !SKIPPED_PATHS.has(normalizeRelative(entry.destination_rel)));
  const skipped = manifest.entries.filter((entry) => SKIPPED_PATHS.has(normalizeRelative(entry.destination_rel)));
  if (selected.length !== 653 || skipped.length !== 4) {
    fail("selection_application_scope_invalid", { selected: selected.length, skipped: skipped.length });
  }

  const dirtyPaths = parseDirtyPaths();
  const dirtyCollisions = selected
    .map((entry) => normalizeRelative(entry.destination_rel))
    .filter((relative) => dirtyPaths.has(relative));
  if (dirtyCollisions.length > 0) {
    fail("destination_has_uncommitted_collision", { paths: dirtyCollisions });
  }

  const applicationEntries = [];
  for (const entry of selected) {
    const relative = normalizeRelative(entry.destination_rel);
    const source = path.resolve(entry.source_path);
    const destination = path.resolve(entry.destination);
    if (!insideRoot(REPO_ROOT, destination)) fail("destination_boundary_escape", { relative, destination });
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile())
      fail("selection_source_missing", { relative, source });
    const sourceBytes = fs.readFileSync(source);
    const sourceSha = sha256(sourceBytes);
    if (sourceSha !== entry.sha256 || sourceBytes.length !== entry.size) {
      fail("selection_source_drift", {
        relative,
        expected_sha256: entry.sha256,
        actual_sha256: sourceSha,
        expected_size: entry.size,
        actual_size: sourceBytes.length,
      });
    }

    const beforeExists = fs.existsSync(destination);
    let beforeSha = null;
    let beforeSize = 0;
    if (beforeExists) {
      const beforeStat = fs.lstatSync(destination);
      if (!beforeStat.isFile() || beforeStat.isSymbolicLink()) {
        fail("destination_not_regular_file", { relative, destination });
      }
      const beforeBytes = fs.readFileSync(destination);
      beforeSha = sha256(beforeBytes);
      beforeSize = beforeBytes.length;
    }
    verifyNoReparseBoundary(REPO_ROOT, path.dirname(destination));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    const afterBytes = fs.readFileSync(destination);
    const afterSha = sha256(afterBytes);
    if (afterSha !== entry.sha256 || afterBytes.length !== entry.size) {
      fail("selection_destination_verification_failed", { relative, expected: entry.sha256, actual: afterSha });
    }
    applicationEntries.push({
      destination_rel: relative,
      source_workspace: entry.source_workspace,
      source_sha256: entry.sha256,
      before_exists: beforeExists,
      before_sha256: beforeSha,
      before_size: beforeSize,
      after_sha256: afterSha,
      after_size: afterBytes.length,
      changed: beforeSha !== afterSha,
      recovery_authority: beforeExists
        ? `git:${EXPECTED_HEAD}:${relative}`
        : `remove-untracked-after-separate-approval:${relative}`,
    });
  }

  const receipt = {
    schema: "donggri-selection-application-receipt/v1",
    spec_id: manifest.spec_id,
    task_id: "T-V1-102",
    approval_id: APPROVAL_ID,
    applied_at: new Date().toISOString(),
    manifest_path: MANIFEST_PATH,
    manifest_sha256: EXPECTED_MANIFEST_SHA256,
    destination_root: REPO_ROOT,
    destination_branch: EXPECTED_BRANCH,
    destination_head_before_apply: EXPECTED_HEAD,
    source_write_count: 0,
    applied_entry_count: applicationEntries.length,
    applied_bytes: applicationEntries.reduce((total, entry) => total + entry.after_size, 0),
    changed_entry_count: applicationEntries.filter((entry) => entry.changed).length,
    skipped_entries: skipped.map((entry) => ({
      destination_rel: normalizeRelative(entry.destination_rel),
      source_sha256: entry.sha256,
      reason: SKIPPED_PATHS.get(normalizeRelative(entry.destination_rel)),
    })),
    entries: applicationEntries,
    verification: {
      source_manifest_check: "pass",
      destination_hash_check: "pass",
      dirty_collision_check: "pass",
      boundary_check: "pass",
    },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  fs.writeFileSync(RECEIPT_PATH, receiptBytes);
  const receiptSha = sha256(receiptBytes);
  fs.writeFileSync(RECEIPT_SHA_PATH, `${receiptSha}  SELECTION_APPLICATION_RECEIPT.json\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      applied_entry_count: receipt.applied_entry_count,
      applied_bytes: receipt.applied_bytes,
      changed_entry_count: receipt.changed_entry_count,
      skipped_entry_count: receipt.skipped_entries.length,
      receipt: RECEIPT_PATH,
      receipt_sha256: receiptSha,
    })}\n`,
  );
}

main();
