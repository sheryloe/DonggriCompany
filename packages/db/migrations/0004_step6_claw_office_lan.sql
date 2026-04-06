PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS office_runtime_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tick INTEGER NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL DEFAULT 271828,
  sim_speed TEXT NOT NULL DEFAULT '1x',
  is_paused INTEGER NOT NULL DEFAULT 0,
  loop_state TEXT NOT NULL DEFAULT 'idle',
  phase_ticks INTEGER NOT NULL DEFAULT 0,
  job_queue INTEGER NOT NULL DEFAULT 0,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  pm_reports INTEGER NOT NULL DEFAULT 0,
  last_loop_event_json TEXT,
  agent_load_json TEXT NOT NULL DEFAULT '{}',
  actors_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS office_event_logs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  tick INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_id TEXT,
  speaker TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_office_event_logs_seq ON office_event_logs(seq DESC);

CREATE TABLE IF NOT EXISTS office_command_threads (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_office_command_threads_updated_at
ON office_command_threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS office_command_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES office_command_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_office_command_messages_thread_created
ON office_command_messages(thread_id, created_at ASC);
