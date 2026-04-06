PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS office_cli_runs (
  task_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT,
  prompt TEXT NOT NULL,
  project_path TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_office_cli_runs_status_updated
ON office_cli_runs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS office_cli_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  level TEXT NOT NULL,
  line TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES office_cli_runs(task_id) ON DELETE CASCADE,
  UNIQUE(task_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_office_cli_logs_task_seq
ON office_cli_logs(task_id, seq DESC);

CREATE TABLE IF NOT EXISTS office_cli_subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES office_cli_runs(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_office_cli_subtasks_task_updated
ON office_cli_subtasks(task_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS office_cli_active_runs (
  task_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES office_cli_runs(task_id) ON DELETE CASCADE
);
