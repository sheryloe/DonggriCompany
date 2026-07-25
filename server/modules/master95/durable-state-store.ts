import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

export const MASTER95_DURABLE_EVENT_TYPES = [
  "task.created",
  "run.started",
  "run.step_completed",
  "run.checkpoint_saved",
  "run.resumed",
  "run.external_effect_recorded",
  "run.completed",
  "run.failed",
  "run.canceled",
] as const;

const NonEmpty = z.string().trim().min(1);
export const Master95DurableEventSchema = z
  .object({
    event_id: NonEmpty,
    event_type: z.enum(MASTER95_DURABLE_EVENT_TYPES),
    project_id: NonEmpty,
    task_id: NonEmpty,
    run_id: NonEmpty,
    trace_id: NonEmpty,
    sequence: z.number().int().positive(),
    idempotency_key: NonEmpty,
    occurred_at: z.iso.datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type Master95DurableEvent = z.infer<typeof Master95DurableEventSchema>;
export type Master95DurableEventInput = Omit<Master95DurableEvent, "event_id" | "sequence">;

export interface Master95EventJournalAdapter {
  readAll(): Master95DurableEvent[];
  append(event: Master95DurableEvent): void;
}

export class Master95MemoryEventJournal implements Master95EventJournalAdapter {
  readonly events: Master95DurableEvent[] = [];
  readAll() {
    return structuredClone(this.events);
  }
  append(event: Master95DurableEvent) {
    this.events.push(structuredClone(event));
  }
}

export class Master95JsonlEventJournal implements Master95EventJournalAdapter {
  constructor(readonly filePath: string) {}

  readAll() {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return Master95DurableEventSchema.parse(JSON.parse(line));
        } catch (error) {
          throw new Error(`journal_corrupt_at_line_${index + 1}:${String(error)}`);
        }
      });
  }

  append(event: Master95DurableEvent) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flush: true });
  }
}

export class Master95DurableStateStore {
  readonly #events: Master95DurableEvent[];
  readonly #idempotency = new Map<string, Master95DurableEvent>();
  readonly #sequences = new Map<string, number>();

  constructor(
    readonly adapter: Master95EventJournalAdapter,
    readonly projects: Master95ProjectRegistry = createMaster95DefaultProjectRegistry(),
  ) {
    this.#events = adapter.readAll();
    for (const event of this.#events) this.#indexEvent(event, true);
  }

  append(input: Master95DurableEventInput) {
    this.projects.require(input.project_id);
    required(input.task_id, "task_id");
    required(input.run_id, "run_id");
    required(input.trace_id, "trace_id");
    required(input.idempotency_key, "idempotency_key");
    const idempotencyIndex = `${input.project_id}:${input.idempotency_key}`;
    const existing = this.#idempotency.get(idempotencyIndex);
    if (existing) {
      const same =
        existing.event_type === input.event_type &&
        existing.task_id === input.task_id &&
        existing.run_id === input.run_id &&
        JSON.stringify(existing.payload) === JSON.stringify(input.payload);
      if (!same) throw new Error("idempotency_key_conflict");
      return { event: structuredClone(existing), duplicate: true };
    }
    const sequence = (this.#sequences.get(runKey(input.project_id, input.run_id)) ?? 0) + 1;
    const event = Master95DurableEventSchema.parse({
      ...input,
      event_id: `event:${input.project_id}:${input.run_id}:${sequence}`,
      sequence,
    });
    this.adapter.append(event);
    this.#events.push(event);
    this.#indexEvent(event, false);
    return { event: structuredClone(event), duplicate: false };
  }

  checkpoint(
    input: Omit<Master95DurableEventInput, "event_type" | "payload"> & { step: number; state: Record<string, unknown> },
  ) {
    const { step, state, ...event } = input;
    return this.append({
      ...event,
      event_type: "run.checkpoint_saved",
      payload: { step, state },
    });
  }

  resume(input: Omit<Master95DurableEventInput, "event_type" | "payload">) {
    const run = this.getRun(input.project_id, input.run_id);
    if (!run.latest_checkpoint) throw new Error("checkpoint_required_for_resume");
    if (["completed", "failed", "canceled"].includes(run.status)) throw new Error("terminal_run_cannot_resume");
    return this.append({
      ...input,
      event_type: "run.resumed",
      payload: { resumed_from_sequence: run.latest_checkpoint.sequence },
    });
  }

  recordExternalEffect(
    input: Omit<Master95DurableEventInput, "event_type" | "payload"> & { effect_type: string; effect_ref: string },
  ) {
    const { effect_type: effectType, effect_ref: effectRef, ...event } = input;
    return this.append({
      ...event,
      event_type: "run.external_effect_recorded",
      payload: {
        effect_type: required(effectType, "effect_type"),
        effect_ref: required(effectRef, "effect_ref"),
      },
    });
  }

  getRun(projectId: string, runId: string) {
    this.projects.require(projectId);
    const events = this.#events.filter((event) => event.project_id === projectId && event.run_id === runId);
    if (events.length === 0) throw new Error("run_not_found");
    const latestCheckpoint = [...events].reverse().find((event) => event.event_type === "run.checkpoint_saved") ?? null;
    const last = events.at(-1)!;
    const status =
      last.event_type === "run.completed"
        ? "completed"
        : last.event_type === "run.failed"
          ? "failed"
          : last.event_type === "run.canceled"
            ? "canceled"
            : last.event_type === "run.resumed"
              ? "working"
              : "running";
    return {
      project_id: projectId,
      run_id: runId,
      status,
      events: structuredClone(events),
      latest_checkpoint: structuredClone(latestCheckpoint),
    };
  }

  listEvents() {
    return structuredClone(this.#events);
  }

  #indexEvent(event: Master95DurableEvent, replay: boolean) {
    Master95DurableEventSchema.parse(event);
    this.projects.require(event.project_id);
    const key = runKey(event.project_id, event.run_id);
    const expected = (this.#sequences.get(key) ?? 0) + 1;
    if (event.sequence !== expected) throw new Error(`event_sequence_gap:${key}:${expected}:${event.sequence}`);
    const idempotencyIndex = `${event.project_id}:${event.idempotency_key}`;
    if (this.#idempotency.has(idempotencyIndex))
      throw new Error(`duplicate_idempotency_key_in_journal:${idempotencyIndex}`);
    this.#sequences.set(key, event.sequence);
    this.#idempotency.set(idempotencyIndex, event);
    if (replay && event.event_id !== `event:${event.project_id}:${event.run_id}:${event.sequence}`) {
      throw new Error("event_id_sequence_mismatch");
    }
  }
}

function runKey(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function required(value: string, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}
