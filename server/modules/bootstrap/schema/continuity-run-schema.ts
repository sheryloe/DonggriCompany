import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

const RUN_TABLE = "continuity_runs";
const EVENT_TABLE = "continuity_run_events";
const ACTIVE_ROOT_STATUS_SQL =
  "'reserved','starting','running','pause_requested','paused','dispatch_uncertain','stale'";

function runTableSql(tableName = RUN_TABLE): string {
  return `
CREATE TABLE ${tableName} (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL CHECK(length(trim(project_id)) > 0),
  task_id TEXT NOT NULL CHECK(length(trim(task_id)) > 0),
  checkpoint_id TEXT
    REFERENCES continuity_checkpoints(checkpoint_id) ON DELETE RESTRICT,
  parent_run_id TEXT
    REFERENCES ${tableName}(run_id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(provider IN ('codex','claude')),
  account_pool_id TEXT NOT NULL CHECK(length(trim(account_pool_id)) > 0),
  provider_native_session_id TEXT,
  dispatch_id TEXT NOT NULL UNIQUE CHECK(length(trim(dispatch_id)) > 0),
  pid INTEGER CHECK(pid IS NULL OR pid > 0),
  process_started_at TEXT,
  process_fingerprint TEXT CHECK(
    process_fingerprint IS NULL OR length(process_fingerprint) = 64
  ),
  owner_instance_id TEXT CHECK(
    owner_instance_id IS NULL OR length(trim(owner_instance_id)) > 0
  ),
  lease_expires_at TEXT,
  status TEXT NOT NULL CHECK(status IN (
    'reserved','starting','running','pause_requested','paused',
    'dispatch_uncertain','stale','completed','failed','canceled'
  )),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK(state_version >= 0),
  heartbeat_at TEXT,
  last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_event_sequence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;
}

function eventTableSql(tableName = EVENT_TABLE, runTableName = RUN_TABLE): string {
  return `
CREATE TABLE ${tableName} (
  run_id TEXT NOT NULL
    REFERENCES ${runTableName}(run_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  event_type TEXT NOT NULL CHECK(length(trim(event_type)) > 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
);`;
}

function tableExists(db: DbLike, tableName: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
  );
}

function tableColumns(db: DbLike, tableName: string): Map<string, { notnull: number }> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  return new Map(rows.map((row) => [row.name, { notnull: Number(row.notnull) }]));
}

function columnOr(columns: Map<string, unknown>, column: string, fallback: string): string {
  return columns.has(column) ? `legacy.${column}` : fallback;
}

function assertNoReferenceViolations(db: DbLike, runTable: string, eventTable: string | null): void {
  const checkpointOrphan = db
    .prepare(
      `SELECT run.run_id AS id
       FROM ${runTable} AS run
       LEFT JOIN continuity_checkpoints AS checkpoint
         ON checkpoint.checkpoint_id = run.checkpoint_id
       WHERE run.checkpoint_id IS NOT NULL AND checkpoint.checkpoint_id IS NULL
       LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  if (checkpointOrphan) {
    throw new Error(`continuity_run_schema_migration_checkpoint_orphan:${checkpointOrphan.id}`);
  }

  const parentOrphan = db
    .prepare(
      `SELECT child.run_id AS id
       FROM ${runTable} AS child
       LEFT JOIN ${runTable} AS parent ON parent.run_id = child.parent_run_id
       WHERE child.parent_run_id IS NOT NULL AND parent.run_id IS NULL
       LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  if (parentOrphan) {
    throw new Error(`continuity_run_schema_migration_parent_orphan:${parentOrphan.id}`);
  }

  if (!eventTable) return;
  const eventOrphan = db
    .prepare(
      `SELECT event.run_id AS id
       FROM ${eventTable} AS event
       LEFT JOIN ${runTable} AS run ON run.run_id = event.run_id
       WHERE run.run_id IS NULL
       LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  if (eventOrphan) {
    throw new Error(`continuity_run_schema_migration_event_orphan:${eventOrphan.id}`);
  }
}

function assertUniqueActiveRootOwnership(db: DbLike, runTable = RUN_TABLE): void {
  const conflict = db
    .prepare(
      `SELECT project_id, task_id
       FROM ${runTable}
       WHERE parent_run_id IS NULL
         AND status IN (${ACTIVE_ROOT_STATUS_SQL})
       GROUP BY project_id, task_id
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get() as { project_id: string; task_id: string } | undefined;
  if (conflict) {
    throw new Error(`continuity_run_active_root_ownership_conflict:${conflict.project_id}:${conflict.task_id}`);
  }
}

function migrateLegacyRunLedger(db: DbLike): void {
  if (!tableExists(db, RUN_TABLE)) return;
  const runColumns = tableColumns(db, RUN_TABLE);
  const requiredColumns = [
    "project_id",
    "task_id",
    "process_started_at",
    "process_fingerprint",
    "owner_instance_id",
    "lease_expires_at",
    "state_version",
  ];
  const checkpointColumn = runColumns.get("checkpoint_id");
  if (requiredColumns.every((column) => runColumns.has(column)) && checkpointColumn?.notnull === 0) return;

  const eventExists = tableExists(db, EVENT_TABLE);
  const foreignKeysWereEnabled =
    (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined)?.foreign_keys === 1;
  const columns = runColumns as Map<string, unknown>;
  const checkpoint = columnOr(columns, "checkpoint_id", "NULL");
  const projectId = columnOr(
    columns,
    "project_id",
    `COALESCE(checkpoint.project_id, 'legacy:project:' || legacy.run_id)`,
  );
  const taskId = columnOr(
    columns,
    "task_id",
    `COALESCE(checkpoint.task_id, 'legacy:task:' || legacy.run_id)`,
  );
  const provider = columnOr(columns, "provider", "COALESCE(checkpoint.source_provider, 'codex')");
  const createdAt = columnOr(
    columns,
    "created_at",
    "COALESCE(checkpoint.created_at, '1970-01-01T00:00:00.000Z')",
  );

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`
BEGIN IMMEDIATE;
DROP TRIGGER IF EXISTS continuity_runs_no_delete;
DROP TRIGGER IF EXISTS continuity_runs_state_version_guard;
DROP TRIGGER IF EXISTS continuity_run_events_next_sequence;
DROP TRIGGER IF EXISTS continuity_run_events_advance_cursor;
DROP TRIGGER IF EXISTS continuity_run_events_no_update;
DROP TRIGGER IF EXISTS continuity_run_events_no_delete;
DROP TABLE IF EXISTS continuity_runs_schema_v2;
DROP TABLE IF EXISTS continuity_run_events_schema_v2;
${runTableSql("continuity_runs_schema_v2")}
INSERT INTO continuity_runs_schema_v2 (
  run_id, project_id, task_id, checkpoint_id, parent_run_id, provider,
  account_pool_id, provider_native_session_id, dispatch_id, pid,
  process_started_at, process_fingerprint, owner_instance_id, lease_expires_at,
  status, state_version, heartbeat_at, last_event_sequence, created_at, updated_at
)
SELECT
  legacy.run_id,
  ${projectId},
  ${taskId},
  ${checkpoint},
  ${columnOr(columns, "parent_run_id", "NULL")},
  ${provider},
  ${columnOr(columns, "account_pool_id", "'legacy:account:' || legacy.run_id")},
  ${columnOr(columns, "provider_native_session_id", "NULL")},
  ${columnOr(columns, "dispatch_id", "'legacy:dispatch:' || legacy.run_id")},
  ${columnOr(columns, "pid", "NULL")},
  ${columnOr(columns, "process_started_at", "NULL")},
  ${columnOr(columns, "process_fingerprint", "NULL")},
  ${columnOr(columns, "owner_instance_id", "NULL")},
  ${columnOr(columns, "lease_expires_at", "NULL")},
  ${columnOr(columns, "status", "'paused'")},
  ${columnOr(columns, "state_version", "0")},
  ${columnOr(columns, "heartbeat_at", "NULL")},
  ${columnOr(columns, "last_event_sequence", "0")},
  ${createdAt},
  ${columnOr(columns, "updated_at", createdAt)}
FROM continuity_runs AS legacy
LEFT JOIN continuity_checkpoints AS checkpoint
  ON checkpoint.checkpoint_id = ${checkpoint};
${eventExists ? eventTableSql("continuity_run_events_schema_v2", "continuity_runs_schema_v2") : ""}
${eventExists ? `INSERT INTO continuity_run_events_schema_v2 (
  run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
)
SELECT run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
FROM continuity_run_events;` : ""}
`);
    assertNoReferenceViolations(
      db,
      "continuity_runs_schema_v2",
      eventExists ? "continuity_run_events_schema_v2" : null,
    );
    assertUniqueActiveRootOwnership(db, "continuity_runs_schema_v2");
    db.exec(`
${eventExists ? "DROP TABLE continuity_run_events;" : ""}
DROP TABLE continuity_runs;
ALTER TABLE continuity_runs_schema_v2 RENAME TO continuity_runs;
${eventExists ? "ALTER TABLE continuity_run_events_schema_v2 RENAME TO continuity_run_events;" : ""}
`);
    assertNoReferenceViolations(db, RUN_TABLE, eventExists ? EVENT_TABLE : null);
    assertUniqueActiveRootOwnership(db, RUN_TABLE);
    const foreignKeyIssues = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyIssues.length > 0) {
      throw new Error("continuity_run_schema_migration_foreign_key_failed");
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the migration error if SQLite already rolled back the transaction.
    }
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeysWereEnabled ? "ON" : "OFF"}`);
  }
}

/**
 * Durable, host-native continuity Runner ledger.
 *
 * A source run is owned by project/task and may exist before a checkpoint. A
 * dispatch id remains the durable spawn reservation boundary. Events are
 * append-only and advance their reconnect cursor inside SQLite.
 */
export function applyContinuityRunSchema(db: DbLike): void {
  db.exec(`
${runTableSql(RUN_TABLE).replace(`CREATE TABLE ${RUN_TABLE}`, `CREATE TABLE IF NOT EXISTS ${RUN_TABLE}`)}
${eventTableSql(EVENT_TABLE, RUN_TABLE).replace(
    `CREATE TABLE ${EVENT_TABLE}`,
    `CREATE TABLE IF NOT EXISTS ${EVENT_TABLE}`,
  )}
`);
  migrateLegacyRunLedger(db);
  assertUniqueActiveRootOwnership(db);
  db.exec(`
${eventTableSql(EVENT_TABLE, RUN_TABLE).replace(
    `CREATE TABLE ${EVENT_TABLE}`,
    `CREATE TABLE IF NOT EXISTS ${EVENT_TABLE}`,
  )}

CREATE UNIQUE INDEX IF NOT EXISTS uq_continuity_runs_dispatch
  ON continuity_runs(dispatch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_continuity_runs_active_root_owner
  ON continuity_runs(project_id, task_id)
  WHERE parent_run_id IS NULL
    AND status IN (${ACTIVE_ROOT_STATUS_SQL});
CREATE INDEX IF NOT EXISTS idx_continuity_runs_checkpoint_created
  ON continuity_runs(checkpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_runs_task_created
  ON continuity_runs(project_id, task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_runs_parent_created
  ON continuity_runs(parent_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_runs_status_heartbeat
  ON continuity_runs(status, heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_continuity_runs_owner_lease
  ON continuity_runs(owner_instance_id, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_continuity_run_events_cursor
  ON continuity_run_events(run_id, sequence ASC);

CREATE TRIGGER IF NOT EXISTS continuity_runs_no_delete
BEFORE DELETE ON continuity_runs
BEGIN
  SELECT RAISE(ABORT, 'continuity_runs_persistent');
END;

CREATE TRIGGER IF NOT EXISTS continuity_runs_state_version_guard
BEFORE UPDATE OF status ON continuity_runs
WHEN NEW.status <> OLD.status AND NEW.state_version <> OLD.state_version + 1
BEGIN
  SELECT RAISE(ABORT, 'continuity_run_state_version_required');
END;

CREATE TRIGGER IF NOT EXISTS continuity_run_events_next_sequence
BEFORE INSERT ON continuity_run_events
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM continuity_runs WHERE run_id = NEW.run_id
    )
    THEN RAISE(ABORT, 'continuity_run_missing')
  END;
  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT last_event_sequence + 1
      FROM continuity_runs
      WHERE run_id = NEW.run_id
    )
    THEN RAISE(ABORT, 'continuity_run_event_sequence_non_monotonic')
  END;
END;

CREATE TRIGGER IF NOT EXISTS continuity_run_events_advance_cursor
AFTER INSERT ON continuity_run_events
BEGIN
  UPDATE continuity_runs
  SET last_event_sequence = NEW.sequence,
      updated_at = NEW.occurred_at
  WHERE run_id = NEW.run_id;
END;

CREATE TRIGGER IF NOT EXISTS continuity_run_events_no_update
BEFORE UPDATE ON continuity_run_events
BEGIN
  SELECT RAISE(ABORT, 'continuity_run_events_append_only');
END;

CREATE TRIGGER IF NOT EXISTS continuity_run_events_no_delete
BEFORE DELETE ON continuity_run_events
BEGIN
  SELECT RAISE(ABORT, 'continuity_run_events_append_only');
END;
`);
}
