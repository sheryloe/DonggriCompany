import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { applyControlPlaneMutationSchema } from "../../server/modules/bootstrap/schema/control-plane-mutation-schema.ts";
import { ControlPlaneSourceAdapter } from "../../server/modules/control-plane/source-adapter.ts";
import { createMaster95EventJournalControlTowerRuntime } from "../../server/modules/master95/control-tower-event-journal.ts";
import { MASTER95_CONTROL_TOWER_JOURNEYS } from "../../server/modules/master95/durable-control-tower.ts";
import { resolveReleaseIdentity } from "../../server/modules/release/release-identity.ts";
import { controlTowerV2JourneyOperation } from "../../server/modules/routes/ops/control-plane-v2-control-tower.ts";
import { createControlPlaneV2Runtime } from "../../server/modules/routes/ops/control-plane-v2-runtime.ts";
import { assertV01NewReportPath, assertV01NewRuntimePath } from "./v01-evidence-file.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const controlRoot = "G:\\Donggri_DevDrive";
const approvalLedger = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "approvals.md",
);
const requiredApproval = "APR-V1-ALPHA1-SMOKE-001";
const rootProjectId = "project:BloggerGent";
const isolationProjectId = "project:CardNewsAgent";
const repetitionsPerJourney = 4;

type JourneyEvidence = {
  journey_id: (typeof MASTER95_CONTROL_TOWER_JOURNEYS)[number];
  attempt: number;
  success: boolean;
  error: string | null;
  preview_id: string;
  approval_id: string;
  approval_receipt_sha256: string;
  idempotency_replay_verified: boolean;
  first_sequence: number | null;
  last_sequence: number | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) throw new Error(`${name.slice(2)}_value_required`);
  return value;
}

function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function currentGitSha(): string {
  const value = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(value), "candidate_git_sha_invalid");
  return value;
}

function requireCleanCandidate(): void {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert(status.length === 0, "five_journey_candidate_worktree_dirty");
}

function requireApprovedLedgerEntry(approvalId: string): void {
  assert(approvalId === requiredApproval, "five_journey_approval_id_invalid");
  const ledger = fs.readFileSync(approvalLedger, "utf8");
  const headingPattern = new RegExp(`^#{2,3}\\s+${approvalId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
  const heading = headingPattern.exec(ledger);
  assert(heading?.index !== undefined, "five_journey_approval_not_recorded");
  const tail = ledger.slice(heading.index + heading[0].length);
  const nextHeading = tail.search(/\r?\n#{2,3}\s+/);
  const section = nextHeading < 0 ? tail : tail.slice(0, nextHeading);
  assert(/^- policy_decision:\s*`approved`\s*$/m.test(section), "five_journey_approval_not_approved");
}

function boundedPaths(
  runtimeRootInput: string,
  outputInput: string,
): {
  runtimeRoot: string;
  output: string;
} {
  const runtimeRoot = assertV01NewRuntimePath(runtimeRootInput, "five_journey_runtime_root");
  const output = assertV01NewReportPath(outputInput, "five_journey_output");
  assert(!fs.existsSync(runtimeRoot), "five_journey_runtime_root_already_exists");
  assert(!fs.existsSync(output) && !fs.existsSync(`${output}.sha256`), "five_journey_output_already_exists");
  return { runtimeRoot, output };
}

function queryCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number | bigint } | undefined;
  return Number(row?.count ?? 0);
}

function resultShape(value: unknown): { duplicate: boolean; external_effect: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const outer = value as Record<string, unknown>;
  const result = outer.result;
  if (!result || typeof result !== "object") return null;
  return {
    duplicate: outer.duplicate === true,
    external_effect: (result as Record<string, unknown>).external_effect === true,
  };
}

export function summarizeFiveJourneyEvidence(input: {
  executions: JourneyEvidence[];
  journalEventCount: number;
  journalSha256: string;
  checkpointSha256: string;
  mutationDbSha256: string;
  lastEventHash: string;
  externalEffectCount: number;
  crossProjectLeakCount: number;
  sqliteRestartVerified: boolean;
}) {
  const successes = input.executions.filter((execution) => execution.success);
  const perJourney = Object.fromEntries(
    MASTER95_CONTROL_TOWER_JOURNEYS.map((journeyId) => {
      const attempts = input.executions.filter((execution) => execution.journey_id === journeyId);
      return [
        journeyId,
        {
          attempts: attempts.length,
          successes: attempts.filter((execution) => execution.success).length,
        },
      ];
    }),
  );
  return {
    attempt_count: input.executions.length,
    success_count: successes.length,
    success_rate: input.executions.length === 0 ? 0 : successes.length / input.executions.length,
    per_journey: perJourney,
    approval_receipt_sha256: successes.map((execution) => execution.approval_receipt_sha256),
    idempotency_replay_count: input.executions.filter((execution) => execution.idempotency_replay_verified).length,
    sqlite_restart_verified: input.sqliteRestartVerified,
    journal_event_ranges: successes.map((execution) => ({
      journey_id: execution.journey_id,
      approval_receipt_sha256: execution.approval_receipt_sha256,
      first_sequence: execution.first_sequence,
      last_sequence: execution.last_sequence,
    })),
    journal_event_count: input.journalEventCount,
    journal_sha256: input.journalSha256,
    checkpoint_sha256: input.checkpointSha256,
    mutation_db_sha256: input.mutationDbSha256,
    last_event_hash: input.lastEventHash,
    external_effect_count: input.externalEffectCount,
    cross_project_leak_count: input.crossProjectLeakCount,
  };
}

async function main(): Promise<void> {
  const approvalId = argumentValue("--approval");
  const runtimeRootInput = argumentValue("--runtime-root");
  const outputInput = argumentValue("--output");
  requireApprovedLedgerEntry(approvalId);
  requireCleanCandidate();
  const { runtimeRoot, output } = boundedPaths(runtimeRootInput, outputInput);

  const candidateSha = currentGitSha();
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    donggriRelease?: { candidateId?: string };
  };
  const expectedCandidateId = String(packageJson.donggriRelease?.candidateId ?? "");
  assert(
    /^dongri-grigri-v01(?:[-.][a-z0-9]+)*$/i.test(expectedCandidateId),
    "five_journey_expected_candidate_id_invalid",
  );
  const release = resolveReleaseIdentity(repoRoot, {
    ...process.env,
    DONGRI_RELEASE_GIT_SHA: candidateSha,
  });
  assert(release.candidate_id === expectedCandidateId, "five_journey_candidate_id_mismatch");
  const sourceAdapter = new ControlPlaneSourceAdapter({
    controlRoot,
    sourceEpoch: release.source_epoch,
  });
  const sourceSnapshot = sourceAdapter.readSnapshot();
  assert(!sourceSnapshot.degraded, "five_journey_control_plane_projection_degraded");
  const project = sourceSnapshot.projects.find((item) => item.key === "BloggerGent");
  assert(project?.status === "active" && project.enabled, "five_journey_project_not_active");

  fs.mkdirSync(runtimeRoot, { recursive: false });
  const journalPath = path.join(runtimeRoot, "control-tower", "events.jsonl");
  const checkpointPath = `${journalPath}.checkpoint.json`;
  const dbPath = path.join(runtimeRoot, "mutation-authority.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
  applyControlPlaneMutationSchema(db);

  let controlTower = await createMaster95EventJournalControlTowerRuntime({
    candidate_id: release.candidate_id,
    source_epoch: release.source_epoch,
    projection_epoch: sourceSnapshot.projection_epoch,
    journal_path: journalPath,
    writer_instance_id: `v01-alpha1-${crypto.randomUUID()}`,
  });
  const runtime = createControlPlaneV2Runtime(db, {
    source_adapter: sourceAdapter,
    read_operations: {} as never,
    load_control_tower: async () => controlTower,
    candidate_id: release.candidate_id,
    allowed_origins: ["http://127.0.0.1:8800"],
  });

  const executions: JourneyEvidence[] = [];
  let externalEffectCount = 0;
  let crossProjectLeakCount = 0;
  try {
    for (let repetition = 1; repetition <= repetitionsPerJourney; repetition += 1) {
      for (const journeyId of MASTER95_CONTROL_TOWER_JOURNEYS) {
        const operationKey = controlTowerV2JourneyOperation(journeyId);
        const operation = runtime.operations[operationKey];
        assert(operation, `five_journey_operation_missing:${operationKey}`);
        const executionIndex = executions.length + 1;
        const prepared = await operation.prepare({
          project_id: rootProjectId,
          source_epoch: release.source_epoch,
          requester: "local-v01-alpha1-evidence",
          request_id: `v01-alpha1-prepare-${executionIndex}`,
          parameters: {},
        });
        const preview = await runtime.authorizer.createPreview(
          {
            ...prepared,
            project_id: rootProjectId,
            operation: operationKey,
            source_epoch: release.source_epoch,
            projection_epoch: sourceSnapshot.projection_epoch,
            requester: "local-v01-alpha1-evidence",
          },
          {
            idempotency_key: `v01-alpha1-preview-${executionIndex.toString().padStart(4, "0")}`,
            request: { phase: "preview", operation: operationKey, execution_index: executionIndex },
          },
        );
        const receipt = await runtime.authorizer.issueApproval(preview.preview_id, "local-v01-alpha1-evidence", {
          idempotency_key: `v01-alpha1-approval-${executionIndex.toString().padStart(4, "0")}`,
          request: { phase: "approval", preview_id: preview.preview_id, execution_index: executionIndex },
        });
        const before = (await controlTower.journalEvents()).length;
        const executeInput = {
          preview_id: preview.preview_id,
          approval_id: receipt.approval_id,
          source_epoch: release.source_epoch,
          current_projection_epoch: sourceSnapshot.projection_epoch,
          confirmation_text: preview.confirmation_text,
          idempotency_key: `v01-alpha1-execute-${executionIndex.toString().padStart(4, "0")}`,
          guards: {
            authenticated: true,
            csrf_valid: true,
            origin: "http://127.0.0.1:8800",
          },
        } as const;
        const result = await runtime.authorizer.execute(
          executeInput,
          async ({ command, preview: authorizedPreview, approval_receipt }) =>
            operation.execute({
              command,
              preview: authorizedPreview,
              approval_receipt,
              request_id: `v01-alpha1-execute-${executionIndex}`,
            }),
        );
        const after = (await controlTower.journalEvents()).length;
        const shape = result.ok ? resultShape(result.value) : null;
        let replayMutationCalled = false;
        let idempotencyReplayVerified = false;
        if (result.ok) {
          const replay = await runtime.authorizer.execute(executeInput, async () => {
            replayMutationCalled = true;
            throw new Error("five_journey_idempotency_replay_called_mutation");
          });
          const afterReplay = (await controlTower.journalEvents()).length;
          idempotencyReplayVerified =
            replay.ok && replay.status === "replayed" && !replayMutationCalled && afterReplay === after;
        }
        const success =
          result.ok &&
          shape !== null &&
          !shape.duplicate &&
          !shape.external_effect &&
          after > before &&
          idempotencyReplayVerified;
        if (shape?.external_effect) externalEffectCount += 1;
        executions.push({
          journey_id: journeyId,
          attempt: repetition,
          success,
          error: success ? null : result.ok ? "journey_result_contract_failed" : result.code,
          preview_id: preview.preview_id,
          approval_id: receipt.approval_id,
          approval_receipt_sha256: receipt.receipt_sha256,
          idempotency_replay_verified: idempotencyReplayVerified,
          first_sequence: success ? before + 1 : null,
          last_sequence: success ? after : null,
        });
      }
    }

    const bloggerSnapshot = await controlTower.snapshot(rootProjectId);
    const firstRun = bloggerSnapshot.runs[0];
    if (firstRun) {
      try {
        await controlTower.getRun(isolationProjectId, firstRun.run_id);
        crossProjectLeakCount += 1;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "control_tower_cross_project_access_denied") {
          throw error;
        }
      }
    } else {
      crossProjectLeakCount += 1;
    }

    await controlTower.checkpoint();
    const preRestartEvents = await controlTower.journalEvents();
    const preRestartSnapshot = await controlTower.snapshot(rootProjectId);
    await controlTower.close();
    db.close();

    controlTower = await createMaster95EventJournalControlTowerRuntime({
      candidate_id: release.candidate_id,
      source_epoch: release.source_epoch,
      projection_epoch: sourceSnapshot.projection_epoch,
      journal_path: journalPath,
      writer_instance_id: `v01-alpha1-restart-${crypto.randomUUID()}`,
    });
    const postRestartEvents = await controlTower.journalEvents();
    const postRestartSnapshot = await controlTower.snapshot(rootProjectId);
    assert(
      canonicalJson(postRestartEvents) === canonicalJson(preRestartEvents),
      "five_journey_restart_event_replay_mismatch",
    );
    assert(
      canonicalJson(postRestartSnapshot) === canonicalJson(preRestartSnapshot),
      "five_journey_restart_projection_mismatch",
    );
    await controlTower.close();

    const reopenedDb = new DatabaseSync(dbPath);
    const approvalCount = queryCount(reopenedDb, "control_plane_approval_receipts");
    const completedCount = queryCount(reopenedDb, "control_plane_idempotency_results");
    const expectedAttemptCount = MASTER95_CONTROL_TOWER_JOURNEYS.length * repetitionsPerJourney;
    assert(approvalCount === expectedAttemptCount, "five_journey_approval_persistence_count_mismatch");
    assert(completedCount === expectedAttemptCount, "five_journey_execution_persistence_count_mismatch");
    reopenedDb.close();

    const journalBytes = fs.readFileSync(journalPath);
    const checkpointBytes = fs.readFileSync(checkpointPath);
    const dbBytes = fs.readFileSync(dbPath);
    const lastEvent = postRestartEvents.at(-1);
    assert(lastEvent, "five_journey_journal_empty");
    const measurement = summarizeFiveJourneyEvidence({
      executions,
      journalEventCount: postRestartEvents.length,
      journalSha256: sha256(journalBytes),
      checkpointSha256: sha256(checkpointBytes),
      mutationDbSha256: sha256(dbBytes),
      lastEventHash: lastEvent.event_hash,
      externalEffectCount,
      crossProjectLeakCount,
      sqliteRestartVerified: true,
    });
    const pass =
      measurement.attempt_count === 20 &&
      measurement.success_count === 20 &&
      measurement.external_effect_count === 0 &&
      measurement.cross_project_leak_count === 0;
    const report = {
      schema_version: "donggri-v01-five-journey-evidence/v1",
      release_label: "V01",
      component_status: pass ? "pass" : "fail",
      certification_claimed: false,
      candidate_id: release.candidate_id,
      candidate_sha: candidateSha,
      source_epoch: release.source_epoch,
      projection_epoch: sourceSnapshot.projection_epoch,
      approval_id: approvalId,
      generated_at: new Date().toISOString(),
      measurement,
      executions,
      persistence: {
        runtime_root: runtimeRoot,
        journal_path: journalPath,
        checkpoint_path: checkpointPath,
        mutation_db_path: dbPath,
        approval_receipt_count: approvalCount,
        completed_execution_count: completedCount,
        idempotency_replay_count: measurement.idempotency_replay_count,
        sqlite_restart_verified: true,
        restart_replay_verified: true,
      },
    };
    const serialized = canonicalJson(report);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(`${output}.sha256`, `${sha256(serialized)}  ${path.basename(output)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: pass,
        component_status: report.component_status,
        output,
        candidate_id: release.candidate_id,
        candidate_sha: candidateSha,
        source_epoch: release.source_epoch,
        attempt_count: measurement.attempt_count,
        success_count: measurement.success_count,
        journal_event_count: measurement.journal_event_count,
        journal_sha256: measurement.journal_sha256,
        mutation_db_sha256: measurement.mutation_db_sha256,
      })}\n`,
    );
    if (!pass) process.exitCode = 2;
  } catch (error) {
    await controlTower.close().catch(() => undefined);
    try {
      db.close();
    } catch {
      // Preserve the original error.
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
