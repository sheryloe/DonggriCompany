import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { continuityCheckpointFixture } from "./checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.ts";
import { ContinuityRealtimeProjectionService } from "./realtime-projection.ts";
import { SqliteContinuityRunLedger } from "./run-ledger.ts";

const NOW = "2026-08-29T01:00:20.000Z";
const SOURCE_RUN_ID = "run:source:projection";
const TARGET_RUN_ID = "run:target:projection";
const CHECKPOINT_ID = "checkpoint:projection:2";

describe("ContinuityRealtimeProjectionService", () => {
  let db: DatabaseSync;
  let store: SqliteContinuityCheckpointStore;
  let ledger: SqliteContinuityRunLedger;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    store = new SqliteContinuityCheckpointStore(db);
    ledger = new SqliteContinuityRunLedger(db);
  });

  function seedRunningTarget(heartbeatAt = "2026-08-29T01:00:10.000Z") {
    const checkpoint = continuityCheckpointFixture({
      checkpoint_id: CHECKPOINT_ID,
      source_run_id: SOURCE_RUN_ID,
      target_run_id: TARGET_RUN_ID,
      dispatch_id: "dispatch:projection",
      status: "accepted",
      sequence: 2,
      source_account_pool_id: "private-codex-account",
      target_account_pool_id: "private-claude-account",
      objective: "PRIVATE OBJECTIVE MUST NOT LEAVE THE SERVER",
      next_safe_action: "Inspect C:\\private\\workspace",
      workspace: {
        ...continuityCheckpointFixture().workspace,
        canonical_project_path: "C:\\private\\workspace",
        git_root: "C:\\private\\workspace",
      },
      blockers: ["approval_required", "Needs Human Review!", "private-claude-account"],
      idempotency_key: "projection:checkpoint:2",
      created_at: "2026-08-29T01:00:00.000Z",
    });
    expect(store.save(checkpoint).status).toBe("created");
    ledger.reserve({
      run_id: SOURCE_RUN_ID,
      project_id: checkpoint.project_id,
      task_id: checkpoint.task_id,
      provider: "codex",
      account_pool_id: "private-codex-account",
      dispatch_id: "dispatch:source:projection",
      status: "paused",
      heartbeat_at: "2026-08-29T00:59:00.000Z",
      created_at: "2026-08-29T00:58:00.000Z",
    });
    ledger.reserve({
      run_id: TARGET_RUN_ID,
      project_id: checkpoint.project_id,
      task_id: checkpoint.task_id,
      checkpoint_id: CHECKPOINT_ID,
      parent_run_id: SOURCE_RUN_ID,
      provider: "claude",
      account_pool_id: "private-claude-account",
      dispatch_id: "dispatch:projection",
      status: "running",
      heartbeat_at: heartbeatAt,
      created_at: "2026-08-29T01:00:05.000Z",
    });
    ledger.appendEvent({
      run_id: TARGET_RUN_ID,
      sequence: 1,
      event_type: "provider.output",
      payload: {
        prompt: "secret prompt",
        project_path: "C:\\private\\workspace",
        account_pool_id: "private-claude-account",
        status: "running",
      },
      occurred_at: "2026-08-29T01:00:10.000Z",
    });
    return checkpoint;
  }

  it("projects only the public whitelist and authorizes motion for a fresh persisted target run", () => {
    const checkpoint = seedRunningTarget();
    const service = new ContinuityRealtimeProjectionService(db, {
      now: () => NOW,
      heartbeatFreshMs: 30_000,
    });

    const projection = service.forTask(checkpoint.task_id);

    expect(projection).toMatchObject({
      checkpoint_id: CHECKPOINT_ID,
      checkpoint_sequence: 2,
      checkpoint_status: "accepted",
      phase: "resume_confirmed",
      phase_index: 5,
      source_run_id: SOURCE_RUN_ID,
      source_provider: "codex",
      source_run_status: "paused",
      target_run_id: TARGET_RUN_ID,
      target_provider: "claude",
      target_run_status: "running",
      cursor_run_id: TARGET_RUN_ID,
      event_sequence: 1,
      heartbeat_freshness: "fresh",
      heartbeat_age_ms: 10_000,
      reconcile_state: "in_sync",
      motion_eligible: true,
      latest_event: {
        run_id: TARGET_RUN_ID,
        sequence: 1,
        event_type: "provider.output",
      },
    });
    expect(projection?.blockers).toEqual(["approval_required", "unclassified_blocker"]);
    expect(projection?.next_safe_action).toBe("monitor_live_run");

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("PRIVATE OBJECTIVE");
    expect(serialized).not.toContain("C:\\\\private");
    expect(serialized).not.toContain("private-codex-account");
    expect(serialized).not.toContain("private-claude-account");
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("payload");
  });

  it("freezes running motion and requires reconciliation when the heartbeat is stale", () => {
    const checkpoint = seedRunningTarget("2026-08-29T00:55:00.000Z");
    const projection = new ContinuityRealtimeProjectionService(db, {
      now: () => NOW,
      heartbeatFreshMs: 30_000,
    }).forTask(checkpoint.task_id);

    expect(projection).toMatchObject({
      phase: "dispatch_reserved",
      phase_index: 4,
      heartbeat_freshness: "stale",
      reconcile_state: "reconcile_required",
      motion_eligible: false,
    });
    expect(projection?.blockers).toContain("heartbeat_stale");
  });

  it("returns append-only event cursors without exposing event payloads", () => {
    seedRunningTarget();
    ledger.appendEvent({
      run_id: TARGET_RUN_ID,
      sequence: 2,
      event_type: "provider.output",
      payload: { raw_prompt: "never expose", project_path: "G:\\secret" },
      occurred_at: "2026-08-29T01:00:15.000Z",
    });
    const events = new ContinuityRealtimeProjectionService(db, { now: () => NOW }).runEvents(TARGET_RUN_ID, 1);

    expect(events).toEqual({
      run_id: TARGET_RUN_ID,
      after_sequence: 1,
      event_sequence: 2,
      state_version: 0,
      run_status: "running",
      events: [
        {
          run_id: TARGET_RUN_ID,
          sequence: 2,
          event_type: "provider.output",
          occurred_at: "2026-08-29T01:00:15.000Z",
        },
      ],
    });
    expect(JSON.stringify(events)).not.toContain("never expose");
    expect(JSON.stringify(events)).not.toContain("G:\\\\secret");
  });

  it("generalizes unrecognized event metadata instead of reflecting identifiers", () => {
    seedRunningTarget();
    ledger.appendEvent({
      run_id: TARGET_RUN_ID,
      sequence: 2,
      event_type: "provider.private-claude-account",
      payload: {},
      occurred_at: "2026-08-29T01:00:15.000Z",
    });

    const events = new ContinuityRealtimeProjectionService(db, { now: () => NOW }).runEvents(TARGET_RUN_ID, 1);

    expect(events?.events).toEqual([
      {
        run_id: TARGET_RUN_ID,
        sequence: 2,
        event_type: "runner.event",
        occurred_at: "2026-08-29T01:00:15.000Z",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("private-claude-account");
  });

  it("uses the source run cursor before a target dispatch exists", () => {
    const checkpoint = continuityCheckpointFixture({
      source_run_id: SOURCE_RUN_ID,
      blockers: [],
      approval_ref: null,
    });
    expect(store.save(checkpoint).status).toBe("created");
    ledger.reserve({
      run_id: SOURCE_RUN_ID,
      project_id: checkpoint.project_id,
      task_id: checkpoint.task_id,
      provider: "codex",
      account_pool_id: "source-private",
      dispatch_id: "dispatch:source:only",
      status: "paused",
    });

    expect(new ContinuityRealtimeProjectionService(db, { now: () => NOW }).forTask(checkpoint.task_id)).toMatchObject({
      phase: "checkpoint_persisted",
      phase_index: 1,
      target_run_id: null,
      target_run_status: null,
      cursor_run_id: SOURCE_RUN_ID,
      heartbeat_freshness: "not_applicable",
      reconcile_state: "source_paused",
      motion_eligible: false,
      next_safe_action: "validate_target",
    });
  });

  it("returns null for unknown task and run identifiers", () => {
    const service = new ContinuityRealtimeProjectionService(db, { now: () => NOW });
    expect(service.forTask("task:missing")).toBeNull();
    expect(service.runEvents("run:missing", 0)).toBeNull();
  });
});
