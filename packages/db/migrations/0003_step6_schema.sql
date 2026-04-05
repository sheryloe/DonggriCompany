PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_model_assignments (
  agent_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  runtime_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_model_assignments_provider_pool
ON agent_model_assignments(provider, account_pool_id);

CREATE TABLE IF NOT EXISTS oauth_pkce_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  state_token TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  client_origin TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_pkce_states_lookup
ON oauth_pkce_states(provider, state_token);

CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_pool_id TEXT NOT NULL,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, account_pool_id),
  FOREIGN KEY (account_pool_id) REFERENCES account_pools(id) ON DELETE CASCADE
);
