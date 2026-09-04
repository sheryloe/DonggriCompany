import { createHash } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import { ContinuityCheckpointSchema, type ContinuityCheckpoint } from "./checkpoint-contract.js";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;
type Row = Record<string, SQLOutputValue>;

function serialize(checkpoint: ContinuityCheckpoint): { json: string; sha256: string } {
  const json = JSON.stringify(checkpoint);
  return { json, sha256: createHash("sha256").update(json).digest("hex") };
}

function parseRow(row: Row | undefined): ContinuityCheckpoint | null {
  if (!row || typeof row.payload_json !== "string" || typeof row.payload_sha256 !== "string") return null;
  const sha256 = createHash("sha256").update(row.payload_json).digest("hex");
  if (sha256 !== row.payload_sha256) throw new Error("continuity_checkpoint_digest_mismatch");
  const checkpoint = ContinuityCheckpointSchema.parse(JSON.parse(row.payload_json));
  if (
    checkpoint.checkpoint_id !== row.checkpoint_id ||
    checkpoint.workspace.workspace_digest !== row.workspace_digest
  ) {
    throw new Error("continuity_checkpoint_column_mismatch");
  }
  return checkpoint;
}

export type SaveCheckpointResult =
  | { status: "created" | "replay"; checkpoint: ContinuityCheckpoint }
  | { status: "idempotency_conflict" };

export class SqliteContinuityCheckpointStore {
  constructor(private readonly db: DbLike) {}

  save(input: unknown): SaveCheckpointResult {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.saveInTransaction(input);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Original SQLite error remains authoritative.
      }
      throw error;
    }
  }

  /**
   * Save a checkpoint inside a transaction already owned by the caller.
   *
   * This method deliberately performs no BEGIN/COMMIT. It is used by the
   * continuity handoff coordinator so approval consumption, checkpoint
   * acceptance, target-run reservation and audit evidence share one SQLite
   * commit boundary.
   */
  saveInTransaction(input: unknown): SaveCheckpointResult {
    const checkpoint = ContinuityCheckpointSchema.parse(input);
    const payload = serialize(checkpoint);
    const existing = this.db
      .prepare("SELECT * FROM continuity_checkpoints WHERE idempotency_key = ?")
      .get(checkpoint.idempotency_key) as Row | undefined;
    if (existing) {
      const replay = parseRow(existing);
      return replay && serialize(replay).sha256 === payload.sha256
        ? { status: "replay", checkpoint: replay }
        : { status: "idempotency_conflict" };
    }

    this.db
      .prepare(
        `INSERT INTO continuity_checkpoints (
          checkpoint_id, previous_checkpoint_id, sequence, project_id, task_id,
          source_run_id, source_provider, source_account_label, target_provider,
          target_account_label, status, workspace_digest, payload_json, payload_sha256,
          idempotency_key, schema_version, captured_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        checkpoint.checkpoint_id,
        checkpoint.previous_checkpoint_id,
        checkpoint.sequence,
        checkpoint.project_id,
        checkpoint.task_id,
        checkpoint.source_run_id,
        checkpoint.source_provider,
        checkpoint.source_account_label ?? checkpoint.source_account_pool_id ?? "legacy-source-account",
        checkpoint.target_provider,
        checkpoint.target_account_label ?? checkpoint.target_account_pool_id ?? "legacy-target-account",
        checkpoint.status,
        checkpoint.workspace.workspace_digest,
        payload.json,
        payload.sha256,
        checkpoint.idempotency_key,
        checkpoint.schema_version,
        checkpoint.workspace.captured_at,
        checkpoint.created_at,
      );
    return { status: "created", checkpoint: structuredClone(checkpoint) };
  }

  get(checkpointId: string): ContinuityCheckpoint | null {
    return parseRow(
      this.db.prepare("SELECT * FROM continuity_checkpoints WHERE checkpoint_id = ?").get(checkpointId) as
        | Row
        | undefined,
    );
  }

  findLatestByDispatchId(dispatchId: string): ContinuityCheckpoint | null {
    const rows = this.db
      .prepare("SELECT * FROM continuity_checkpoints ORDER BY created_at DESC, sequence DESC")
      .all() as Row[];
    for (const row of rows) {
      const checkpoint = parseRow(row);
      if (checkpoint?.dispatch_id === dispatchId) return checkpoint;
    }
    return null;
  }

  latest(taskId: string): ContinuityCheckpoint | null {
    return parseRow(
      this.db
        .prepare("SELECT * FROM continuity_checkpoints WHERE task_id = ? ORDER BY sequence DESC LIMIT 1")
        .get(taskId) as Row | undefined,
    );
  }

  list(taskId: string): ContinuityCheckpoint[] {
    return (
      this.db
        .prepare("SELECT * FROM continuity_checkpoints WHERE task_id = ? ORDER BY sequence ASC")
        .all(taskId) as Row[]
    ).map((row) => {
      const checkpoint = parseRow(row);
      if (!checkpoint) throw new Error("continuity_checkpoint_corrupt");
      return checkpoint;
    });
  }

  recent(limit = 50): ContinuityCheckpoint[] {
    const boundedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return (
      this.db
        .prepare(
          `SELECT c.* FROM continuity_checkpoints c
           WHERE c.sequence = (
             SELECT MAX(latest.sequence) FROM continuity_checkpoints latest WHERE latest.task_id = c.task_id
           )
           ORDER BY c.created_at DESC LIMIT ?`,
        )
        .all(boundedLimit) as Row[]
    ).map((row) => {
      const checkpoint = parseRow(row);
      if (!checkpoint) throw new Error("continuity_checkpoint_corrupt");
      return checkpoint;
    });
  }
}
