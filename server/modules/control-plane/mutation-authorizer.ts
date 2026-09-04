import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type StructuredCommand = {
  executable_id: string;
  args: string[];
  cwd_ref: string;
};

export type MutationPreviewInput = {
  spec_id: string;
  project_id: string;
  operation: string;
  resolved_target: string;
  scope: JsonValue;
  command: StructuredCommand;
  source_epoch: string;
  projection_epoch: string;
  requester: string;
  expires_in_ms?: number;
};

export type MutationPreview = {
  schema_version: "1.0.0";
  preview_id: string;
  spec_id: string;
  project_id: string;
  operation: string;
  resolved_target: string;
  scope: JsonValue;
  command: StructuredCommand;
  target_digest: string;
  scope_digest: string;
  command_digest: string;
  source_epoch: string;
  projection_epoch: string;
  requester: string;
  confirmation_text: string;
  issued_at: string;
  expires_at: string;
};

export type ApprovalReceipt = {
  schema_version: "1.0.0";
  approval_id: string;
  preview_id: string;
  spec_id: string;
  project_id: string;
  operation: string;
  resolved_target: string;
  target_digest: string;
  scope_digest: string;
  command_digest: string;
  source_epoch: string;
  projection_epoch: string;
  issued_at: string;
  expires_at: string;
  requester: string;
  approver: string;
  receipt_sha256: string;
};

export type MutationGuardContext = {
  authenticated: boolean;
  csrf_valid: boolean;
  origin: string | null | undefined;
};

export type MutationExecuteInput = {
  preview_id: string;
  approval_id: string;
  source_epoch: string;
  /** Server-owned current projection authority. Never accepted from a public execute body. */
  current_projection_epoch: string;
  confirmation_text: string;
  idempotency_key: string;
  guards: MutationGuardContext;
};

export type MutationRequestIdempotency = {
  idempotency_key: string;
  request: JsonValue;
};

export type PersistedRequestIdempotency = {
  idempotency_key: string;
  request_digest: string;
  created_at: string;
};

export type IdempotentResourceResult<T> =
  | { status: "created"; value: T }
  | { status: "replay"; value: T }
  | { status: "idempotency_conflict" }
  | { status: "persistence_corrupt" };

export type MutationAuditEvent = {
  event_id: string;
  event_type:
    | "preview_created"
    | "preview_replayed"
    | "approval_issued"
    | "approval_replayed"
    | "execution_rejected"
    | "execution_started"
    | "execution_reconciliation_started"
    | "execution_effect_recorded"
    | "execution_completed"
    | "execution_replayed"
    | "execution_failed";
  occurred_at: string;
  preview_id?: string;
  approval_id?: string;
  idempotency_key_digest?: string;
  reason?: MutationFailureCode;
  request_digest?: string;
};

export type StoredMutationOutcome =
  | { status: "succeeded"; value: unknown }
  | { status: "failed"; error_code: "mutation_callback_failed" };

export type IdempotencyExecutionRecord = {
  idempotency_key: string;
  request_digest: string;
  reservation_id: string;
  approval_id: string;
  state: "in_flight" | "completed";
  outcome: StoredMutationOutcome | null;
  created_at: string;
  lease_expires_at: string;
  attempt_count: number;
  completed_at: string | null;
};

export type ExecutionReservationResult =
  | { status: "reserved"; reservation_id: string }
  | { status: "reconcile"; reservation_id: string }
  | { status: "effect_recorded"; reservation_id: string; outcome: StoredMutationOutcome }
  | { status: "replay"; outcome: StoredMutationOutcome }
  | { status: "idempotency_conflict" }
  | { status: "execution_in_flight" }
  | { status: "approval_reused" }
  | { status: "approval_missing" }
  | { status: "reservation_not_found" }
  | { status: "persistence_corrupt" };

export interface MutationAuthorizerPersistence {
  savePreview(
    preview: MutationPreview,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<MutationPreview>>;
  getPreview(previewId: string): Promise<MutationPreview | null>;
  saveApproval(
    receipt: ApprovalReceipt,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<ApprovalReceipt>>;
  getApproval(approvalId: string): Promise<ApprovalReceipt | null>;

  /**
   * Implementations must atomically check the idempotency key, consume the
   * approval once, and persist an in-flight reservation.
   */
  reserveExecution(input: {
    idempotency_key: string;
    request_digest: string;
    reservation_id: string;
    approval_id: string;
    created_at: string;
    lease_expires_at: string;
    allow_new_reservation?: boolean;
  }): Promise<ExecutionReservationResult>;

  recordExecutionEffect(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    recorded_at: string;
  }): Promise<void>;

  markExecutionForReconciliation(input: { reservation_id: string; reconcile_after: string }): Promise<void>;

  completeExecution(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    completed_at: string;
    audit_event: MutationAuditEvent;
  }): Promise<void>;

  appendAudit(event: MutationAuditEvent): Promise<void>;
}

export type MutationFailureCode =
  | "invalid_input"
  | "not_authenticated"
  | "csrf_invalid"
  | "origin_not_allowed"
  | "idempotency_key_invalid"
  | "preview_not_found"
  | "preview_tampered"
  | "preview_expired"
  | "source_epoch_mismatch"
  | "projection_epoch_mismatch"
  | "confirmation_mismatch"
  | "approval_not_found"
  | "approval_expired"
  | "approval_tampered"
  | "approval_mismatch"
  | "approval_reused"
  | "idempotency_conflict"
  | "execution_in_flight"
  | "execution_reconciliation_required"
  | "persistence_corrupt"
  | "mutation_callback_failed";

export type MutationExecutionResult<T> =
  | {
      ok: true;
      status: "executed" | "replayed";
      value: T;
      approval_receipt: ApprovalReceipt;
    }
  | {
      ok: false;
      code: MutationFailureCode;
      replayed?: boolean;
    };

export class MutationInputError extends Error {
  readonly code = "invalid_input";

  constructor(message: string) {
    super(message);
    this.name = "MutationInputError";
  }
}

export class MutationNoEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationNoEffectError";
  }
}

export type MutationAuthorizerOptions = {
  persistence: MutationAuthorizerPersistence;
  allowed_origins?: readonly string[];
  allowed_executable_ids: readonly string[];
  allowed_cwd_refs: readonly string[];
  now?: () => Date;
  create_id?: () => string;
  default_preview_ttl_ms?: number;
  max_preview_ttl_ms?: number;
  execution_lease_ms?: number;
};

const DEFAULT_PREVIEW_TTL_MS = 5 * 60 * 1_000;
const MAX_PREVIEW_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_EXECUTION_LEASE_MS = 30 * 1_000;
const MAX_TEXT_LENGTH = 4_096;
const MAX_ARGS = 256;
const MAX_ARG_LENGTH = 32_768;
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const EXECUTABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CWD_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;
const SHELL_EXPANSION_PATTERN = /(?:\$\(|\$\{|`|%[^%\r\n]+%|[\r\n])/;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function assertNonEmptyText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || value.includes("\0")) {
    throw new MutationInputError(`${field}_invalid`);
  }
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
  assertNonEmptyText(value, field, 256);
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new MutationInputError(`${field}_invalid`);
  }
}

function assertJsonValue(value: unknown, field: string): asserts value is JsonValue {
  const visit = (current: unknown, depth: number): void => {
    if (depth > 32) {
      throw new MutationInputError(`${field}_too_deep`);
    }
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new MutationInputError(`${field}_invalid_number`);
      }
      return;
    }
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry, depth + 1);
      return;
    }
    if (typeof current === "object") {
      for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
        if (key.length === 0 || key.length > 256 || key.includes("\0")) {
          throw new MutationInputError(`${field}_invalid_key`);
        }
        visit(entry, depth + 1);
      }
      return;
    }
    throw new MutationInputError(`${field}_invalid`);
  };

  visit(value, 0);
}

function ownKeysExactly(value: object, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertStructuredCommand(
  value: unknown,
  allowedExecutableIds: ReadonlySet<string>,
  allowedCwdRefs: ReadonlySet<string>,
): asserts value is StructuredCommand {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !ownKeysExactly(value, ["executable_id", "args", "cwd_ref"])
  ) {
    throw new MutationInputError("structured_command_required");
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.executable_id !== "string" ||
    !EXECUTABLE_ID_PATTERN.test(candidate.executable_id) ||
    !allowedExecutableIds.has(candidate.executable_id)
  ) {
    throw new MutationInputError("executable_id_not_allowed");
  }
  if (
    typeof candidate.cwd_ref !== "string" ||
    !CWD_REF_PATTERN.test(candidate.cwd_ref) ||
    SHELL_EXPANSION_PATTERN.test(candidate.cwd_ref) ||
    !allowedCwdRefs.has(candidate.cwd_ref)
  ) {
    throw new MutationInputError("cwd_ref_not_allowed");
  }
  if (!Array.isArray(candidate.args) || candidate.args.length > MAX_ARGS) {
    throw new MutationInputError("command_args_invalid");
  }
  for (const argument of candidate.args) {
    if (
      typeof argument !== "string" ||
      argument.length > MAX_ARG_LENGTH ||
      argument.includes("\0") ||
      SHELL_EXPANSION_PATTERN.test(argument)
    ) {
      throw new MutationInputError("command_arg_shell_expansion_rejected");
    }
  }
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
      return null;
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  const parsed = new URL(origin);
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
}

function safeTextEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMutationPreviewDigests(preview: MutationPreview): boolean {
  try {
    if (preview.schema_version !== "1.0.0") return false;
    assertIdentifier(preview.preview_id, "preview_id");
    assertIdentifier(preview.spec_id, "spec_id");
    assertIdentifier(preview.project_id, "project_id");
    assertIdentifier(preview.operation, "operation");
    assertNonEmptyText(preview.resolved_target, "resolved_target");
    assertNonEmptyText(preview.source_epoch, "source_epoch", 512);
    assertNonEmptyText(preview.projection_epoch, "projection_epoch", 512);
    assertNonEmptyText(preview.requester, "requester", 512);
    assertJsonValue(preview.scope, "scope");
    assertJsonValue(preview.command as unknown, "command");

    const issuedAt = Date.parse(preview.issued_at);
    const expiresAt = Date.parse(preview.expires_at);
    const targetDigest = sha256(preview.resolved_target);
    return (
      Number.isFinite(issuedAt) &&
      Number.isFinite(expiresAt) &&
      issuedAt < expiresAt &&
      preview.target_digest === targetDigest &&
      preview.scope_digest === sha256(stableJson(preview.scope)) &&
      preview.command_digest === sha256(stableJson(preview.command as unknown as JsonValue)) &&
      preview.confirmation_text === `승인 ${preview.operation} ${targetDigest.slice(0, 12)}`
    );
  } catch {
    return false;
  }
}

function receiptHashInput(receipt: Omit<ApprovalReceipt, "receipt_sha256">): string {
  return stableJson(receipt as unknown as JsonValue);
}

export function calculateApprovalReceiptSha256(receipt: Omit<ApprovalReceipt, "receipt_sha256">): string {
  return sha256(receiptHashInput(receipt));
}

export function verifyApprovalReceiptSha256(receipt: ApprovalReceipt): boolean {
  const { receipt_sha256: actual, ...unsigned } = receipt;
  return /^[a-f0-9]{64}$/.test(actual) && safeTextEquals(actual, calculateApprovalReceiptSha256(unsigned));
}

function clonePreview(preview: MutationPreview): MutationPreview {
  return cloneJson(preview);
}

function cloneReceipt(receipt: ApprovalReceipt): ApprovalReceipt {
  return cloneJson(receipt);
}

export class InMemoryMutationAuthorizerPersistence implements MutationAuthorizerPersistence {
  private readonly previews = new Map<string, MutationPreview>();
  private readonly approvals = new Map<string, ApprovalReceipt>();
  private readonly approvalByPreview = new Map<string, string>();
  private readonly requestIdempotency = new Map<string, { request_digest: string; resource_id: string }>();
  private readonly consumedApprovals = new Map<string, string>();
  private readonly idempotency = new Map<string, IdempotencyExecutionRecord>();
  private readonly executionEffects = new Map<string, StoredMutationOutcome>();
  private readonly audits: MutationAuditEvent[] = [];
  private lockTail: Promise<void> = Promise.resolve();

  private async withLock<T>(callback: () => T | Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let unlock: (() => void) | undefined;
    this.lockTail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      return await callback();
    } finally {
      unlock?.();
    }
  }

  async savePreview(
    preview: MutationPreview,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<MutationPreview>> {
    return this.withLock(() => {
      if (idempotency) {
        const requestKey = `preview:${idempotency.idempotency_key}`;
        const existingRequest = this.requestIdempotency.get(requestKey);
        if (existingRequest) {
          if (existingRequest.request_digest !== idempotency.request_digest) {
            return { status: "idempotency_conflict" } as const;
          }
          const existingPreview = this.previews.get(existingRequest.resource_id);
          return existingPreview
            ? ({ status: "replay", value: clonePreview(existingPreview) } as const)
            : ({ status: "persistence_corrupt" } as const);
        }
      }
      if (this.previews.has(preview.preview_id)) {
        throw new Error("preview_id_conflict");
      }
      this.previews.set(preview.preview_id, clonePreview(preview));
      if (idempotency) {
        this.requestIdempotency.set(`preview:${idempotency.idempotency_key}`, {
          request_digest: idempotency.request_digest,
          resource_id: preview.preview_id,
        });
      }
      return { status: "created", value: clonePreview(preview) } as const;
    });
  }

  async getPreview(previewId: string): Promise<MutationPreview | null> {
    const preview = this.previews.get(previewId);
    return preview ? clonePreview(preview) : null;
  }

  async saveApproval(
    receipt: ApprovalReceipt,
    idempotency?: PersistedRequestIdempotency,
  ): Promise<IdempotentResourceResult<ApprovalReceipt>> {
    return this.withLock(() => {
      if (idempotency) {
        const requestKey = `approval:${idempotency.idempotency_key}`;
        const existingRequest = this.requestIdempotency.get(requestKey);
        if (existingRequest) {
          if (existingRequest.request_digest !== idempotency.request_digest) {
            return { status: "idempotency_conflict" } as const;
          }
          const existingReceipt = this.approvals.get(existingRequest.resource_id);
          return existingReceipt
            ? ({ status: "replay", value: cloneReceipt(existingReceipt) } as const)
            : ({ status: "persistence_corrupt" } as const);
        }
      }
      const existingApprovalId = this.approvalByPreview.get(receipt.preview_id);
      if (existingApprovalId) {
        const existingReceipt = this.approvals.get(existingApprovalId);
        if (!existingReceipt) return { status: "persistence_corrupt" };
        if (idempotency) {
          this.requestIdempotency.set(`approval:${idempotency.idempotency_key}`, {
            request_digest: idempotency.request_digest,
            resource_id: existingReceipt.approval_id,
          });
        }
        return { status: "replay", value: cloneReceipt(existingReceipt) };
      }
      if (this.approvals.has(receipt.approval_id)) {
        throw new Error("approval_id_conflict");
      }
      this.approvals.set(receipt.approval_id, cloneReceipt(receipt));
      this.approvalByPreview.set(receipt.preview_id, receipt.approval_id);
      if (idempotency) {
        this.requestIdempotency.set(`approval:${idempotency.idempotency_key}`, {
          request_digest: idempotency.request_digest,
          resource_id: receipt.approval_id,
        });
      }
      return { status: "created", value: cloneReceipt(receipt) } as const;
    });
  }

  async getApproval(approvalId: string): Promise<ApprovalReceipt | null> {
    const approval = this.approvals.get(approvalId);
    return approval ? cloneReceipt(approval) : null;
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
    return this.withLock(() => {
      const existing = this.idempotency.get(input.idempotency_key);
      if (existing) {
        if (existing.request_digest !== input.request_digest) {
          return { status: "idempotency_conflict" } as const;
        }
        if (existing.state === "in_flight") {
          const effect = this.executionEffects.get(existing.reservation_id);
          if (effect) {
            return {
              status: "effect_recorded",
              reservation_id: existing.reservation_id,
              outcome: cloneJson(effect),
            } as const;
          }
          const leaseExpiry = Date.parse(existing.lease_expires_at);
          const retryAt = Date.parse(input.created_at);
          if (!Number.isFinite(leaseExpiry) || !Number.isFinite(retryAt)) {
            return { status: "persistence_corrupt" } as const;
          }
          if (leaseExpiry <= retryAt) {
            existing.lease_expires_at = input.lease_expires_at;
            existing.attempt_count += 1;
            return { status: "reconcile", reservation_id: existing.reservation_id } as const;
          }
          return { status: "execution_in_flight" } as const;
        }
        if (!existing.outcome) {
          return { status: "persistence_corrupt" } as const;
        }
        return { status: "replay", outcome: cloneJson(existing.outcome) } as const;
      }

      if (!this.approvals.has(input.approval_id)) {
        return { status: "approval_missing" } as const;
      }
      if (this.consumedApprovals.has(input.approval_id)) {
        return { status: "approval_reused" } as const;
      }
      if (input.allow_new_reservation === false) {
        return { status: "reservation_not_found" } as const;
      }

      this.consumedApprovals.set(input.approval_id, input.reservation_id);
      this.idempotency.set(input.idempotency_key, {
        idempotency_key: input.idempotency_key,
        request_digest: input.request_digest,
        reservation_id: input.reservation_id,
        approval_id: input.approval_id,
        state: "in_flight",
        outcome: null,
        created_at: input.created_at,
        lease_expires_at: input.lease_expires_at,
        attempt_count: 1,
        completed_at: null,
      });
      return { status: "reserved", reservation_id: input.reservation_id } as const;
    });
  }

  async recordExecutionEffect(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    recorded_at: string;
  }): Promise<void> {
    await this.withLock(() => {
      const record = [...this.idempotency.values()].find(
        (candidate) => candidate.reservation_id === input.reservation_id,
      );
      if (!record || record.state !== "in_flight") {
        throw new Error("execution_reservation_not_found");
      }
      const existing = this.executionEffects.get(input.reservation_id);
      if (
        existing &&
        stableJson(existing as unknown as JsonValue) !== stableJson(input.outcome as unknown as JsonValue)
      ) {
        throw new Error("execution_effect_conflict");
      }
      this.executionEffects.set(input.reservation_id, cloneJson(input.outcome));
    });
  }

  async markExecutionForReconciliation(input: { reservation_id: string; reconcile_after: string }): Promise<void> {
    await this.withLock(() => {
      const record = [...this.idempotency.values()].find(
        (candidate) => candidate.reservation_id === input.reservation_id,
      );
      if (!record || record.state !== "in_flight") return;
      record.lease_expires_at = input.reconcile_after;
    });
  }

  async completeExecution(input: {
    reservation_id: string;
    outcome: StoredMutationOutcome;
    completed_at: string;
    audit_event: MutationAuditEvent;
  }): Promise<void> {
    await this.withLock(() => {
      const record = [...this.idempotency.values()].find(
        (candidate) => candidate.reservation_id === input.reservation_id,
      );
      const effect = this.executionEffects.get(input.reservation_id);
      if (!record || !effect) {
        throw new Error("execution_reservation_not_found");
      }
      if (stableJson(effect as unknown as JsonValue) !== stableJson(input.outcome as unknown as JsonValue)) {
        throw new Error("execution_effect_conflict");
      }
      if (record.state === "completed") {
        if (
          !record.outcome ||
          stableJson(record.outcome as unknown as JsonValue) !== stableJson(input.outcome as unknown as JsonValue)
        ) {
          throw new Error("execution_completion_conflict");
        }
        return;
      }
      if (record.state !== "in_flight") throw new Error("execution_reservation_not_found");
      record.state = "completed";
      record.outcome = cloneJson(input.outcome);
      record.completed_at = input.completed_at;
      this.audits.push(cloneJson(input.audit_event));
    });
  }

  async appendAudit(event: MutationAuditEvent): Promise<void> {
    await this.withLock(() => {
      this.audits.push(cloneJson(event));
    });
  }

  listAudits(): MutationAuditEvent[] {
    return cloneJson(this.audits);
  }
}

export class MutationAuthorizer {
  private readonly persistence: MutationAuthorizerPersistence;
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly allowedExecutableIds: ReadonlySet<string>;
  private readonly allowedCwdRefs: ReadonlySet<string>;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly defaultPreviewTtlMs: number;
  private readonly maxPreviewTtlMs: number;
  private readonly executionLeaseMs: number;

  constructor(options: MutationAuthorizerOptions) {
    this.persistence = options.persistence;
    this.allowedExecutableIds = new Set(options.allowed_executable_ids);
    this.allowedCwdRefs = new Set(options.allowed_cwd_refs);
    if (this.allowedExecutableIds.size === 0 || this.allowedCwdRefs.size === 0) {
      throw new MutationInputError("command_allowlist_required");
    }

    const origins = (options.allowed_origins ?? []).map((origin) => {
      const normalized = normalizeOrigin(origin);
      if (!normalized) {
        throw new MutationInputError("allowed_origin_invalid");
      }
      return normalized;
    });
    this.allowedOrigins = new Set(origins);
    this.now = options.now ?? (() => new Date());
    this.createId = options.create_id ?? randomUUID;
    this.defaultPreviewTtlMs = options.default_preview_ttl_ms ?? DEFAULT_PREVIEW_TTL_MS;
    this.maxPreviewTtlMs = options.max_preview_ttl_ms ?? MAX_PREVIEW_TTL_MS;
    this.executionLeaseMs = options.execution_lease_ms ?? DEFAULT_EXECUTION_LEASE_MS;
    if (
      !Number.isSafeInteger(this.defaultPreviewTtlMs) ||
      this.defaultPreviewTtlMs <= 0 ||
      !Number.isSafeInteger(this.maxPreviewTtlMs) ||
      this.maxPreviewTtlMs <= 0 ||
      this.defaultPreviewTtlMs > this.maxPreviewTtlMs
    ) {
      throw new MutationInputError("preview_ttl_invalid");
    }
    if (!Number.isSafeInteger(this.executionLeaseMs) || this.executionLeaseMs <= 0) {
      throw new MutationInputError("execution_lease_invalid");
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private async audit(
    event: Omit<MutationAuditEvent, "event_id" | "occurred_at"> & Partial<Pick<MutationAuditEvent, "occurred_at">>,
  ): Promise<void> {
    await this.persistence.appendAudit(this.auditEvent(event));
  }

  private auditEvent(
    event: Omit<MutationAuditEvent, "event_id" | "occurred_at"> & Partial<Pick<MutationAuditEvent, "occurred_at">>,
  ): MutationAuditEvent {
    return {
      ...event,
      event_id: this.createId(),
      occurred_at: event.occurred_at ?? this.timestamp(),
    };
  }

  private async auditBestEffort(
    event: Omit<MutationAuditEvent, "event_id" | "occurred_at"> & Partial<Pick<MutationAuditEvent, "occurred_at">>,
  ): Promise<void> {
    try {
      await this.audit(event);
    } catch {
      // The durable reservation/effect state remains authoritative. Audit
      // recovery can be performed independently without re-running an effect.
    }
  }

  private async reject(
    code: MutationFailureCode,
    context: {
      preview_id?: string;
      approval_id?: string;
      idempotency_key?: string;
      request_digest?: string;
    },
  ): Promise<MutationExecutionResult<never>> {
    await this.audit({
      event_type: "execution_rejected",
      preview_id: context.preview_id,
      approval_id: context.approval_id,
      idempotency_key_digest: context.idempotency_key ? sha256(context.idempotency_key) : undefined,
      request_digest: context.request_digest,
      reason: code,
    });
    return { ok: false, code };
  }

  private originAllowed(origin: string | null | undefined): boolean {
    if (!origin) return false;
    const normalized = normalizeOrigin(origin);
    return normalized !== null && (isLoopbackOrigin(normalized) || this.allowedOrigins.has(normalized));
  }

  private persistedRequestIdempotency(
    input: MutationRequestIdempotency | undefined,
    createdAt: string,
  ): PersistedRequestIdempotency | undefined {
    if (!input) return undefined;
    if (typeof input.idempotency_key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(input.idempotency_key)) {
      throw new MutationInputError("idempotency_key_invalid");
    }
    assertJsonValue(input.request, "idempotency_request");
    return {
      idempotency_key: input.idempotency_key,
      request_digest: sha256(stableJson(input.request)),
      created_at: createdAt,
    };
  }

  private previewIntegrityValid(preview: MutationPreview): boolean {
    try {
      if (!verifyMutationPreviewDigests(preview)) return false;
      assertStructuredCommand(preview.command, this.allowedExecutableIds, this.allowedCwdRefs);
      return true;
    } catch {
      return false;
    }
  }

  async createPreview(input: MutationPreviewInput, idempotency?: MutationRequestIdempotency): Promise<MutationPreview> {
    assertIdentifier(input.spec_id, "spec_id");
    assertIdentifier(input.project_id, "project_id");
    assertIdentifier(input.operation, "operation");
    assertNonEmptyText(input.resolved_target, "resolved_target");
    assertNonEmptyText(input.source_epoch, "source_epoch", 512);
    assertNonEmptyText(input.projection_epoch, "projection_epoch", 512);
    assertNonEmptyText(input.requester, "requester", 512);
    assertJsonValue(input.scope, "scope");
    assertStructuredCommand(input.command, this.allowedExecutableIds, this.allowedCwdRefs);

    const ttl = input.expires_in_ms ?? this.defaultPreviewTtlMs;
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > this.maxPreviewTtlMs) {
      throw new MutationInputError("preview_ttl_invalid");
    }

    const issuedAt = this.now();
    const targetDigest = sha256(input.resolved_target);
    const scope = cloneJson(input.scope);
    const command = cloneJson(input.command);
    const scopeDigest = sha256(stableJson(scope));
    const commandDigest = sha256(stableJson(command as unknown as JsonValue));
    const preview: MutationPreview = {
      schema_version: "1.0.0",
      preview_id: this.createId(),
      spec_id: input.spec_id,
      project_id: input.project_id,
      operation: input.operation,
      resolved_target: input.resolved_target,
      scope,
      command,
      target_digest: targetDigest,
      scope_digest: scopeDigest,
      command_digest: commandDigest,
      source_epoch: input.source_epoch,
      projection_epoch: input.projection_epoch,
      requester: input.requester,
      confirmation_text: `승인 ${input.operation} ${targetDigest.slice(0, 12)}`,
      issued_at: issuedAt.toISOString(),
      expires_at: new Date(issuedAt.getTime() + ttl).toISOString(),
    };

    const persisted = await this.persistence.savePreview(
      preview,
      this.persistedRequestIdempotency(idempotency, issuedAt.toISOString()),
    );
    if (persisted.status === "idempotency_conflict" || persisted.status === "persistence_corrupt") {
      throw new MutationInputError(persisted.status);
    }
    await this.audit({
      event_type: persisted.status === "created" ? "preview_created" : "preview_replayed",
      preview_id: persisted.value.preview_id,
    });
    return clonePreview(persisted.value);
  }

  async issueApproval(
    previewId: string,
    approver: string,
    idempotency?: MutationRequestIdempotency,
  ): Promise<ApprovalReceipt> {
    assertIdentifier(previewId, "preview_id");
    assertNonEmptyText(approver, "approver", 512);

    const preview = await this.persistence.getPreview(previewId);
    if (!preview) {
      throw new MutationInputError("preview_not_found");
    }
    if (!this.previewIntegrityValid(preview)) {
      throw new MutationInputError("preview_tampered");
    }
    const issuedAt = this.now();
    if (Date.parse(preview.expires_at) <= issuedAt.getTime()) {
      throw new MutationInputError("preview_expired");
    }

    const unsigned: Omit<ApprovalReceipt, "receipt_sha256"> = {
      schema_version: "1.0.0",
      approval_id: this.createId(),
      preview_id: preview.preview_id,
      spec_id: preview.spec_id,
      project_id: preview.project_id,
      operation: preview.operation,
      resolved_target: preview.resolved_target,
      target_digest: preview.target_digest,
      scope_digest: preview.scope_digest,
      command_digest: preview.command_digest,
      source_epoch: preview.source_epoch,
      projection_epoch: preview.projection_epoch,
      issued_at: issuedAt.toISOString(),
      expires_at: preview.expires_at,
      requester: preview.requester,
      approver,
    };
    const receipt: ApprovalReceipt = {
      ...unsigned,
      receipt_sha256: calculateApprovalReceiptSha256(unsigned),
    };

    const persisted = await this.persistence.saveApproval(
      receipt,
      this.persistedRequestIdempotency(idempotency, issuedAt.toISOString()),
    );
    if (persisted.status === "idempotency_conflict" || persisted.status === "persistence_corrupt") {
      throw new MutationInputError(persisted.status);
    }
    const effectiveReceipt = persisted.value;
    if (
      !verifyApprovalReceiptSha256(effectiveReceipt) ||
      effectiveReceipt.preview_id !== preview.preview_id ||
      effectiveReceipt.source_epoch !== preview.source_epoch ||
      effectiveReceipt.projection_epoch !== preview.projection_epoch ||
      effectiveReceipt.approver !== approver
    ) {
      throw new MutationInputError("persistence_corrupt");
    }
    await this.audit({
      event_type: persisted.status === "created" ? "approval_issued" : "approval_replayed",
      preview_id: preview.preview_id,
      approval_id: effectiveReceipt.approval_id,
    });
    return cloneReceipt(effectiveReceipt);
  }

  async execute<T>(
    input: MutationExecuteInput,
    mutation: (authorized: {
      preview: MutationPreview;
      approval_receipt: ApprovalReceipt;
      command: StructuredCommand;
    }) => Promise<T>,
  ): Promise<MutationExecutionResult<T>> {
    const baseContext = {
      preview_id: typeof input.preview_id === "string" ? input.preview_id : undefined,
      approval_id: typeof input.approval_id === "string" ? input.approval_id : undefined,
      idempotency_key: typeof input.idempotency_key === "string" ? input.idempotency_key : undefined,
    };

    if (!input.guards?.authenticated) {
      return this.reject("not_authenticated", baseContext);
    }
    if (!input.guards.csrf_valid) {
      return this.reject("csrf_invalid", baseContext);
    }
    if (!this.originAllowed(input.guards.origin)) {
      return this.reject("origin_not_allowed", baseContext);
    }
    if (typeof input.idempotency_key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(input.idempotency_key)) {
      return this.reject("idempotency_key_invalid", baseContext);
    }
    if (
      typeof input.preview_id !== "string" ||
      typeof input.approval_id !== "string" ||
      typeof input.source_epoch !== "string" ||
      typeof input.current_projection_epoch !== "string" ||
      typeof input.confirmation_text !== "string"
    ) {
      return this.reject("invalid_input", baseContext);
    }

    const preview = await this.persistence.getPreview(input.preview_id);
    if (!preview) {
      return this.reject("preview_not_found", baseContext);
    }
    if (!this.previewIntegrityValid(preview)) {
      return this.reject("preview_tampered", baseContext);
    }
    const now = this.now();
    const previewExpired = Date.parse(preview.expires_at) <= now.getTime();
    if (!safeTextEquals(input.source_epoch, preview.source_epoch)) {
      return this.reject("source_epoch_mismatch", baseContext);
    }
    if (!safeTextEquals(input.current_projection_epoch, preview.projection_epoch)) {
      return this.reject("projection_epoch_mismatch", baseContext);
    }
    if (!safeTextEquals(input.confirmation_text, preview.confirmation_text)) {
      return this.reject("confirmation_mismatch", baseContext);
    }

    const approval = await this.persistence.getApproval(input.approval_id);
    if (!approval) {
      return this.reject("approval_not_found", baseContext);
    }
    if (!verifyApprovalReceiptSha256(approval)) {
      return this.reject("approval_tampered", baseContext);
    }
    const approvalExpired = Date.parse(approval.expires_at) <= now.getTime();

    const receiptMatchesPreview =
      approval.approval_id === input.approval_id &&
      approval.preview_id === preview.preview_id &&
      approval.spec_id === preview.spec_id &&
      approval.project_id === preview.project_id &&
      approval.operation === preview.operation &&
      approval.resolved_target === preview.resolved_target &&
      approval.target_digest === preview.target_digest &&
      approval.scope_digest === preview.scope_digest &&
      approval.command_digest === preview.command_digest &&
      approval.source_epoch === preview.source_epoch &&
      approval.projection_epoch === preview.projection_epoch &&
      approval.requester === preview.requester &&
      approval.expires_at === preview.expires_at;
    if (!receiptMatchesPreview) {
      return this.reject("approval_mismatch", baseContext);
    }

    const requestDigest = sha256(
      stableJson({
        preview_id: input.preview_id,
        approval_id: input.approval_id,
        source_epoch: input.source_epoch,
        projection_epoch: preview.projection_epoch,
        confirmation_text: input.confirmation_text,
      }),
    );
    const reservationId = this.createId();
    const reservation = await this.persistence.reserveExecution({
      idempotency_key: input.idempotency_key,
      request_digest: requestDigest,
      reservation_id: reservationId,
      approval_id: input.approval_id,
      created_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + this.executionLeaseMs).toISOString(),
      allow_new_reservation: !previewExpired && !approvalExpired,
    });

    if (reservation.status === "reservation_not_found") {
      return this.reject(previewExpired ? "preview_expired" : "approval_expired", {
        ...baseContext,
        request_digest: requestDigest,
      });
    }
    if (reservation.status === "idempotency_conflict") {
      return this.reject("idempotency_conflict", { ...baseContext, request_digest: requestDigest });
    }
    if (reservation.status === "execution_in_flight") {
      return this.reject("execution_in_flight", { ...baseContext, request_digest: requestDigest });
    }
    if (reservation.status === "persistence_corrupt") {
      return this.reject("persistence_corrupt", { ...baseContext, request_digest: requestDigest });
    }
    if (reservation.status === "approval_reused" || reservation.status === "approval_missing") {
      return this.reject(reservation.status === "approval_reused" ? "approval_reused" : "approval_not_found", {
        ...baseContext,
        request_digest: requestDigest,
      });
    }
    if (reservation.status === "replay") {
      await this.audit({
        event_type: "execution_replayed",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
      });
      if (reservation.outcome.status === "failed") {
        return { ok: false, code: reservation.outcome.error_code, replayed: true };
      }
      return {
        ok: true,
        status: "replayed",
        value: reservation.outcome.value as T,
        approval_receipt: cloneReceipt(approval),
      };
    }

    if (reservation.status === "effect_recorded") {
      const completionAudit = this.auditEvent({
        event_type: reservation.outcome.status === "succeeded" ? "execution_completed" : "execution_failed",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
        reason: reservation.outcome.status === "failed" ? reservation.outcome.error_code : undefined,
      });
      try {
        await this.persistence.completeExecution({
          reservation_id: reservation.reservation_id,
          outcome: reservation.outcome,
          completed_at: completionAudit.occurred_at,
          audit_event: completionAudit,
        });
      } catch {
        await this.persistence
          .markExecutionForReconciliation({
            reservation_id: reservation.reservation_id,
            reconcile_after: this.timestamp(),
          })
          .catch(() => undefined);
        return { ok: false, code: "execution_reconciliation_required" };
      }
      await this.auditBestEffort({
        event_type: "execution_replayed",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
      });
      if (reservation.outcome.status === "failed") {
        return { ok: false, code: reservation.outcome.error_code, replayed: true };
      }
      return {
        ok: true,
        status: "replayed",
        value: reservation.outcome.value as T,
        approval_receipt: cloneReceipt(approval),
      };
    }

    const reconciliation = reservation.status === "reconcile";
    try {
      await this.audit({
        event_type: reconciliation ? "execution_reconciliation_started" : "execution_started",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
      });
    } catch {
      await this.persistence
        .markExecutionForReconciliation({
          reservation_id: reservation.reservation_id,
          reconcile_after: this.timestamp(),
        })
        .catch(() => undefined);
      return { ok: false, code: "execution_reconciliation_required" };
    }

    let value: T;
    try {
      value = await mutation({
        preview: clonePreview(preview),
        approval_receipt: cloneReceipt(approval),
        command: cloneJson(preview.command),
      });
    } catch (error) {
      if (error instanceof MutationNoEffectError) {
        const failedOutcome: StoredMutationOutcome = {
          status: "failed",
          error_code: "mutation_callback_failed",
        };
        try {
          await this.persistence.recordExecutionEffect({
            reservation_id: reservation.reservation_id,
            outcome: failedOutcome,
            recorded_at: this.timestamp(),
          });
          const completionAudit = this.auditEvent({
            event_type: "execution_failed",
            preview_id: preview.preview_id,
            approval_id: approval.approval_id,
            idempotency_key_digest: sha256(input.idempotency_key),
            request_digest: requestDigest,
            reason: "mutation_callback_failed",
          });
          await this.persistence.completeExecution({
            reservation_id: reservation.reservation_id,
            outcome: failedOutcome,
            completed_at: completionAudit.occurred_at,
            audit_event: completionAudit,
          });
          return { ok: false, code: "mutation_callback_failed" };
        } catch {
          await this.persistence
            .markExecutionForReconciliation({
              reservation_id: reservation.reservation_id,
              reconcile_after: this.timestamp(),
            })
            .catch(() => undefined);
          return { ok: false, code: "execution_reconciliation_required" };
        }
      }
      await this.persistence
        .markExecutionForReconciliation({
          reservation_id: reservation.reservation_id,
          reconcile_after: this.timestamp(),
        })
        .catch(() => undefined);
      await this.auditBestEffort({
        event_type: "execution_rejected",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
        reason: "execution_reconciliation_required",
      });
      return { ok: false, code: "execution_reconciliation_required" };
    }
    const outcome: StoredMutationOutcome = { status: "succeeded", value };

    try {
      await this.persistence.recordExecutionEffect({
        reservation_id: reservation.reservation_id,
        outcome,
        recorded_at: this.timestamp(),
      });
      await this.auditBestEffort({
        event_type: "execution_effect_recorded",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
      });
      const completionAudit = this.auditEvent({
        event_type: "execution_completed",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
      });
      await this.persistence.completeExecution({
        reservation_id: reservation.reservation_id,
        outcome,
        completed_at: completionAudit.occurred_at,
        audit_event: completionAudit,
      });
    } catch {
      // If effect evidence was recorded, the next same-key request promotes it
      // atomically to completed/replay. If recording failed before that point,
      // the bounded lease permits operation-specific idempotent reconciliation.
      await this.persistence
        .markExecutionForReconciliation({
          reservation_id: reservation.reservation_id,
          reconcile_after: this.timestamp(),
        })
        .catch(() => undefined);
      await this.auditBestEffort({
        event_type: "execution_rejected",
        preview_id: preview.preview_id,
        approval_id: approval.approval_id,
        idempotency_key_digest: sha256(input.idempotency_key),
        request_digest: requestDigest,
        reason: "execution_reconciliation_required",
      });
      return { ok: false, code: "execution_reconciliation_required" };
    }

    return {
      ok: true,
      status: "executed",
      value,
      approval_receipt: cloneReceipt(approval),
    };
  }
}
