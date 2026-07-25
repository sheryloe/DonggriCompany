import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  Master95DurableStateStore,
  Master95JsonlEventJournal,
} from "../../server/modules/master95/durable-state-store.js";

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
  "master95-persistence",
);
const journalPath = path.join(reportRoot, "restart-trial-events.jsonl");
const reportPath = path.join(reportRoot, "restart-trial-report.json");
fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(journalPath, "", "utf8");

let recovered = 0;
let duplicateExternalExecutions = 0;
let externalEffectRecords = 0;
const trials = 100;

for (let trial = 1; trial <= trials; trial += 1) {
  const runId = `run:bloggergent:restart:${trial}`;
  const taskId = `task:bloggergent:restart:${trial}`;
  const traceId = `trace:bloggergent:restart:${trial}`;
  const common = { project_id: "project:BloggerGent", run_id: runId, task_id: taskId, trace_id: traceId };
  const store = new Master95DurableStateStore(new Master95JsonlEventJournal(journalPath));
  store.append({
    ...common,
    event_type: "task.created",
    idempotency_key: `${runId}:task`,
    occurred_at: timestamp(trial, 0),
    payload: { objective: "read-only BloggerGent routing preview" },
  });
  store.append({
    ...common,
    event_type: "run.started",
    idempotency_key: `${runId}:start`,
    occurred_at: timestamp(trial, 1),
    payload: { lane_id: "google-travel-en" },
  });
  store.append({
    ...common,
    event_type: "run.step_completed",
    idempotency_key: `${runId}:step:1`,
    occurred_at: timestamp(trial, 2),
    payload: { step: 1 },
  });
  store.checkpoint({
    ...common,
    idempotency_key: `${runId}:checkpoint:1`,
    occurred_at: timestamp(trial, 3),
    step: 1,
    state: { lane_id: "google-travel-en", mode: "dry-run" },
  });

  const restarted = new Master95DurableStateStore(new Master95JsonlEventJournal(journalPath));
  restarted.resume({ ...common, idempotency_key: `${runId}:resume`, occurred_at: timestamp(trial, 4) });
  const effect = {
    ...common,
    idempotency_key: `${runId}:effect:routing-preview`,
    occurred_at: timestamp(trial, 5),
    effect_type: "routing_preview",
    effect_ref: `artifact:routing-preview:${trial}`,
  };
  const first = restarted.recordExternalEffect(effect);
  const duplicate = restarted.recordExternalEffect(effect);
  restarted.append({
    ...common,
    event_type: "run.completed",
    idempotency_key: `${runId}:complete`,
    occurred_at: timestamp(trial, 6),
    payload: { evidence_refs: [`EV-M95-PERSISTENCE-TRIAL-${trial}`] },
  });

  const verified = new Master95DurableStateStore(new Master95JsonlEventJournal(journalPath)).getRun(
    "project:BloggerGent",
    runId,
  );
  const effectCount = verified.events.filter((event) => event.event_type === "run.external_effect_recorded").length;
  if (
    verified.status === "completed" &&
    verified.latest_checkpoint &&
    effectCount === 1 &&
    !first.duplicate &&
    duplicate.duplicate
  )
    recovered += 1;
  if (effectCount > 1) duplicateExternalExecutions += effectCount - 1;
  externalEffectRecords += effectCount;
}

const journalBytes = fs.readFileSync(journalPath);
const report = {
  schema_version: "2026-07-14.master95.persistence-rehearsal.v1",
  status: recovered >= 99 && duplicateExternalExecutions === 0 ? "pass" : "fail",
  project_id: "project:BloggerGent",
  mode: "dry-run-routing-preview-only",
  trials,
  recovered,
  recovery_rate_percent: (recovered / trials) * 100,
  external_effect_attempts: trials * 2,
  external_effect_records: externalEffectRecords,
  duplicate_external_executions: duplicateExternalExecutions,
  journal_events: journalBytes.toString("utf8").split(/\r?\n/).filter(Boolean).length,
  journal_sha256: crypto.createHash("sha256").update(journalBytes).digest("hex"),
  journal_path: journalPath,
  writes: "Control Plane evidence JSONL only; no runtime DB or external effect executed",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`[master95-persistence-rehearsal] ${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;

function timestamp(trial: number, offset: number) {
  return new Date(Date.parse("2026-07-14T00:00:00.000Z") + trial * 10_000 + offset * 1_000).toISOString();
}
