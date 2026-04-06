PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS office_departments (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS office_kanban_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  department_id TEXT,
  assignee_agent_id TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES office_departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_office_kanban_tasks_status_updated
ON office_kanban_tasks(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_kanban_tasks_department
ON office_kanban_tasks(department_id, status);

CREATE TABLE IF NOT EXISTS office_meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  meeting_type TEXT NOT NULL DEFAULT 'planned',
  task_id TEXT,
  department_id TEXT,
  agenda TEXT,
  summary TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES office_departments(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES office_kanban_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_office_meetings_status_updated
ON office_meetings(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS office_meeting_participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES office_meetings(id) ON DELETE CASCADE,
  UNIQUE(meeting_id, participant)
);

INSERT OR IGNORE INTO office_departments (id, key, name, color, sort_order)
VALUES
  ('dept-planning', 'planning', 'Planning', '#4f46e5', 10),
  ('dept-runtime', 'runtime', 'Runtime', '#0ea5e9', 20),
  ('dept-probe', 'probe', 'Probe', '#f59e0b', 30),
  ('dept-history', 'history', 'History', '#10b981', 40),
  ('dept-pm', 'pm', 'PM', '#ef4444', 50);
