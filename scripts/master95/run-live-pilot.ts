import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Master95CooOrchestrator } from "../../server/modules/master95/coo-orchestrator.js";
import {
  Master95DurableStateStore,
  Master95JsonlEventJournal,
} from "../../server/modules/master95/durable-state-store.js";
import {
  evaluateMaster95PilotCertification,
  type Master95PilotRun,
} from "../../server/modules/master95/pilot-certification.js";
import { runMaster95RecoveryTrial } from "../../server/modules/master95/operations-resilience.js";
import { runMaster95IntegratedPilotWorkflow } from "../../server/modules/master95/pilot-integrated-workflow.js";
import {
  MASTER95_PILOT_SCENARIO_TYPES,
  MASTER95_PILOT_WORK_TYPES,
  calculateMaster95PilotNextBatchDelay,
  createMaster95PilotScenarioPlan,
} from "../../server/modules/master95/pilot-scenario-plan.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const runtimeRoot = process.env.MASTER95_RUNTIME_ROOT
  ? path.resolve(process.env.MASTER95_RUNTIME_ROOT, "live-pilot")
  : "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\live-pilot";
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-pilot",
);
const runsPath = path.join(runtimeRoot, "pilot-runs.jsonl");
const eventsPath = path.join(runtimeRoot, "pilot-events.jsonl");
const statePath = path.join(runtimeRoot, "pilot-state.json");
const assessmentsPath = path.join(runtimeRoot, "pilot-independent-assessments.json");
const artifactRoot = path.join(runtimeRoot, "artifacts");
const reportPath = path.join(reportRoot, "live-pilot-status.json");
const trajectoryReportPath = path.join(reportRoot, "pilot-trajectory-report.json");
const evidenceIndexPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "quality",
  "master-95",
  "EVIDENCE_INDEX.yaml",
);
const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
const batchIntervalMs = 4 * 60 * 60 * 1000;

function readJsonLines(file: string) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function initialStartedAt() {
  if (!fs.existsSync(statePath)) return new Date().toISOString();
  return JSON.parse(fs.readFileSync(statePath, "utf8")).observation.started_at as string;
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
      ? runMaster95IntegratedPilotWorkflow({ run_id: runId, project_id: input.projectId, occurred_at: completedAt })
      : [];
  const artifact = {
    schema_version: "2026-07-15.master95.production-like-artifact.v1",
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
  const run: Master95PilotRun = {
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
  return JSON.parse(fs.readFileSync(assessmentsPath, "utf8"));
}

function allOtherHardGatesPass() {
  const source = fs.readFileSync(evidenceIndexPath, "utf8");
  const block = source.match(/^hard_gates:\r?\n((?: {2}.+\r?\n)+)/m)?.[1] ?? "";
  const gates = [...block.matchAll(/^ {2}([a-z0-9_]+):\s+(pass|pending|fail)\s*$/gm)]
    .map((match) => ({ id: match[1], status: match[2] }))
    .filter((gate) => gate.id !== "independent_reassessment_all_95_plus");
  return gates.length > 0 && gates.every((gate) => gate.status === "pass");
}

function readCollectorPid() {
  if (!fs.existsSync(statePath)) return null;
  const pid = Number(JSON.parse(fs.readFileSync(statePath, "utf8")).collector_pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writeStatus(startedAt: string, collectorPid: number | null = readCollectorPid()) {
  const runs = readJsonLines(runsPath);
  const evaluatedAt = new Date().toISOString();
  const evaluation = evaluateMaster95PilotCertification({
    runs,
    assessments: readAssessments(),
    all_other_hard_gates_pass: allOtherHardGatesPass(),
    observation: {
      started_at: startedAt,
      evaluated_at: evaluatedAt,
      clock_source: "system-wall-clock",
      backdated_records_count: 0,
    },
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
      "three project runs complete every four hours",
      "all future scheduled runs pass",
      "wall-clock records remain append-only and are not backdated",
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
  const report = {
    schema_version: "2026-07-15.master95.live-pilot.v1",
    execution_mode: "production-like-local-dry-run-no-external-effects",
    collector_pid: collectorPid,
    observation: { started_at: startedAt, evaluated_at: evaluatedAt },
    certification_claimed: evaluation.status === "pass",
    ...evaluation,
    trajectory,
    next_safe_action:
      "Continue real-time collection; independent assessments remain separate after all runtime gates pass.",
    mutations: { publish: false, db: false, docker: false, deploy: false, git: false, agentmemory: false },
  };
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    trajectoryReportPath,
    `${JSON.stringify(
      {
        schema_version: "2026-07-15.master95.pilot-trajectory.v1",
        generated_at: evaluatedAt,
        certification_claimed: false,
        current: {
          run_count: evaluation.run_count,
          observed_days: evaluation.observed_days,
          success_rate: evaluation.success_rate,
          critical_success_rate: evaluation.critical_success_rate,
          integrated_e2e_scenario_observed: evaluation.gates.integrated_e2e_scenario_observed,
        },
        trajectory,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return report;
}

async function runBatch(collectorPid = process.pid) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const startedAt = initialStartedAt();
  const existingRuns = readJsonLines(runsPath);
  const batchIndex = Math.floor(existingRuns.length / projects.length);
  const batchId = `batch:${String(batchIndex + 1).padStart(4, "0")}:${Date.now()}`;
  const elapsedDays = (Date.now() - Date.parse(startedAt)) / 86_400_000;
  const epoch = elapsedDays >= 15 ? 2 : 1;
  await Promise.all(
    projects.map((projectId, projectIndex) =>
      runProject({ projectId, index: existingRuns.length + projectIndex, batchId, epoch }),
    ),
  );
  return writeStatus(startedAt, collectorPid);
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
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const startedAt = initialStartedAt();
  const existingRuns = readJsonLines(runsPath);
  const nextBatchDelayMs = calculateMaster95PilotNextBatchDelay({
    completed_at: existingRuns.map((run) => String(run.completed_at)),
    now_ms: Date.now(),
    batch_interval_ms: batchIntervalMs,
  });
  const runAndRepeat = async () => {
    await runBatch();
    setInterval(() => {
      runBatch().catch((error) => process.stderr.write(`[master95-live-pilot] ${String(error)}\n`));
    }, batchIntervalMs);
  };
  if (nextBatchDelayMs === 0) await runAndRepeat();
  else {
    writeStatus(startedAt, process.pid);
    setTimeout(() => {
      runAndRepeat().catch((error) => process.stderr.write(`[master95-live-pilot] ${String(error)}\n`));
    }, nextBatchDelayMs);
  }
  process.stdout.write(
    `[master95-live-pilot] collector started pid=${process.pid} runs=${existingRuns.length} next_batch_delay_ms=${nextBatchDelayMs}\n`,
  );
}

if (process.argv.includes("--daemon")) {
  await daemon();
} else if (process.argv.includes("--status")) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  process.stdout.write(`${JSON.stringify(writeStatus(initialStartedAt(), readCollectorPid()), null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(await runBatch(), null, 2)}\n`);
}
