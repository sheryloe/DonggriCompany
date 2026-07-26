import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const BASELINE_OPENAPI = "G:\\Donggri_DevDrive\\repos\\DonggriCompany\\docs\\openapi.json";
const CURRENT_OPENAPI = path.join(REPO_ROOT, "docs", "openapi.json");
const SNAPSHOT_PATH = path.join(REPO_ROOT, "contracts", "v1", "openapi-operation-floor.json");
const EXPECTED_BASELINE_SHA256 = "d5731eec7dc2889cee49b6c58a8187f352a4d7db04c9c1703da7ea5a99c70ce5";
const EXPECTED_BASELINE_OPERATION_COUNT = 191;
const FROZEN_BASE_SHA = "9519f4036ec8e9380d044a4ff65e737485256a3b";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readOpenApi(filePath) {
  const bytes = fs.readFileSync(filePath);
  const document = JSON.parse(bytes.toString("utf8"));
  const operations = [];
  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) operations.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  operations.sort((left, right) => left.localeCompare(right, "en"));
  return { bytes, operations };
}

function fail(message, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message, ...details })}\n`);
  process.exit(1);
}

function assertUniqueOperations(operations, label) {
  const unique = new Set(operations);
  if (unique.size !== operations.length) {
    fail("duplicate_openapi_operations", { label, operation_count: operations.length, unique_count: unique.size });
  }
}

function freeze() {
  const baseline = readOpenApi(BASELINE_OPENAPI);
  const baselineSha = sha256(baseline.bytes);
  if (baselineSha !== EXPECTED_BASELINE_SHA256) {
    fail("baseline_openapi_drift", {
      expected_sha256: EXPECTED_BASELINE_SHA256,
      actual_sha256: baselineSha,
    });
  }
  assertUniqueOperations(baseline.operations, "baseline");
  if (baseline.operations.length !== EXPECTED_BASELINE_OPERATION_COUNT) {
    fail("baseline_operation_count_drift", {
      expected: EXPECTED_BASELINE_OPERATION_COUNT,
      actual: baseline.operations.length,
    });
  }

  const snapshot = {
    schema: "donggri-openapi-operation-floor/v1",
    product_id: "dongri-grigri",
    release_epoch: "dongri-grigri-v1",
    frozen_base_sha: FROZEN_BASE_SHA,
    source: {
      path: BASELINE_OPENAPI,
      sha256: baselineSha,
      operation_count: baseline.operations.length,
    },
    policy: {
      missing_operations_allowed: 0,
      additional_operations_allowed: true,
    },
    operations: baseline.operations,
  };

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: "freeze",
      snapshot: SNAPSHOT_PATH,
      snapshot_sha256: sha256(fs.readFileSync(SNAPSHOT_PATH)),
      operation_count: snapshot.operations.length,
    })}\n`,
  );
}

function check() {
  if (!fs.existsSync(SNAPSHOT_PATH)) fail("snapshot_missing", { snapshot: SNAPSHOT_PATH });
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  if (
    snapshot?.schema !== "donggri-openapi-operation-floor/v1" ||
    !Array.isArray(snapshot.operations) ||
    snapshot.operations.length !== EXPECTED_BASELINE_OPERATION_COUNT ||
    snapshot?.source?.sha256 !== EXPECTED_BASELINE_SHA256
  ) {
    fail("snapshot_contract_invalid", { snapshot: SNAPSHOT_PATH });
  }

  const current = readOpenApi(CURRENT_OPENAPI);
  assertUniqueOperations(current.operations, "current");
  const currentSet = new Set(current.operations);
  const missing = snapshot.operations.filter((operation) => !currentSet.has(operation));
  const result = {
    ok: missing.length === 0,
    mode: "check",
    snapshot: SNAPSHOT_PATH,
    required_operation_count: snapshot.operations.length,
    current_operation_count: current.operations.length,
    missing_operation_count: missing.length,
    missing_operations: missing,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

if (process.argv.includes("--freeze")) freeze();
else check();
