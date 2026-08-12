import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "../..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : resolve(repoRoot, "../..");
const qualityRoot = resolve(controlRoot, "storage/codex-control/quality/master-95");
const rehearsalPath = resolve(qualityRoot, "delivery/DELIVERY_REHEARSAL.json");
const formatDebtPath = resolve(qualityRoot, "delivery/FORMAT_DEBT_BASELINE.json");
const formatFingerprintPath = resolve(repoRoot, "scripts/master95/baselines/FORMAT_DEBT_FINGERPRINT.json");
const requireRehearsal = process.argv.includes("--require-rehearsal");
const localQaContractOnly = process.argv.includes("--local-qa-contract-only");
const failures = [];
const warnings = [];
const pass = (condition, message) => {
  if (!condition) failures.push(message);
};

const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");
const packageJson = JSON.parse(read("package.json"));
const dockerfile = read("Dockerfile");
const compose = read("docker-compose.yml");
const workflow = read(".github/workflows/ci.yml");
const envFiles = [".env.example", "deploy/.env.production.template"];

pass(
  /^pnpm@\d+\.\d+\.\d+(?:\+sha512\.)?/.test(packageJson.packageManager ?? ""),
  "packageManager must pin pnpm exactly",
);
pass(
  typeof packageJson.engines?.node === "string" && packageJson.engines.node.includes("22"),
  "Node engine must include the CI major version",
);
pass(existsSync(resolve(repoRoot, "pnpm-lock.yaml")), "pnpm-lock.yaml is required");

const resilientLocalQa = packageJson.scripts?.["master95:dev:local:resilient"] ?? "";
const resilientCanonicalWeb = packageJson.scripts?.["master95:dev:web:resilient"] ?? "";
const resilientCanonicalApi = packageJson.scripts?.["master95:dev:api:resilient"] ?? "";
const localQaFailures = [];
for (const token of [
  "concurrently --restart-tries 12 --restart-after exponential",
  "vite --host 127.0.0.1 --port 8800",
  "HOST=127.0.0.1 PORT=8790",
  "nodemon --exitcrash --delay 1000ms",
])
  if (!resilientLocalQa.includes(token)) localQaFailures.push(`Resilient local QA command is missing: ${token}`);
if (resilientLocalQa.includes("--restart-tries -1")) {
  localQaFailures.push("Resilient local QA command must not restart forever");
}
for (const token of [
  "concurrently --restart-tries 12 --restart-after exponential",
  "VITE_API_PROXY_TARGET=http://127.0.0.1:8790",
  "vite --host 127.0.0.1 --port 8800 --strictPort",
])
  if (!resilientCanonicalWeb.includes(token)) {
    localQaFailures.push(`Resilient canonical web command is missing: ${token}`);
  }
if (resilientCanonicalWeb.includes("--restart-tries -1")) {
  localQaFailures.push("Resilient canonical web command must not restart forever");
}
for (const token of [
  "concurrently --restart-tries 12 --restart-after exponential",
  "HOST=127.0.0.1 PORT=8790 APP_DATA_DIR=data",
  "nodemon --exitcrash --delay 1000ms --watch server --ext ts --exec tsx server/index.ts",
])
  if (!resilientCanonicalApi.includes(token)) {
    localQaFailures.push(`Resilient canonical API command is missing: ${token}`);
  }
if (resilientCanonicalApi.includes("--restart-tries -1")) {
  localQaFailures.push("Resilient canonical API command must not restart forever");
}
failures.push(...localQaFailures);
if (localQaContractOnly) {
  process.stdout.write(
    `[master95-local-qa-delivery] ${JSON.stringify(
      {
        status: localQaFailures.length === 0 ? "pass" : "fail",
        failures: localQaFailures,
        starts_processes: false,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(localQaFailures.length === 0 ? 0 : 1);
}

for (const token of [
  "pnpm install --frozen-lockfile",
  "pnpm run format:check",
  "pnpm run lint",
  "pnpm run openapi:check",
  "pnpm exec tsc",
  "pnpm run build",
  "pnpm run test:ci",
  "pnpm run master95:delivery",
])
  pass(workflow.includes(token), `CI is missing: ${token}`);

for (const packageName of [
  "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}",
  "@openai/codex@${CODEX_VERSION}",
  "codex-multi-auth@${CODEX_MULTI_AUTH_VERSION}",
  "@google/gemini-cli@${GEMINI_CLI_VERSION}",
  "@google/jules@${JULES_VERSION}",
  "opencode-ai@${OPENCODE_VERSION}",
])
  pass(dockerfile.includes(packageName), `Docker CLI is not pinned: ${packageName.split("@")[0] || packageName}`);

pass(
  compose.includes("E:/DonggriPlatform_Asset/runtime/DonggriCompany"),
  "Compose default runtime must use canonical E: backing store",
);
pass(existsSync(resolve(repoRoot, "deploy/.env.production.template")), "Production env template is missing");
pass(existsSync(resolve(repoRoot, "deploy/ROLLBACK_RUNBOOK.md")), "Rollback runbook is missing");

pass(existsSync(formatFingerprintPath), "FORMAT_DEBT_FINGERPRINT.json is missing");
if (existsSync(formatFingerprintPath)) {
  const fingerprint = JSON.parse(readFileSync(formatFingerprintPath, "utf8"));
  const prettierCli = resolve(repoRoot, "node_modules/prettier/bin/prettier.cjs");
  const prettierResult = spawnSync(process.execPath, [prettierCli, "--list-different", fingerprint.glob], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  pass(
    prettierResult.status === 0 || prettierResult.status === 1,
    `Prettier debt inventory failed: ${prettierResult.stderr?.trim() || prettierResult.error?.message || "unknown"}`,
  );
  const currentFiles = (prettierResult.stdout ?? "")
    .split(/\r?\n/)
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean)
    .sort();
  const canonical = `${currentFiles.join("\n")}\n`;
  const digest = createHash("sha256").update(canonical).digest("hex");
  pass(fingerprint.policy === "exact-match-only-new-or-removed-drift-fails", "Format debt policy must be exact-match");
  pass(currentFiles.length === fingerprint.file_count, "Format debt file count drifted");
  pass(digest === fingerprint.canonical_list_sha256, "Format debt canonical list hash drifted");
  if (existsSync(formatDebtPath)) {
    const canonical = JSON.parse(readFileSync(formatDebtPath, "utf8"));
    pass(canonical.file_count === fingerprint.file_count, "Canonical format debt count differs from fingerprint");
    pass(
      canonical.canonical_list_sha256 === fingerprint.canonical_list_sha256,
      "Canonical format debt hash differs from fingerprint",
    );
    pass(JSON.stringify(currentFiles) === JSON.stringify(canonical.files), "Canonical format debt file list drifted");
  } else {
    warnings.push("canonical Control Plane format debt list unavailable; standalone fingerprint was enforced");
  }
}

const safePlaceholder = /^(?:"?__CHANGE_ME__"?|"?YOUR_[A-Z0-9_]+"?|)$/;
const isSensitiveName = (name) =>
  /(?:SECRET|PASSWORD|API_KEY)$/.test(name) || /_BOT_TOKEN(?:_|$)/.test(name) || name === "API_AUTH_TOKEN";
for (const envFile of envFiles) {
  const lines = read(envFile).split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !isSensitiveName(match[1])) continue;
    pass(
      safePlaceholder.test(match[2].trim()),
      `${envFile} contains a non-placeholder sensitive example for ${match[1]}`,
    );
  }
}

const composeResult = spawnSync("docker", ["compose", "config", "--quiet"], {
  cwd: repoRoot,
  encoding: "utf8",
});
pass(composeResult.status === 0, "docker compose config --quiet failed");

let rehearsalStatus = "missing";
if (existsSync(rehearsalPath)) {
  try {
    rehearsalStatus = JSON.parse(readFileSync(rehearsalPath, "utf8")).status ?? "invalid";
  } catch {
    rehearsalStatus = "invalid";
  }
}
if (rehearsalStatus !== "pass") warnings.push("clean-environment and induced rollback rehearsal evidence is not pass");
if (requireRehearsal) pass(rehearsalStatus === "pass", "certification requires DELIVERY_REHEARSAL.json status=pass");

const result = {
  structural_status: failures.length === 0 ? "pass" : "fail",
  rehearsal_status: rehearsalStatus,
  certification_ready: failures.length === 0 && rehearsalStatus === "pass",
  failures,
  warnings,
};
process.stdout.write(`[master95-delivery] ${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
