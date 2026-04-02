-- Step 4 schema extensions for Telegram bridge

CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  polling_enabled INTEGER NOT NULL DEFAULT 1,
  bot_username TEXT,
  bot_token_encrypted TEXT,
  last_update_offset INTEGER NOT NULL DEFAULT 0,
  last_poll_started_at TEXT,
  last_poll_succeeded_at TEXT,
  last_poll_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_allowed_chats (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  chat_type TEXT NOT NULL,
  title TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS telegram_command_logs (
  id TEXT PRIMARY KEY,
  update_id TEXT,
  chat_id TEXT NOT NULL,
  from_username TEXT,
  from_display_name TEXT,
  command_name TEXT NOT NULL,
  command_text TEXT NOT NULL,
  parsed_args_json TEXT,
  outcome_status TEXT NOT NULL,
  outcome_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_notification_rules (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  min_severity TEXT NOT NULL DEFAULT 'info',
  target_chat_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_delivery_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_chat_id TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  telegram_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);
