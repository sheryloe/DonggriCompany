-- Step 3 schema extensions

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL, -- planning|research|coding|review|cloud|idle|custom
  layout_mode TEXT NOT NULL DEFAULT 'grid', -- grid|map|kanban
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_presets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL, -- human|animal|robot|pixel|icon
  asset_uri TEXT,
  fallback_emoji TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle', -- idle|active|blocked|paused|offline
  role_template_key TEXT NOT NULL,
  visual_preset_id TEXT,
  default_runtime_profile_id TEXT,
  workspace_id TEXT,
  personality_json TEXT,
  description TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (visual_preset_id) REFERENCES visual_presets(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS employee_runtime_preferences (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  preferred_runtime_profile_id TEXT,
  fallback_runtime_profile_id TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS employee_presence (
  employee_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  presence_state TEXT NOT NULL DEFAULT 'desk', -- desk|walking|meeting|break|offline
  pos_x INTEGER,
  pos_y INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS ui_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL, -- employee.updated|session.started|session.progress|session.rebound|timeline.note
  employee_id TEXT,
  session_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info', -- info|success|warn|error
  title TEXT NOT NULL,
  body TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_workspace_id ON employees(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_created_at ON ui_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ui_events_employee_id ON ui_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_session_id ON ui_events(session_id);
