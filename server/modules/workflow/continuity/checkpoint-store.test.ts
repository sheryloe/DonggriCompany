import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { applyContinuityCheckpointSchema } from "../../bootstrap/schema/continuity-checkpoint-schema.ts";
import { continuityCheckpointFixture } from "./checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.ts";

describe("SqliteContinuityCheckpointStore", () => {
  let db: DatabaseSync;
  let store: SqliteContinuityCheckpointStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyContinuityCheckpointSchema(db);
    store = new SqliteContinuityCheckpointStore(db);
  });

  it("persists and reloads a checkpoint after store recreation", () => {
    const checkpoint = continuityCheckpointFixture();
    expect(store.save(checkpoint).status).toBe("created");
    expect(new SqliteContinuityCheckpointStore(db).get(checkpoint.checkpoint_id)).toEqual(checkpoint);
  });

  it("replays the same idempotent request and rejects changed input", () => {
    const checkpoint = continuityCheckpointFixture();
    expect(store.save(checkpoint).status).toBe("created");
    expect(store.save(checkpoint).status).toBe("replay");
    expect(store.save({ ...checkpoint, objective: "different" })).toEqual({ status: "idempotency_conflict" });
  });

  it("returns the ordered chain and latest checkpoint", () => {
    const first = continuityCheckpointFixture();
    const second = continuityCheckpointFixture({
      checkpoint_id: "checkpoint:fixture:2",
      previous_checkpoint_id: first.checkpoint_id,
      sequence: 2,
      status: "accepted",
      idempotency_key: "continuity:fixture:2",
    });
    store.save(first);
    store.save(second);
    expect(store.list(first.task_id).map((item) => item.checkpoint_id)).toEqual([
      "checkpoint:fixture:1",
      "checkpoint:fixture:2",
    ]);
    expect(store.latest(first.task_id)?.status).toBe("accepted");
  });

  it("finds the newest checkpoint for a persisted dispatch reservation", () => {
    const first = continuityCheckpointFixture({ dispatch_id: "dispatch:fixture" });
    const second = continuityCheckpointFixture({
      checkpoint_id: "checkpoint:fixture:2",
      previous_checkpoint_id: first.checkpoint_id,
      sequence: 2,
      status: "dispatch_uncertain",
      dispatch_id: "dispatch:fixture",
      idempotency_key: "continuity:fixture:2",
    });
    store.save(first);
    store.save(second);
    expect(store.findLatestByDispatchId("dispatch:fixture")?.checkpoint_id).toBe("checkpoint:fixture:2");
    expect(store.findLatestByDispatchId("dispatch:missing")).toBeNull();
  });

  it("fails closed when the persisted payload digest is corrupted", () => {
    const checkpoint = continuityCheckpointFixture();
    store.save(checkpoint);
    db.exec("DROP TRIGGER continuity_checkpoints_no_update");
    db.prepare("UPDATE continuity_checkpoints SET payload_json = ? WHERE checkpoint_id = ?").run(
      "{}",
      checkpoint.checkpoint_id,
    );
    expect(() => store.get(checkpoint.checkpoint_id)).toThrow("continuity_checkpoint_digest_mismatch");
  });

  it("participates in a caller-owned transaction without committing it", () => {
    const checkpoint = continuityCheckpointFixture();
    db.exec("BEGIN IMMEDIATE");
    expect(store.saveInTransaction(checkpoint).status).toBe("created");
    db.exec("ROLLBACK");
    expect(store.get(checkpoint.checkpoint_id)).toBeNull();
  });
});
