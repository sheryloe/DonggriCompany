PRAGMA foreign_keys = ON;

ALTER TABLE account_pools ADD COLUMN key TEXT;
ALTER TABLE account_pools ADD COLUMN label TEXT;
ALTER TABLE account_pools ADD COLUMN plan_tier TEXT;
ALTER TABLE account_pools ADD COLUMN fatigue_mode TEXT NOT NULL DEFAULT 'derived';
ALTER TABLE account_pools ADD COLUMN max_concurrency INTEGER;
ALTER TABLE account_pools ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE account_pools ADD COLUMN notes TEXT;

UPDATE account_pools
SET key = COALESCE(NULLIF(key, ''), id)
WHERE key IS NULL OR TRIM(key) = '';

UPDATE account_pools
SET label = COALESCE(NULLIF(label, ''), display_name, id)
WHERE label IS NULL OR TRIM(label) = '';

UPDATE account_pools
SET fatigue_mode = CASE
  WHEN fatigue_source_type IN ('official', 'derived', 'manual') THEN fatigue_source_type
  ELSE 'derived'
END
WHERE fatigue_mode IS NULL OR TRIM(fatigue_mode) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_pools_key ON account_pools(key);

CREATE TABLE IF NOT EXISTS runtime_capabilities (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS runtime_profile_capabilities (
  id TEXT PRIMARY KEY,
  runtime_profile_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  strength INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(runtime_profile_id, capability_id),
  FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id) REFERENCES runtime_capabilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fatigue_snapshots (
  id TEXT PRIMARY KEY,
  account_pool_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  raw_payload_json TEXT,
  raw_usage_value REAL,
  raw_limit_value REAL,
  raw_unit TEXT,
  normalized_percent REAL NOT NULL,
  fatigue_state TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fatigue_snapshots_pool_observed_at
ON fatigue_snapshots(account_pool_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  task_type TEXT,
  role_key TEXT,
  workspace_mode TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  match_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routing_rule_targets (
  id TEXT PRIMARY KEY,
  routing_rule_id TEXT NOT NULL,
  runtime_profile_id TEXT NOT NULL,
  target_order INTEGER NOT NULL DEFAULT 1,
  min_confidence REAL NOT NULL DEFAULT 0.0,
  max_fatigue_percent REAL,
  fallback_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (routing_rule_id) REFERENCES routing_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_target_unique
ON routing_rule_targets(routing_rule_id, runtime_profile_id, target_order);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  task_request_json TEXT NOT NULL,
  selected_runtime_profile_id TEXT,
  selected_account_pool_id TEXT,
  decision_state TEXT NOT NULL,
  reason_text TEXT,
  score_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (selected_runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (selected_account_pool_id) REFERENCES account_pools(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS provider_probe_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT,
  runtime_profile_id TEXT,
  probe_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  command_text TEXT,
  stdout_text TEXT,
  stderr_text TEXT,
  parsed_payload_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE SET NULL,
  FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE SET NULL
);
