import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { applyBaseSchema } from "./base-schema.ts";
import { applyContinuityCheckpointSchema } from "./continuity-checkpoint-schema.ts";

const insertSql = `
  INSERT INTO continuity_checkpoints (
    checkpoint_id, previous_checkpoint_id, sequence, project_id, task_id,
    source_run_id, source_provider, source_account_label, target_provider,
    target_account_label, status, workspace_digest, payload_json, payload_sha256,
    idempotency_key, schema_version, captured_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function insertCheckpoint(
  db: DatabaseSync,
  overrides: {
    id?: string;
    previousCheckpointId?: string;
    sequence?: number;
    idempotencyKey?: string;
    targetProvider?: "codex" | "claude";
  } = {},
) {
  db.prepare(insertSql).run(
    overrides.id ?? "checkpoint:1",
    overrides.previousCheckpointId ?? null,
    overrides.sequence ?? 1,
    "project:DonggriCompany",
    "task:continuity",
    "run:codex:1",
    "codex",
    "Codex primary",
    overrides.targetProvider ?? "claude",
    overrides.targetProvider === "codex" ? "Codex recovery" : "Claude primary",
    "ready_for_transfer",
    "a".repeat(64),
    "{}",
    "b".repeat(64),
    overrides.idempotencyKey ?? "continuity:checkpoint:1",
    1,
    "2026-08-26T09:00:00+09:00",
    "2026-08-26T09:01:00+09:00",
  );
}

describe("continuity checkpoint schema", () => {
  it("is registered by the base schema and can be applied repeatedly", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyContinuityCheckpointSchema(db);

      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints'")
        .get();
      const columns = db.prepare("PRAGMA table_info(continuity_checkpoints)").all() as Array<{ name: string }>;
      expect(row).toBeTruthy();
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["checkpoint_id", "workspace_digest", "payload_sha256", "idempotency_key"]),
      );
    } finally {
      db.close();
    }
  });

  it("accepts inserts but blocks update and delete", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      insertCheckpoint(db);

      expect(() => db.prepare("UPDATE continuity_checkpoints SET status = 'accepted'").run()).toThrow(
        /continuity_checkpoints_append_only/,
      );
      expect(() => db.prepare("DELETE FROM continuity_checkpoints").run()).toThrow(
        /continuity_checkpoints_append_only/,
      );
      expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("persists same-provider resume checkpoints", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      insertCheckpoint(db, { targetProvider: "codex" });

      expect(
        db
          .prepare("SELECT source_provider, target_provider FROM continuity_checkpoints WHERE checkpoint_id = ?")
          .get("checkpoint:1"),
      ).toEqual({ source_provider: "codex", target_provider: "codex" });
    } finally {
      db.close();
    }
  });

  it("upgrades the draft cross-provider-only table without losing checkpoints", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE continuity_checkpoints (
          checkpoint_id TEXT PRIMARY KEY,
          previous_checkpoint_id TEXT,
          sequence INTEGER NOT NULL CHECK(sequence > 0),
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          source_run_id TEXT NOT NULL,
          source_provider TEXT NOT NULL CHECK(source_provider IN ('codex','claude')),
          source_account_label TEXT NOT NULL,
          target_provider TEXT NOT NULL CHECK(target_provider IN ('codex','claude')),
          target_account_label TEXT NOT NULL,
          status TEXT NOT NULL,
          workspace_digest TEXT NOT NULL CHECK(length(workspace_digest) = 64),
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
          idempotency_key TEXT NOT NULL UNIQUE,
          schema_version INTEGER NOT NULL CHECK(schema_version = 1),
          captured_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK(source_provider <> target_provider),
          UNIQUE(task_id, sequence),
          FOREIGN KEY(previous_checkpoint_id) REFERENCES continuity_checkpoints(checkpoint_id)
        );
        CREATE TABLE continuity_runs (
          run_id TEXT PRIMARY KEY,
          checkpoint_id TEXT NOT NULL REFERENCES continuity_checkpoints(checkpoint_id) ON DELETE RESTRICT
        );
      `);
      insertCheckpoint(db);
      db.prepare("INSERT INTO continuity_runs (run_id, checkpoint_id) VALUES (?, ?)").run(
        "run:legacy:1",
        "checkpoint:1",
      );

      applyContinuityCheckpointSchema(db);

      expect(db.prepare("SELECT checkpoint_id FROM continuity_checkpoints").all()).toEqual([
        { checkpoint_id: "checkpoint:1" },
      ]);
      expect(db.prepare("SELECT checkpoint_id FROM continuity_runs").all()).toEqual([
        { checkpoint_id: "checkpoint:1" },
      ]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const tableSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints'").get() as {
          sql: string;
        }
      ).sql;
      expect(tableSql).not.toMatch(/source_provider\s*<>\s*target_provider/i);
      insertCheckpoint(db, {
        id: "checkpoint:2",
        sequence: 2,
        idempotencyKey: "continuity:checkpoint:2",
        targetProvider: "codex",
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints").get()).toEqual({ count: 2 });
      expect(() =>
        db.prepare("DELETE FROM continuity_checkpoints WHERE checkpoint_id = ?").run("checkpoint:1"),
      ).toThrow(/continuity_checkpoints_append_only/);
    } finally {
      db.close();
    }
  });

  it("rolls the legacy table, data, index, and trigger back when migrated rows contain an orphan parent", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE continuity_checkpoints (
          checkpoint_id TEXT PRIMARY KEY,
          previous_checkpoint_id TEXT,
          sequence INTEGER NOT NULL CHECK(sequence > 0),
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          source_run_id TEXT NOT NULL,
          source_provider TEXT NOT NULL CHECK(source_provider IN ('codex','claude')),
          source_account_label TEXT NOT NULL,
          target_provider TEXT NOT NULL CHECK(target_provider IN ('codex','claude')),
          target_account_label TEXT NOT NULL,
          status TEXT NOT NULL,
          workspace_digest TEXT NOT NULL CHECK(length(workspace_digest) = 64),
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
          idempotency_key TEXT NOT NULL UNIQUE,
          schema_version INTEGER NOT NULL CHECK(schema_version = 1),
          captured_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK(source_provider <> target_provider),
          UNIQUE(task_id, sequence),
          FOREIGN KEY(previous_checkpoint_id) REFERENCES continuity_checkpoints(checkpoint_id)
        );
        CREATE INDEX legacy_checkpoint_project
          ON continuity_checkpoints(project_id);
        CREATE TRIGGER legacy_checkpoint_no_update
        BEFORE UPDATE ON continuity_checkpoints
        BEGIN
          SELECT RAISE(ABORT, 'legacy_checkpoint_immutable');
        END;
      `);
      insertCheckpoint(db, { previousCheckpointId: "checkpoint:missing" });
      db.exec("PRAGMA foreign_keys = ON");
      const legacyTableSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints'").get() as {
          sql: string;
        }
      ).sql;
      const legacyRows = db.prepare("SELECT * FROM continuity_checkpoints").all();
      const legacyObjects = db
        .prepare(
          "SELECT type, name, sql FROM sqlite_master WHERE name IN ('legacy_checkpoint_project', 'legacy_checkpoint_no_update') ORDER BY type",
        )
        .all();

      expect(() => applyContinuityCheckpointSchema(db)).toThrow(
        /continuity_checkpoint_provider_pair_migration_foreign_key_failed/,
      );

      const tableSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints'").get() as {
          sql: string;
        }
      ).sql;
      expect(tableSql).toBe(legacyTableSql);
      expect(tableSql).toMatch(/source_provider\s*<>\s*target_provider/i);
      expect(db.prepare("SELECT * FROM continuity_checkpoints").all()).toEqual(legacyRows);
      expect(
        db
          .prepare(
            "SELECT type, name, sql FROM sqlite_master WHERE name IN ('legacy_checkpoint_project', 'legacy_checkpoint_no_update') ORDER BY type",
          )
          .all(),
      ).toEqual(legacyObjects);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints_provider_pair_v2'",
          )
          .get(),
      ).toBeUndefined();
      expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      expect(() => db.prepare("UPDATE continuity_checkpoints SET status = 'accepted'").run()).toThrow(
        /legacy_checkpoint_immutable/,
      );
    } finally {
      db.close();
    }
  });

  it("enforces idempotency and monotonic per-task sequence uniqueness", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyContinuityCheckpointSchema(db);
      insertCheckpoint(db);
      expect(() =>
        insertCheckpoint(db, { id: "checkpoint:2", sequence: 2, idempotencyKey: "continuity:checkpoint:1" }),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() =>
        insertCheckpoint(db, { id: "checkpoint:3", sequence: 1, idempotencyKey: "continuity:checkpoint:3" }),
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      db.close();
    }
  });
});
