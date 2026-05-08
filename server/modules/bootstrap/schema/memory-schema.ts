import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

function existingColumns(db: DbLike, tableName: string): Set<string> {
  return new Set(
    (
      db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name?: string;
      }>
    )
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0),
  );
}

function ensureColumn(db: DbLike, tableName: string, columnName: string, definition: string): void {
  if (existingColumns(db, tableName).has(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function applyMemoryCompatibilityColumns(db: DbLike): void {
  for (const tableName of ["agent_memories", "project_memories"]) {
    ensureColumn(db, tableName, "memory_layer", "TEXT NOT NULL DEFAULT 'archival'");
    ensureColumn(db, tableName, "thread_id", "TEXT");
    ensureColumn(db, tableName, "promotion_status", "TEXT NOT NULL DEFAULT 'local'");
    ensureColumn(db, tableName, "retrieval_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, tableName, "last_retrieved_at", "INTEGER");
    ensureColumn(db, tableName, "episode_json", "TEXT");
  }
  ensureColumn(db, "agent_growth_events", "episode_json", "TEXT");
  ensureColumn(db, "agent_growth_events", "source_memory_id", "TEXT");
  ensureColumn(db, "memory_embeddings", "provider_id", "TEXT");
  ensureColumn(db, "memory_embeddings", "provider_type", "TEXT");
  ensureColumn(db, "memory_embeddings", "embedding_status", "TEXT NOT NULL DEFAULT 'ready'");
  ensureColumn(db, "memory_embeddings", "last_error", "TEXT");
  ensureColumn(db, "memory_embeddings", "source_text_chars", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "memory_embeddings", "indexed_at", "INTEGER");
}

function applyMemoryFtsSchema(db: DbLike): void {
  try {
    db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
  memory_id UNINDEXED,
  project_id UNINDEXED,
  agent_id UNINDEXED,
  memory_layer UNINDEXED,
  promotion_status UNINDEXED,
  title,
  body,
  tags,
  display_summary_ko
);

CREATE VIRTUAL TABLE IF NOT EXISTS project_memories_fts USING fts5(
  memory_id UNINDEXED,
  project_id UNINDEXED,
  agent_id UNINDEXED,
  memory_layer UNINDEXED,
  promotion_status UNINDEXED,
  title,
  body,
  tags,
  display_summary_ko
);

CREATE TRIGGER IF NOT EXISTS trg_agent_memories_fts_insert AFTER INSERT ON agent_memories BEGIN
  INSERT INTO agent_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
  VALUES (new.id, new.project_id, new.agent_id, new.memory_layer, new.promotion_status, new.title, new.body, new.tags_json, COALESCE(new.display_summary_ko, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_memories_fts_update AFTER UPDATE ON agent_memories BEGIN
  DELETE FROM agent_memories_fts WHERE memory_id = old.id;
  INSERT INTO agent_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
  VALUES (new.id, new.project_id, new.agent_id, new.memory_layer, new.promotion_status, new.title, new.body, new.tags_json, COALESCE(new.display_summary_ko, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_memories_fts_delete AFTER DELETE ON agent_memories BEGIN
  DELETE FROM agent_memories_fts WHERE memory_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_memories_fts_insert AFTER INSERT ON project_memories BEGIN
  INSERT INTO project_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
  VALUES (new.id, new.project_id, new.agent_id, new.memory_layer, new.promotion_status, new.title, new.body, new.tags_json, COALESCE(new.display_summary_ko, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_memories_fts_update AFTER UPDATE ON project_memories BEGIN
  DELETE FROM project_memories_fts WHERE memory_id = old.id;
  INSERT INTO project_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
  VALUES (new.id, new.project_id, new.agent_id, new.memory_layer, new.promotion_status, new.title, new.body, new.tags_json, COALESCE(new.display_summary_ko, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_memories_fts_delete AFTER DELETE ON project_memories BEGIN
  DELETE FROM project_memories_fts WHERE memory_id = old.id;
END;
`);

    db.exec(`
INSERT INTO agent_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
SELECT id, project_id, agent_id, memory_layer, promotion_status, title, body, tags_json, COALESCE(display_summary_ko, '')
FROM agent_memories
WHERE id NOT IN (SELECT memory_id FROM agent_memories_fts);

INSERT INTO project_memories_fts(memory_id, project_id, agent_id, memory_layer, promotion_status, title, body, tags, display_summary_ko)
SELECT id, project_id, agent_id, memory_layer, promotion_status, title, body, tags_json, COALESCE(display_summary_ko, '')
FROM project_memories
WHERE id NOT IN (SELECT memory_id FROM project_memories_fts);
`);
  } catch {
    db.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('memoryFtsAvailable', 'false')");
    return;
  }
  db.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('memoryFtsAvailable', 'true')");
}

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
  memory_layer TEXT NOT NULL DEFAULT 'archival',
  thread_id TEXT,
  promotion_status TEXT NOT NULL DEFAULT 'local',
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  last_retrieved_at INTEGER,
  episode_json TEXT,
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
  memory_layer TEXT NOT NULL DEFAULT 'archival',
  thread_id TEXT,
  promotion_status TEXT NOT NULL DEFAULT 'local',
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  last_retrieved_at INTEGER,
  episode_json TEXT,
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

CREATE TABLE IF NOT EXISTS memory_entities (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(project_id, entity_type, entity_key)
);

CREATE TABLE IF NOT EXISTS memory_entity_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  from_entity_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN ('relates_to','duplicates','supersedes','blocks','learned_from','applies_to')),
  source_memory_id TEXT,
  source_memory_table TEXT CHECK(source_memory_table IN ('agent_memories','project_memories')),
  confidence REAL NOT NULL DEFAULT 0.7,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS memory_promotion_evidence (
  id TEXT PRIMARY KEY,
  candidate_key TEXT NOT NULL,
  candidate_type TEXT NOT NULL DEFAULT 'skill',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  project_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','rejected')),
  approved_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(candidate_key, candidate_type)
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  source_table TEXT NOT NULL CHECK(source_table IN ('agent_memories','project_memories')),
  memory_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  provider_id TEXT,
  provider_type TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'ready' CHECK(embedding_status IN ('ready','failed','fallback')),
  last_error TEXT,
  source_text_chars INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY(source_table, memory_id, embedding_model)
);

CREATE TABLE IF NOT EXISTS memory_embedding_index (
  embedding_model TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  source_table TEXT NOT NULL CHECK(source_table IN ('agent_memories','project_memories')),
  memory_id TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY(embedding_model, bucket_key, source_table, memory_id)
);

CREATE TABLE IF NOT EXISTS memory_search_profiles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('saved','recent')),
  owner_key TEXT NOT NULL DEFAULT 'local',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS quality_metric_events (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  metric_family TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  subject_type TEXT,
  subject_id TEXT,
  value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  recorded_at INTEGER DEFAULT (unixepoch()*1000),
  created_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(metric_key, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS memory_outbox (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at INTEGER,
  external_ref TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS memory_quality_events (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'recorded',
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
  episode_json TEXT,
  source_memory_id TEXT,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);
`);

  applyMemoryCompatibilityColumns(db);

  db.exec(`

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_updated
  ON agent_memories(agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project
  ON agent_memories(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_source
  ON agent_memories(source_type, source_id, external_ref);
CREATE INDEX IF NOT EXISTS idx_agent_memories_layer
  ON agent_memories(agent_id, project_id, memory_layer, promotion_status, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_memories_project_updated
  ON project_memories(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_memories_source
  ON project_memories(source_type, source_id, external_ref);
CREATE INDEX IF NOT EXISTS idx_project_memories_layer
  ON project_memories(project_id, memory_layer, promotion_status, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from
  ON memory_edges(from_memory_table, from_memory_id, relation);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to
  ON memory_edges(to_memory_table, to_memory_id, relation);
CREATE INDEX IF NOT EXISTS idx_memory_entities_project
  ON memory_entities(project_id, entity_type, entity_key);
CREATE INDEX IF NOT EXISTS idx_memory_entity_relations_project
  ON memory_entity_relations(project_id, relation);
CREATE INDEX IF NOT EXISTS idx_memory_promotion_evidence_status
  ON memory_promotion_evidence(status, project_count DESC, evidence_count DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_model
  ON memory_embeddings(embedding_model, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_status
  ON memory_embeddings(embedding_model, embedding_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embedding_index_bucket
  ON memory_embedding_index(embedding_model, bucket_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_search_profiles_owner
  ON memory_search_profiles(owner_key, kind, project_id, last_used_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_metric_events_key
  ON quality_metric_events(metric_key, project_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_metric_events_family
  ON quality_metric_events(metric_family, project_id, recorded_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_agent_memories_embeddings_delete AFTER DELETE ON agent_memories BEGIN
  DELETE FROM memory_embeddings WHERE source_table = 'agent_memories' AND memory_id = old.id;
  DELETE FROM memory_embedding_index WHERE source_table = 'agent_memories' AND memory_id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_project_memories_embeddings_delete AFTER DELETE ON project_memories BEGIN
  DELETE FROM memory_embeddings WHERE source_table = 'project_memories' AND memory_id = old.id;
  DELETE FROM memory_embedding_index WHERE source_table = 'project_memories' AND memory_id = old.id;
END;
CREATE INDEX IF NOT EXISTS idx_memory_outbox_project
  ON memory_outbox(project_id, target, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_quality_events_project
  ON memory_quality_events(project_id, event_type, created_at DESC);
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
  applyMemoryFtsSchema(db);
}
