import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_REQUIRED_SPANS,
  Master95LogSchema,
  Master95MetricSchema,
  Master95ObservabilityCollector,
  Master95SpanSchema,
} from "../../server/modules/master95/observability.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "observability");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-observability",
);
const baselinePath = path.join(qualityRoot, "OBSERVABILITY_BASELINE.json");
const reportPath = path.join(reportRoot, "trace-completeness-report.json");

const baseline = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-observability-v1.json",
  title: "DonggriCompany Master95 Correlated Observability",
  version: "1.0.0",
  required_spans: MASTER95_REQUIRED_SPANS,
  span_schema: z.toJSONSchema(Master95SpanSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  log_schema: z.toJSONSchema(Master95LogSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  metric_schema: z.toJSONSchema(Master95MetricSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  gates: {
    run_trace_coverage_required: 1,
    required_span_missing_required: 0,
    orphan_correlation_required: 0,
    cost_consistency_required: 1,
    sensitive_value_leak_required: 0,
  },
};
const report = evaluate();
const outputs = [
  [baselinePath, `${JSON.stringify(baseline, null, 2)}\n`],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-observability] wrote ${report.run_count}-run trace evaluation\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-observability] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-observability] check passed: coverage=${report.trace_coverage}, missing=${report.required_span_missing_count}\n`,
    );
  }
}
if (report.status !== "pass") process.exitCode = 1;

function evaluate() {
  const collector = new Master95ObservabilityCollector();
  const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
  const assessments = [];
  for (let run = 0; run < 100; run += 1) {
    const project_id = projects[run % projects.length];
    const task_id = `task:trace:${run}`;
    const run_id = `run:trace:${run}`;
    const trace_id = `trace:${project_id}:${run}`;
    const common = { project_id, task_id, run_id, trace_id };
    MASTER95_REQUIRED_SPANS.forEach((name, index) =>
      collector.recordSpan({
        ...common,
        span_id: `${trace_id}:span:${index}`,
        parent_span_id: index === 0 ? null : `${trace_id}:span:0`,
        name,
        status: "ok",
        started_at: timestamp(run, index),
        ended_at: timestamp(run, index + 1),
        duration_ms: index + 1,
        cost_units: index,
        attributes: index === 3 ? { operation: name, access_token: `sensitive-${run}` } : { operation: name },
      }),
    );
    collector.recordLog({
      ...common,
      span_id: `${trace_id}:span:5`,
      level: "info",
      message: `run complete Authorization: Bearer secret-${run}`,
      fields: { status: "complete", password: `password-${run}` },
      occurred_at: timestamp(run, 7),
    });
    const metrics = [
      ["run.duration_ms", 21, "ms"],
      ["run.cost_units", 15, "cost-unit"],
      ["tool.calls", 1, "count"],
      ["artifact.count", 1, "count"],
    ] as const;
    for (const [name, value, unit] of metrics) {
      collector.recordMetric({
        ...common,
        span_id: `${trace_id}:span:5`,
        name,
        value,
        unit,
        recorded_at: timestamp(run, 8),
      });
    }
    assessments.push(collector.assessRun({ project_id, run_id, trace_id }));
  }
  const snapshotText = JSON.stringify(collector.snapshot());
  const complete = assessments.filter((item) => item.complete).length;
  const missing = assessments.reduce((total, item) => total + item.missing_spans.length, 0);
  const orphan = assessments.reduce((total, item) => total + item.orphan_records, 0);
  const costConsistent = assessments.filter((item) => item.cost_consistent).length;
  const sensitiveValueLeaks = /sensitive-\d+|secret-\d+|password-\d+/.test(snapshotText) ? 1 : 0;
  return {
    schema_version: "2026-07-14.master95.observability-evaluation.v1",
    status:
      complete === 100 && missing === 0 && orphan === 0 && costConsistent === 100 && sensitiveValueLeaks === 0
        ? "pass"
        : "fail",
    run_count: 100,
    complete_run_traces: complete,
    trace_coverage: complete / 100,
    required_span_count_per_run: MASTER95_REQUIRED_SPANS.length,
    required_span_missing_count: missing,
    orphan_correlation_count: orphan,
    cost_consistent_runs: costConsistent,
    log_records: collector.snapshot().logs.length,
    metric_records: collector.snapshot().metrics.length,
    span_records: collector.snapshot().spans.length,
    redaction_markers: (snapshotText.match(/\[REDACTED\]/g) ?? []).length,
    sensitive_value_leak_count: sensitiveValueLeaks,
    evaluated_at: "2026-07-14T12:00:00.000Z",
  };
}

function timestamp(run: number, offset: number) {
  return new Date(Date.parse("2026-07-14T00:00:00.000Z") + run * 60_000 + offset * 100).toISOString();
}
