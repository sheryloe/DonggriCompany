PRAGMA foreign_keys = ON;

-- OAuth states (PKCE용)
CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  verifier_enc TEXT NOT NULL DEFAULT 'none',
  redirect_to TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_provider ON oauth_states(provider, created_at);

-- OAuth credentials (provider별 단일)
CREATE TABLE IF NOT EXISTS oauth_credentials (
  provider TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'web-oauth',
  encrypted_data TEXT,
  email TEXT,
  scope TEXT,
  expires_at INTEGER,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000)
);

-- OAuth accounts (멀티 계정)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web-oauth',
  label TEXT,
  email TEXT,
  scope TEXT,
  expires_at INTEGER,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 100,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at INTEGER,
  last_success_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider, priority, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email ON oauth_accounts(provider, email) WHERE email IS NOT NULL;

-- OAuth active accounts
CREATE TABLE IF NOT EXISTS oauth_active_accounts (
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  PRIMARY KEY (provider, account_id),
  FOREIGN KEY (account_id) REFERENCES oauth_accounts(id) ON DELETE CASCADE
);

-- Tasks 테이블 확장 (Kanban용 컬럼 추가)
-- hidden, task_type, workflow_pack_key, project_path, project_id 추가
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_pack_key TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_path TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id TEXT;

-- Kanban 상태 추가 (collaborating, cancelled 포함)
-- status CHECK 없이 TEXT로 운용 (DonggriCompany 기존 방식 유지)

-- Meetings 테이블
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  meeting_type TEXT NOT NULL DEFAULT 'planned',
  department_id TEXT,
  agenda TEXT,
  summary TEXT,
  minutes_json TEXT,
  scheduled_at INTEGER,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_task_id ON meetings(task_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- Meeting participants
CREATE TABLE IF NOT EXISTS meeting_participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
  UNIQUE(meeting_id, agent_id),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
