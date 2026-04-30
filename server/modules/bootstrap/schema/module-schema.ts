import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec">;

export function applyModuleSchema(db: DbLike): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS project_module_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  module_version TEXT NOT NULL,
  binding_name TEXT NOT NULL,
  project_path TEXT,
  project_context TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_refs_json TEXT NOT NULL DEFAULT '{}',
  preview_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'bound' CHECK(status IN ('previewed','bound','applied','failed','disabled')),
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  applied_at INTEGER,
  UNIQUE(project_id, module_key, module_version, binding_name)
);

CREATE INDEX IF NOT EXISTS idx_project_module_bindings_project ON project_module_bindings(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_module_bindings_module ON project_module_bindings(module_key, module_version);

CREATE TABLE IF NOT EXISTS project_module_apply_runs (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES project_module_bindings(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','noop','failed')),
  artifact_delta_json TEXT NOT NULL DEFAULT '[]',
  message TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(binding_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_project_module_apply_runs_binding ON project_module_apply_runs(binding_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_module_apply_runs_project ON project_module_apply_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS asset_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  module_key TEXT NOT NULL,
  module_type TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','generating','generated','needs_review','approved','published','failed')),
  engine TEXT NOT NULL DEFAULT 'imagegen_builtin',
  request_json TEXT NOT NULL DEFAULT '{}',
  prompt_markdown TEXT NOT NULL DEFAULT '',
  source_files_json TEXT NOT NULL DEFAULT '[]',
  published_files_json TEXT NOT NULL DEFAULT '[]',
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  approved_at INTEGER,
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_asset_jobs_project ON asset_jobs(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_jobs_module ON asset_jobs(module_key, status, updated_at DESC);
  `);
}
