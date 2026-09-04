import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { applyBaseSchema } from "./base-schema.ts";
import { applyContinuityCheckpointSchema } from "./continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "./continuity-run-schema.ts";

const RUN_INSERT = `
  INSERT INTO continuity_runs (
    run_id, project_id, task_id, checkpoint_id, parent_run_id, provider, account_pool_id,
    provider_native_session_id, dispatch_id, pid, status, heartbeat_at,
    last_event_sequence, created_at, updated_at
  ) VALUES (?, 'project:DonggriCompany', 'task:continuity', ?, NULL, 'codex', 'pool:codex:primary', NULL, ?, NULL, 'reserved', NULL, 0, ?, ?)
`;

function insertRun(db: DatabaseSync, runId = "run:target:1", dispatchId = "dispatch:1"): void {
  const timestamp = "2026-08-28T10:00:00.000Z";
  db.prepare(RUN_INSERT).run(runId, "checkpoint:1", dispatchId, timestamp, timestamp);
}

function insertCheckpoint(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO continuity_checkpoints (
      checkpoint_id, previous_checkpoint_id, sequence, project_id, task_id,
      source_run_id, source_provider, source_account_label, target_provider,
      target_account_label, status, workspace_digest, payload_json, payload_sha256,
      idempotency_key, schema_version, captured_at, created_at
    ) VALUES (?, NULL, 1, ?, ?, ?, 'codex', ?, 'claude', ?, 'ready_for_transfer', ?, '{}', ?, ?, 1, ?, ?)`,
  ).run(
    "checkpoint:1",
    "project:DonggriCompany",
    "task:continuity",
    "run:source:1",
    "Codex primary",
    "Claude primary",
    "a".repeat(64),
    "b".repeat(64),
    "continuity:checkpoint:1",
    "2026-08-28T09:59:00.000Z",
    "2026-08-28T09:59:00.000Z",
  );
}

describe("continuity run schema", () => {
  it("is registered by the base schema and remains additive/idempotent", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyContinuityRunSchema(db);
      applyBaseSchema(db);

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('continuity_runs','continuity_run_events') ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const runColumns = db.prepare("PRAGMA table_info(continuity_runs)").all() as Array<{ name: string }>;
      const eventColumns = db.prepare("PRAGMA table_info(continuity_run_events)").all() as Array<{ name: string }>;

      expect(tables.map((row) => row.name)).toEqual(["continuity_run_events", "continuity_runs"]);
      expect(runColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "run_id",
          "project_id",
          "task_id",
          "checkpoint_id",
          "parent_run_id",
          "provider",
          "account_pool_id",
          "provider_native_session_id",
          "dispatch_id",
          "pid",
          "process_started_at",
          "process_fingerprint",
          "owner_instance_id",
          "lease_expires_at",
          "status",
          "state_version",
          "heartbeat_at",
          "last_event_sequence",
        ]),
      );
      expect(eventColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["run_id", "sequence", "payload_json", "payload_sha256"]),
      );
    } finally {
      db.close();
    }
  });

  it("enforces one durable reservation per dispatch id", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      insertCheckpoint(db);
      insertRun(db);
      expect(() => insertRun(db, "run:target:2", "dispatch:1")).toThrow(/UNIQUE constraint failed/);
      expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("allows a task-owned source run to exist before its first checkpoint", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      const timestamp = "2026-08-28T10:00:00.000Z";
      db.prepare(
        `INSERT INTO continuity_runs (
          run_id, project_id, task_id, checkpoint_id, provider, account_pool_id,
          dispatch_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'codex', ?, ?, 'running', ?, ?)`,
      ).run(
        "run:source:before-checkpoint",
        "project:DonggriCompany",
        "task:source-owned",
        "pool:codex:primary",
        "dispatch:source:before-checkpoint",
        timestamp,
        timestamp,
      );

      expect(
        db.prepare("SELECT project_id, task_id, checkpoint_id FROM continuity_runs").get(),
      ).toEqual({
        project_id: "project:DonggriCompany",
        task_id: "task:source-owned",
        checkpoint_id: null,
      });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("enforces one nonterminal root source owner per project and task", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      const insertRoot = db.prepare(
        `INSERT INTO continuity_runs (
          run_id, project_id, task_id, checkpoint_id, parent_run_id, provider,
          account_pool_id, dispatch_id, status, created_at, updated_at
        ) VALUES (?, 'project:owned', 'task:owned', NULL, NULL, 'codex', ?, ?, ?, ?, ?)`,
      );
      const timestamp = "2026-08-29T00:00:00.000Z";
      insertRoot.run("run:root:1", "pool:codex", "dispatch:root:1", "running", timestamp, timestamp);
      expect(() =>
        insertRoot.run("run:root:2", "pool:claude", "dispatch:root:2", "reserved", timestamp, timestamp),
      ).toThrow(/UNIQUE constraint failed/);

      db.prepare(
        "UPDATE continuity_runs SET status = 'completed', state_version = state_version + 1 WHERE run_id = ?",
      ).run("run:root:1");
      expect(() =>
        insertRoot.run("run:root:2", "pool:claude", "dispatch:root:2", "reserved", timestamp, timestamp),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it.each(["reserved", "starting", "running", "pause_requested", "paused", "dispatch_uncertain", "stale"])(
    "blocks a second root while the existing owner is %s",
    (status) => {
      const db = new DatabaseSync(":memory:");
      try {
        applyContinuityCheckpointSchema(db);
        applyContinuityRunSchema(db);
        const timestamp = "2026-08-29T00:00:00.000Z";
        const insertRoot = db.prepare(
          `INSERT INTO continuity_runs (
            run_id, project_id, task_id, parent_run_id, provider, account_pool_id,
            dispatch_id, status, created_at, updated_at
          ) VALUES (?, 'project:owned', 'task:owned', NULL, 'codex', ?, ?, ?, ?, ?)`,
        );
        insertRoot.run("run:root:1", "pool:codex", "dispatch:root:1", status, timestamp, timestamp);
        expect(() =>
          insertRoot.run("run:root:2", "pool:claude", "dispatch:root:2", "reserved", timestamp, timestamp),
        ).toThrow(/UNIQUE constraint failed/);
      } finally {
        db.close();
      }
    },
  );

  it.each(["completed", "failed", "canceled"])("permits a new root after the prior owner is %s", (status) => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      const timestamp = "2026-08-29T00:00:00.000Z";
      const insertRoot = db.prepare(
        `INSERT INTO continuity_runs (
          run_id, project_id, task_id, parent_run_id, provider, account_pool_id,
          dispatch_id, status, created_at, updated_at
        ) VALUES (?, 'project:owned', 'task:owned', NULL, 'codex', ?, ?, ?, ?, ?)`,
      );
      insertRoot.run("run:root:1", "pool:codex", "dispatch:root:1", status, timestamp, timestamp);
      expect(() =>
        insertRoot.run("run:root:2", "pool:claude", "dispatch:root:2", "reserved", timestamp, timestamp),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("permits a parent-owned target child while its source root is paused", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      const timestamp = "2026-08-29T00:00:00.000Z";
      db.prepare(
        `INSERT INTO continuity_runs (
          run_id, project_id, task_id, parent_run_id, provider, account_pool_id,
          dispatch_id, status, created_at, updated_at
        ) VALUES ('run:source', 'project:owned', 'task:owned', NULL, 'codex',
          'pool:codex', 'dispatch:source', 'paused', ?, ?)`,
      ).run(timestamp, timestamp);
      expect(() =>
        db
          .prepare(
            `INSERT INTO continuity_runs (
              run_id, project_id, task_id, parent_run_id, provider, account_pool_id,
              dispatch_id, status, created_at, updated_at
            ) VALUES ('run:target', 'project:owned', 'task:owned', 'run:source', 'claude',
              'pool:claude', 'dispatch:target', 'reserved', ?, ?)`,
          )
          .run(timestamp, timestamp),
      ).not.toThrow();
      expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_runs").get()).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  });

  it("migrates the v1 ledger without losing runs or append-only events", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      insertCheckpoint(db);
      db.exec(`
        CREATE TABLE continuity_runs (
          run_id TEXT PRIMARY KEY,
          checkpoint_id TEXT NOT NULL REFERENCES continuity_checkpoints(checkpoint_id),
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          dispatch_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          last_event_sequence INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE continuity_run_events (
          run_id TEXT NOT NULL REFERENCES continuity_runs(run_id),
          sequence INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (run_id, sequence)
        );
      `);
      const timestamp = "2026-08-28T10:00:00.000Z";
      db.prepare(
        `INSERT INTO continuity_runs (
          run_id, checkpoint_id, provider, account_pool_id, dispatch_id,
          status, last_event_sequence, created_at, updated_at
        ) VALUES (?, ?, 'codex', ?, ?, 'paused', 1, ?, ?)`,
      ).run(
        "run:legacy:1",
        "checkpoint:1",
        "pool:codex:primary",
        "dispatch:legacy:1",
        timestamp,
        timestamp,
      );
      db.prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES (?, 1, 'runner.paused', '{}', ?, ?, ?)`,
      ).run("run:legacy:1", "a".repeat(64), timestamp, timestamp);

      applyContinuityRunSchema(db);

      expect(db.prepare("SELECT * FROM continuity_runs WHERE run_id = ?").get("run:legacy:1")).toMatchObject({
        project_id: "project:DonggriCompany",
        task_id: "task:continuity",
        checkpoint_id: "checkpoint:1",
        state_version: 0,
        owner_instance_id: null,
      });
      expect(db.prepare("SELECT event_type FROM continuity_run_events").all()).toEqual([
        { event_type: "runner.paused" },
      ]);
      expect(() => db.exec("DELETE FROM continuity_run_events")).toThrow(/continuity_run_events_append_only/);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rolls an active-root ownership conflict back to the complete legacy ledger", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      insertCheckpoint(db);
      db.exec(`
        CREATE TABLE continuity_runs (
          run_id TEXT PRIMARY KEY,
          checkpoint_id TEXT NOT NULL REFERENCES continuity_checkpoints(checkpoint_id),
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          dispatch_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          last_event_sequence INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE continuity_run_events (
          run_id TEXT NOT NULL REFERENCES continuity_runs(run_id),
          sequence INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (run_id, sequence)
        );
        CREATE INDEX legacy_runs_status ON continuity_runs(status);
        CREATE TRIGGER legacy_runs_no_update
        BEFORE UPDATE ON continuity_runs
        BEGIN
          SELECT RAISE(ABORT, 'legacy_runs_no_update');
        END;
      `);
      const timestamp = "2026-08-28T10:00:00.000Z";
      const insertLegacyRun = db.prepare(
        `INSERT INTO continuity_runs (
          run_id, checkpoint_id, provider, account_pool_id, dispatch_id,
          status, last_event_sequence, created_at, updated_at
        ) VALUES (?, 'checkpoint:1', 'codex', ?, ?, 'paused', 1, ?, ?)`,
      );
      const insertLegacyEvent = db.prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES (?, 1, 'runner.paused', '{}', ?, ?, ?)`,
      );
      for (const index of [1, 2]) {
        insertLegacyRun.run(
          `run:legacy:duplicate:${index}`,
          `pool:legacy:${index}`,
          `dispatch:legacy:duplicate:${index}`,
          timestamp,
          timestamp,
        );
        insertLegacyEvent.run(`run:legacy:duplicate:${index}`, "a".repeat(64), timestamp, timestamp);
      }
      const legacyObjects = db
        .prepare(
          `SELECT type, name, sql FROM sqlite_master
           WHERE name IN ('continuity_runs','continuity_run_events','legacy_runs_status','legacy_runs_no_update')
           ORDER BY type, name`,
        )
        .all();
      const legacyRows = db.prepare("SELECT * FROM continuity_runs ORDER BY run_id").all();
      const legacyEvents = db.prepare("SELECT * FROM continuity_run_events ORDER BY run_id, sequence").all();

      expect(() => applyContinuityRunSchema(db)).toThrow(
        "continuity_run_active_root_ownership_conflict:project:DonggriCompany:task:continuity",
      );

      expect(
        db
          .prepare(
            `SELECT type, name, sql FROM sqlite_master
             WHERE name IN ('continuity_runs','continuity_run_events','legacy_runs_status','legacy_runs_no_update')
             ORDER BY type, name`,
          )
          .all(),
      ).toEqual(legacyObjects);
      expect(db.prepare("SELECT * FROM continuity_runs ORDER BY run_id").all()).toEqual(legacyRows);
      expect(db.prepare("SELECT * FROM continuity_run_events ORDER BY run_id, sequence").all()).toEqual(legacyEvents);
      expect(
        (db.prepare("PRAGMA table_info(continuity_runs)").all() as Array<{ name: string }>).map(
          (column) => column.name,
        ),
      ).not.toContain("state_version");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%schema_v2'").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rolls an orphaned v1 migration back with legacy schema and data intact", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      db.exec("PRAGMA foreign_keys = OFF");
      db.exec(`
        CREATE TABLE continuity_runs (
          run_id TEXT PRIMARY KEY,
          checkpoint_id TEXT NOT NULL REFERENCES continuity_checkpoints(checkpoint_id),
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          dispatch_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          last_event_sequence INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE continuity_run_events (
          run_id TEXT NOT NULL REFERENCES continuity_runs(run_id),
          sequence INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (run_id, sequence)
        );
      `);
      const timestamp = "2026-08-28T10:00:00.000Z";
      db.prepare(
        `INSERT INTO continuity_runs (
          run_id, checkpoint_id, provider, account_pool_id, dispatch_id,
          status, last_event_sequence, created_at, updated_at
        ) VALUES ('run:orphan', 'checkpoint:missing', 'codex', 'pool:codex:primary',
          'dispatch:orphan', 'paused', 1, ?, ?)`,
      ).run(timestamp, timestamp);
      db.prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES ('run:orphan', 1, 'runner.paused', '{}', ?, ?, ?)`,
      ).run("a".repeat(64), timestamp, timestamp);
      const legacySql = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_runs'")
        .get() as { sql: string };
      db.exec("PRAGMA foreign_keys = ON");

      expect(() => applyContinuityRunSchema(db)).toThrow(
        "continuity_run_schema_migration_checkpoint_orphan:run:orphan",
      );

      expect(
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_runs'").get(),
      ).toEqual(legacySql);
      expect(db.prepare("SELECT run_id, checkpoint_id FROM continuity_runs").all()).toEqual([
        { run_id: "run:orphan", checkpoint_id: "checkpoint:missing" },
      ]);
      expect(db.prepare("SELECT run_id, sequence FROM continuity_run_events").all()).toEqual([
        { run_id: "run:orphan", sequence: 1 },
      ]);
      expect(
        (db.prepare("PRAGMA table_info(continuity_runs)").all() as Array<{ name: string }>).map(
          (column) => column.name,
        ),
      ).not.toContain("state_version");
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%schema_v2'").all(),
      ).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("accepts only the next event sequence and advances the persisted cursor", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      insertCheckpoint(db);
      insertRun(db);
      const eventInsert = db.prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES ('run:target:1', ?, 'runner.started', '{}', ?, ?, ?)`,
      );
      const timestamp = "2026-08-28T10:01:00.000Z";
      eventInsert.run(1, "a".repeat(64), timestamp, timestamp);

      expect(db.prepare("SELECT last_event_sequence FROM continuity_runs").get()).toEqual({
        last_event_sequence: 1,
      });
      expect(() => eventInsert.run(3, "b".repeat(64), timestamp, timestamp)).toThrow(
        /continuity_run_event_sequence_non_monotonic/,
      );
      expect(() => eventInsert.run(1, "c".repeat(64), timestamp, timestamp)).toThrow(
        /continuity_run_event_sequence_non_monotonic|UNIQUE constraint failed/,
      );
      expect(() => db.exec("UPDATE continuity_run_events SET event_type = 'changed'")).toThrow(
        /continuity_run_events_append_only/,
      );
      expect(() => db.exec("DELETE FROM continuity_run_events")).toThrow(/continuity_run_events_append_only/);
      expect(() => db.exec("DELETE FROM continuity_runs")).toThrow(/continuity_runs_persistent/);
    } finally {
      db.close();
    }
  });

  it("rejects an event whose run reservation does not exist", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      applyContinuityRunSchema(db);
      expect(() =>
        db
          .prepare(
            `INSERT INTO continuity_run_events (
              run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
            ) VALUES ('run:missing', 1, 'runner.started', '{}', ?, ?, ?)`,
          )
          .run("a".repeat(64), "2026-08-28T10:01:00.000Z", "2026-08-28T10:01:00.000Z"),
      ).toThrow(/continuity_run_missing/);
    } finally {
      db.close();
    }
  });
});
