import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Master95CooOrchestrator } from "../../server/modules/master95/coo-orchestrator.js";
import {
  Master95DurableStateStore,
  Master95JsonlEventJournal,
} from "../../server/modules/master95/durable-state-store.js";
import { MASTER95_BLOGGERGENT_LANES } from "../../server/modules/master95/project-registry.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-orchestrator",
);
const journalPath = path.join(reportRoot, "routing-events.jsonl");
const reportPath = path.join(reportRoot, "routing-report.json");
fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(journalPath, "", "utf8");

const operations = [
  "read_control_plane",
  "read_repo",
  "runtime_preview",
  "write_control_plane_docs",
  "write_repo_code",
] as const;
const scenarios = Array.from({ length: 20 }, (_, index) => {
  const operation = operations[index % operations.length];
  const lane = MASTER95_BLOGGERGENT_LANES[index % MASTER95_BLOGGERGENT_LANES.length];
  return {
    scenario_id: `route-${String(index + 1).padStart(2, "0")}`,
    operation,
    lane,
  };
});
const results = [];
for (const scenario of scenarios) {
  const state = new Master95DurableStateStore(new Master95JsonlEventJournal(journalPath));
  const result = new Master95CooOrchestrator(state).execute({
    project_id: "project:BloggerGent",
    task_id: `task:${scenario.scenario_id}`,
    run_id: `run:${scenario.scenario_id}`,
    trace_id: `trace:${scenario.scenario_id}`,
    occurred_at: "2026-07-14T03:00:00+09:00",
    objective: `BloggerGent ${scenario.operation} dry-run scenario`,
    operation_class: scenario.operation,
    target_path:
      scenario.operation === "write_repo_code"
        ? "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/coo-orchestrator.ts"
        : null,
    allowed_paths: ["G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/*"],
    approvals: ["APR-M95-DOCS-001", "APR-M95-RUNTIME-ALPHA-001"],
    lane_id: scenario.lane.lane_id,
    role_agent: scenario.lane.role_agent,
    max_iterations: 20,
    max_retries_per_phase: 2,
  });
  results.push({
    scenario_id: scenario.scenario_id,
    operation: scenario.operation,
    lane_id: scenario.lane.lane_id,
    role_agent: scenario.lane.role_agent,
    status: result.status,
    routing: result.routing.map((step) => ({ department: step.department, reason_code: step.reason_code })),
    executed_steps: result.executed_steps,
    retry_count: result.retry_count,
    trace_id: result.trace_id,
  });
}

const completed = results.filter((result) => result.status === "completed").length;
const missingReasons = results.flatMap((result) => result.routing).filter((step) => !step.reason_code).length;
const maxObservedSteps = Math.max(...results.map((result) => result.executed_steps));
const report = {
  schema_version: "2026-07-14.master95.orchestrator-rehearsal.v1",
  status: completed === 20 && missingReasons === 0 && maxObservedSteps <= 20 ? "pass" : "fail",
  project_id: "project:BloggerGent",
  mode: "dry-run-no-external-effects",
  scenarios: results.length,
  completed,
  missing_routing_reasons: missingReasons,
  infinite_loops: maxObservedSteps > 20 ? 1 : 0,
  max_observed_steps: maxObservedSteps,
  operation_coverage: Object.fromEntries(
    operations.map((operation) => [operation, results.filter((result) => result.operation === operation).length]),
  ),
  results,
  journal_path: journalPath,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  `[master95-orchestrator-rehearsal] ${JSON.stringify({ ...report, results: `[${results.length} scenario records]` }, null, 2)}\n`,
);
if (report.status !== "pass") process.exitCode = 1;
