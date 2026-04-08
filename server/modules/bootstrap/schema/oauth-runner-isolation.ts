import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec">;

export function applyOAuthRunnerIsolationSchema(db: DbLike): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK(status IN ('connected','expired','error','disconnected')),
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  last_refreshed_at INTEGER,
  refresh_fail_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  UNIQUE(provider, account_pool_id)
);

CREATE TABLE IF NOT EXISTS office_runner_instances (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  runner_key TEXT NOT NULL,
  container_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','idle','stopping','error')),
  last_used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, account_pool_id)
);

CREATE TABLE IF NOT EXISTS office_runner_queue (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  runner_key TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','done','failed','canceled')),
  enqueued_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS office_cli_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL DEFAULT '',
  runner_key TEXT NOT NULL,
  prompt TEXT,
  project_path TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','done','failed','canceled')),
  queue_item_id TEXT REFERENCES office_runner_queue(id) ON DELETE SET NULL,
  started_at INTEGER,
  ended_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_provider_pool
  ON oauth_sessions(provider, account_pool_id);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_status
  ON oauth_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_runner_instances_status
  ON office_runner_instances(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_runner_queue_status_enqueued
  ON office_runner_queue(status, enqueued_at ASC);
CREATE INDEX IF NOT EXISTS idx_office_cli_runs_provider_pool_created
  ON office_cli_runs(provider, account_pool_id, created_at DESC);
`);

  try {
    db.exec("ALTER TABLE oauth_sessions ADD COLUMN refresh_token_expires_at INTEGER");
  } catch {
    // already exists
  }
  try {
    db.exec("ALTER TABLE oauth_sessions ADD COLUMN last_refreshed_at INTEGER");
  } catch {
    // already exists
  }
  try {
    db.exec("ALTER TABLE oauth_sessions ADD COLUMN refresh_fail_count INTEGER NOT NULL DEFAULT 0");
  } catch {
    // already exists
  }
  try {
    db.exec("ALTER TABLE office_cli_runs ADD COLUMN account_pool_id TEXT NOT NULL DEFAULT ''");
  } catch {
    // already exists
  }
}
