import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "../..");
const stamp = new Date()
  .toISOString()
  .replaceAll(/[-:.TZ]/g, "")
  .slice(0, 14);
const snapshotRoot = path.join(
  "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\cw",
  `${stamp}-${process.pid}`,
);
const logRoot = path.join(snapshotRoot, "rehearsal-logs");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-delivery",
);
const reportPath = path.join(reportRoot, "isolated-windows-build-preflight.json");
const excludedDirectories = new Set([
  ".git",
  ".tmp",
  ".cache",
  ".codex",
  "node_modules",
  "dist",
  "coverage",
  "data",
  "logs",
  "backups",
  "runtime",
]);

function relative(file) {
  return path.relative(repoRoot, file).replaceAll("\\", "/");
}

function includeSource(source) {
  const rel = relative(source);
  if (!rel) return true;
  const parts = rel.split("/");
  if (excludedDirectories.has(parts[0])) return false;
  const name = path.basename(source).toLowerCase();
  if (name.startsWith(".env") && name !== ".env.example" && !name.endsWith(".template")) return false;
  if (/\.(?:db|sqlite|sqlite3|log|bak)$/i.test(name)) return false;
  return true;
}

function walkFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

function hash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function redact(value) {
  return String(value)
    .replaceAll(/((?:SECRET|TOKEN|PASSWORD|API_KEY)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replaceAll(/(authorization:\s*(?:bearer|basic)\s+)\S+/gi, "$1[REDACTED]");
}

function run(index, id, command) {
  const started = Date.now();
  const result = spawnSync(process.env.ComSpec, ["/d", "/s", "/c", command], {
    cwd: snapshotRoot,
    encoding: "utf8",
    env: { ...process.env, DONGGRI_DEVDRIVE_ROOT: controlRoot, CI: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const logPath = path.join(logRoot, `${String(index).padStart(2, "0")}-${id}.log`);
  fs.writeFileSync(logPath, output, "utf8");
  return {
    id,
    command,
    exit_code: result.status,
    signal: result.signal,
    duration_ms: Date.now() - started,
    log_path: logPath,
    passed: result.status === 0,
  };
}

if (process.platform !== "win32") throw new Error("isolated_windows_preflight_requires_win32");
fs.mkdirSync(path.dirname(snapshotRoot), { recursive: true });
fs.cpSync(repoRoot, snapshotRoot, { recursive: true, filter: includeSource, preserveTimestamps: true });
fs.mkdirSync(logRoot, { recursive: true });
const files = walkFiles(snapshotRoot).filter((file) => !file.includes(`${path.sep}rehearsal-logs${path.sep}`));
const forbidden = files
  .map((file) => path.relative(snapshotRoot, file).replaceAll("\\", "/"))
  .filter((file) => /(^|\/)(?:\.env(?:\.|$)|data|logs|backups|runtime)(?:\/|$)/i.test(file))
  .filter((file) => file !== ".env.example" && !file.endsWith(".env.production.template"));
const commands = [
  ["install", "corepack pnpm install --frozen-lockfile --prefer-offline"],
  ["delivery", "corepack pnpm run master95:delivery"],
  ["openapi", "corepack pnpm run openapi:check"],
  ["typecheck", "corepack pnpm exec tsc --noEmit"],
  ["build", "corepack pnpm exec vite build"],
  ["master95-tests", "corepack pnpm exec vitest run --config server/vitest.config.ts server/modules/master95"],
];
const results = [];
if (forbidden.length === 0) {
  for (const [index, [id, command]] of commands.entries()) {
    const result = run(index + 1, id, command);
    results.push(result);
    if (!result.passed) break;
  }
}
const report = {
  schema_version: "2026-07-15.master95.isolated-windows-preflight.v1",
  status: forbidden.length === 0 && results.every((result) => result.passed) ? "pass" : "fail",
  certification_credit: "partial-only-not-clean-pc-or-vm",
  source_tree_mode: "current-working-tree-snapshot-without-git-history",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    os_release: os.release(),
  },
  snapshot_root: snapshotRoot,
  copied_file_count_before_install: files.length,
  excluded_sensitive_or_runtime_classes: [...excludedDirectories].sort(),
  forbidden_snapshot_paths: forbidden,
  source_hashes: {
    package_json: hash(path.join(repoRoot, "package.json")),
    pnpm_lock: hash(path.join(repoRoot, "pnpm-lock.yaml")),
    format_debt_fingerprint: hash(
      path.join(repoRoot, "scripts", "master95", "baselines", "FORMAT_DEBT_FINGERPRINT.json"),
    ),
  },
  command_results: results,
  mutations: {
    source_repo: false,
    git: false,
    docker_lifecycle: false,
    db: false,
    deploy: false,
    secrets: false,
    agentmemory: false,
    isolated_snapshot_build_output_only: true,
  },
  remaining_for_step_5: [
    "approved clean Windows PC or VM rehearsal",
    "approved clean Linux VM or CI-equivalent rehearsal",
    "approved induced rollback rehearsal",
  ],
  evaluated_at: new Date().toISOString(),
};
fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`[master95-isolated-windows] status=${report.status} snapshot=${snapshotRoot}\n`);
if (report.status !== "pass") process.exitCode = 1;
