import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Master95CooOrchestrator } from "../../server/modules/master95/coo-orchestrator.js";
import {
  resolveDonggriV1CandidateRuntimeRoot,
  type DonggriV1CandidateBinding,
  type DonggriV1Heartbeat,
} from "../../server/modules/master95/candidate-observation.js";
import {
  Master95DurableStateStore,
  Master95JsonlEventJournal,
} from "../../server/modules/master95/durable-state-store.js";
import {
  DONGGRI_V1_REQUIRED_PILOT_PROJECTS,
  evaluateDonggriV1CandidatePilotCertification,
  type DonggriV1CandidatePilotRun,
} from "../../server/modules/master95/pilot-certification.js";
import { runMaster95RecoveryTrial } from "../../server/modules/master95/operations-resilience.js";
import { runMaster95IntegratedPilotWorkflow } from "../../server/modules/master95/pilot-integrated-workflow.js";
import {
  MASTER95_PILOT_SCENARIO_TYPES,
  MASTER95_PILOT_WORK_TYPES,
  calculateMaster95PilotNextBatchDelay,
  createMaster95PilotScenarioPlan,
} from "../../server/modules/master95/pilot-scenario-plan.js";
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
const runtimeRoot = path.join(candidateRuntimeRoot, "pilot-30d");
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
const candidateStatusPath = path.join(candidateInputRoot, "runtime-status", "pilot-30d.json");
const componentReportPath = path.join(candidateInputRoot, "component-reports", "thirty_day_pilot_report.json");
const approvalLedgerPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "approvals.md",
);
const hardGatesPath = path.join(candidateInputRoot, "prerequisites", "hard-gates.json");
const runsPath = path.join(runtimeRoot, "pilot-runs.jsonl");
const eventsPath = path.join(runtimeRoot, "pilot-events.jsonl");
const heartbeatPath = path.join(runtimeRoot, "pilot-heartbeats.jsonl");
const statePath = path.join(runtimeRoot, "pilot-state.json");
const assessmentsPath = path.join(runtimeRoot, "pilot-independent-assessments.json");
const artifactRoot = path.join(runtimeRoot, "artifacts");
const projects = [...DONGGRI_V1_REQUIRED_PILOT_PROJECTS];
const heartbeatIntervalMs = 60_000;
const batchIntervalMs = 4 * 60 * 60 * 1000;
const historicalRunCount = 111;

function readJsonLines<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function initialStartedAt(evaluatedAt: string) {
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      observation?: { started_at?: unknown };
    };
    if (typeof state.observation?.started_at === "string") return state.observation.started_at;
  }
  const firstHeartbeat = readJsonLines<DonggriV1Heartbeat>(heartbeatPath)[0];
  return firstHeartbeat?.recorded_at ?? evaluatedAt;
}

async function healthSnapshot() {
  const inspect = async (url: string) => {
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return { ok: response.ok, status: response.status, latency_ms: Math.round(performance.now() - started) };
    } catch {
      return { ok: false, status: null, latency_ms: Math.round(performance.now() - started) };
    }
  };
  const [web, api] = await Promise.all([
    inspect("http://127.0.0.1:8800/"),
    inspect("http://127.0.0.1:8790/api/health"),
  ]);
  return { web, api };
}

async function runProject(input: { projectId: string; index: number; batchId: string; epoch: 1 | 2 }) {
  const startedAt = new Date().toISOString();
  const workType = MASTER95_PILOT_WORK_TYPES[input.index % MASTER95_PILOT_WORK_TYPES.length];
  const scenario = MASTER95_PILOT_SCENARIO_TYPES[input.index % MASTER95_PILOT_SCENARIO_TYPES.length];
  const plan = createMaster95PilotScenarioPlan(workType, scenario);
  const suffix = `${input.batchId}:${input.projectId.split(":")[1]}`;
  const runId = `pilot:${suffix}`;
  const traceId = `trace:${suffix}`;
  const health = await healthSnapshot();
  const journal = new Master95JsonlEventJournal(eventsPath);
  const orchestrator = new Master95CooOrchestrator(
    new Master95DurableStateStore(journal),
    undefined,
    undefined,
    scenario === "failure"
      ? () => ({ ok: false as const, reason: "pilot_injected_failure", retryable: false })
      : (_step, attempt) => ({ ok: true as const, evidence_refs: [`pilot:${scenario}:attempt:${attempt}`] }),
  );
  const result = orchestrator.execute({
    project_id: input.projectId,
    task_id: `task:${suffix}`,
    run_id: runId,
    trace_id: traceId,
    occurred_at: startedAt,
    objective: `${workType} ${scenario} production-like local dry-run`,
    operation_class: plan.operation_class,
    target_path: plan.target_path,
    allowed_paths: plan.allowed_paths,
    approvals: plan.approvals,
    cancel_after_step: plan.cancel_after_step,
  });
  const recovery =
    scenario === "recovery"
      ? runMaster95RecoveryTrial({
          trial_id: `recovery:${runId}`,
          state: { project_id: input.projectId, run_id: runId, critical_record_ids: [`artifact:${runId}`] },
          critical_record_ids: [`artifact:${runId}`],
        })
      : null;
  const completedAt = new Date().toISOString();
  const passed =
    result.status === plan.expected_status &&
    health.web.ok &&
    health.api.ok &&
    (recovery === null || recovery.recovered);
  const artifactPath = path.join(artifactRoot, `${runId.replaceAll(":", "-")}.json`);
  const workflowStageReceipts =
    scenario === "normal"
      ? runMaster95IntegratedPilotWorkflow({
          run_id: runId,
          project_id: input.projectId,
          occurred_at: completedAt,
        })
      : [];
  const artifact = {
    schema_version: "2026-07-25.dongri-grigri-v1.production-like-artifact.v1",
    ...binding,
    project_id: input.projectId,
    run_id: runId,
    trace_id: traceId,
    work_type: workType,
    scenario_type: scenario,
    expected_status: plan.expected_status,
    observed_status: result.status,
    health,
    recovery,
    result,
    workflow_stage_receipts: workflowStageReceipts,
    external_effects: false,
  };
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const run: DonggriV1CandidatePilotRun = {
    ...binding,
    run_id: runId,
    project_id: input.projectId,
    started_at: startedAt,
    completed_at: completedAt,
    recorded_at: new Date().toISOString(),
    status: passed ? "pass" : "fail",
    critical: scenario === "approval" || scenario === "recovery",
    work_type: workType,
    scenario_type: scenario,
    concurrency_group_id: input.batchId,
    agent_version: `master95-agent-pilot-v${input.epoch}`,
    skill_version: `master95-skill-pilot-v${input.epoch}`,
    memory_version: `master95-memory-pilot-v${input.epoch}`,
    trace_id: traceId,
    trace_span_count: Math.max(1, result.routing.length + 2),
    artifact_refs: [artifactPath],
    evidence_refs: [eventsPath, artifactPath],
    workflow_stage_receipts: workflowStageReceipts,
  };
  fs.appendFileSync(runsPath, `${JSON.stringify(run)}\n`, "utf8");
  return run;
}

function readAssessments() {
  if (!fs.existsSync(assessmentsPath)) return [];
  return JSON.parse(fs.readFileSync(assessmentsPath, "utf8")) as unknown[];
}

function allOtherHardGatesPass() {
  if (!fs.existsSync(hardGatesPath)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(hardGatesPath, "utf8")) as {
      candidate_id?: unknown;
      source_epoch?: unknown;
      hard_gates?: unknown;
    };
    if (record.candidate_id !== binding.candidate_id || record.source_epoch !== binding.source_epoch) return false;
    if (!Array.isArray(record.hard_gates) || record.hard_gates.length !== 10) return false;
    return record.hard_gates.every(
      (gate) =>
        typeof gate === "object" &&
        gate !== null &&
        "status" in gate &&
        (gate as { status: unknown }).status === "pass",
    );
  } catch {
    return false;
  }
}

function readCollectorPid() {
  if (!fs.existsSync(statePath)) return null;
  const pid = Number(JSON.parse(fs.readFileSync(statePath, "utf8")).collector_pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function requireRuntimeApproval() {
  const ledger = fs.readFileSync(approvalLedgerPath, "utf8");
  const section = ledger.match(/^#{2,3} APR-V1-RUNTIME-001\s*\r?\n([\s\S]*?)(?=^#{2,3}\s|\z)/m)?.[1] ?? "";
  if (!/policy_decision:\s*`?approved`?/i.test(section)) {
    throw new Error("APR-V1-RUNTIME-001_required");
  }
}

function buildStatus(
  startedAt: string,
  evaluatedAt = new Date().toISOString(),
  collectorPid: number | null = readCollectorPid(),
  overrides?: {
    runs: DonggriV1CandidatePilotRun[];
    heartbeats: DonggriV1Heartbeat[];
    assessments: unknown[];
    allOtherHardGatesPass: boolean;
  },
) {
  const runs = overrides?.runs ?? readJsonLines<DonggriV1CandidatePilotRun>(runsPath);
  const heartbeats = overrides?.heartbeats ?? readJsonLines<DonggriV1Heartbeat>(heartbeatPath);
  const evaluation = evaluateDonggriV1CandidatePilotCertification({
    binding,
    runs,
    heartbeats,
    assessments: overrides?.assessments ?? readAssessments(),
    all_other_hard_gates_pass: overrides?.allOtherHardGatesPass ?? allOtherHardGatesPass(),
    observation: {
      started_at: startedAt,
      evaluated_at: evaluatedAt,
      clock_source: "system-wall-clock",
      backdated_records_count: 0,
    },
    unresolved_critical: 0,
    unresolved_sev1: 0,
    historical_run_count: historicalRunCount,
  });
  const remainingToThirtyDaysMs = Math.max(0, Date.parse(startedAt) + 30 * 86_400_000 - Date.parse(evaluatedAt));
  const batchesTo500 = Math.max(0, Math.ceil((500 - runs.length) / projects.length));
  const projectedAdditionalRuns = Math.floor(remainingToThirtyDaysMs / batchIntervalMs) * projects.length;
  const projectedRunCount = runs.length + projectedAdditionalRuns;
  const currentPassed = runs.filter((run) => run.status === "pass").length;
  const trajectory = {
    certification_credit: "none-forecast-only",
    assumptions: [
      "collector remains continuously alive",
      "candidate-bound heartbeat is appended every 60 seconds",
      "three project runs complete every four hours",
      "all future scheduled runs pass",
    ],
    batch_interval_ms: batchIntervalMs,
    projects_per_batch: projects.length,
    remaining_runs_to_500: Math.max(0, 500 - runs.length),
    batches_to_500: batchesTo500,
    estimated_run_count_gate_at: new Date(Date.parse(evaluatedAt) + batchesTo500 * batchIntervalMs).toISOString(),
    estimated_observation_gate_at: new Date(Date.parse(startedAt) + 30 * 86_400_000).toISOString(),
    scheduled_version_epoch_2_at: new Date(Date.parse(startedAt) + 15 * 86_400_000).toISOString(),
    projected_run_count_at_30_days: projectedRunCount,
    projected_success_rate_at_30_days:
      projectedRunCount > 0 ? (currentPassed + projectedAdditionalRuns) / projectedRunCount : 0,
  };
  return {
    schema_version: "2026-07-25.dongri-grigri-v1.live-pilot.v1",
    report_type: "candidate-runtime-component",
    component: "thirty_day_pilot_report",
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    evidence_mode: "actual",
    component_status: evaluation.component_status,
    certification_claimed: false,
    execution_mode: "production-like-local-dry-run-no-external-effects",
    collector_pid: collectorPid,
    observation: { started_at: startedAt, evaluated_at: evaluatedAt },
    runtime_evidence: {
      root: runtimeRoot,
      runs: runsPath,
      events: eventsPath,
      heartbeats: heartbeatPath,
      assessments: assessmentsPath,
    },
    ...evaluation,
    trajectory,
    historical_evidence: {
      source: "Master95 2026-07-15 Pilot",
      run_count: historicalRunCount,
      credited_run_count: 0,
      credited_observation_days: 0,
      credited: false,
    },
    next_safe_action: "APR-V1-RUNTIME-001 승인 후에만 candidate-bound heartbeat와 production-like Run 수집을 시작한다.",
    mutations: { publish: false, db: false, docker: false, deploy: false, git: false, agentmemory: false },
  };
}

function sha256(content: string | Buffer) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function persistStatus(report: ReturnType<typeof buildStatus>) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(candidateStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(componentReportPath), { recursive: true });
  const statusContent = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(statePath, statusContent, "utf8");
  fs.writeFileSync(candidateStatusPath, statusContent, "utf8");
  const componentReport = {
    schema: "donggri-component-report/v1",
    report_type: "component",
    component: "thirty_day_pilot_report",
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    generated_at: report.observation.evaluated_at,
    evidence_mode: "actual",
    component_status: report.component_status,
    certification_claimed: false,
    evidence_files: [
      {
        path: path.relative(path.dirname(componentReportPath), candidateStatusPath).replaceAll("\\", "/"),
        sha256: sha256(statusContent),
        bytes: Buffer.byteLength(statusContent),
      },
    ],
    summary:
      report.component_status === "pass"
        ? "후보별 30일 Pilot과 500 Run Gate가 통과했습니다."
        : "후보별 Pilot은 실제 heartbeat와 production-like Run을 수집 중입니다.",
  };
  fs.writeFileSync(componentReportPath, `${JSON.stringify(componentReport, null, 2)}\n`, "utf8");
  return report;
}

function recordHeartbeat(startedAt: string, collectorPid = process.pid) {
  const heartbeats = readJsonLines<DonggriV1Heartbeat>(heartbeatPath);
  const now = new Date();
  const last = heartbeats.at(-1);
  if (last && now.getTime() - Date.parse(last.recorded_at) < 30_000) {
    return persistStatus(buildStatus(startedAt, now.toISOString(), collectorPid));
  }
  const heartbeat: DonggriV1Heartbeat = {
    schema_version: "dongri-grigri-v1.heartbeat.v1",
    ...binding,
    sequence: heartbeats.length + 1,
    recorded_at: now.toISOString(),
    collector_instance_id: `pilot-collector-${collectorPid}`,
  };
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.appendFileSync(heartbeatPath, `${JSON.stringify(heartbeat)}\n`, "utf8");
  return persistStatus(buildStatus(startedAt, now.toISOString(), collectorPid));
}

async function runBatch(startedAt: string, collectorPid = process.pid) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const existingRuns = readJsonLines<DonggriV1CandidatePilotRun>(runsPath);
  const batchIndex = Math.floor(existingRuns.length / projects.length);
  const batchId = `batch:${String(batchIndex + 1).padStart(4, "0")}:${Date.now()}`;
  const elapsedDays = (Date.now() - Date.parse(startedAt)) / 86_400_000;
  const epoch = elapsedDays >= 15 ? 2 : 1;
  await Promise.all(
    projects.map((projectId, projectIndex) =>
      runProject({ projectId, index: existingRuns.length + projectIndex, batchId, epoch }),
    ),
  );
  return persistStatus(buildStatus(startedAt, new Date().toISOString(), collectorPid));
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
  if (collectorAlreadyRunning()) throw new Error("live_pilot_collector_already_running");
  const now = new Date().toISOString();
  const startedAt = initialStartedAt(now);
  recordHeartbeat(startedAt);
  const existingRuns = readJsonLines<DonggriV1CandidatePilotRun>(runsPath);
  const nextBatchDelayMs = calculateMaster95PilotNextBatchDelay({
    completed_at: existingRuns.map((run) => String(run.completed_at)),
    now_ms: Date.now(),
    batch_interval_ms: batchIntervalMs,
  });
  const runAndRepeat = async () => {
    await runBatch(startedAt);
    setInterval(() => {
      runBatch(startedAt).catch((error) => process.stderr.write(`[dongri-v1-live-pilot] ${String(error)}\n`));
    }, batchIntervalMs);
  };
  setInterval(() => {
    try {
      recordHeartbeat(startedAt);
    } catch (error) {
      process.stderr.write(`[dongri-v1-live-pilot] heartbeat ${String(error)}\n`);
    }
  }, heartbeatIntervalMs);
  if (nextBatchDelayMs === 0) await runAndRepeat();
  else {
    setTimeout(() => {
      runAndRepeat().catch((error) => process.stderr.write(`[dongri-v1-live-pilot] ${String(error)}\n`));
    }, nextBatchDelayMs);
  }
  process.stdout.write(
    `[dongri-v1-live-pilot] collector started candidate=${binding.candidate_id} pid=${process.pid} runs=${existingRuns.length} next_batch_delay_ms=${nextBatchDelayMs}\n`,
  );
}

function selfTest() {
  const evaluatedAt = "2026-07-25T00:00:00.000Z";
  const report = buildStatus(evaluatedAt, evaluatedAt, null, {
    runs: [],
    heartbeats: [],
    assessments: [],
    allOtherHardGatesPass: false,
  });
  if (report.component_status !== "collecting") throw new Error("self_test_uncollected_pilot_must_collect");
  if (report.certification_claimed !== false) throw new Error("self_test_component_certification_forbidden");
  if (report.historical_evidence.credited_run_count !== 0) {
    throw new Error("self_test_historical_run_credit_must_be_zero");
  }
  if (report.credited_observation_days !== 0) {
    throw new Error("self_test_heartbeat_credit_must_start_at_zero");
  }
  return {
    self_test: "pass",
    candidate_id: binding.candidate_id,
    source_epoch: binding.source_epoch,
    project_ids: projects.map((projectId) => projectId.replace(/^project:/, "")),
    heartbeat_interval_seconds: 60,
    component_status: report.component_status,
    certification_claimed: report.certification_claimed,
    historical_run_count_credited: report.historical_evidence.credited_run_count,
    runtime_write_performed: false,
  };
}

if (process.argv.includes("--daemon")) {
  requireRuntimeApproval();
  await daemon();
} else if (process.argv.includes("--run-batch")) {
  requireRuntimeApproval();
  const evaluatedAt = new Date().toISOString();
  const startedAt = initialStartedAt(evaluatedAt);
  process.stdout.write(`${JSON.stringify(await runBatch(startedAt), null, 2)}\n`);
} else if (process.argv.includes("--heartbeat-once")) {
  requireRuntimeApproval();
  const evaluatedAt = new Date().toISOString();
  const startedAt = initialStartedAt(evaluatedAt);
  process.stdout.write(`${JSON.stringify(recordHeartbeat(startedAt), null, 2)}\n`);
} else if (process.argv.includes("--status")) {
  const evaluatedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify(buildStatus(initialStartedAt(evaluatedAt), evaluatedAt), null, 2)}\n`);
} else if (process.argv.includes("--self-test")) {
  process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
} else {
  process.stderr.write("Use --status, --self-test, --heartbeat-once, --run-batch, or --daemon.\n");
  process.exitCode = 2;
}
