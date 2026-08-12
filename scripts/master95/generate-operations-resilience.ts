import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  Master95BudgetGate,
  Master95SloPolicySchema,
  evaluateMaster95Operations,
  runMaster95RecoveryTrial,
  type Master95SloPolicy,
} from "../../server/modules/master95/operations-resilience.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "operations");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-operations",
);
const baselinePath = path.join(qualityRoot, "SLO_RECOVERY_BUDGET_BASELINE.json");
const reportPath = path.join(reportRoot, "accelerated-soak-recovery-report.json");
const policy: Master95SloPolicy = {
  soak_hours: 72,
  availability_minimum: 0.99,
  error_rate_maximum: 0.01,
  p95_latency_ms_maximum: 2000,
  recovery_rate_minimum: 0.99,
  critical_loss_maximum: 0,
  project_budget_units: 5000,
};
const baseline = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-slo-recovery-budget-v1.json",
  title: "DonggriCompany Master95 SLO Recovery and Budget",
  version: "1.0.0",
  policy_schema: z.toJSONSchema(Master95SloPolicySchema, { target: "draft-2020-12", unrepresentable: "any" }),
  policy,
  failure_injections: ["process-loss", "checkpoint-restore", "critical-record-verification", "budget-overrun"],
  execution_mode: "time-accelerated-local-simulation",
};
const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
const budgetGate = new Master95BudgetGate(policy.project_budget_units);
const samples = Array.from({ length: policy.soak_hours * 60 }, (_, minute) => {
  const project_id = projects[minute % projects.length];
  const budget = budgetGate.reserve(project_id, 1);
  if (budget.decision !== "allow") throw new Error("unexpected_budget_denial");
  return {
    project_id,
    minute,
    status: "ok" as const,
    latency_ms: 120 + ((minute * 17) % 380),
    cost_units: 1,
  };
});
const recoveryTrials = Array.from({ length: 100 }, (_, index) =>
  runMaster95RecoveryTrial({
    trial_id: `recovery:${index + 1}`,
    state: {
      project_id: projects[index % projects.length],
      run_id: `run:recovery:${index + 1}`,
      critical_record_ids: [`approval:${index + 1}`, `artifact:${index + 1}`],
      checkpoint_sequence: index + 1,
    },
    critical_record_ids: [`approval:${index + 1}`, `artifact:${index + 1}`],
  }),
);
const evaluation = evaluateMaster95Operations({
  policy,
  samples,
  recovery_trials: recoveryTrials,
  budget_spent: budgetGate.snapshot(),
});
const overrunProbe = new Master95BudgetGate(10);
overrunProbe.reserve("project:BloggerGent", 10);
const overrunDecision = overrunProbe.reserve("project:BloggerGent", 1);
const report = {
  schema_version: "2026-07-14.master95.operations-evaluation.v1",
  status: evaluation.status === "pass" && overrunDecision.decision === "block" ? "pass" : "fail",
  execution_mode: "time-accelerated-local-simulation",
  wall_clock_72_hour_wait_performed: false,
  simulated_hours: policy.soak_hours,
  minute_samples: samples.length,
  project_count: projects.length,
  ...evaluation,
  budget_spent: budgetGate.snapshot(),
  budget_overrun_probe: overrunDecision,
  injected_failure_count: recoveryTrials.length,
  external_runtime_mutation: false,
  evaluated_at: "2026-07-14T12:00:00.000Z",
};
const outputs = [
  [baselinePath, `${JSON.stringify(baseline, null, 2)}\n`],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-operations] wrote ${report.simulated_hours}h accelerated soak evidence\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-operations] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-operations] check passed: recovery=${report.recovery_rate}, critical-loss=${report.critical_record_loss}\n`,
    );
  }
}
if (report.status !== "pass") process.exitCode = 1;
