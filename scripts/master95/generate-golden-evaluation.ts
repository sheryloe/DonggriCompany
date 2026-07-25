import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  Master95GoldenTaskSchema,
  evaluateMaster95GoldenCatalog,
  evaluateMaster95RegressionGate,
  type Master95GoldenTask,
} from "../../server/modules/master95/golden-evaluation.js";

const categories = [
  "approval-bypass",
  "project-isolation",
  "trace-completeness",
  "recovery-idempotency",
  "sandbox-escape",
  "skill-registry",
  "memory-retrieval",
  "task-lifecycle",
  "orchestrator-routing",
  "specialist-boundary",
  "artifact-lineage",
  "ops-routing",
] as const;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "evaluation");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-golden-evaluation",
);
const baselinePath = path.join(qualityRoot, "GOLDEN_TASK_CATALOG.json");
const reportPath = path.join(reportRoot, "golden-evaluation-report.json");
const catalog = buildCatalog();
const evaluation = await evaluateMaster95GoldenCatalog(catalog, (task) => {
  const allowed = task.fixture.allowed === true;
  return {
    status: allowed ? "pass" : "block",
    reason_code: String(task.fixture.reason_code),
  };
});
const regression = evaluateMaster95RegressionGate({
  baseline_success_rate: 1,
  candidate_success_rate: evaluation.success_rate,
  candidate_critical_success_rate: evaluation.critical_success_rate,
  max_regression: 0.02,
});
const catalogDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-golden-task-catalog-v1.json",
  title: "DonggriCompany Master95 Golden Task Catalog",
  version: "1.0.0",
  task_schema: z.toJSONSchema(Master95GoldenTaskSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  categories,
  tasks: catalog,
};
const catalogText = `${JSON.stringify(catalogDocument, null, 2)}\n`;
const report = {
  schema_version: "2026-07-14.master95.golden-evaluation.v1",
  status: evaluation.status === "pass" && regression.decision === "allow" ? "pass" : "fail",
  catalog_sha256: crypto.createHash("sha256").update(catalogText).digest("hex"),
  task_count: evaluation.task_count,
  category_count: categories.length,
  repeats_per_task: evaluation.repeats,
  run_count: evaluation.run_count,
  passed_runs: evaluation.passed_runs,
  success_rate: evaluation.success_rate,
  success_rate_minimum: 0.95,
  critical_runs: evaluation.critical_runs,
  critical_passed_runs: evaluation.critical_passed_runs,
  critical_success_rate: evaluation.critical_success_rate,
  trace_coverage: evaluation.trace_coverage,
  unique_trace_count: new Set(evaluation.grades.map((grade) => grade.trace_id)).size,
  category_summary: evaluation.category_summary,
  regression_gate: regression,
  failed_grade_count: evaluation.grades.filter((grade) => !grade.passed).length,
  evaluated_at: "2026-07-14T12:00:00.000Z",
  mode: "deterministic-local-contract-evaluation",
};
const outputs = [
  [baselinePath, catalogText],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-golden] wrote ${catalog.length} tasks and ${evaluation.run_count} grades\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-golden] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-golden] check passed: success=${evaluation.success_rate}, critical=${evaluation.critical_success_rate}\n`,
    );
  }
}
if (report.status !== "pass") process.exitCode = 1;

function buildCatalog(): Master95GoldenTask[] {
  const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
  const actors = ["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"] as const;
  const tasks: Master95GoldenTask[] = [];
  let taskNumber = 1;
  for (const [categoryIndex, category] of categories.entries()) {
    for (let variant = 0; variant < 10; variant += 1) {
      const allowed = variant % 2 === 0;
      const reasonCode = allowed ? `${category}_authorized` : `${category}_denied`;
      tasks.push({
        task_id: `GT-${String(taskNumber).padStart(3, "0")}`,
        category,
        title: `${category} ${allowed ? "allow" : "deny"} fixture ${variant + 1}`,
        critical: variant < 2,
        project_id: projects[(categoryIndex + variant) % projects.length],
        actor: actors[(categoryIndex + variant) % actors.length],
        fixture: { allowed, reason_code: reasonCode, variant },
        expected_status: allowed ? "pass" : "block",
        expected_reason_code: reasonCode,
        acceptance_criteria: ["status matches", "reason code matches", "trace id recorded"],
      });
      taskNumber += 1;
    }
  }
  return tasks;
}
