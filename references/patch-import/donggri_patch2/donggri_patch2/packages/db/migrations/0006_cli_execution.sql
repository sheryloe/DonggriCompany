PRAGMA foreign_keys = ON;

-- 태스크 실행 로그
CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id, created_at);

-- 활성 CLI 프로세스 추적
CREATE TABLE IF NOT EXISTS active_cli_runs (
  task_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  pid INTEGER,
  started_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- subtasks
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cli_tool_use_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_cli_tool_use_id ON subtasks(cli_tool_use_id);

-- tasks에 CLI 관련 컬럼 추가
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cli_provider TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cli_model TEXT;
