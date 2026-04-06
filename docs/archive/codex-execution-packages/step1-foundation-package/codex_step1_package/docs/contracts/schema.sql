PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  db_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  is_initialized INTEGER NOT NULL DEFAULT 0,
  selected_providers_json TEXT NOT NULL DEFAULT '[]',
  selected_rolepack_ids_json TEXT NOT NULL DEFAULT '[]',
  office_theme TEXT NOT NULL DEFAULT 'office-classic',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_pools (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'oauth',
  fatigue_source_type TEXT NOT NULL DEFAULT 'manual',
  config_dir TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_profiles (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT,
  profile_name TEXT NOT NULL,
  profile_path TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS role_packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  root_dir TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_pack_id TEXT,
  avatar_type TEXT NOT NULL DEFAULT 'human',
  avatar_asset TEXT,
  visual_preset TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (role_pack_id) REFERENCES role_packs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS provider_probe_results (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  cli_installed INTEGER NOT NULL DEFAULT 0,
  executable_path TEXT,
  config_path TEXT,
  login_status TEXT NOT NULL DEFAULT 'unknown',
  raw_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL
);
