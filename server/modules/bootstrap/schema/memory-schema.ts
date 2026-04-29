import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec">;

export function applyMemorySchema(db: DbLike): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'agent',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display_summary_ko TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.7,
  strength REAL NOT NULL DEFAULT 0.5,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS project_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'project',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display_summary_ko TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.7,
  strength REAL NOT NULL DEFAULT 0.5,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  from_memory_id TEXT NOT NULL,
  from_memory_table TEXT NOT NULL CHECK(from_memory_table IN ('agent_memories','project_memories')),
  to_memory_id TEXT NOT NULL,
  to_memory_table TEXT NOT NULL CHECK(to_memory_table IN ('agent_memories','project_memories')),
  relation TEXT NOT NULL CHECK(relation IN ('relates_to','duplicates','supersedes','blocks','learned_from','applies_to')),
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS skill_usage_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  skill_id TEXT NOT NULL,
  provider TEXT,
  outcome TEXT NOT NULL DEFAULT 'observed',
  confidence REAL NOT NULL DEFAULT 0.7,
  notes TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS agent_growth_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_updated
  ON agent_memories(agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project
  ON agent_memories(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_source
  ON agent_memories(source_type, source_id, external_ref);
CREATE INDEX IF NOT EXISTS idx_project_memories_project_updated
  ON project_memories(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_memories_source
  ON project_memories(source_type, source_id, external_ref);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from
  ON memory_edges(from_memory_table, from_memory_id, relation);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to
  ON memory_edges(to_memory_table, to_memory_id, relation);
CREATE INDEX IF NOT EXISTS idx_skill_usage_agent
  ON skill_usage_events(agent_id, skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_usage_project
  ON skill_usage_events(project_id, skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_growth_events_agent
  ON agent_growth_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_growth_events_project
  ON agent_growth_events(project_id, created_at DESC);

INSERT OR IGNORE INTO settings (key, value) VALUES ('uiLanguageMode', 'ko_forced');
INSERT OR IGNORE INTO settings (key, value) VALUES ('memoryExtractionEnabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('beadsBridgeEnabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('beadsWriteEnabled', 'false');
`);
}
