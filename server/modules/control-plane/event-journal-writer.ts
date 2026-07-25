import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const ZERO_HASH = "0".repeat(64);

export type JournalEventInput = {
  type: string;
  payload: unknown;
  projection_epoch?: string | null;
  occurred_at?: string;
};

export type JournalEvent = {
  event_version: 1;
  sequence: number;
  cursor: string;
  candidate_id: string;
  source_epoch: string;
  projection_epoch: string | null;
  previous_hash: string;
  event_hash: string;
  writer_instance_id: string;
  occurred_at: string;
  type: string;
  payload: unknown;
};

export type JournalCheckpoint = {
  schema: "donggri-journal-checkpoint/v1";
  candidate_id: string;
  source_epoch: string;
  sequence: number;
  event_hash: string;
  journal_prefix_sha256: string;
  created_at: string;
};

export type JournalRecoveryManifest = {
  schema: "donggri-journal-recovery/v1";
  journal_path: string;
  candidate_id: string;
  source_epoch: string;
  valid_event_count: number;
  valid_prefix_bytes: number;
  valid_prefix_sha256: string;
  last_valid_event_hash: string;
  corruption_kind: "invalid_event" | "torn_tail";
  corrupt_line: number;
  detected_at: string;
};

export class JournalLeaseError extends Error {
  constructor(message = "journal_writer_lease_unavailable") {
    super(message);
    this.name = "JournalLeaseError";
  }
}

export class JournalCorruptionError extends Error {
  constructor(
    readonly recovery_manifest_path: string,
    readonly recovery_manifest: JournalRecoveryManifest,
  ) {
    super("journal_corruption_detected");
    this.name = "JournalCorruptionError";
  }
}

export class JournalCheckpointError extends Error {
  constructor(message = "journal_checkpoint_invalid") {
    super(message);
    this.name = "JournalCheckpointError";
  }
}

export type EventJournalWriterOptions = {
  journal_path: string;
  candidate_id: string;
  source_epoch: string;
  writer_instance_id?: string;
  now?: () => Date;
};

type VerifiedJournal = {
  events: JournalEvent[];
  prefix_bytes: Buffer;
  event_prefix_bytes: number[];
};

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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
  return JSON.stringify(canonicalize(value));
}

function eventHashPayload(event: Omit<JournalEvent, "event_hash">): string {
  return canonicalJson(event);
}

function isJournalEvent(value: unknown): value is JournalEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    event.event_version === 1 &&
    Number.isSafeInteger(event.sequence) &&
    Number(event.sequence) > 0 &&
    event.cursor === String(event.sequence) &&
    typeof event.candidate_id === "string" &&
    event.candidate_id.length > 0 &&
    typeof event.source_epoch === "string" &&
    event.source_epoch.length > 0 &&
    (event.projection_epoch === null ||
      (typeof event.projection_epoch === "string" && /^sha256:[0-9a-f]{64}$/.test(event.projection_epoch))) &&
    typeof event.previous_hash === "string" &&
    /^[0-9a-f]{64}$/.test(event.previous_hash) &&
    typeof event.event_hash === "string" &&
    /^[0-9a-f]{64}$/.test(event.event_hash) &&
    typeof event.writer_instance_id === "string" &&
    event.writer_instance_id.length > 0 &&
    typeof event.occurred_at === "string" &&
    !Number.isNaN(Date.parse(event.occurred_at)) &&
    typeof event.type === "string" &&
    event.type.length > 0
  );
}

function withoutEventHash(event: JournalEvent): Omit<JournalEvent, "event_hash"> {
  const { event_hash: _eventHash, ...hashPayload } = event;
  return hashPayload;
}

async function writeRecoveryManifest(
  options: EventJournalWriterOptions,
  bytes: Buffer,
  validPrefixBytes: number,
  events: JournalEvent[],
  corruptionKind: JournalRecoveryManifest["corruption_kind"],
  corruptLine: number,
): Promise<never> {
  const detectedAt = (options.now ?? (() => new Date()))().toISOString();
  const prefix = bytes.subarray(0, validPrefixBytes);
  const manifest: JournalRecoveryManifest = {
    schema: "donggri-journal-recovery/v1",
    journal_path: path.resolve(options.journal_path),
    candidate_id: options.candidate_id,
    source_epoch: options.source_epoch,
    valid_event_count: events.length,
    valid_prefix_bytes: prefix.length,
    valid_prefix_sha256: sha256(prefix),
    last_valid_event_hash: events.at(-1)?.event_hash ?? ZERO_HASH,
    corruption_kind: corruptionKind,
    corrupt_line: corruptLine,
    detected_at: detectedAt,
  };
  const recoveryPath = `${options.journal_path}.recovery-${detectedAt.replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(recoveryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  throw new JournalCorruptionError(recoveryPath, manifest);
}

async function verifyJournal(options: EventJournalWriterOptions): Promise<VerifiedJournal> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(options.journal_path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { events: [], prefix_bytes: Buffer.alloc(0), event_prefix_bytes: [] };
    }
    throw error;
  }
  if (bytes.length === 0) return { events: [], prefix_bytes: bytes, event_prefix_bytes: [] };

  const text = bytes.toString("utf8");
  const hasCompleteTail = text.endsWith("\n");
  const lines = text.split("\n");
  if (hasCompleteTail) lines.pop();
  const completeLineCount = hasCompleteTail ? lines.length : Math.max(0, lines.length - 1);
  const events: JournalEvent[] = [];
  const eventPrefixBytes: number[] = [];
  let validPrefixBytes = 0;
  let previousHash = ZERO_HASH;

  for (let index = 0; index < completeLineCount; index += 1) {
    const line = lines[index];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return writeRecoveryManifest(options, bytes, validPrefixBytes, events, "invalid_event", index + 1);
    }
    if (
      !isJournalEvent(parsed) ||
      parsed.sequence !== index + 1 ||
      parsed.candidate_id !== options.candidate_id ||
      parsed.source_epoch !== options.source_epoch ||
      parsed.previous_hash !== previousHash ||
      sha256(eventHashPayload(withoutEventHash(parsed))) !== parsed.event_hash
    ) {
      return writeRecoveryManifest(options, bytes, validPrefixBytes, events, "invalid_event", index + 1);
    }
    events.push(parsed);
    previousHash = parsed.event_hash;
    validPrefixBytes += Buffer.byteLength(`${line}\n`, "utf8");
    eventPrefixBytes.push(validPrefixBytes);
  }

  if (!hasCompleteTail) {
    return writeRecoveryManifest(options, bytes, validPrefixBytes, events, "torn_tail", completeLineCount + 1);
  }
  return { events, prefix_bytes: bytes, event_prefix_bytes: eventPrefixBytes };
}

async function verifyCheckpoint(options: EventJournalWriterOptions, verified: VerifiedJournal): Promise<void> {
  const checkpointPath = `${options.journal_path}.checkpoint.json`;
  let raw: string;
  try {
    raw = await fs.readFile(checkpointPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  let checkpoint: JournalCheckpoint;
  try {
    checkpoint = JSON.parse(raw) as JournalCheckpoint;
  } catch {
    throw new JournalCheckpointError("journal_checkpoint_parse_failed");
  }
  if (
    checkpoint.schema !== "donggri-journal-checkpoint/v1" ||
    checkpoint.candidate_id !== options.candidate_id ||
    checkpoint.source_epoch !== options.source_epoch ||
    !Number.isSafeInteger(checkpoint.sequence) ||
    checkpoint.sequence < 0 ||
    checkpoint.sequence > verified.events.length ||
    !/^[0-9a-f]{64}$/.test(checkpoint.event_hash) ||
    !/^[0-9a-f]{64}$/.test(checkpoint.journal_prefix_sha256) ||
    Number.isNaN(Date.parse(checkpoint.created_at))
  ) {
    throw new JournalCheckpointError();
  }

  const expectedEventHash = checkpoint.sequence === 0 ? ZERO_HASH : verified.events[checkpoint.sequence - 1].event_hash;
  const prefixLength = checkpoint.sequence === 0 ? 0 : verified.event_prefix_bytes[checkpoint.sequence - 1];
  const expectedPrefixHash = sha256(verified.prefix_bytes.subarray(0, prefixLength));
  if (checkpoint.event_hash !== expectedEventHash || checkpoint.journal_prefix_sha256 !== expectedPrefixHash) {
    throw new JournalCheckpointError("journal_checkpoint_prefix_mismatch");
  }
}

export class EventJournalWriter {
  readonly journal_path: string;
  readonly lease_path: string;
  readonly candidate_id: string;
  readonly source_epoch: string;
  readonly writer_instance_id: string;

  private readonly now: () => Date;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly events: JournalEvent[];
  private lastEvent: JournalEvent | null;
  private closed = false;

  private constructor(options: EventJournalWriterOptions, events: JournalEvent[]) {
    this.journal_path = path.resolve(options.journal_path);
    this.lease_path = `${this.journal_path}.lease`;
    this.candidate_id = options.candidate_id;
    this.source_epoch = options.source_epoch;
    this.writer_instance_id = options.writer_instance_id ?? crypto.randomUUID();
    this.now = options.now ?? (() => new Date());
    this.events = structuredClone(events);
    this.lastEvent = this.events.at(-1) ?? null;
  }

  static async open(options: EventJournalWriterOptions): Promise<EventJournalWriter> {
    if (!path.isAbsolute(options.journal_path)) throw new Error("journal_path_must_be_absolute");
    if (!options.candidate_id.trim() || !options.source_epoch.trim()) throw new Error("journal_identity_required");
    await fs.mkdir(path.dirname(options.journal_path), { recursive: true });
    const verified = await verifyJournal(options);
    await verifyCheckpoint(options, verified);
    const writer = new EventJournalWriter(options, verified.events);
    const lease = {
      schema: "donggri-journal-writer-lease/v1",
      journal_path: writer.journal_path,
      candidate_id: writer.candidate_id,
      source_epoch: writer.source_epoch,
      writer_instance_id: writer.writer_instance_id,
      acquired_at: writer.now().toISOString(),
    };
    try {
      await fs.writeFile(writer.lease_path, `${JSON.stringify(lease, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new JournalLeaseError();
      throw error;
    }
    return writer;
  }

  readEvents(): JournalEvent[] {
    return structuredClone(this.events);
  }

  currentCursor(): string {
    return this.lastEvent?.cursor ?? "0";
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async assertLease(): Promise<void> {
    if (this.closed) throw new JournalLeaseError("journal_writer_closed");
    let lease: { writer_instance_id?: unknown };
    try {
      lease = JSON.parse(await fs.readFile(this.lease_path, "utf8"));
    } catch {
      throw new JournalLeaseError("journal_writer_lease_lost");
    }
    if (lease.writer_instance_id !== this.writer_instance_id) {
      throw new JournalLeaseError("journal_writer_lease_lost");
    }
  }

  append(input: JournalEventInput): Promise<JournalEvent> {
    return this.enqueue(async () => {
      await this.assertLease();
      if (!input.type.trim()) throw new Error("journal_event_type_required");
      const eventWithoutHash: Omit<JournalEvent, "event_hash"> = {
        event_version: 1,
        sequence: (this.lastEvent?.sequence ?? 0) + 1,
        cursor: String((this.lastEvent?.sequence ?? 0) + 1),
        candidate_id: this.candidate_id,
        source_epoch: this.source_epoch,
        projection_epoch: input.projection_epoch ?? null,
        previous_hash: this.lastEvent?.event_hash ?? ZERO_HASH,
        writer_instance_id: this.writer_instance_id,
        occurred_at: input.occurred_at ?? this.now().toISOString(),
        type: input.type,
        payload: input.payload,
      };
      const event: JournalEvent = {
        ...eventWithoutHash,
        event_hash: sha256(eventHashPayload(eventWithoutHash)),
      };
      const handle = await fs.open(this.journal_path, "a");
      try {
        await handle.writeFile(`${JSON.stringify(event)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.lastEvent = event;
      this.events.push(structuredClone(event));
      return event;
    });
  }

  checkpoint(checkpointPath = `${this.journal_path}.checkpoint.json`): Promise<JournalCheckpoint> {
    return this.enqueue(async () => {
      await this.assertLease();
      const bytes = await fs.readFile(this.journal_path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return Buffer.alloc(0);
        throw error;
      });
      const checkpoint: JournalCheckpoint = {
        schema: "donggri-journal-checkpoint/v1",
        candidate_id: this.candidate_id,
        source_epoch: this.source_epoch,
        sequence: this.lastEvent?.sequence ?? 0,
        event_hash: this.lastEvent?.event_hash ?? ZERO_HASH,
        journal_prefix_sha256: sha256(bytes),
        created_at: this.now().toISOString(),
      };
      await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
      return checkpoint;
    });
  }

  async close(): Promise<void> {
    await this.tail;
    if (this.closed) return;
    await this.assertLease();
    this.closed = true;
    await fs.unlink(this.lease_path);
  }

  releaseLeaseOnProcessExit(): void {
    try {
      const lease = JSON.parse(fsSync.readFileSync(this.lease_path, "utf8")) as {
        writer_instance_id?: unknown;
      };
      if (lease.writer_instance_id !== this.writer_instance_id) return;
      fsSync.unlinkSync(this.lease_path);
      this.closed = true;
    } catch {
      // Process-exit cleanup must never remove a lease it cannot verify.
    }
  }
}

export type JournalResumeResult =
  | { kind: "events"; events: JournalEvent[]; snapshot_version: string }
  | {
      kind: "reset";
      event: {
        type: "reset";
        cursor: string;
        snapshot_version: string;
        reason: "cursor_invalid" | "cursor_expired" | "cursor_ahead";
      };
    };

export function resolveJournalResume(
  events: readonly JournalEvent[],
  lastEventId: string | undefined,
  snapshotVersion: string,
): JournalResumeResult {
  if (!lastEventId) return { kind: "events", events: [...events], snapshot_version: snapshotVersion };
  if (!/^(0|[1-9]\d*)$/.test(lastEventId)) {
    return {
      kind: "reset",
      event: {
        type: "reset",
        cursor: events.at(-1)?.cursor ?? "0",
        snapshot_version: snapshotVersion,
        reason: "cursor_invalid",
      },
    };
  }
  const cursor = Number(lastEventId);
  const first = events.at(0)?.sequence ?? 1;
  const last = events.at(-1)?.sequence ?? 0;
  if (!Number.isSafeInteger(cursor) || cursor < first - 1) {
    return {
      kind: "reset",
      event: { type: "reset", cursor: String(last), snapshot_version: snapshotVersion, reason: "cursor_expired" },
    };
  }
  if (cursor > last) {
    return {
      kind: "reset",
      event: { type: "reset", cursor: String(last), snapshot_version: snapshotVersion, reason: "cursor_ahead" },
    };
  }
  return {
    kind: "events",
    events: events.filter((event) => event.sequence > cursor),
    snapshot_version: snapshotVersion,
  };
}

export class SseConnectionLimiter {
  readonly heartbeat_ms: number;
  private total = 0;
  private readonly bySession = new Map<string, number>();

  constructor(
    readonly per_session_limit = 2,
    readonly process_limit = 50,
    heartbeatMs = 15_000,
  ) {
    this.heartbeat_ms = heartbeatMs;
  }

  acquire(sessionId: string): () => void {
    const sessionCount = this.bySession.get(sessionId) ?? 0;
    if (sessionCount >= this.per_session_limit) throw new Error("sse_session_connection_limit");
    if (this.total >= this.process_limit) throw new Error("sse_process_connection_limit");
    this.bySession.set(sessionId, sessionCount + 1);
    this.total += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const nextSessionCount = (this.bySession.get(sessionId) ?? 1) - 1;
      if (nextSessionCount <= 0) this.bySession.delete(sessionId);
      else this.bySession.set(sessionId, nextSessionCount);
      this.total = Math.max(0, this.total - 1);
    };
  }
}
