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
  "master95-persistence",
  "restart-trial-report.json",
);
if (!fs.existsSync(reportPath)) throw new Error("persistence_rehearsal_report_missing");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const failures = [];
if (report.status !== "pass") failures.push("report status is not pass");
if (report.trials !== 100) failures.push("exactly 100 restart trials are required");
if (report.recovery_rate_percent < 99) failures.push("recovery rate is below 99 percent");
if (report.duplicate_external_executions !== 0) failures.push("duplicate external executions must be zero");
if (report.external_effect_records !== report.trials)
  failures.push("exactly one external effect record per trial is required");
if (!/^[a-f0-9]{64}$/.test(report.journal_sha256 ?? "")) failures.push("journal sha256 is missing");
process.stdout.write(`[master95-persistence] ${JSON.stringify({ ...report, failures }, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
