PRAGMA foreign_keys = ON;

ALTER TABLE oauth_sessions ADD COLUMN refresh_token_expires_at TEXT;
ALTER TABLE oauth_sessions ADD COLUMN last_refreshed_at TEXT;
ALTER TABLE oauth_sessions ADD COLUMN refresh_fail_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE office_cli_runs ADD COLUMN account_pool_id TEXT;

CREATE INDEX IF NOT EXISTS idx_office_cli_runs_pool_updated
ON office_cli_runs(provider, account_pool_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS office_runner_instances (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  UNIQUE(provider, account_pool_id),
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_office_runner_instances_status_used
ON office_runner_instances(status, last_used_at ASC);

CREATE TABLE IF NOT EXISTS office_runner_queue (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  enqueued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  ended_at TEXT,
  error_message TEXT,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_office_runner_queue_status_enqueued
ON office_runner_queue(status, enqueued_at ASC);
