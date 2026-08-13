import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  resolveDonggriV1CandidateRuntimeRoot,
  type DonggriV1CandidateBinding,
} from "../../server/modules/master95/candidate-observation.js";
import {
  evaluateDonggriV1WallClockSoak,
  type DonggriV1WallClockSoakSample,
  type Master95WallClockSoakPolicy,
  validateDonggriV1WallClockSoakRecoveryResume,
} from "../../server/modules/master95/wallclock-soak.js";
import { resolveReleaseIdentity } from "../../server/modules/release/release-identity.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const releaseIdentity = resolveReleaseIdentity(repoRoot);
const binding: DonggriV1CandidateBinding = {
  candidate_id: releaseIdentity.candidate_id,
  source_epoch: releaseIdentity.source_epoch,
};
const candidateRuntimeRoot = resolveDonggriV1CandidateRuntimeRoot(binding, process.env.DONGGRI_V1_RUNTIME_ROOT);
const runtimeRoot = path.join(candidateRuntimeRoot, "soak-72h");
const candidateInputRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "quality",
  "dongri-grigri-v1",
  "candidates",
  binding.candidate_id,
  "inputs",
);
const candidateStatusPath = path.join(candidateInputRoot, "runtime-status", "soak-72h.json");
const approvalLedgerPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "approvals.md",
);
const samplesPath = path.join(runtimeRoot, "wallclock-soak-samples.jsonl");
const statePath = path.join(runtimeRoot, "wallclock-soak-state.json");
const DEFAULT_API_ENDPOINT = "http://127.0.0.1:8790/api/health";
const DEFAULT_WEB_ENDPOINT = "http://127.0.0.1:8810/";

export function resolveDonggriV1SoakEndpoints(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{ api: string; web: string }> {
  const api = environment.DONGGRI_V1_SOAK_API_ENDPOINT ?? DEFAULT_API_ENDPOINT;
  const web = environment.DONGGRI_V1_SOAK_WEB_ENDPOINT ?? DEFAULT_WEB_ENDPOINT;
  if (api !== DEFAULT_API_ENDPOINT) throw new Error("soak_api_endpoint_must_be_exact_loopback_8790");
  if (web !== DEFAULT_WEB_ENDPOINT) throw new Error("soak_web_endpoint_must_be_exact_loopback_8810");
  return Object.freeze({ api, web });
}

const endpoints = resolveDonggriV1SoakEndpoints();
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

export function didDonggriV1SoakRecoverySucceed(input: {
  recovery_attempted: boolean;
  web: { ok: boolean };
  api: { ok: boolean };
}): boolean {
  return input.recovery_attempted && input.web.ok && input.api.ok;
}

export function parseDonggriV1SoakSampleJournal(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readSamples(): DonggriV1WallClockSoakSample[] {
  if (!fs.existsSync(samplesPath)) return [];
  return parseDonggriV1SoakSampleJournal(fs.readFileSync(samplesPath, "utf8")) as DonggriV1WallClockSoakSample[];
}

function readPreviousState(): unknown | null {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function readCollectorPid() {
  if (!fs.existsSync(statePath)) return null;
  const pid = Number(JSON.parse(fs.readFileSync(statePath, "utf8")).collector_pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function requireRuntimeApproval() {
  const ledger = fs.readFileSync(approvalLedgerPath, "utf8");
  const section = ledger.match(/^#{2,3} APR-V1-RUNTIME-001\s*\r?\n([\s\S]*?)(?=^#{2,3}\s|(?![\s\S]))/m)?.[1] ?? "";
  if (!/policy_decision:\s*`?approved`?/i.test(section)) {
    throw new Error("APR-V1-RUNTIME-001_required");
  }
}

function buildStatus(
  samples: DonggriV1WallClockSoakSample[],
  evaluatedAt = new Date().toISOString(),
  collectorPid: number | null = readCollectorPid(),
) {
  const evaluation = evaluateDonggriV1WallClockSoak({
    binding,
    policy,
    samples,
    evaluated_at: evaluatedAt,
    historical_sample_count: 0,
  });
  return {
    schema_version: "2026-07-25.dongri-grigri-v1.wallclock-soak.v1",
    report_type: "candidate-runtime-component",
    component: "soak_72h",
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    evidence_mode: "actual",
    component_status: evaluation.component_status,
    certification_claimed: false,
    execution_mode: "actual-wall-clock-local-read-only-observation",
    collector_pid: collectorPid,
    endpoints,
    runtime_evidence: {
      root: runtimeRoot,
      samples: samplesPath,
      state: statePath,
    },
    ...evaluation,
    evaluated_at: evaluatedAt,
    historical_evidence: {
      source: "pre-v1 Master95 Soak",
      credit: 0,
      credited: false,
    },
    mutations: { publish: false, db: false, docker: false, deploy: false, git: false, agentmemory: false },
  };
}

function persistStatus(report: ReturnType<typeof buildStatus>) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(candidateStatusPath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(candidateStatusPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function recordOne(collectorPid = process.pid, recoveryAttempted = false) {
  const samples = readSamples();
  const now = Date.now();
  const last = samples.at(-1);
  if (!recoveryAttempted && last && now - Date.parse(last.sampled_at) < 30_000) {
    return persistStatus(buildStatus(samples, new Date(now).toISOString(), collectorPid));
  }
  const [web, api] = await Promise.all([inspect(endpoints.web), inspect(endpoints.api)]);
  const sample: DonggriV1WallClockSoakSample = {
    ...binding,
    sequence: samples.length + 1,
    sampled_at: new Date(now).toISOString(),
    web,
    api,
    recovery_attempted: recoveryAttempted,
    recovery_succeeded: didDonggriV1SoakRecoverySucceed({ recovery_attempted: recoveryAttempted, web, api }),
    critical_loss_count: 0,
    budget_exceeded_count: 0,
  };
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.appendFileSync(samplesPath, `${JSON.stringify(sample)}\n`, "utf8");
  samples.push(sample);
  return persistStatus(buildStatus(samples, new Date(now).toISOString(), collectorPid));
}

export function classifyDonggriV1SoakCollectorStart(input: {
  binding: DonggriV1CandidateBinding;
  previous_state: unknown | null;
  samples: unknown[];
  current_pid: number;
  is_process_running: (pid: number) => boolean;
}) {
  if (input.previous_state === null) return { recovery_attempted: false, previous_collector_pid: null };
  const validated = validateDonggriV1WallClockSoakRecoveryResume({
    binding: input.binding,
    previous_state: input.previous_state,
    samples: input.samples,
  });
  if (validated.previous_collector_pid === input.current_pid) {
    throw new Error("wallclock_soak_state_references_current_collector");
  }
  if (input.is_process_running(validated.previous_collector_pid)) {
    throw new Error("wallclock_soak_collector_already_running");
  }
  return { recovery_attempted: true, previous_collector_pid: validated.previous_collector_pid };
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function daemon() {
  const samples = readSamples();
  const collectorStart = classifyDonggriV1SoakCollectorStart({
    binding,
    previous_state: readPreviousState(),
    samples,
    current_pid: process.pid,
    is_process_running: isProcessRunning,
  });
  await recordOne(process.pid, collectorStart.recovery_attempted);
  process.stdout.write(
    `[dongri-v1-wallclock-soak] collector started candidate=${binding.candidate_id} pid=${process.pid}\n`,
  );
  setInterval(() => {
    recordOne().catch((error) => process.stderr.write(`[dongri-v1-wallclock-soak] ${String(error)}\n`));
  }, policy.sample_interval_seconds * 1000);
}

function selfTest() {
  const evaluatedAt = "2026-07-25T00:00:00.000Z";
  const report = buildStatus([], evaluatedAt, null);
  if (report.component_status !== "collecting") throw new Error("self_test_uncollected_soak_must_collect");
  if (report.certification_claimed !== false) throw new Error("self_test_component_certification_forbidden");
  if (report.historical_evidence.credit !== 0) throw new Error("self_test_historical_credit_must_be_zero");
  return {
    self_test: "pass",
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    component_status: report.component_status,
    certification_claimed: report.certification_claimed,
    runtime_write_performed: false,
    endpoints,
  };
}

export async function runDonggriV1WallClockSoakCommand(args = process.argv.slice(2)) {
  if (args.includes("--daemon")) {
    requireRuntimeApproval();
    await daemon();
  } else if (args.includes("--record-one")) {
    requireRuntimeApproval();
    process.stdout.write(`${JSON.stringify(await recordOne(), null, 2)}\n`);
  } else if (args.includes("--status")) {
    process.stdout.write(`${JSON.stringify(buildStatus(readSamples()), null, 2)}\n`);
  } else if (args.includes("--self-test")) {
    process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
  } else {
    process.stderr.write("Use --status, --self-test, --record-one, or --daemon.\n");
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runDonggriV1WallClockSoakCommand();
}
