import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  evaluateMaster95WallClockSoak,
  type Master95WallClockSoakPolicy,
  type Master95WallClockSoakSample,
} from "../../server/modules/master95/wallclock-soak.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const runtimeRoot = process.env.MASTER95_RUNTIME_ROOT
  ? path.resolve(process.env.MASTER95_RUNTIME_ROOT)
  : "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\wallclock-soak";
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-operations",
);
const samplesPath = path.join(runtimeRoot, "wallclock-soak-samples.jsonl");
const statePath = path.join(runtimeRoot, "wallclock-soak-state.json");
const reportPath = path.join(reportRoot, "wallclock-soak-status.json");
const policy: Master95WallClockSoakPolicy = {
  required_hours: 72,
  sample_interval_seconds: 60,
  coverage_minimum: 0.99,
  availability_minimum: 0.99,
  p95_latency_ms_maximum: 2000,
  maximum_gap_seconds: 180,
};

async function inspect(url: string) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { ok: response.ok, status: response.status, latency_ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, status: null, latency_ms: Math.round(performance.now() - started) };
  }
}

function readSamples(): Master95WallClockSoakSample[] {
  if (!fs.existsSync(samplesPath)) return [];
  return fs
    .readFileSync(samplesPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readCollectorPid() {
  if (!fs.existsSync(statePath)) return null;
  const pid = Number(JSON.parse(fs.readFileSync(statePath, "utf8")).collector_pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writeStatus(samples: Master95WallClockSoakSample[], collectorPid: number | null = readCollectorPid()) {
  const evaluatedAt = new Date().toISOString();
  const evaluation = evaluateMaster95WallClockSoak({ policy, samples, evaluated_at: evaluatedAt });
  const report = {
    schema_version: "2026-07-15.master95.wallclock-soak.v1",
    execution_mode: "actual-wall-clock-local-read-only-observation",
    certification_claimed: evaluation.status === "pass",
    collector_pid: collectorPid,
    endpoints: { web: "http://127.0.0.1:8800/", api: "http://127.0.0.1:8790/api/health" },
    ...evaluation,
    evaluated_at: evaluatedAt,
    mutations: { publish: false, db: false, docker: false, deploy: false, git: false, agentmemory: false },
  };
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function recordOne(collectorPid = process.pid) {
  const samples = readSamples();
  const now = Date.now();
  const last = samples.at(-1);
  if (last && now - Date.parse(last.sampled_at) < 30_000) return writeStatus(samples, collectorPid);
  const [web, api] = await Promise.all([
    inspect("http://127.0.0.1:8800/"),
    inspect("http://127.0.0.1:8790/api/health"),
  ]);
  const sample: Master95WallClockSoakSample = {
    sequence: samples.length + 1,
    sampled_at: new Date().toISOString(),
    web,
    api,
  };
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.appendFileSync(samplesPath, `${JSON.stringify(sample)}\n`, "utf8");
  samples.push(sample);
  return writeStatus(samples, collectorPid);
}

function collectorAlreadyRunning() {
  if (!fs.existsSync(statePath)) return false;
  const pid = readCollectorPid();
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function daemon() {
  if (collectorAlreadyRunning()) throw new Error("wallclock_soak_collector_already_running");
  await recordOne();
  process.stdout.write(`[master95-wallclock-soak] collector started pid=${process.pid}\n`);
  setInterval(() => {
    recordOne().catch((error) => process.stderr.write(`[master95-wallclock-soak] ${String(error)}\n`));
  }, policy.sample_interval_seconds * 1000);
}

if (process.argv.includes("--daemon")) {
  await daemon();
} else if (process.argv.includes("--status")) {
  process.stdout.write(`${JSON.stringify(writeStatus(readSamples(), readCollectorPid()), null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(await recordOne(), null, 2)}\n`);
}
