import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec">;

const LEGACY_PROVIDER_PAIR_CHECK = /CHECK\s*\(\s*source_provider\s*<>\s*target_provider\s*\)/i;

function checkpointTableSql(tableName: "continuity_checkpoints" | "continuity_checkpoints_provider_pair_v2"): string {
  return `
CREATE TABLE ${tableName} (
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
  status TEXT NOT NULL CHECK(status IN (
    'ready_for_transfer','target_validating','approval_required','accepted','resuming','running','completed',
    'checkpoint_conflict','provider_unavailable','auth_required',
    'dispatch_uncertain','stale','failed','canceled'
  )),
  workspace_digest TEXT NOT NULL CHECK(length(workspace_digest) = 64),
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  idempotency_key TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, sequence),
  FOREIGN KEY(previous_checkpoint_id) REFERENCES ${tableName}(checkpoint_id)
);`;
}

function migrateLegacyProviderPairConstraint(db: DbLike): void {
  const runtimeDb = db as DbLike & Pick<DatabaseSync, "prepare">;
  const row = runtimeDb
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuity_checkpoints'")
    .get() as { sql?: string | null } | undefined;
  if (!row?.sql || !LEGACY_PROVIDER_PAIR_CHECK.test(row.sql)) return;

  const foreignKeysWereEnabled =
    (runtimeDb.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined)?.foreign_keys === 1;
  const hasRunLedger = Boolean(
    runtimeDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'continuity_runs'").get(),
  );
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`
BEGIN IMMEDIATE;
DROP TABLE IF EXISTS continuity_checkpoints_provider_pair_v2;
${checkpointTableSql("continuity_checkpoints_provider_pair_v2")}
INSERT INTO continuity_checkpoints_provider_pair_v2 (
  checkpoint_id, previous_checkpoint_id, sequence, project_id, task_id,
  source_run_id, source_provider, source_account_label, target_provider,
  target_account_label, status, workspace_digest, payload_json, payload_sha256,
  idempotency_key, schema_version, captured_at, created_at
)
SELECT
  checkpoint_id, previous_checkpoint_id, sequence, project_id, task_id,
  source_run_id, source_provider, source_account_label, target_provider,
  target_account_label, status, workspace_digest, payload_json, payload_sha256,
  idempotency_key, schema_version, captured_at, created_at
FROM continuity_checkpoints;
DROP TABLE continuity_checkpoints;
ALTER TABLE continuity_checkpoints_provider_pair_v2 RENAME TO continuity_checkpoints;
`);

    const foreignKeyIssues = [
      ...runtimeDb.prepare("PRAGMA foreign_key_check(continuity_checkpoints)").all(),
      ...(hasRunLedger ? runtimeDb.prepare("PRAGMA foreign_key_check(continuity_runs)").all() : []),
    ];
    if (foreignKeyIssues.length > 0) {
      throw new Error("continuity_checkpoint_provider_pair_migration_foreign_key_failed");
    }

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already have rolled back. Preserve the original error.
    }
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeysWereEnabled ? "ON" : "OFF"}`);
  }
}

export function applyContinuityCheckpointSchema(db: DbLike): void {
  migrateLegacyProviderPairConstraint(db);
  db.exec(`
${checkpointTableSql("continuity_checkpoints").replace("CREATE TABLE continuity_checkpoints", "CREATE TABLE IF NOT EXISTS continuity_checkpoints")}

CREATE INDEX IF NOT EXISTS idx_continuity_checkpoints_task_sequence
  ON continuity_checkpoints(task_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_checkpoints_project_created
  ON continuity_checkpoints(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_checkpoints_status_created
  ON continuity_checkpoints(status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS continuity_checkpoints_no_update
BEFORE UPDATE ON continuity_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'continuity_checkpoints_append_only');
END;

CREATE TRIGGER IF NOT EXISTS continuity_checkpoints_no_delete
BEFORE DELETE ON continuity_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'continuity_checkpoints_append_only');
END;
`);
}
