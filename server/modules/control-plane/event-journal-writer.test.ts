import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EventJournalWriter,
  JournalCheckpointError,
  JournalCorruptionError,
  JournalLeaseError,
  SseConnectionLimiter,
  resolveJournalResume,
} from "./event-journal-writer.ts";

const temporaryDirectories: string[] = [];

async function temporaryJournal(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-v1-journal-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "events.jsonl");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("EventJournalWriter", () => {
  it("serializes concurrent appends into a verifiable hash chain and binds a checkpoint", async () => {
    const journalPath = await temporaryJournal();
    let tick = 0;
    const writer = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
      writer_instance_id: "writer-one",
      now: () => new Date(Date.parse("2026-07-25T00:00:00Z") + tick++ * 1_000),
    });

    const events = await Promise.all(
      Array.from({ length: 12 }, (_, index) => writer.append({ type: "run", payload: { index } })),
    );
    expect(events.map((event) => event.sequence)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(events[0].previous_hash).toBe("0".repeat(64));
    expect(events[11].previous_hash).toBe(events[10].event_hash);

    const checkpoint = await writer.checkpoint();
    const bytes = await fs.readFile(journalPath);
    expect(checkpoint.sequence).toBe(12);
    expect(checkpoint.event_hash).toBe(events[11].event_hash);
    expect(checkpoint.journal_prefix_sha256).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    await writer.close();
  });

  it("enforces a single writer lease without automatically stealing it", async () => {
    const journalPath = await temporaryJournal();
    const first = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    await expect(
      EventJournalWriter.open({
        journal_path: journalPath,
        candidate_id: "candidate-alpha.0",
        source_epoch: "sha256:source",
      }),
    ).rejects.toBeInstanceOf(JournalLeaseError);
    await first.close();
  });

  it("releases only its verified lease during synchronous process-exit cleanup", async () => {
    const journalPath = await temporaryJournal();
    const first = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
      writer_instance_id: "writer-exit-cleanup",
    });
    first.releaseLeaseOnProcessExit();
    await expect(fs.access(`${journalPath}.lease`)).rejects.toMatchObject({ code: "ENOENT" });

    const restarted = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    await restarted.close();
  });

  it("preserves a valid prefix and emits a recovery manifest for a torn tail", async () => {
    const journalPath = await temporaryJournal();
    const writer = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    await writer.append({ type: "safe", payload: { ok: true } });
    await writer.close();
    const validBytes = await fs.readFile(journalPath);
    await fs.appendFile(journalPath, '{"event_version":1');

    let caught: unknown;
    try {
      await EventJournalWriter.open({
        journal_path: journalPath,
        candidate_id: "candidate-alpha.0",
        source_epoch: "sha256:source",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JournalCorruptionError);
    const corruption = caught as JournalCorruptionError;
    expect(corruption.recovery_manifest).toMatchObject({
      valid_event_count: 1,
      valid_prefix_bytes: validBytes.length,
      corruption_kind: "torn_tail",
    });
    expect(await fs.readFile(journalPath, "utf8")).toContain('{"event_version":1');
    expect(JSON.parse(await fs.readFile(corruption.recovery_manifest_path, "utf8"))).toMatchObject({
      valid_event_count: 1,
    });
  });

  it("rejects a modified event hash and never truncates the journal", async () => {
    const journalPath = await temporaryJournal();
    const writer = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    await writer.append({ type: "safe", payload: { ok: true } });
    await writer.close();
    const event = JSON.parse(await fs.readFile(journalPath, "utf8"));
    event.payload.ok = false;
    const tampered = `${JSON.stringify(event)}\n`;
    await fs.writeFile(journalPath, tampered);

    await expect(
      EventJournalWriter.open({
        journal_path: journalPath,
        candidate_id: "candidate-alpha.0",
        source_epoch: "sha256:source",
      }),
    ).rejects.toBeInstanceOf(JournalCorruptionError);
    expect(await fs.readFile(journalPath, "utf8")).toBe(tampered);
  });

  it("verifies a checkpoint against its exact journal prefix on restart", async () => {
    const journalPath = await temporaryJournal();
    const writer = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    await writer.append({ type: "safe", payload: { index: 1 } });
    await writer.checkpoint();
    await writer.append({ type: "safe", payload: { index: 2 } });
    await writer.close();

    const validRestart = await EventJournalWriter.open({
      journal_path: journalPath,
      candidate_id: "candidate-alpha.0",
      source_epoch: "sha256:source",
    });
    expect(validRestart.readEvents()).toHaveLength(2);
    await validRestart.close();

    const checkpointPath = `${journalPath}.checkpoint.json`;
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    checkpoint.journal_prefix_sha256 = "f".repeat(64);
    await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint)}\n`);
    await expect(
      EventJournalWriter.open({
        journal_path: journalPath,
        candidate_id: "candidate-alpha.0",
        source_epoch: "sha256:source",
      }),
    ).rejects.toBeInstanceOf(JournalCheckpointError);
  });
});

describe("journal SSE resume contract", () => {
  it("returns events after Last-Event-ID and reset events for stale or future cursors", () => {
    const events = [1, 2, 3].map((sequence) => ({
      event_version: 1 as const,
      sequence,
      cursor: String(sequence),
      candidate_id: "candidate",
      source_epoch: "source",
      projection_epoch: null,
      previous_hash: sequence === 1 ? "0".repeat(64) : String(sequence - 1).padStart(64, "0"),
      event_hash: String(sequence).padStart(64, "0"),
      writer_instance_id: "writer",
      occurred_at: "2026-07-25T00:00:00Z",
      type: "run",
      payload: {},
    }));
    expect(resolveJournalResume(events, "1", "snapshot-7")).toMatchObject({
      kind: "events",
      events: [{ sequence: 2 }, { sequence: 3 }],
    });
    expect(resolveJournalResume(events.slice(1), "0", "snapshot-7")).toMatchObject({
      kind: "reset",
      event: { reason: "cursor_expired", snapshot_version: "snapshot-7" },
    });
    expect(resolveJournalResume(events, "9", "snapshot-7")).toMatchObject({
      kind: "reset",
      event: { reason: "cursor_ahead" },
    });
  });

  it("enforces two connections per session and the process-wide limit", () => {
    const limiter = new SseConnectionLimiter(2, 3);
    expect(limiter.heartbeat_ms).toBe(15_000);
    const releaseOne = limiter.acquire("session-a");
    const releaseTwo = limiter.acquire("session-a");
    expect(() => limiter.acquire("session-a")).toThrow("sse_session_connection_limit");
    const releaseThree = limiter.acquire("session-b");
    expect(() => limiter.acquire("session-c")).toThrow("sse_process_connection_limit");
    releaseOne();
    releaseTwo();
    releaseThree();
    expect(() => limiter.acquire("session-a")).not.toThrow();
  });
});
