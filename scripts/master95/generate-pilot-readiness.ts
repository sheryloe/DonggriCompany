import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  Master95IndependentAssessmentSchema,
  Master95PilotRunSchema,
  evaluateMaster95PilotCertification,
} from "../../server/modules/master95/pilot-certification.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "pilot");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-pilot",
);
const baselinePath = path.join(qualityRoot, "PILOT_CERTIFICATION_BASELINE.json");
const reportPath = path.join(reportRoot, "pilot-readiness-report.json");
const emptyObservation = {
  started_at: "2026-07-14T12:00:00.000Z",
  evaluated_at: "2026-07-14T12:00:00.000Z",
  clock_source: "system-wall-clock" as const,
  backdated_records_count: 0,
};
const readiness = evaluateMaster95PilotCertification({
  runs: [],
  assessments: [],
  all_other_hard_gates_pass: false,
  observation: emptyObservation,
});
const baseline = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-pilot-certification-v1.json",
  title: "DonggriCompany Master95 Pilot Certification",
  version: "1.0.0",
  pilot_run_schema: z.toJSONSchema(Master95PilotRunSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  independent_assessment_schema: z.toJSONSchema(Master95IndependentAssessmentSchema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }),
  required_projects: 3,
  required_runs: 500,
  required_observed_days: 30,
  required_success_rate: 0.95,
  required_critical_success_rate: 1,
  required_independent_assessments: 2,
  required_distinct_assessors: true,
  maximum_independent_score_delta: 2,
  adjudication_required_above_maximum_delta: true,
  required_agy_axis_minimum: 950,
  required_work_types: ["code", "document", "research", "image"],
  required_scenario_types: ["normal", "failure", "cancel", "approval", "recovery"],
  required_concurrent_projects: 2,
  required_version_changes: ["agent", "skill", "memory"],
  maximum_recording_delay_seconds: 300,
};
const report = {
  schema_version: "2026-07-14.master95.pilot-readiness.v1",
  status: readiness.status,
  ...readiness,
  simulated_or_backdated_runs_counted: 0,
  certification_claimed: false,
  next_safe_action: "Begin the real approval-bounded 30-day pilot only after Steps 5, 17, 18, and 19 live gates pass.",
  generated_at: "2026-07-14T12:00:00.000Z",
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
  process.stdout.write("[master95-pilot] wrote readiness gate; certification remains pending\n");
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-pilot] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`[master95-pilot] readiness check passed: certification=${report.certification_claimed}\n`);
  }
}
