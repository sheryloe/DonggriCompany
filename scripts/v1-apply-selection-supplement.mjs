import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SPEC_ROOT =
  "G:\\Donggri_DevDrive\\storage\\codex-control\\specs\\20260725-donggricompany-v1-stabilization-certification-v1";
const MANIFEST_PATH = path.join(SPEC_ROOT, "SELECTION_MANIFEST.json");
const RECEIPT_PATH = path.join(SPEC_ROOT, "SELECTION_SUPPLEMENT_002_APPLICATION_RECEIPT.json");
const RECEIPT_SHA_PATH = `${RECEIPT_PATH}.sha256`;
const EXPECTED_MANIFEST_SHA256 = "867e09c08292ea677d8542d7a4a4b29a71c8fb4211fc2c995af44ec8322551c4";
const PREVIOUS_MANIFEST_SHA256 = "9bf460737a9226dc378b94ed329bfc66651e2d78f0fae1ac78d2bf6bdb00591f";
const PREVIOUS_RECEIPT_SHA256 = "d7df93ce74627093fe2706f3e710c01cd5f034edb2072924300f34fb0a9f65bb";
const APPROVAL_ID = "APR-V1-IMPLEMENT-001";
const TARGETS = new Set(["Dockerfile", "docker-compose.yml"]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fail(code, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, code, ...details })}\n`);
  process.exit(1);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertNoReparseBoundary(root, parent) {
  if (!isInside(root, parent)) fail("destination_boundary_escape", { parent });
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) fail("destination_reparse_boundary", { path: current });
  }
}

function git(...args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function assertCleanTrackedDestination(relative) {
  try {
    git("ls-files", "--error-unmatch", "--", relative);
  } catch {
    fail("destination_collision_untracked", { destination_rel: relative });
  }
  for (const args of [
    ["-C", REPO_ROOT, "diff", "--quiet", "--", relative],
    ["-C", REPO_ROOT, "diff", "--cached", "--quiet", "--", relative],
  ]) {
    const result = spawnSync("git", args, { windowsHide: true });
    if (result.status !== 0) {
      fail("destination_collision_dirty", { destination_rel: relative });
    }
  }
}

function main() {
  const approvalIndex = process.argv.indexOf("--approval");
  const approval = approvalIndex >= 0 ? process.argv[approvalIndex + 1] : "";
  if (!process.argv.includes("--apply") || approval !== APPROVAL_ID) {
    fail("explicit_apply_approval_required", { approval_id: APPROVAL_ID });
  }
  const manifestBytes = fs.readFileSync(MANIFEST_PATH);
  const manifestSha = sha256(manifestBytes);
  if (manifestSha !== EXPECTED_MANIFEST_SHA256) {
    fail("selection_manifest_hash_drift", {
      expected: EXPECTED_MANIFEST_SHA256,
      actual: manifestSha,
    });
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const entries = manifest.entries.filter((entry) => TARGETS.has(entry.destination_rel));
  if (entries.length !== TARGETS.size) {
    fail("selection_supplement_scope_invalid", {
      expected: [...TARGETS],
      actual: entries.map((entry) => entry.destination_rel),
    });
  }

  const applied = [];
  for (const entry of entries) {
    const source = path.resolve(entry.source_path);
    const destination = path.resolve(entry.destination);
    if (!isInside(REPO_ROOT, destination)) fail("destination_boundary_escape", { destination });
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) {
      fail("selection_source_missing", { source });
    }
    const sourceBytes = fs.readFileSync(source);
    if (sha256(sourceBytes) !== entry.sha256 || sourceBytes.length !== entry.size) {
      fail("selection_source_drift", { source, destination_rel: entry.destination_rel });
    }
    const beforeExists = fs.existsSync(destination);
    let beforeSha256 = null;
    if (beforeExists) {
      const existing = fs.readFileSync(destination);
      beforeSha256 = sha256(existing);
      if (beforeSha256 !== entry.sha256) {
        assertCleanTrackedDestination(entry.destination_rel);
        assertNoReparseBoundary(REPO_ROOT, path.dirname(destination));
        fs.copyFileSync(source, destination);
      }
    } else {
      assertNoReparseBoundary(REPO_ROOT, path.dirname(destination));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    }
    const destinationBytes = fs.readFileSync(destination);
    if (sha256(destinationBytes) !== entry.sha256 || destinationBytes.length !== entry.size) {
      fail("destination_verification_failed", { destination_rel: entry.destination_rel });
    }
    applied.push({
      destination_rel: entry.destination_rel,
      source_workspace: entry.source_workspace,
      source_path: entry.source_path,
      source_sha256: entry.sha256,
      destination: entry.destination,
      before_exists: beforeExists,
      before_sha256: beforeSha256,
      destination_sha256: sha256(destinationBytes),
      bytes: destinationBytes.length,
      changed: beforeSha256 !== entry.sha256,
      selection_reason: entry.rationale,
    });
  }

  const receipt = {
    schema: "donggri-selection-supplement-application-receipt/v1",
    spec_id: manifest.spec_id,
    approval_id: APPROVAL_ID,
    applied_at: new Date().toISOString(),
    previous_manifest_sha256: PREVIOUS_MANIFEST_SHA256,
    previous_application_receipt_sha256: PREVIOUS_RECEIPT_SHA256,
    manifest_path: MANIFEST_PATH,
    manifest_sha256: EXPECTED_MANIFEST_SHA256,
    destination_root: REPO_ROOT,
    source_write_count: 0,
    applied_entry_count: applied.length,
    applied_bytes: applied.reduce((sum, entry) => sum + entry.bytes, 0),
    entries: applied,
    verification: {
      source_hashes: "pass",
      destination_hashes: "pass",
      path_boundaries: "pass",
      original_sources_mutated: false,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  fs.writeFileSync(RECEIPT_PATH, bytes, { flag: "wx" });
  const receiptSha = sha256(bytes);
  fs.writeFileSync(RECEIPT_SHA_PATH, `${receiptSha}  ${path.basename(RECEIPT_PATH)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      manifest_sha256: EXPECTED_MANIFEST_SHA256,
      applied_entry_count: applied.length,
      applied_bytes: receipt.applied_bytes,
      receipt: RECEIPT_PATH,
      receipt_sha256: receiptSha,
    })}\n`,
  );
}

main();
