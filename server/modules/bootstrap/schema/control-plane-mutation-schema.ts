import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

export const CONTROL_PLANE_MUTATION_TABLES = [
  "control_plane_mutation_previews",
  "control_plane_approval_receipts",
  "control_plane_request_idempotency",
  "control_plane_idempotency_results",
  "control_plane_execution_effects",
  "control_plane_mutation_audit",
  "control_plane_image_artifacts",
] as const;

function tableColumns(db: DbLike, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>)
      .map((row) => (typeof row.name === "string" ? row.name : ""))
      .filter(Boolean),
  );
}

/**
 * Additive-only schema for the V1 mutation authorization boundary.
 * Existing application tables are intentionally not altered.
 */
export function applyControlPlaneMutationSchema(db: DbLike): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS control_plane_mutation_previews (
  preview_id TEXT PRIMARY KEY,
  preview_json TEXT NOT NULL,
  source_epoch TEXT NOT NULL,
  projection_epoch TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS control_plane_approval_receipts (
  approval_id TEXT PRIMARY KEY,
  preview_id TEXT NOT NULL UNIQUE REFERENCES control_plane_mutation_previews(preview_id) ON DELETE RESTRICT,
  receipt_json TEXT NOT NULL,
  receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256) = 64),
  projection_epoch TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_reservation_id TEXT UNIQUE,
  consumed_at TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  CHECK (
    (consumed_reservation_id IS NULL AND consumed_at IS NULL)
    OR
    (consumed_reservation_id IS NOT NULL AND consumed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS control_plane_request_idempotency (
  phase TEXT NOT NULL CHECK(phase IN ('preview','approval')),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest) = 64),
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (phase, idempotency_key)
);

CREATE TABLE IF NOT EXISTS control_plane_idempotency_results (
  idempotency_key TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL CHECK(length(request_digest) = 64),
  reservation_id TEXT NOT NULL UNIQUE,
  approval_id TEXT NOT NULL REFERENCES control_plane_approval_receipts(approval_id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('in_flight','completed')),
  outcome_json TEXT,
  created_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count >= 1),
  completed_at TEXT,
  CHECK (
    (state = 'in_flight' AND outcome_json IS NULL AND completed_at IS NULL)
    OR
    (state = 'completed' AND outcome_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS control_plane_execution_effects (
  reservation_id TEXT PRIMARY KEY
    REFERENCES control_plane_idempotency_results(reservation_id) ON DELETE RESTRICT,
  outcome_json TEXT NOT NULL,
  outcome_sha256 TEXT NOT NULL CHECK(length(outcome_sha256) = 64),
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS control_plane_mutation_audit (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  preview_id TEXT,
  approval_id TEXT,
  idempotency_key_digest TEXT,
  request_digest TEXT,
  reason TEXT,
  event_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS control_plane_image_artifacts (
  candidate_id TEXT NOT NULL,
  source_epoch TEXT NOT NULL,
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  original_sha256 TEXT NOT NULL CHECK(length(original_sha256) = 64),
  derived_sha256 TEXT NOT NULL CHECK(length(derived_sha256) = 64),
  parent_sha256_json TEXT NOT NULL,
  approval_id TEXT NOT NULL UNIQUE
    REFERENCES control_plane_approval_receipts(approval_id) ON DELETE RESTRICT,
  receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256) = 64),
  export_target_ref TEXT NOT NULL,
  storage_ref TEXT NOT NULL,
  storage_json TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
  byte_length INTEGER NOT NULL CHECK(byte_length > 0),
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  pixel_count INTEGER NOT NULL CHECK(pixel_count > 0),
  request_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, source_epoch, project_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_control_plane_previews_expiry
  ON control_plane_mutation_previews(expires_at);
CREATE INDEX IF NOT EXISTS idx_control_plane_approvals_preview
  ON control_plane_approval_receipts(preview_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_control_plane_request_idempotency_resource
  ON control_plane_request_idempotency(phase, resource_id);
CREATE INDEX IF NOT EXISTS idx_control_plane_idempotency_approval
  ON control_plane_idempotency_results(approval_id, created_at);
CREATE INDEX IF NOT EXISTS idx_control_plane_mutation_audit_time
  ON control_plane_mutation_audit(occurred_at, event_id);
CREATE INDEX IF NOT EXISTS idx_control_plane_image_artifacts_current
  ON control_plane_image_artifacts(candidate_id, source_epoch, project_id, recorded_at DESC);
  `);

  // Additive migration for databases created by the earlier V1 draft. The
  // execution state CHECK remains unchanged; durable effect evidence is kept
  // in its own table so an old in-flight row can be reconciled safely.
  const previewColumns = tableColumns(db, "control_plane_mutation_previews");
  if (!previewColumns.has("projection_epoch")) {
    db.exec("ALTER TABLE control_plane_mutation_previews ADD COLUMN projection_epoch TEXT");
    db.exec(`
      UPDATE control_plane_mutation_previews
      SET projection_epoch = json_extract(preview_json, '$.projection_epoch')
      WHERE projection_epoch IS NULL
    `);
  }
  const approvalColumns = tableColumns(db, "control_plane_approval_receipts");
  if (!approvalColumns.has("projection_epoch")) {
    db.exec("ALTER TABLE control_plane_approval_receipts ADD COLUMN projection_epoch TEXT");
    db.exec(`
      UPDATE control_plane_approval_receipts
      SET projection_epoch = json_extract(receipt_json, '$.projection_epoch')
      WHERE projection_epoch IS NULL
    `);
  }
  const idempotencyColumns = tableColumns(db, "control_plane_idempotency_results");
  if (!idempotencyColumns.has("lease_expires_at")) {
    db.exec("ALTER TABLE control_plane_idempotency_results ADD COLUMN lease_expires_at TEXT");
    db.exec(
      "UPDATE control_plane_idempotency_results SET lease_expires_at = created_at WHERE lease_expires_at IS NULL",
    );
  }
  if (!idempotencyColumns.has("attempt_count")) {
    db.exec(
      "ALTER TABLE control_plane_idempotency_results ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count >= 1)",
    );
  }
  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS uq_control_plane_approvals_preview
  ON control_plane_approval_receipts(preview_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_control_plane_execution_approval
  ON control_plane_idempotency_results(approval_id);
CREATE INDEX IF NOT EXISTS idx_control_plane_idempotency_lease
  ON control_plane_idempotency_results(state, lease_expires_at);
  `);
}
