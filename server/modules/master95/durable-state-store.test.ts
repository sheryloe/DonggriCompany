import { describe, expect, it } from "vitest";
import { Master95DurableStateStore, Master95MemoryEventJournal } from "./durable-state-store.ts";

const base = (suffix: string) => ({
  project_id: "project:BloggerGent",
  task_id: `task:${suffix}`,
  run_id: `run:${suffix}`,
  trace_id: `trace:${suffix}`,
  occurred_at: "2026-07-14T02:00:00+09:00",
});

describe("Master95 durable state and event store", () => {
  it("replays checkpoints into a fresh store instance", () => {
    const adapter = new Master95MemoryEventJournal();
    const first = new Master95DurableStateStore(adapter);
    first.append({ ...base("replay"), event_type: "run.started", idempotency_key: "start", payload: {} });
    first.checkpoint({
      ...base("replay"),
      idempotency_key: "checkpoint",
      step: 3,
      state: { cursor: "lane:google-travel-en" },
    });
    const restarted = new Master95DurableStateStore(adapter);
    expect(restarted.getRun("project:BloggerGent", "run:replay").latest_checkpoint).toMatchObject({
      sequence: 2,
      payload: { step: 3, state: { cursor: "lane:google-travel-en" } },
    });
  });

  it("records an external effect exactly once for the same idempotency key", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    const input = {
      ...base("effect"),
      idempotency_key: "publish-preview:1",
      effect_type: "routing_preview",
      effect_ref: "artifact:preview:1",
    };
    expect(store.recordExternalEffect(input).duplicate).toBe(false);
    expect(store.recordExternalEffect(input).duplicate).toBe(true);
    expect(store.listEvents()).toHaveLength(1);
  });

  it("rejects idempotency key reuse with a different payload", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    store.recordExternalEffect({
      ...base("conflict"),
      idempotency_key: "effect:1",
      effect_type: "preview",
      effect_ref: "artifact:1",
    });
    expect(() =>
      store.recordExternalEffect({
        ...base("conflict"),
        idempotency_key: "effect:1",
        effect_type: "preview",
        effect_ref: "artifact:2",
      }),
    ).toThrow("idempotency_key_conflict");
  });

  it("requires a checkpoint and rejects terminal resume", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    store.append({ ...base("resume"), event_type: "run.started", idempotency_key: "start", payload: {} });
    expect(() => store.resume({ ...base("resume"), idempotency_key: "resume:early" })).toThrow(
      "checkpoint_required_for_resume",
    );
    store.checkpoint({ ...base("resume"), idempotency_key: "checkpoint", step: 1, state: {} });
    store.append({ ...base("resume"), event_type: "run.completed", idempotency_key: "complete", payload: {} });
    expect(() => store.resume({ ...base("resume"), idempotency_key: "resume:late" })).toThrow(
      "terminal_run_cannot_resume",
    );
  });

  it("rejects missing and cross-project identity before persistence", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    expect(() =>
      store.append({
        ...base("missing"),
        project_id: "",
        event_type: "run.started",
        idempotency_key: "start",
        payload: {},
      }),
    ).toThrow("project_id_required");
    expect(() =>
      store.append({
        ...base("unknown"),
        project_id: "project:Unknown",
        event_type: "run.started",
        idempotency_key: "start",
        payload: {},
      }),
    ).toThrow("project_not_registered");
  });

  it("detects sequence gaps and duplicate keys during replay", () => {
    const adapter = new Master95MemoryEventJournal();
    adapter.events.push({
      ...base("gap"),
      event_id: "event:project:BloggerGent:run:gap:2",
      event_type: "run.started",
      sequence: 2,
      idempotency_key: "start",
      payload: {},
    });
    expect(() => new Master95DurableStateStore(adapter)).toThrow("event_sequence_gap");
  });
});
