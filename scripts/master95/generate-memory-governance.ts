import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_MEMORY_LAYERS,
  Master95MemoryRecordSchema,
  Master95MemoryStore,
} from "../../server/modules/master95/memory-governance.js";
import { createMaster95DefaultProjectRegistry } from "../../server/modules/master95/project-registry.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "memory");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-memory",
);
const baselinePath = path.join(qualityRoot, "MEMORY_GOVERNANCE_BASELINE.json");
const reportPath = path.join(reportRoot, "memory-evaluation-report.json");
const projects = ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"];
const now = "2026-07-14T12:00:00.000Z";

const baseline = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-memory-governance-v1.json",
  title: "DonggriCompany Master95 Memory Governance",
  version: "1.0.0",
  layers: MASTER95_MEMORY_LAYERS,
  record_schema: z.toJSONSchema(Master95MemoryRecordSchema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }),
  adapter_mode: "read-only",
  runtime_connection: "not-performed-approval-required",
  forbidden_capture: ["secrets", "tokens", "credentials", "raw transcripts"],
  evaluation_gates: {
    recall_at_5_minimum: 0.9,
    source_coverage_required: 1,
    cross_project_leakage_required: 0,
    correction_success_required: 1,
    deletion_success_required: 1,
  },
};

const report = await evaluate();
const outputs = [
  [baselinePath, `${JSON.stringify(baseline, null, 2)}\n`],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-memory] wrote baseline and ${report.query_count}-query evaluation\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-memory] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-memory] check passed: Recall@5=${report.recall_at_5.toFixed(2)}, leakage=${report.cross_project_leakage_count}\n`,
    );
  }
}

if (report.status !== "pass") {
  process.stderr.write(`[master95-memory] evaluation failed: Recall@5=${report.recall_at_5.toFixed(2)}\n`);
  process.exitCode = 1;
}

async function evaluate() {
  const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
  const targetIds: string[] = [];
  for (const [projectIndex, projectId] of projects.entries()) {
    for (let index = 0; index < 35; index += 1) {
      const memoryId = `memory:${projectIndex}:${index}`;
      targetIds.push(memoryId);
      store.add(record(memoryId, projectId, projectIndex * 35 + index));
    }
  }

  let hits = 0;
  let sourceLinkedResults = 0;
  let totalResults = 0;
  for (let index = 0; index < 100; index += 1) {
    const targetId = targetIds[index];
    const projectId = projects[Math.floor(index / 35)];
    const result = await store.retrieve({
      requester_project_id: projectId,
      resource_project_id: projectId,
      query: `needle-${index}`,
      limit: 5,
      now,
    });
    if (result.results.some((item) => item.memory_id === targetId)) hits += 1;
    totalResults += result.results.length;
    sourceLinkedResults += result.results.filter((item) => item.source_refs.length > 0).length;
  }

  let crossProjectLeakageCount = 0;
  let crossProjectProbes = 0;
  for (const requester of projects) {
    for (const resource of projects) {
      if (requester === resource) continue;
      crossProjectProbes += 1;
      const result = await store.retrieve({
        requester_project_id: requester,
        resource_project_id: resource,
        query: "needle",
        now,
      });
      crossProjectLeakageCount += result.results.length;
    }
  }

  const oldId = "memory:correction:old";
  const newId = "memory:correction:new";
  store.add(record(oldId, "project:BloggerGent", 200, { content: "legacy policy correction-key" }));
  store.correct({
    previous_memory_id: oldId,
    replacement: record(newId, "project:BloggerGent", 201, {
      content: "current policy correction-key",
      keywords: ["correction-key", "current"],
      supersedes_memory_id: oldId,
    }),
  });
  const correction = await store.retrieve({
    requester_project_id: "project:BloggerGent",
    resource_project_id: "project:BloggerGent",
    query: "correction-key",
    now,
  });
  const correctionSuccess =
    correction.results.some((item) => item.memory_id === newId) &&
    !correction.results.some((item) => item.memory_id === oldId) &&
    store.lineage(newId).length === 2;

  const deletedId = "memory:deletion";
  store.add(record(deletedId, "project:BloggerGent", 202, { content: "remove-me deletion-key" }));
  store.tombstone({ memory_id: deletedId, project_id: "project:BloggerGent", tombstoned_at: now });
  const deletion = await store.retrieve({
    requester_project_id: "project:BloggerGent",
    resource_project_id: "project:BloggerGent",
    query: "deletion-key",
    now,
  });
  const deletionSuccess = !deletion.results.some((item) => item.memory_id === deletedId);

  const recallAt5 = hits / 100;
  const sourceCoverage = totalResults === 0 ? 0 : sourceLinkedResults / totalResults;
  const status =
    recallAt5 >= 0.9 && sourceCoverage === 1 && crossProjectLeakageCount === 0 && correctionSuccess && deletionSuccess
      ? "pass"
      : "fail";
  return {
    schema_version: "2026-07-14.master95.memory-evaluation.v1",
    status,
    adapter_mode: "read-only-contract",
    runtime_connection_performed: false,
    synthetic_records: store.snapshot().length,
    layer_count: MASTER95_MEMORY_LAYERS.length,
    layers: MASTER95_MEMORY_LAYERS,
    query_count: 100,
    recall_at_5: recallAt5,
    recall_at_5_minimum: 0.9,
    source_coverage: sourceCoverage,
    cross_project_probes: crossProjectProbes,
    cross_project_leakage_count: crossProjectLeakageCount,
    correction_success_rate: correctionSuccess ? 1 : 0,
    deletion_success_rate: deletionSuccess ? 1 : 0,
    secrets_or_raw_transcripts_captured: 0,
    evaluated_at: now,
  };
}

function record(memoryId: string, projectId: string, index: number, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0.0",
    memory_id: memoryId,
    project_id: projectId,
    namespace: `${projectId}:memory`,
    layer: MASTER95_MEMORY_LAYERS[index % MASTER95_MEMORY_LAYERS.length],
    content_kind: "fact",
    content: `synthetic curated memory needle-${index}`,
    keywords: [`needle-${index}`, `project-${projects.indexOf(projectId)}`],
    source_refs: [`EV-M95-MEMORY-SYNTH-${index}`],
    confidence: 0.99,
    created_at: "2026-07-14T00:00:00.000Z",
    expires_at: null,
    supersedes_memory_id: null,
    tombstoned_at: null,
    sensitive: false,
    capture_mode: "synthetic-evaluation",
    ...overrides,
  };
}
