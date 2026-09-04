import { createHash } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import type {
  ApprovalReceipt,
  ExecutionReservationResult,
  IdempotencyExecutionRecord,
  IdempotentResourceResult,
  MutationAuditEvent,
  MutationAuthorizerPersistence,
  MutationPreview,
  PersistedRequestIdempotency,
  StoredMutationOutcome,
} from "./mutation-authorizer.ts";

type MutationSqliteDb = Pick<DatabaseSync, "exec" | "prepare">;
type SqliteRow = Record<string, SQLOutputValue>;

export type AtomicExecutionCompletionResult =
  | { status: "completed"; reservation_id: string }
  | { status: "replay"; outcome: StoredMutationOutcome }
  | { status: "idempotency_conflict" }
  | { status: "execution_in_flight" }
  | { status: "approval_reused" }
  | { status: "approval_missing" }
  | { status: "persistence_corrupt" };

function parseJsonObject<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") {
    throw new Error("control_plane_persistence_json_invalid");
  }
  return serialized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseStoredOutcome(value: unknown): StoredMutationOutcome | null {
  const parsed = parseJsonObject<Record<string, unknown>>(value);
  if (!parsed) return null;
  if (parsed.status === "succeeded" && Object.hasOwn(parsed, "value")) {
    return { status: "succeeded", value: parsed.value };
  }
  if (parsed.status === "failed" && parsed.error_code === "mutation_callback_failed") {
    return { status: "failed", error_code: "mutation_callback_failed" };
  }
  return null;
}

function rollbackQuietly(db: MutationSqliteDb): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The original transaction error remains authoritative.
  }
}

export class SqliteMutationAuthorizerPersistence implements MutationAuthorizerPersistence {
  constructor(private readonly db: MutationSqliteDb) {}

  /**
   * Transaction-neutral one-shot completion used by compound SQLite effects.
   *
   * The caller owns BEGIN IMMEDIATE/COMMIT and must roll back if any later
   * operation fails. No callback, await, file I/O or process work is performed
   * here. This lets a coordinator consume an approval and persist idempotency,
   * effect and audit evidence in the same commit as its domain rows.
   */
  consumeApprovalAndCompleteInTransaction(input: {
    idempotency_key: string;
    request_digest: string;
    reservation_id: string;
    approval_id: string;
    outcome: StoredMutationOutcome;
    created_at: string;
    completed_at: string;
    audit_event: MutationAuditEvent;
  }): AtomicExecutionCompletionResult {
    const existing = this.db
      .prepare(
        `SELECT request_digest, reservation_id, state, outcome_json
         FROM control_plane_idempotency_results
         WHERE idempotency_key = ?`,
      )
      .get(input.idempotency_key) as SqliteRow | undefined;
    if (existing) {
      if (existing.request_digest !== input.request_digest) return { status: "idempotency_conflict" };
      if (existing.state === "in_flight") return { status: "execution_in_flight" };
      if (existing.state !== "completed") return { status: "persistence_corrupt" };
      const outcome = parseStoredOutcome(existing.outcome_json);
      return outcome ? { status: "replay", outcome } : { status: "persistence_corrupt" };
    }

    const approval = this.db
      .prepare(
        `SELECT approval_id, consumed_reservation_id
         FROM control_plane_approval_receipts
         WHERE approval_id = ?`,
      )
      .get(input.approval_id) as SqliteRow | undefined;
    if (!approval) return { status: "approval_missing" };
    if (approval.consumed_reservation_id !== null) return { status: "approval_reused" };

    const consumed = this.db
      .prepare(
        `UPDATE control_plane_approval_receipts
         SET consumed_reservation_id = ?, consumed_at = ?
         WHERE approval_id = ? AND consumed_reservation_id IS NULL`,
      )
      .run(input.reservation_id, input.created_at, input.approval_id);
    if (Number(consumed.changes) !== 1) return { status: "approval_reused" };

    const serialized = serializeJson(input.outcome);
    const serializedHash = sha256(serialized);
    this.db
      .prepare(
        `INSERT INTO control_plane_idempotency_results (
          idempotency_key, request_digest, reservation_id, approval_id,
          state, outcome_json, created_at, lease_expires_at, attempt_count, completed_at
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, 1, ?)`,
      )
      .run(
        input.idempotency_key,
        input.request_digest,
        input.reservation_id,
        input.approval_id,
        serialized,
        input.created_at,
        input.completed_at,
        input.completed_at,
      );
    this.db
      .prepare(
        `INSERT INTO control_plane_execution_effects (
          reservation_id, outcome_json, outcome_sha256, recorded_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(input.reservation_id, serialized, serializedHash, input.completed_at);
    this.db
      .prepare(
        `INSERT INTO control_plane_mutation_audit (
          event_id, event_type, preview_id, approval_id,
          idempotency_key_digest, request_digest, reason, event_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.audit_event.event_id,
        input.audit_event.event_type,
        input.audit_event.preview_id ?? null,
        input.audit_event.approval_id ?? null,
        input.audit_event.idempotency_key_digest ?? null,
        input.audit_event.request_digest ?? null,
        input.audit_event.reason ?? null,
        serializeJson(input.audit_event),
        input.audit_event.occurred_at,
      );
    return { status: "completed", reservation_id: input.reservation_id };
  }

  async savePreview(
    preview: MutationPreview,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<MutationPreview>> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (idempotency) {
        const existing = this.db
          .prepare(
            `
            SELECT request_digest, resource_id
            FROM control_plane_request_idempotency
            WHERE phase = 'preview' AND idempotency_key = ?
          `,
          )
          .get(idempotency.idempotency_key) as SqliteRow | undefined;
        if (existing) {
          if (existing.request_digest !== idempotency.request_digest) {
            this.db.exec("COMMIT");
            return { status: "idempotency_conflict" };
          }
          const replay = await this.getPreview(String(existing.resource_id));
          this.db.exec("COMMIT");
          return replay ? { status: "replay", value: replay } : { status: "persistence_corrupt" };
        }
      }

      this.db
        .prepare(
          `
        INSERT INTO control_plane_mutation_previews (
          preview_id, preview_json, source_epoch, projection_epoch, issued_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          preview.preview_id,
          serializeJson(preview),
          preview.source_epoch,
          preview.projection_epoch,
          preview.issued_at,
          preview.expires_at,
        );
      if (idempotency) {
        this.db
          .prepare(
            `
            INSERT INTO control_plane_request_idempotency (
              phase, idempotency_key, request_digest, resource_id, created_at
            ) VALUES ('preview', ?, ?, ?, ?)
          `,
          )
          .run(idempotency.idempotency_key, idempotency.request_digest, preview.preview_id, idempotency.created_at);
      }
      this.db.exec("COMMIT");
      return { status: "created", value: structuredClone(preview) };
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  async getPreview(previewId: string): Promise<MutationPreview | null> {
    const row = this.db
      .prepare(
        `
        SELECT preview_id, preview_json, source_epoch, projection_epoch, issued_at, expires_at
        FROM control_plane_mutation_previews
        WHERE preview_id = ?
      `,
      )
      .get(previewId) as SqliteRow | undefined;
    if (!row) return null;

    const preview = parseJsonObject<MutationPreview>(row.preview_json);
    if (
      !preview ||
      preview.preview_id !== row.preview_id ||
      preview.source_epoch !== row.source_epoch ||
      preview.projection_epoch !== row.projection_epoch ||
      preview.issued_at !== row.issued_at ||
      preview.expires_at !== row.expires_at
    ) {
      return null;
    }
    return structuredClone(preview);
  }

  async saveApproval(
    receipt: ApprovalReceipt,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<ApprovalReceipt>> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (idempotency) {
        const existingRequest = this.db
          .prepare(
            `
            SELECT request_digest, resource_id
            FROM control_plane_request_idempotency
            WHERE phase = 'approval' AND idempotency_key = ?
          `,
          )
          .get(idempotency.idempotency_key) as SqliteRow | undefined;
        if (existingRequest) {
          if (existingRequest.request_digest !== idempotency.request_digest) {
            this.db.exec("COMMIT");
            return { status: "idempotency_conflict" };
          }
          const replay = await this.getApproval(String(existingRequest.resource_id));
          this.db.exec("COMMIT");
          return replay ? { status: "replay", value: replay } : { status: "persistence_corrupt" };
        }
      }

      const existingApproval = this.db
        .prepare("SELECT approval_id FROM control_plane_approval_receipts WHERE preview_id = ?")
        .get(receipt.preview_id) as SqliteRow | undefined;
      if (existingApproval) {
        const replay = await this.getApproval(String(existingApproval.approval_id));
        if (!replay) {
          this.db.exec("COMMIT");
          return { status: "persistence_corrupt" };
        }
        if (idempotency) {
          this.db
            .prepare(
              `
              INSERT INTO control_plane_request_idempotency (
                phase, idempotency_key, request_digest, resource_id, created_at
              ) VALUES ('approval', ?, ?, ?, ?)
            `,
            )
            .run(idempotency.idempotency_key, idempotency.request_digest, replay.approval_id, idempotency.created_at);
        }
        this.db.exec("COMMIT");
        return { status: "replay", value: replay };
      }

      this.db
        .prepare(
          `
        INSERT INTO control_plane_approval_receipts (
          approval_id, preview_id, receipt_json, receipt_sha256, projection_epoch, issued_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          receipt.approval_id,
          receipt.preview_id,
          serializeJson(receipt),
          receipt.receipt_sha256,
          receipt.projection_epoch,
          receipt.issued_at,
          receipt.expires_at,
        );
      if (idempotency) {
        this.db
          .prepare(
            `
            INSERT INTO control_plane_request_idempotency (
              phase, idempotency_key, request_digest, resource_id, created_at
            ) VALUES ('approval', ?, ?, ?, ?)
          `,
          )
          .run(idempotency.idempotency_key, idempotency.request_digest, receipt.approval_id, idempotency.created_at);
      }
      this.db.exec("COMMIT");
      return { status: "created", value: structuredClone(receipt) };
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  async getApproval(approvalId: string): Promise<ApprovalReceipt | null> {
    const row = this.db
      .prepare(
        `
        SELECT approval_id, preview_id, receipt_json, receipt_sha256, projection_epoch, issued_at, expires_at
        FROM control_plane_approval_receipts
        WHERE approval_id = ?
      `,
      )
      .get(approvalId) as SqliteRow | undefined;
    if (!row) return null;

    const receipt = parseJsonObject<ApprovalReceipt>(row.receipt_json);
    if (
      !receipt ||
      receipt.approval_id !== row.approval_id ||
      receipt.preview_id !== row.preview_id ||
      receipt.projection_epoch !== row.projection_epoch ||
      receipt.issued_at !== row.issued_at ||
      receipt.expires_at !== row.expires_at
    ) {
      return null;
    }
    if (receipt.receipt_sha256 !== row.receipt_sha256) {
      return { ...receipt, receipt_sha256: "persistence-column-mismatch" };
    }
    return structuredClone(receipt);
  }

  async reserveExecution(input: {
    idempotency_key: string;
    request_digest: string;
    reservation_id: string;
    approval_id: string;
    created_at: string;
    lease_expires_at: string;
    allow_new_reservation?: boolean;
  }): Promise<ExecutionReservationResult> {
    const leaseExpiresAt =
      typeof input.lease_expires_at === "string" && input.lease_expires_at ? input.lease_expires_at : input.created_at;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare(
          `
          SELECT
            idempotency_key, request_digest, reservation_id, approval_id,
            state, outcome_json, created_at, lease_expires_at, attempt_count, completed_at
          FROM control_plane_idempotency_results
          WHERE idempotency_key = ?
        `,
        )
        .get(input.idempotency_key) as SqliteRow | undefined;

      if (existing) {
        let result: ExecutionReservationResult;
        if (existing.request_digest !== input.request_digest) {
          result = { status: "idempotency_conflict" };
        } else if (existing.state === "in_flight") {
          const effect = this.db
            .prepare(
              `
              SELECT outcome_json, outcome_sha256, recorded_at
              FROM control_plane_execution_effects
              WHERE reservation_id = ?
            `,
            )
            .get(existing.reservation_id) as SqliteRow | undefined;
          if (effect) {
            const serialized = typeof effect.outcome_json === "string" ? effect.outcome_json : "";
            const outcome = parseStoredOutcome(serialized);
            if (!outcome || effect.outcome_sha256 !== sha256(serialized)) {
              result = { status: "persistence_corrupt" };
            } else {
              result = {
                status: "effect_recorded",
                reservation_id: String(existing.reservation_id),
                outcome,
              };
            }
          } else {
            const leaseExpiry = Date.parse(String(existing.lease_expires_at));
            const retryAt = Date.parse(input.created_at);
            if (!Number.isFinite(leaseExpiry) || !Number.isFinite(retryAt)) {
              result = { status: "persistence_corrupt" };
            } else if (leaseExpiry <= retryAt) {
              const renewed = this.db
                .prepare(
                  `
                  UPDATE control_plane_idempotency_results
                  SET lease_expires_at = ?, attempt_count = attempt_count + 1
                  WHERE reservation_id = ? AND state = 'in_flight' AND lease_expires_at <= ?
                `,
                )
                .run(leaseExpiresAt, existing.reservation_id, input.created_at);
              result =
                Number(renewed.changes) === 1
                  ? { status: "reconcile", reservation_id: String(existing.reservation_id) }
                  : { status: "execution_in_flight" };
            } else {
              result = { status: "execution_in_flight" };
            }
          }
        } else if (existing.state === "completed") {
          const outcome = parseStoredOutcome(existing.outcome_json);
          result = outcome ? { status: "replay", outcome } : { status: "persistence_corrupt" };
        } else {
          result = { status: "persistence_corrupt" };
        }
        this.db.exec("COMMIT");
        return result;
      }

      const approval = this.db
        .prepare(
          `
          SELECT approval_id, consumed_reservation_id
          FROM control_plane_approval_receipts
          WHERE approval_id = ?
        `,
        )
        .get(input.approval_id) as SqliteRow | undefined;
      if (!approval) {
        this.db.exec("COMMIT");
        return { status: "approval_missing" };
      }
      if (approval.consumed_reservation_id !== null) {
        this.db.exec("COMMIT");
        return { status: "approval_reused" };
      }
      if (input.allow_new_reservation === false) {
        this.db.exec("COMMIT");
        return { status: "reservation_not_found" };
      }

      const consumed = this.db
        .prepare(
          `
          UPDATE control_plane_approval_receipts
          SET consumed_reservation_id = ?, consumed_at = ?
          WHERE approval_id = ? AND consumed_reservation_id IS NULL
        `,
        )
        .run(input.reservation_id, input.created_at, input.approval_id);
      if (Number(consumed.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return { status: "approval_reused" };
      }

      this.db
        .prepare(
          `
          INSERT INTO control_plane_idempotency_results (
            idempotency_key, request_digest, reservation_id, approval_id,
            state, outcome_json, created_at, lease_expires_at, attempt_count, completed_at
          ) VALUES (?, ?, ?, ?, 'in_flight', NULL, ?, ?, 1, NULL)
        `,
        )
        .run(
          input.idempotency_key,
          input.request_digest,
          input.reservation_id,
          input.approval_id,
          input.created_at,
          leaseExpiresAt,
        );

      this.db.exec("COMMIT");
      return { status: "reserved", reservation_id: input.reservation_id };
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  async recordExecutionEffect(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    recorded_at: string;
  }): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const serialized = serializeJson(input.outcome);
      const existing = this.db
        .prepare(
          `
          SELECT outcome_json, outcome_sha256
          FROM control_plane_execution_effects
          WHERE reservation_id = ?
        `,
        )
        .get(input.reservation_id) as SqliteRow | undefined;
      if (existing) {
        if (existing.outcome_json !== serialized || existing.outcome_sha256 !== sha256(serialized)) {
          throw new Error("execution_effect_conflict");
        }
        this.db.exec("COMMIT");
        return;
      }
      const reservation = this.db
        .prepare(
          `
          SELECT state
          FROM control_plane_idempotency_results
          WHERE reservation_id = ?
        `,
        )
        .get(input.reservation_id) as SqliteRow | undefined;
      if (!reservation || reservation.state !== "in_flight") {
        throw new Error("execution_reservation_not_found");
      }
      this.db
        .prepare(
          `
          INSERT INTO control_plane_execution_effects (
            reservation_id, outcome_json, outcome_sha256, recorded_at
          ) VALUES (?, ?, ?, ?)
        `,
        )
        .run(input.reservation_id, serialized, sha256(serialized), input.recorded_at);
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  async markExecutionForReconciliation(input: { reservation_id: string; reconcile_after: string }): Promise<void> {
    this.db
      .prepare(
        `
        UPDATE control_plane_idempotency_results
        SET lease_expires_at = ?
        WHERE reservation_id = ? AND state = 'in_flight'
      `,
      )
      .run(input.reconcile_after, input.reservation_id);
  }

  async completeExecution(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    completed_at: string;
    audit_event: MutationAuditEvent;
  }): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const serialized = serializeJson(input.outcome);
      const effect = this.db
        .prepare(
          `
          SELECT outcome_json, outcome_sha256
          FROM control_plane_execution_effects
          WHERE reservation_id = ?
        `,
        )
        .get(input.reservation_id) as SqliteRow | undefined;
      if (!effect || effect.outcome_json !== serialized || effect.outcome_sha256 !== sha256(serialized)) {
        throw new Error("execution_effect_missing_or_conflicting");
      }
      const result = this.db
        .prepare(
          `
          UPDATE control_plane_idempotency_results
          SET state = 'completed', outcome_json = ?, completed_at = ?
          WHERE reservation_id = ? AND state = 'in_flight'
        `,
        )
        .run(serialized, input.completed_at, input.reservation_id);
      if (Number(result.changes) !== 1) {
        const existing = this.db
          .prepare(
            `
            SELECT state, outcome_json
            FROM control_plane_idempotency_results
            WHERE reservation_id = ?
          `,
          )
          .get(input.reservation_id) as SqliteRow | undefined;
        if (!existing || existing.state !== "completed" || existing.outcome_json !== serialized) {
          throw new Error("execution_reservation_not_found");
        }
        this.db.exec("COMMIT");
        return;
      }
      this.db
        .prepare(
          `
          INSERT INTO control_plane_mutation_audit (
            event_id, event_type, preview_id, approval_id,
            idempotency_key_digest, request_digest, reason, event_json, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          input.audit_event.event_id,
          input.audit_event.event_type,
          input.audit_event.preview_id ?? null,
          input.audit_event.approval_id ?? null,
          input.audit_event.idempotency_key_digest ?? null,
          input.audit_event.request_digest ?? null,
          input.audit_event.reason ?? null,
          serializeJson(input.audit_event),
          input.audit_event.occurred_at,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  async appendAudit(event: MutationAuditEvent): Promise<void> {
    this.db
      .prepare(
        `
        INSERT INTO control_plane_mutation_audit (
          event_id, event_type, preview_id, approval_id,
          idempotency_key_digest, request_digest, reason, event_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        event.event_id,
        event.event_type,
        event.preview_id ?? null,
        event.approval_id ?? null,
        event.idempotency_key_digest ?? null,
        event.request_digest ?? null,
        event.reason ?? null,
        serializeJson(event),
        event.occurred_at,
      );
  }
}

export type { IdempotencyExecutionRecord };
