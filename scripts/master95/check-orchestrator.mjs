import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const reportPath = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-orchestrator",
  "routing-report.json",
);
if (!fs.existsSync(reportPath)) throw new Error("orchestrator_rehearsal_report_missing");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const failures = [];
if (report.status !== "pass") failures.push("report status is not pass");
if (report.scenarios !== 20 || report.completed !== 20) failures.push("20 completed routing scenarios are required");
if (report.missing_routing_reasons !== 0) failures.push("every route step requires a reason");
if (report.infinite_loops !== 0 || report.max_observed_steps > 20) failures.push("loop bound failed");
if (Object.values(report.operation_coverage ?? {}).some((count) => count < 4))
  failures.push("five operation classes require four scenarios each");
process.stdout.write(
  `[master95-orchestrator] ${JSON.stringify({ scenarios: report.scenarios, completed: report.completed, missing_routing_reasons: report.missing_routing_reasons, infinite_loops: report.infinite_loops, max_observed_steps: report.max_observed_steps, operation_coverage: report.operation_coverage, failures }, null, 2)}\n`,
);
if (failures.length > 0) process.exitCode = 1;
