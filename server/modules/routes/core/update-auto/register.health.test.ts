import { DatabaseSync } from "node:sqlite";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { applyContinuityCheckpointSchema } from "../../../bootstrap/schema/continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "../../../bootstrap/schema/continuity-run-schema.ts";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import { evaluateDatabaseReadiness, registerUpdateAutoRoutes } from "./register.ts";

vi.mock("./command-capture.ts", () => ({
  createCommandCaptureTools: () => ({
    runCommandCaptureSync: () => ({ ok: false, code: 1, stdout: "", stderr: "not available" }),
    runCommandCapture: vi.fn(),
  }),
}));

function createReadyDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applyContinuityCheckpointSchema(db);
  applyContinuityRunSchema(db);
  return db;
}

function recreateContinuityTable(
  db: DatabaseSync,
  tableName: "continuity_checkpoints" | "continuity_runs" | "continuity_run_events",
  replacements: ReadonlyArray<readonly [string, string]>,
): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as
    | { sql?: string }
    | undefined;
  if (!row?.sql) throw new Error(`test_schema_missing:${tableName}`);

  let replacementSql = row.sql;
  for (const [before, after] of replacements) {
    const nextSql = replacementSql.replace(before, after);
    if (nextSql === replacementSql) throw new Error(`test_schema_fragment_missing:${tableName}:${before}`);
    replacementSql = nextSql;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`DROP TABLE ${tableName}; ${replacementSql};`);
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  applyContinuityCheckpointSchema(db);
  applyContinuityRunSchema(db);
}

function createContext(app: ReturnType<typeof express>, db: DatabaseSync): RuntimeContext {
  return {
    app,
    db,
    dbPath: "C:\\Users\\private-owner\\Dongri grigri\\runtime.sqlite",
    appendTaskLog: vi.fn(),
    activeProcesses: new Map(),
    notifyCeo: vi.fn(),
    readSettingString: vi.fn(() => undefined),
    killPidTree: vi.fn(),
  } as unknown as RuntimeContext;
}

describe("runtime liveness and readiness routes", () => {
  it("keeps only liveness at 200 while all health routes fail closed when probes are unbound", async () => {
    const app = express();
    const db = createReadyDatabase();
    registerUpdateAutoRoutes(createContext(app, db));

    const live = await request(app).get("/livez").expect(200);
    expect(live.body).toMatchObject({ ok: true, status: "alive", app: "Dongri-grigri" });
    expect(JSON.stringify(live.body)).not.toContain("private-owner");

    for (const path of ["/health", "/healthz", "/api/health"]) {
      const health = await request(app).get(path).expect(503);
      expect(health.body).toMatchObject({
        ok: false,
        alive: true,
        ready: false,
        status: "not_ready",
        checks: {
          database: { ok: true },
          supervisor: { ok: false, reason: "supervisor_readiness_unbound" },
          reconciliation: { ok: false, reason: "reconciliation_readiness_unbound" },
        },
      });
      expect(JSON.stringify(health.body)).not.toContain("private-owner");
      expect(health.body).not.toHaveProperty("dbPath");
    }

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: { ok: true },
        supervisor: { ok: false },
        reconciliation: { ok: false },
      },
    });
    expect(JSON.stringify(ready.body)).not.toContain("private-owner");
    expect(ready.body).not.toHaveProperty("dbPath");

    db.close();
  });

  it("reports ready only when the database, Supervisor, and reconciliation probes all pass", async () => {
    const app = express();
    const db = createReadyDatabase();
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: true }),
      reconciliationReadiness: () => ({ ready: true }),
    });

    const ready = await request(app).get("/readyz").expect(200);
    expect(ready.body).toMatchObject({
      ok: true,
      status: "ready",
      checks: {
        database: { ok: true },
        supervisor: { ok: true },
        reconciliation: { ok: true },
      },
    });
    expect(ready.body).not.toHaveProperty("dbPath");

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toMatchObject({ ok: true, alive: true, ready: true, status: "ready" });
    expect(health.body).not.toHaveProperty("dbPath");

    db.close();
  });

  it("returns 503 without leaking probe errors when a dependency or database check fails", async () => {
    const app = express();
    const db = new DatabaseSync(":memory:");
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => {
        throw new Error("sensitive provider detail");
      },
      reconciliationReadiness: () => ({ ready: false, reason: "boot_reconciliation_pending" }),
    });
    db.close();

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: { ok: false, reason: "database_unavailable" },
        supervisor: { ok: false, reason: "supervisor_readiness_probe_failed" },
        reconciliation: { ok: false, reason: "boot_reconciliation_pending" },
      },
    });
    expect(JSON.stringify(ready.body)).not.toContain("sensitive provider detail");
  });

  it("replaces path-like and arbitrary dependency reasons with public-safe invalid codes", async () => {
    const app = express();
    const db = createReadyDatabase();
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: false, reason: "C:/Users/private-owner/secret.exe" }),
      reconciliationReadiness: () => ({ ready: false, reason: "G:/private/repo/runtime.db" }),
    });

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: { ok: true },
        supervisor: { ok: false, reason: "supervisor_readiness_invalid" },
        reconciliation: { ok: false, reason: "reconciliation_readiness_invalid" },
      },
    });
    expect(JSON.stringify(ready.body)).not.toContain("private-owner");
    expect(JSON.stringify(ready.body)).not.toContain("runtime.db");

    db.close();
  });

  it("rejects unknown code-shaped reasons and reasons attached to a ready dependency", async () => {
    const app = express();
    const db = createReadyDatabase();
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: false, reason: "runner_supervisor_private_token" }),
      reconciliationReadiness: () => ({ ready: true, reason: "runner_supervisor_boot_reconcile_pending" }),
    });

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body.checks).toMatchObject({
      supervisor: { ok: false, reason: "supervisor_readiness_invalid" },
      reconciliation: { ok: false, reason: "reconciliation_readiness_invalid" },
    });
    expect(JSON.stringify(ready.body)).not.toContain("private_token");

    db.close();
  });
});

describe("database readiness probe", () => {
  it("fails a corruption fixture unless quick_check returns exactly one ok result", () => {
    const corruptedDb = {
      prepare: vi.fn((sql: string) => {
        expect(sql).toBe("PRAGMA quick_check(1)");
        return { all: () => [{ quick_check: "database disk image is malformed" }] };
      }),
    } as unknown as RuntimeContext["db"];

    expect(evaluateDatabaseReadiness(corruptedDb)).toEqual({
      ok: false,
      reason: "database_integrity_check_failed",
    });
  });

  it("fails when the required continuity schema is missing", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "continuity_schema_missing:continuity_checkpoints",
    });

    db.close();
  });

  it("fails when foreign_key_check finds an orphan fixture", () => {
    const db = createReadyDatabase();
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE readiness_parent (id INTEGER PRIMARY KEY);
      CREATE TABLE readiness_child (parent_id INTEGER REFERENCES readiness_parent(id));
      INSERT INTO readiness_child (parent_id) VALUES (999);
      PRAGMA foreign_keys = ON;
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "database_foreign_key_violation",
    });

    db.close();
  });

  it("returns not_ready/503 for the previous subset schema missing runtime-critical run columns", async () => {
    const app = express();
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    applyContinuityCheckpointSchema(db);
    db.exec(`
      CREATE TABLE continuity_runs (
        run_id TEXT, project_id TEXT, task_id TEXT, checkpoint_id TEXT,
        provider TEXT, account_pool_id TEXT, dispatch_id TEXT,
        owner_instance_id TEXT, lease_expires_at TEXT, status TEXT,
        state_version INTEGER, last_event_sequence INTEGER
      );
      CREATE TABLE continuity_run_events (
        run_id TEXT, sequence INTEGER, event_type TEXT, payload_json TEXT,
        payload_sha256 TEXT, occurred_at TEXT, created_at TEXT
      );
    `);
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: true }),
      reconciliationReadiness: () => ({ ready: true }),
    });

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: {
          ok: false,
          reason:
            "continuity_schema_columns_missing:continuity_runs:parent_run_id,provider_native_session_id,pid,process_started_at,process_fingerprint,heartbeat_at,created_at,updated_at",
        },
        supervisor: { ok: true },
        reconciliation: { ok: true },
      },
    });

    db.close();
  });

  it("returns not_ready/503 when foreign key enforcement is disabled on an otherwise complete schema", async () => {
    const app = express();
    const db = createReadyDatabase();
    db.exec("PRAGMA foreign_keys = OFF");
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: true }),
      reconciliationReadiness: () => ({ ready: true }),
    });

    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: { ok: false, reason: "database_foreign_keys_disabled" },
        supervisor: { ok: true },
        reconciliation: { ok: true },
      },
    });

    db.close();
  });

  it("returns not_ready/503 when the runtime connection is query-only", async () => {
    const app = express();
    const db = createReadyDatabase();
    db.exec("PRAGMA query_only = ON");
    registerUpdateAutoRoutes(createContext(app, db), {
      supervisorReadiness: () => ({ ready: true }),
      reconciliationReadiness: () => ({ ready: true }),
    });

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "database_query_only_enabled",
    });
    const ready = await request(app).get("/readyz").expect(503);
    expect(ready.body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: {
        database: { ok: false, reason: "database_query_only_enabled" },
        supervisor: { ok: true },
        reconciliation: { ok: true },
      },
    });

    db.close();
  });

  it("rejects a constraintless same-column shape rebuilt with CREATE TABLE AS SELECT", () => {
    const db = createReadyDatabase();
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE readiness_checkpoints_shape AS SELECT * FROM continuity_checkpoints;
      CREATE TABLE readiness_runs_shape AS SELECT * FROM continuity_runs;
      CREATE TABLE readiness_events_shape AS SELECT * FROM continuity_run_events;
      DROP TABLE continuity_run_events;
      DROP TABLE continuity_runs;
      DROP TABLE continuity_checkpoints;
      ALTER TABLE readiness_checkpoints_shape RENAME TO continuity_checkpoints;
      ALTER TABLE readiness_runs_shape RENAME TO continuity_runs;
      ALTER TABLE readiness_events_shape RENAME TO continuity_run_events;
      PRAGMA foreign_keys = ON;
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "continuity_schema_column_contract_invalid:continuity_checkpoints:checkpoint_id:pk",
    });

    db.close();
  });

  it.each([
    {
      fixture: "checkpoint source identity NOT NULL",
      tableName: "continuity_checkpoints" as const,
      replacements: [["source_run_id TEXT NOT NULL", "source_run_id TEXT"]] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_checkpoints:source_run_id:notnull",
    },
    {
      fixture: "checkpoint payload type",
      tableName: "continuity_checkpoints" as const,
      replacements: [["payload_json TEXT NOT NULL", "payload_json BLOB NOT NULL"]] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_checkpoints:payload_json:type",
    },
    {
      fixture: "run timestamp NOT NULL",
      tableName: "continuity_runs" as const,
      replacements: [["updated_at TEXT NOT NULL", "updated_at TEXT"]] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_runs:updated_at:notnull",
    },
    {
      fixture: "run CAS state version default",
      tableName: "continuity_runs" as const,
      replacements: [["state_version INTEGER NOT NULL DEFAULT 0", "state_version INTEGER NOT NULL DEFAULT 1"]] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_runs:state_version:default",
    },
    {
      fixture: "event timestamps NOT NULL",
      tableName: "continuity_run_events" as const,
      replacements: [
        ["occurred_at TEXT NOT NULL", "occurred_at TEXT"],
        ["created_at TEXT NOT NULL", "created_at TEXT"],
      ] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_run_events:occurred_at:notnull",
    },
    {
      fixture: "event composite primary key",
      tableName: "continuity_run_events" as const,
      replacements: [["PRIMARY KEY (run_id, sequence)", "UNIQUE (run_id, sequence)"]] as const,
      reason: "continuity_schema_column_contract_invalid:continuity_run_events:run_id:pk",
    },
  ])("rejects a restored schema whose $fixture contract drifted", ({ tableName, replacements, reason }) => {
    const db = createReadyDatabase();
    recreateContinuityTable(db, tableName, replacements);

    expect(evaluateDatabaseReadiness(db)).toEqual({ ok: false, reason });

    db.close();
  });

  it("rejects a named unique dispatch index recreated as a non-unique index", () => {
    const db = createReadyDatabase();
    db.exec(`
      DROP INDEX uq_continuity_runs_dispatch;
      CREATE INDEX uq_continuity_runs_dispatch ON continuity_runs(dispatch_id);
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "continuity_schema_index_invalid:uq_continuity_runs_dispatch",
    });

    db.close();
  });

  it.each([
    ["idx_continuity_checkpoints_task_sequence", "continuity_checkpoints", "checkpoint_id", false],
    ["idx_continuity_checkpoints_project_created", "continuity_checkpoints", "checkpoint_id", false],
    ["idx_continuity_checkpoints_status_created", "continuity_checkpoints", "checkpoint_id", false],
    ["uq_continuity_runs_dispatch", "continuity_runs", "run_id", true],
    ["uq_continuity_runs_active_root_owner", "continuity_runs", "run_id", true],
    ["idx_continuity_runs_checkpoint_created", "continuity_runs", "run_id", false],
    ["idx_continuity_runs_task_created", "continuity_runs", "run_id", false],
    ["idx_continuity_runs_parent_created", "continuity_runs", "run_id", false],
    ["idx_continuity_runs_status_heartbeat", "continuity_runs", "run_id", false],
    ["idx_continuity_runs_owner_lease", "continuity_runs", "run_id", false],
    ["idx_continuity_run_events_cursor", "continuity_run_events", "event_type", false],
  ])("rejects required index %s recreated with wrong columns", (indexName, tableName, columnName, unique) => {
    const db = createReadyDatabase();
    db.exec(`
      DROP INDEX ${indexName};
      CREATE ${unique ? "UNIQUE " : ""}INDEX ${indexName} ON ${tableName}(${columnName});
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: `continuity_schema_index_invalid:${indexName}`,
    });

    db.close();
  });

  it("rejects the active-root unique index when its partial ownership predicate is weakened", () => {
    const db = createReadyDatabase();
    db.exec(`
      DROP INDEX uq_continuity_runs_active_root_owner;
      CREATE UNIQUE INDEX uq_continuity_runs_active_root_owner
        ON continuity_runs(project_id, task_id)
        WHERE parent_run_id IS NULL AND status = 'running';
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "continuity_schema_index_invalid:uq_continuity_runs_active_root_owner",
    });

    db.close();
  });

  it.each([
    ["continuity_checkpoints_no_update", "BEFORE UPDATE", "continuity_checkpoints"],
    ["continuity_checkpoints_no_delete", "BEFORE DELETE", "continuity_checkpoints"],
    ["continuity_runs_no_delete", "BEFORE DELETE", "continuity_runs"],
    ["continuity_runs_state_version_guard", "BEFORE UPDATE OF status", "continuity_runs"],
    ["continuity_run_events_next_sequence", "BEFORE INSERT", "continuity_run_events"],
    ["continuity_run_events_advance_cursor", "AFTER INSERT", "continuity_run_events"],
    ["continuity_run_events_no_update", "BEFORE UPDATE", "continuity_run_events"],
    ["continuity_run_events_no_delete", "BEFORE DELETE", "continuity_run_events"],
  ])("rejects required trigger %s recreated without its guard SQL", (triggerName, timing, tableName) => {
    const db = createReadyDatabase();
    db.exec(`
      DROP TRIGGER ${triggerName};
      CREATE TRIGGER ${triggerName}
      ${timing} ON ${tableName}
      BEGIN
        SELECT 1;
      END;
    `);

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: `continuity_schema_trigger_invalid:${triggerName}`,
    });

    db.close();
  });

  it("fails when the continuity event schema omits its runtime created_at column", () => {
    const db = createReadyDatabase();
    db.exec("ALTER TABLE continuity_run_events DROP COLUMN created_at");

    expect(evaluateDatabaseReadiness(db)).toEqual({
      ok: false,
      reason: "continuity_schema_columns_missing:continuity_run_events:created_at",
    });

    db.close();
  });
});
