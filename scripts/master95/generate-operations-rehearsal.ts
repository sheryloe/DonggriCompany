import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  Master95BudgetGate,
  Master95RateLimitGate,
  asMaster95CheckpointResilienceTrial,
  evaluateMaster95ResilienceRehearsal,
  runMaster95GuardBlockTrial,
  runMaster95ProviderIsolationTrial,
  runMaster95QueueRecoveryTrial,
  runMaster95RecoveryTrial,
  runMaster95ReleaseRollbackTrial,
  type Master95ResilienceTrial,
} from "../../server/modules/master95/operations-resilience.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "quality",
  "master-95",
  "operations",
  "RESILIENCE_REHEARSAL_BASELINE.json",
);
const reportPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-15",
  "master95-operations",
  "resilience-rehearsal-report.json",
);
const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
const trials: Master95ResilienceTrial[] = [];

for (let index = 0; index < 100; index += 1) {
  const projectId = projects[index % projects.length];
  trials.push(
    asMaster95CheckpointResilienceTrial(
      runMaster95RecoveryTrial({
        trial_id: `checkpoint:${index + 1}`,
        state: {
          project_id: projectId,
          critical_record_ids: [`approval:${index + 1}`, `artifact:${index + 1}`],
        },
        critical_record_ids: [`approval:${index + 1}`, `artifact:${index + 1}`],
      }),
    ),
  );
  trials.push(
    runMaster95QueueRecoveryTrial({
      trial_id: `queue:${index + 1}`,
      project_id: projectId,
      item_ids: [`task:${index}:a`, `task:${index}:b`, `task:${index}:b`],
      critical_item_ids: [`task:${index}:a`],
      fail_once_item_ids: [`task:${index}:a`, `task:${index}:b`],
      max_retries: 1,
    }),
  );
  for (const scenario of ["tool_provider_isolation", "model_provider_fallback"] as const)
    trials.push(
      runMaster95ProviderIsolationTrial({
        trial_id: `${scenario}:${index + 1}`,
        scenario,
        failed_provider_id: `${scenario}:primary`,
        providers: [
          { provider_id: `${scenario}:primary`, healthy: false },
          { provider_id: `${scenario}:fallback`, healthy: true },
        ],
      }),
    );
  trials.push(
    runMaster95ReleaseRollbackTrial({
      trial_id: `rollback:${index + 1}`,
      previous_version: "master95-runtime-v1",
      candidate_version: "master95-runtime-v2-canary",
      canary_checks: [true, index % 2 === 0, false],
    }),
  );

  const budget = new Master95BudgetGate(10);
  budget.reserve(projectId, 10);
  const budgetBefore = budget.snapshot()[projectId];
  const budgetDecision = budget.reserve(projectId, 1);
  const budgetAfter = budget.snapshot()[projectId];
  trials.push(
    runMaster95GuardBlockTrial({
      trial_id: `budget:${index + 1}`,
      scenario: "budget_overrun_block",
      decision: budgetDecision.decision,
      before: budgetBefore,
      after: budgetAfter,
      reason_code: budgetDecision.reason_code,
    }),
  );

  const rate = new Master95RateLimitGate(10);
  rate.reserve(projectId, 10);
  const rateBefore = rate.snapshot()[projectId];
  const rateDecision = rate.reserve(projectId, 1);
  const rateAfter = rate.snapshot()[projectId];
  trials.push(
    runMaster95GuardBlockTrial({
      trial_id: `rate:${index + 1}`,
      scenario: "rate_limit_block",
      decision: rateDecision.decision,
      before: rateBefore,
      after: rateAfter,
      reason_code: rateDecision.reason_code,
    }),
  );
}

const evaluation = evaluateMaster95ResilienceRehearsal({
  trials,
  minimum_trials_per_scenario: 100,
  recovery_rate_minimum: 0.99,
});
const baseline = {
  schema_version: "2026-07-15.master95.resilience-rehearsal.v1",
  required_scenarios: [
    "checkpoint_restore",
    "queue_recovery",
    "tool_provider_isolation",
    "model_provider_fallback",
    "release_auto_rollback",
    "budget_overrun_block",
    "rate_limit_block",
  ],
  minimum_trials_per_scenario: 100,
  recovery_rate_minimum: 0.99,
  critical_record_loss_maximum: 0,
  duplicate_effects_maximum: 0,
  execution_mode: "deterministic-local-fault-injection-no-external-effects",
};
const report = {
  ...baseline,
  status: evaluation.status,
  certification_claimed: false,
  production_db_backup_restore_performed: false,
  docker_or_deploy_rehearsal_performed: false,
  wall_clock_72_hour_soak_complete: false,
  ...evaluation,
  project_count: projects.length,
  sampled_trials: trials.filter((_, index) => index % 100 === 0).slice(0, 14),
  mutations: { publish: false, db: false, docker: false, deploy: false, git: false, agentmemory: false },
  evaluated_at: "2026-07-15T05:40:00+09:00",
};
const outputs = [
  [qualityPath, `${JSON.stringify(baseline, null, 2)}\n`],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-resilience] wrote ${evaluation.trial_count} local fault-injection trials\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-resilience] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-resilience] check passed: ${evaluation.passed_trials}/${evaluation.trial_count}, critical-loss=${evaluation.critical_record_loss}\n`,
    );
  }
}
if (evaluation.status !== "pass") process.exitCode = 1;
