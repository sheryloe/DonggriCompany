import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApprovalReceipt, MutationPreview } from "../control-plane/mutation-authorizer.js";
import {
  JournalCorruptionError,
  JournalLeaseError,
  type JournalEvent,
  type JournalEventInput,
} from "../control-plane/event-journal-writer.js";
import {
  controlTowerV2JourneyOperation,
  createControlTowerV2OperationRegistry,
} from "../routes/ops/control-plane-v2-control-tower.js";
import {
  CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE,
  Master95EventJournalControlTowerRuntime,
  resolveMaster95V1ControlTowerJournalPath,
} from "./control-tower-event-journal.js";

const temporaryDirectories: string[] = [];
const CANDIDATE_ID = "dongri-grigri-v1-alpha.0";
const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"b".repeat(64)}`;

async function temporaryJournal() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-control-tower-v1-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "events.jsonl");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function journey(attemptId: string) {
  return {
    root_project_id: "project:BloggerGent",
    journey_id: "task-progress" as const,
    attempt_id: attemptId,
    occurred_at: "2026-07-25T04:30:00.000Z",
  };
}

describe("Master95EventJournalControlTowerRuntime", () => {
  it("persists Control Tower events through the candidate hash chain and replays the same state", async () => {
    const journalPath = await temporaryJournal();
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
      writer_instance_id: "writer-runtime-one",
    });

    const result = await runtime.runJourney(journey("durable-1"));
    expect(result.snapshot.event_count).toBe(7);
    const expected = await runtime.snapshot("project:BloggerGent");
    const events = await runtime.journalEvents();
    expect(events).toHaveLength(8);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(events[0]).toMatchObject({
      event_version: 1,
      cursor: "1",
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      previous_hash: "0".repeat(64),
      writer_instance_id: "writer-runtime-one",
      type: CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE,
      payload: {
        previous_projection_epoch: null,
        projection_epoch: PROJECTION_EPOCH,
      },
    });
    expect(events[7].previous_hash).toBe(events[6].event_hash);

    const checkpoint = JSON.parse(await fs.readFile(`${journalPath}.checkpoint.json`, "utf8"));
    expect(checkpoint).toMatchObject({
      schema: "donggri-journal-checkpoint/v1",
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      sequence: 8,
      event_hash: events[7].event_hash,
    });
    expect(checkpoint.journal_prefix_sha256).toMatch(/^[0-9a-f]{64}$/);
    await runtime.close();

    const restarted = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
      writer_instance_id: "writer-runtime-two",
    });
    expect(await restarted.snapshot("project:BloggerGent")).toEqual(expected);
    expect(await restarted.journalCursor()).toBe("8");
    await restarted.close();
  });

  it("serializes concurrent journeys under one writer lease", async () => {
    const journalPath = await temporaryJournal();
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
    });

    const [first, second] = await Promise.all([
      runtime.runJourney(journey("concurrent-1")),
      runtime.runJourney(journey("concurrent-2")),
    ]);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    const events = await runtime.journalEvents();
    expect(events).toHaveLength(15);
    expect(events.map((event) => event.sequence)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].previous_hash).toBe(events[index - 1].event_hash);
    }
    await runtime.close();
  });

  it("reuses the preview-bound timestamp when a V2 journey retries after a partial journal append", async () => {
    const journalPath = await temporaryJournal();
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
      writer_instance_id: "writer-partial-retry",
    });
    const previewOccurredAt = "2026-07-25T04:30:00.000Z";
    const laterOccurredAt = "2026-07-25T04:31:00.000Z";
    let nowCalls = 0;
    const operationName = controlTowerV2JourneyOperation("task-progress");
    const registry = createControlTowerV2OperationRegistry({
      source_adapter: {
        readSnapshot: () =>
          ({
            projects: [{ key: "BloggerGent", status: "active", enabled: true }],
          }) as never,
      },
      load_control_tower: async () => runtime,
      cwd_ref: "worktree:DonggriCompany-v1-stabilization",
      spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
      create_attempt_id: () => "partial-retry",
      now: () => new Date(nowCalls++ === 0 ? previewOccurredAt : laterOccurredAt),
    });
    const operation = registry[operationName];
    if (!operation) throw new Error("control_tower_test_operation_missing");
    const prepared = await operation.prepare({
      project_id: "project:BloggerGent",
      source_epoch: SOURCE_EPOCH,
      requester: "tester",
      request_id: "partial-retry-preview",
      parameters: {},
    });
    expect(prepared.command.args).toEqual([
      "journey",
      "task-progress",
      "project:BloggerGent",
      "v2-partial-retry",
      previewOccurredAt,
    ]);

    const preview = {
      schema_version: "1.0.0",
      preview_id: "preview-partial-retry",
      spec_id: prepared.spec_id,
      project_id: "project:BloggerGent",
      operation: operationName,
      resolved_target: prepared.resolved_target,
      scope: prepared.scope,
      command: prepared.command,
      target_digest: "1".repeat(64),
      scope_digest: "2".repeat(64),
      command_digest: "3".repeat(64),
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
      requester: "tester",
      confirmation_text: "confirm",
      issued_at: previewOccurredAt,
      expires_at: "2026-07-25T04:35:00.000Z",
    } satisfies MutationPreview;
    const execute = () =>
      operation.execute({
        preview,
        approval_receipt: {} as ApprovalReceipt,
        command: prepared.command,
        request_id: "partial-retry-execute",
      });

    const internalWriter = (
      runtime as unknown as {
        writer: { append(input: JournalEventInput): Promise<JournalEvent> };
      }
    ).writer;
    const append = internalWriter.append.bind(internalWriter);
    let appendCalls = 0;
    internalWriter.append = async (input) => {
      appendCalls += 1;
      if (appendCalls === 2) throw new Error("injected_second_control_event_append_failure");
      return append(input);
    };

    try {
      await expect(execute()).rejects.toThrow("injected_second_control_event_append_failure");
      const partialEvents = await runtime.journalEvents();
      expect(partialEvents).toHaveLength(2);
      const firstCommitted = structuredClone(partialEvents[1]);

      await expect(execute()).resolves.toMatchObject({
        duplicate: false,
        snapshot: { event_count: 7 },
      });

      const finalEvents = await runtime.journalEvents();
      const controlEvents = finalEvents.slice(1);
      expect(finalEvents).toHaveLength(8);
      expect(controlEvents[0]).toEqual(firstCommitted);
      expect(controlEvents.map((event) => event.occurred_at)).toEqual(Array(7).fill(previewOccurredAt));
      const payloads = controlEvents.map((event) => event.payload as { event_id: string; idempotency_key: string });
      expect(new Set(payloads.map((event) => event.event_id)).size).toBe(7);
      expect(new Set(payloads.map((event) => event.idempotency_key)).size).toBe(7);
      expect(nowCalls).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it("fails closed for a second writer and for a corrupt tail without truncating it", async () => {
    const journalPath = await temporaryJournal();
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
    });
    await expect(
      Master95EventJournalControlTowerRuntime.open({
        journal_path: journalPath,
        candidate_id: CANDIDATE_ID,
        source_epoch: SOURCE_EPOCH,
        projection_epoch: PROJECTION_EPOCH,
      }),
    ).rejects.toBeInstanceOf(JournalLeaseError);
    await runtime.runJourney(journey("corrupt-tail"));
    await runtime.close();

    await fs.appendFile(journalPath, '{"event_version":1');
    const corrupted = await fs.readFile(journalPath, "utf8");
    let caught: unknown;
    try {
      await Master95EventJournalControlTowerRuntime.open({
        journal_path: journalPath,
        candidate_id: CANDIDATE_ID,
        source_epoch: SOURCE_EPOCH,
        projection_epoch: PROJECTION_EPOCH,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JournalCorruptionError);
    expect(await fs.readFile(journalPath, "utf8")).toBe(corrupted);
    const recovery = caught as JournalCorruptionError;
    expect(recovery.recovery_manifest).toMatchObject({
      valid_event_count: 8,
      corruption_kind: "torn_tail",
    });
  });

  it("segments the default journal by candidate and immutable source epoch", () => {
    const runtimeRoot = path.join(os.tmpdir(), "donggri-journal-path");
    const resolved = resolveMaster95V1ControlTowerJournalPath(CANDIDATE_ID, SOURCE_EPOCH, runtimeRoot);

    expect(resolved).toBe(path.join(runtimeRoot, CANDIDATE_ID, "a".repeat(64), "control-tower", "events.jsonl"));
    expect(() =>
      resolveMaster95V1ControlTowerJournalPath(CANDIDATE_ID, "sha256:mutable-root-document-hash", runtimeRoot),
    ).toThrow("control_tower_source_epoch_invalid");
  });

  it("records projection changes as normal boundaries and restarts without corrupting the candidate journal", async () => {
    const journalPath = await temporaryJournal();
    const changedProjectionEpoch = `sha256:${"c".repeat(64)}`;
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
      writer_instance_id: "writer-boundary-one",
    });
    await runtime.runJourney(journey("projection-boundary"));
    expect(await runtime.ensureProjectionEpoch(changedProjectionEpoch)).toMatchObject({ changed: true, cursor: "9" });
    expect(runtime.source_epoch).toBe(SOURCE_EPOCH);
    expect(runtime.projection_epoch).toBe(changedProjectionEpoch);
    await runtime.close();

    const restarted = await Master95EventJournalControlTowerRuntime.open({
      journal_path: journalPath,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      projection_epoch: changedProjectionEpoch,
      writer_instance_id: "writer-boundary-two",
    });
    expect(restarted.source_epoch).toBe(SOURCE_EPOCH);
    expect(restarted.projection_epoch).toBe(changedProjectionEpoch);
    expect(await restarted.journalCursor()).toBe("9");
    expect(await restarted.snapshot("project:BloggerGent")).toMatchObject({ event_count: 7 });
    const boundaries = (await restarted.journalEvents()).filter(
      (event) => event.type === CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE,
    );
    expect(boundaries).toHaveLength(2);
    expect(boundaries[1].payload).toMatchObject({
      previous_projection_epoch: PROJECTION_EPOCH,
      projection_epoch: changedProjectionEpoch,
    });
    await restarted.close();
  });
});
