import { createHash } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { stripVTControlCharacters } from "node:util";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;
type Row = Record<string, SQLOutputValue>;
type JsonScalar = boolean | number | string | null;
export type SanitizedEventPayload = JsonScalar | SanitizedEventPayload[] | { [key: string]: SanitizedEventPayload };

export type ContinuityProvider = "codex" | "claude";
export type ContinuityRunStatus =
  | "reserved"
  | "starting"
  | "running"
  | "pause_requested"
  | "paused"
  | "dispatch_uncertain"
  | "stale"
  | "completed"
  | "failed"
  | "canceled";

export interface ContinuityRun {
  run_id: string;
  project_id: string;
  task_id: string;
  checkpoint_id: string | null;
  parent_run_id: string | null;
  provider: ContinuityProvider;
  account_pool_id: string;
  provider_native_session_id: string | null;
  dispatch_id: string;
  pid: number | null;
  process_started_at: string | null;
  process_fingerprint: string | null;
  owner_instance_id: string | null;
  lease_expires_at: string | null;
  status: ContinuityRunStatus;
  state_version: number;
  heartbeat_at: string | null;
  last_event_sequence: number;
  created_at: string;
  updated_at: string;
}

export interface ContinuityRunEvent {
  run_id: string;
  sequence: number;
  event_type: string;
  payload: SanitizedEventPayload;
  payload_sha256: string;
  occurred_at: string;
  created_at: string;
}

export interface ReserveContinuityRunInput {
  run_id: string;
  project_id?: string;
  task_id?: string;
  checkpoint_id?: string | null;
  parent_run_id?: string | null;
  provider: ContinuityProvider;
  account_pool_id: string;
  provider_native_session_id?: string | null;
  dispatch_id: string;
  pid?: number | null;
  process_started_at?: string | null;
  process_fingerprint?: string | null;
  owner_instance_id?: string | null;
  lease_expires_at?: string | null;
  status?: ContinuityRunStatus;
  heartbeat_at?: string | null;
  created_at?: string;
}

export type ReserveContinuityRunResult =
  | { status: "reserved"; run: ContinuityRun }
  | { status: "dispatch_exists"; run: ContinuityRun };

export interface AppendContinuityRunEventInput {
  run_id: string;
  sequence: number;
  event_type: string;
  payload: unknown;
  occurred_at?: string;
}

export interface UpdateContinuityRunStateInput {
  status: ContinuityRunStatus;
  provider_native_session_id?: string | null;
  pid?: number | null;
  process_started_at?: string | null;
  process_fingerprint?: string | null;
  owner_instance_id?: string | null;
  lease_expires_at?: string | null;
  heartbeat_at?: string | null;
  updated_at?: string;
}

export interface TransitionContinuityRunWithEventInput extends UpdateContinuityRunStateInput {
  run_id: string;
  expected_state_version: number;
  expected_status?: ContinuityRunStatus;
  event_type: string;
  payload: unknown;
  occurred_at?: string;
}

export interface TransitionContinuityRunWithEventResult {
  run: ContinuityRun;
  event: ContinuityRunEvent;
}

const PROVIDERS = new Set<ContinuityProvider>(["codex", "claude"]);
const RUN_STATUSES = new Set<ContinuityRunStatus>([
  "reserved",
  "starting",
  "running",
  "pause_requested",
  "paused",
  "dispatch_uncertain",
  "stale",
  "completed",
  "failed",
  "canceled",
]);
const ACTIVE_ROOT_STATUSES: readonly ContinuityRunStatus[] = [
  "reserved",
  "starting",
  "running",
  "pause_requested",
  "paused",
  "dispatch_uncertain",
  "stale",
];
const TERMINAL_RUN_STATUSES = new Set<ContinuityRunStatus>(["completed", "failed", "canceled"]);
const LEGAL_RUN_TRANSITIONS: Readonly<Record<ContinuityRunStatus, ReadonlySet<ContinuityRunStatus>>> = {
  reserved: new Set(["starting", "dispatch_uncertain", "failed", "canceled"]),
  starting: new Set(["running", "dispatch_uncertain", "stale", "failed", "canceled"]),
  running: new Set(["pause_requested", "dispatch_uncertain", "stale", "completed", "failed", "canceled"]),
  pause_requested: new Set(["running", "paused", "dispatch_uncertain", "stale", "failed", "canceled"]),
  paused: new Set(["starting", "stale", "completed", "failed", "canceled"]),
  dispatch_uncertain: new Set(["starting", "running", "stale", "failed", "canceled"]),
  stale: new Set(["starting", "dispatch_uncertain", "failed", "canceled"]),
  completed: new Set(),
  failed: new Set(),
  canceled: new Set(),
};
const MAX_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 100;
const MAX_STRING_LENGTH = 4_096;
const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const SENSITIVE_KEYS = new Set([
  "auth",
  "authtoken",
  "authorization",
  "authorizationheader",
  "bearer",
  "jwt",
  "jwtvalue",
  "authorizationheader",
  "token",
  "oauthtoken",
  "slacktoken",
  "gitlabtoken",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "password",
  "passphrase",
  "passwd",
  "pwd",
  "secret",
  "clientsecret",
  "credential",
  "credentials",
  "cookie",
  "setcookie",
  "session",
  "sessioncookie",
  "sessionid",
  "sessiontoken",
  "xapikey",
  "privatekey",
  "sshkey",
  "signingkey",
  "prompt",
  "prompttext",
  "rawprompt",
  "stdin",
  "transcript",
  "fulltranscript",
  "line",
  "lines",
  "output",
  "raw",
  "rawoutput",
  "stderr",
  "stdout",
  "projectpath",
  "workspacepath",
  "cwd",
  "home",
  "executablepath",
  "commandpath",
  "dbpath",
  "error",
  "closeerror",
]);
const FAIL_CLOSED_CREDENTIAL_KEY_WORDS = new Set([
  "auth",
  "authentication",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "header",
  "key",
  "line",
  "lines",
  "output",
  "passphrase",
  "password",
  "passwd",
  "pwd",
  "raw",
  "secret",
  "session",
  "stderr",
  "stdout",
  "token",
]);
type CredentialMetadataValueKind = "identifier" | "number" | "status";
type CredentialKeyClassification =
  | { kind: "normal" }
  | { kind: "sensitive" }
  | { kind: "metadata"; valueKind: CredentialMetadataValueKind };
const ALLOWED_CREDENTIAL_METADATA_FIELDS: Readonly<
  Record<string, Readonly<Record<string, CredentialMetadataValueKind>>>
> = {
  cookie: { count: "number" },
  header: { count: "number", name: "identifier" },
  key: { count: "number", name: "identifier", type: "identifier" },
  session: { duration: "number", status: "status" },
  token: { count: "number", limit: "number", status: "status", type: "identifier", usage: "number" },
};
const ALLOWED_SESSION_DURATION_UNITS = new Set(["ms", "s", "seconds"]);
const ALLOWED_CREDENTIAL_METADATA_STATUSES = new Set([
  "active",
  "available",
  "connected",
  "disabled",
  "disconnected",
  "expired",
  "failed",
  "idle",
  "invalid",
  "missing",
  "paused",
  "ready",
  "revoked",
  "running",
  "stopped",
  "unavailable",
  "unknown",
]);
const SAFE_METADATA_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SENSITIVE_METADATA_IDENTIFIER_FRAGMENT =
  /credential|passphrase|password|passwd|private|pwd|secret|session|token/i;
const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN ((?:(?:DSA|EC|ENCRYPTED|OPENSSH|RSA) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----[\s\S]*?(?:-----END \1-----|$)/gi;
const URL_QUERY_ASSIGNMENT_PATTERN = /([?&#])([A-Za-z][A-Za-z0-9_-]{0,127})(=)([^&#\s]*)/g;
const AUTHORIZATION_HEADER_PATTERN = /(^|[ \t])authorization\b\s*[:=]\s*[^\r\n]*/gim;
const COOKIE_HEADER_PATTERN = /(^|[ \t])(?:set[-_ ]?cookie|cookie)\b\s*[:=]\s*[^\r\n]*/gim;
const BEARER_PATTERN = /\bBearer\s+[/A-Za-z0-9._~+-]+=*/gi;
const BASIC_AUTH_PATTERN = /\bBasic\s+[A-Za-z0-9+/]{4,}={0,2}/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
const TOKEN_PREFIX_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|gl(?:pat|dt|rt|cbt|soat)-[A-Za-z0-9_-]{8,}|xox(?:a|b|p|r|s)-[A-Za-z0-9-]{8,}|xapp-[A-Za-z0-9-]{8,}|sess(?:ion)?[_-](?=[A-Za-z0-9_-]{8,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+)\b/gi;
const URI_USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)(@)/gi;
const INLINE_ASSIGNMENT_PATTERN =
  /(^|[^A-Za-z0-9])([_-]*[A-Za-z][A-Za-z0-9_-]{0,127})(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/g;
const QUOTED_ASSIGNMENT_PATTERN =
  /(["'])([_-]*[A-Za-z][A-Za-z0-9_-]{0,127})\1(\s*:\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\s]+)/g;
const CLI_ARGUMENT_PATTERN =
  /(^|[ \t])(--?)([A-Za-z][A-Za-z0-9_-]{0,127})(=|[ \t]+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/gim;

function nowIso(): string {
  return new Date().toISOString();
}

function requireNonEmpty(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function normalizeTimestamp(value: string | undefined, code: string): string {
  const normalized = value?.trim() || nowIso();
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function normalizeOptionalTimestamp(value: string | null | undefined, code: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  return normalizeTimestamp(value, code);
}

function normalizeProcessFingerprint(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("continuity_run_process_fingerprint_invalid");
  return normalized;
}

function isLegalRunTransition(from: ContinuityRunStatus, to: ContinuityRunStatus): boolean {
  if (from === to) return !TERMINAL_RUN_STATUSES.has(from);
  return LEGAL_RUN_TRANSITIONS[from].has(to);
}

function splitKeyWords(key: string): string[] {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function classifyCredentialKey(key: string): CredentialKeyClassification {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (SENSITIVE_KEYS.has(compactKey)) return { kind: "sensitive" };

  const words = splitKeyWords(key);
  const sensitiveIndexes = words.flatMap((word, index) => (FAIL_CLOSED_CREDENTIAL_KEY_WORDS.has(word) ? [index] : []));
  if (sensitiveIndexes.length === 0) return { kind: "normal" };
  if (sensitiveIndexes.length !== 1) return { kind: "sensitive" };

  const sensitiveIndex = sensitiveIndexes[0];
  const family = words[sensitiveIndex];
  const suffix = words.slice(sensitiveIndex + 1);
  const allowedFields = ALLOWED_CREDENTIAL_METADATA_FIELDS[family];
  if (!allowedFields) return { kind: "sensitive" };
  if (suffix.length === 1 && allowedFields[suffix[0]]) {
    return { kind: "metadata", valueKind: allowedFields[suffix[0]] };
  }
  if (
    family === "session" &&
    suffix.length === 2 &&
    suffix[0] === "duration" &&
    ALLOWED_SESSION_DURATION_UNITS.has(suffix[1])
  ) {
    return { kind: "metadata", valueKind: "number" };
  }
  return { kind: "sensitive" };
}

function isSensitiveKey(key: string): boolean {
  return classifyCredentialKey(key).kind === "sensitive";
}

function sanitizeCredentialMetadataValue(
  value: unknown,
  valueKind: CredentialMetadataValueKind,
): SanitizedEventPayload {
  if (valueKind === "number") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : REDACTED;
  }
  if (typeof value !== "string") return REDACTED;
  const normalized = stripUnsafeControlCharacters(value).trim();
  if (valueKind === "status") {
    return ALLOWED_CREDENTIAL_METADATA_STATUSES.has(normalized) ? normalized : REDACTED;
  }
  return SAFE_METADATA_IDENTIFIER_PATTERN.test(normalized) && !SENSITIVE_METADATA_IDENTIFIER_FRAGMENT.test(normalized)
    ? normalized
    : REDACTED;
}

function unquoteInlineValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) return trimmed.slice(1, -1);
  return trimmed;
}

function shouldRedactInlineCredentialValue(key: string, value: string): boolean {
  const classification = classifyCredentialKey(key);
  if (classification.kind === "normal") return false;
  if (classification.kind === "sensitive") return true;

  let candidate = unquoteInlineValue(value);
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return true;
  }
  if (classification.valueKind === "number") {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(candidate)) return true;
    const numericValue = Number(candidate);
    return !Number.isFinite(numericValue) || numericValue < 0;
  }
  return sanitizeCredentialMetadataValue(candidate, classification.valueKind) === REDACTED;
}

function stripUnsafeControlCharacters(value: string): string {
  let output = "";
  for (const character of stripVTControlCharacters(value)) {
    const code = character.charCodeAt(0);
    if (code <= 8 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) || code === 127) continue;
    output += character;
  }
  return output;
}

function sanitizeString(value: string): string {
  return stripUnsafeControlCharacters(value)
    .replace(PRIVATE_KEY_BLOCK_PATTERN, REDACTED)
    .replace(URL_QUERY_ASSIGNMENT_PATTERN, (match, prefix: string, key: string, equals: string, urlValue: string) =>
      shouldRedactInlineCredentialValue(key, urlValue) ? `${prefix}${key}${equals}${REDACTED}` : match,
    )
    .replace(AUTHORIZATION_HEADER_PATTERN, (_match, prefix: string) => `${prefix}Authorization=${REDACTED}`)
    .replace(COOKIE_HEADER_PATTERN, (_match, prefix: string) => `${prefix}Cookie=${REDACTED}`)
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(BASIC_AUTH_PATTERN, "Basic [REDACTED]")
    .replace(JWT_PATTERN, REDACTED)
    .replace(TOKEN_PREFIX_PATTERN, REDACTED)
    .replace(
      URI_USERINFO_PATTERN,
      (_match, scheme: string, _userinfo: string, suffix: string) => `${scheme}${REDACTED}${suffix}`,
    )
    .replace(
      QUOTED_ASSIGNMENT_PATTERN,
      (match, quote: string, key: string, separator: string, assignmentValue: string) => {
        if (!shouldRedactInlineCredentialValue(key, assignmentValue)) return match;
        const valueQuote = assignmentValue.startsWith('"') ? '"' : assignmentValue.startsWith("'") ? "'" : "";
        return `${quote}${key}${quote}${separator}${valueQuote}${REDACTED}${valueQuote}`;
      },
    )
    .replace(
      CLI_ARGUMENT_PATTERN,
      (match, prefix: string, dashes: string, key: string, separator: string, argumentValue: string) =>
        shouldRedactInlineCredentialValue(key, argumentValue)
          ? `${prefix}${dashes}${key}${separator}${REDACTED}`
          : match,
    )
    .replace(
      INLINE_ASSIGNMENT_PATTERN,
      (match, prefix: string, key: string, separator: string, assignmentValue: string) =>
        shouldRedactInlineCredentialValue(key, assignmentValue)
          ? `${prefix}${key}${separator}${REDACTED}`
          : match,
    )
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): SanitizedEventPayload {
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeValue(item, depth + 1, seen));
    }

    const output: Record<string, SanitizedEventPayload> = {};
    for (const key of Object.keys(value).sort().slice(0, MAX_COLLECTION_ITEMS)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      const safeKey = sanitizeString(key).slice(0, 128);
      if (!safeKey) continue;
      const rawValue = (value as Record<string, unknown>)[key];
      const classification = classifyCredentialKey(key);
      output[safeKey] =
        classification.kind === "sensitive"
          ? REDACTED
          : classification.kind === "metadata"
            ? sanitizeCredentialMetadataValue(rawValue, classification.valueKind)
            : sanitizeValue(rawValue, depth + 1, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeContinuityRunEventPayload(payload: unknown): SanitizedEventPayload {
  return sanitizeValue(payload, 0, new WeakSet<object>());
}

export function hashContinuityRunEventPayload(payloadJson: string): string {
  return createHash("sha256").update(payloadJson, "utf8").digest("hex");
}

function asString(value: SQLOutputValue, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  return value;
}

function asNullableString(value: SQLOutputValue, code: string): string | null {
  if (value === null) return null;
  return asString(value, code);
}

function asInteger(value: SQLOutputValue, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
  return value;
}

function parseRun(row: Row | undefined): ContinuityRun | null {
  if (!row) return null;
  const provider = asString(row.provider, "continuity_run_provider_corrupt") as ContinuityProvider;
  const status = asString(row.status, "continuity_run_status_corrupt") as ContinuityRunStatus;
  if (!PROVIDERS.has(provider)) throw new Error("continuity_run_provider_corrupt");
  if (!RUN_STATUSES.has(status)) throw new Error("continuity_run_status_corrupt");
  const pid = row.pid === null ? null : asInteger(row.pid, "continuity_run_pid_corrupt");
  return {
    run_id: asString(row.run_id, "continuity_run_id_corrupt"),
    project_id: asString(row.project_id, "continuity_run_project_corrupt"),
    task_id: asString(row.task_id, "continuity_run_task_corrupt"),
    checkpoint_id: asNullableString(row.checkpoint_id, "continuity_run_checkpoint_corrupt"),
    parent_run_id: asNullableString(row.parent_run_id, "continuity_run_parent_corrupt"),
    provider,
    account_pool_id: asString(row.account_pool_id, "continuity_run_account_pool_corrupt"),
    provider_native_session_id: asNullableString(
      row.provider_native_session_id,
      "continuity_run_native_session_corrupt",
    ),
    dispatch_id: asString(row.dispatch_id, "continuity_run_dispatch_corrupt"),
    pid,
    process_started_at: asNullableString(row.process_started_at, "continuity_run_process_started_corrupt"),
    process_fingerprint: asNullableString(row.process_fingerprint, "continuity_run_process_fingerprint_corrupt"),
    owner_instance_id: asNullableString(row.owner_instance_id, "continuity_run_owner_corrupt"),
    lease_expires_at: asNullableString(row.lease_expires_at, "continuity_run_lease_corrupt"),
    status,
    state_version: asInteger(row.state_version, "continuity_run_state_version_corrupt"),
    heartbeat_at: asNullableString(row.heartbeat_at, "continuity_run_heartbeat_corrupt"),
    last_event_sequence: asInteger(row.last_event_sequence, "continuity_run_sequence_corrupt"),
    created_at: asString(row.created_at, "continuity_run_created_at_corrupt"),
    updated_at: asString(row.updated_at, "continuity_run_updated_at_corrupt"),
  };
}

function parseEvent(row: Row): ContinuityRunEvent {
  const payloadJson = asString(row.payload_json, "continuity_run_event_payload_corrupt");
  const storedHash = asString(row.payload_sha256, "continuity_run_event_hash_corrupt");
  if (hashContinuityRunEventPayload(payloadJson) !== storedHash) {
    throw new Error("continuity_run_event_digest_mismatch");
  }
  let payload: SanitizedEventPayload;
  try {
    payload = JSON.parse(payloadJson) as SanitizedEventPayload;
  } catch {
    throw new Error("continuity_run_event_payload_corrupt");
  }
  return {
    run_id: asString(row.run_id, "continuity_run_event_run_corrupt"),
    sequence: asInteger(row.sequence, "continuity_run_event_sequence_corrupt"),
    event_type: asString(row.event_type, "continuity_run_event_type_corrupt"),
    payload,
    payload_sha256: storedHash,
    occurred_at: asString(row.occurred_at, "continuity_run_event_occurred_at_corrupt"),
    created_at: asString(row.created_at, "continuity_run_event_created_at_corrupt"),
  };
}

export class SqliteContinuityRunLedger {
  constructor(private readonly db: DbLike) {}

  reserve(input: ReserveContinuityRunInput): ReserveContinuityRunResult {
    const runId = requireNonEmpty(input.run_id, "continuity_run_id_required");
    if (!PROVIDERS.has(input.provider)) throw new Error("continuity_run_provider_invalid");
    const checkpointId =
      input.checkpoint_id == null ? null : requireNonEmpty(input.checkpoint_id, "continuity_run_checkpoint_required");
    const parentRunId = input.parent_run_id?.trim() || null;
    const checkpointOwnership = checkpointId
      ? (this.db
          .prepare(
            `SELECT project_id, task_id, source_run_id, source_provider, target_provider
             FROM continuity_checkpoints WHERE checkpoint_id = ?`,
          )
          .get(checkpointId) as
          | {
              project_id: string;
              task_id: string;
              source_run_id: string;
              source_provider: ContinuityProvider;
              target_provider: ContinuityProvider;
            }
          | undefined)
      : undefined;
    if (checkpointId && !checkpointOwnership) throw new Error("continuity_run_checkpoint_missing");
    const projectId = requireNonEmpty(
      input.project_id?.trim() || checkpointOwnership?.project_id || "",
      "continuity_run_project_required",
    );
    const taskId = requireNonEmpty(
      input.task_id?.trim() || checkpointOwnership?.task_id || "",
      "continuity_run_task_required",
    );
    if (
      checkpointOwnership &&
      (checkpointOwnership.project_id !== projectId || checkpointOwnership.task_id !== taskId)
    ) {
      throw new Error("continuity_run_checkpoint_ownership_mismatch");
    }
    const parentRun = parentRunId ? this.get(parentRunId) : null;
    if (parentRunId && !parentRun) throw new Error("continuity_run_parent_missing");
    if (parentRun && (parentRun.project_id !== projectId || parentRun.task_id !== taskId)) {
      throw new Error("continuity_run_parent_ownership_mismatch");
    }
    if (checkpointOwnership) {
      if (!parentRunId) throw new Error("continuity_run_checkpoint_parent_required");
      if (checkpointOwnership.source_run_id !== parentRunId) {
        throw new Error("continuity_run_checkpoint_source_run_mismatch");
      }
      if (parentRun?.provider !== checkpointOwnership.source_provider) {
        throw new Error("continuity_run_checkpoint_source_provider_mismatch");
      }
      if (input.provider !== checkpointOwnership.target_provider) {
        throw new Error("continuity_run_checkpoint_target_provider_mismatch");
      }
    }
    const dispatchId = requireNonEmpty(input.dispatch_id, "continuity_run_dispatch_required");
    const accountPoolId = requireNonEmpty(input.account_pool_id, "continuity_run_account_pool_required");
    const status = input.status ?? "reserved";
    if (!RUN_STATUSES.has(status)) throw new Error("continuity_run_status_invalid");
    if (input.pid !== null && input.pid !== undefined && (!Number.isSafeInteger(input.pid) || input.pid <= 0)) {
      throw new Error("continuity_run_pid_invalid");
    }
    const createdAt = normalizeTimestamp(input.created_at, "continuity_run_created_at_invalid");
    const heartbeatAt = input.heartbeat_at
      ? normalizeTimestamp(input.heartbeat_at, "continuity_run_heartbeat_invalid")
      : null;
    const processStartedAt =
      normalizeOptionalTimestamp(input.process_started_at, "continuity_run_process_started_at_invalid") ?? null;
    const processFingerprint = normalizeProcessFingerprint(input.process_fingerprint) ?? null;
    const ownerInstanceId =
      input.owner_instance_id == null
        ? null
        : requireNonEmpty(input.owner_instance_id, "continuity_run_owner_required");
    const leaseExpiresAt =
      normalizeOptionalTimestamp(input.lease_expires_at, "continuity_run_lease_expires_at_invalid") ?? null;
    if (leaseExpiresAt && !ownerInstanceId) throw new Error("continuity_run_lease_owner_required");

    const result = this.db
      .prepare(
        `INSERT INTO continuity_runs (
          run_id, project_id, task_id, checkpoint_id, parent_run_id, provider,
          account_pool_id, provider_native_session_id, dispatch_id, pid,
          process_started_at, process_fingerprint, owner_instance_id, lease_expires_at,
          status, state_version, heartbeat_at, last_event_sequence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)
        ON CONFLICT(dispatch_id) DO NOTHING`,
      )
      .run(
        runId,
        projectId,
        taskId,
        checkpointId,
        parentRunId,
        input.provider,
        accountPoolId,
        input.provider_native_session_id?.trim() || null,
        dispatchId,
        input.pid ?? null,
        processStartedAt,
        processFingerprint,
        ownerInstanceId,
        leaseExpiresAt,
        status,
        heartbeatAt,
        createdAt,
        createdAt,
      );
    const run = this.getByDispatchId(dispatchId);
    if (!run) throw new Error("continuity_run_reservation_missing");
    if (Number(result.changes) === 1) return { status: "reserved", run };
    if (
      run.run_id !== runId ||
      run.project_id !== projectId ||
      run.task_id !== taskId ||
      run.checkpoint_id !== checkpointId ||
      run.parent_run_id !== parentRunId ||
      run.provider !== input.provider ||
      run.account_pool_id !== accountPoolId
    ) {
      throw new Error("continuity_run_dispatch_identity_mismatch");
    }
    return { status: "dispatch_exists", run };
  }

  get(runId: string): ContinuityRun | null {
    return parseRun(
      this.db.prepare("SELECT * FROM continuity_runs WHERE run_id = ?").get(runId.trim()) as Row | undefined,
    );
  }

  getByDispatchId(dispatchId: string): ContinuityRun | null {
    return parseRun(
      this.db.prepare("SELECT * FROM continuity_runs WHERE dispatch_id = ?").get(dispatchId.trim()) as Row | undefined,
    );
  }

  getLatestForTask(
    projectId: string,
    taskId: string,
    statuses: readonly ContinuityRunStatus[] = [],
  ): ContinuityRun | null {
    const normalizedProjectId = requireNonEmpty(projectId, "continuity_run_project_required");
    const normalizedTaskId = requireNonEmpty(taskId, "continuity_run_task_required");
    const normalizedStatuses = [...new Set(statuses)];
    for (const status of normalizedStatuses) {
      if (!RUN_STATUSES.has(status)) throw new Error("continuity_run_status_invalid");
    }
    const statusClause =
      normalizedStatuses.length > 0 ? ` AND status IN (${normalizedStatuses.map(() => "?").join(",")})` : "";
    return parseRun(
      this.db
        .prepare(
          `SELECT * FROM continuity_runs
           WHERE project_id = ? AND task_id = ?${statusClause}
           ORDER BY created_at DESC, run_id DESC
           LIMIT 1`,
        )
        .get(normalizedProjectId, normalizedTaskId, ...normalizedStatuses) as Row | undefined,
    );
  }

  listByStatuses(statuses: readonly ContinuityRunStatus[], limit = 200): ContinuityRun[] {
    const normalizedStatuses = [...new Set(statuses)];
    if (normalizedStatuses.length === 0) return [];
    for (const status of normalizedStatuses) {
      if (!RUN_STATUSES.has(status)) throw new Error("continuity_run_status_invalid");
    }
    const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(500, limit)) : 200;
    return (
      this.db
        .prepare(
          `SELECT * FROM continuity_runs
           WHERE status IN (${normalizedStatuses.map(() => "?").join(",")})
           ORDER BY updated_at ASC, run_id ASC
           LIMIT ?`,
        )
        .all(...normalizedStatuses, boundedLimit) as Row[]
    ).map((row) => {
      const run = parseRun(row);
      if (!run) throw new Error("continuity_run_missing");
      return run;
    });
  }

  getActiveRootForTask(projectId: string, taskId: string): ContinuityRun | null {
    const normalizedProjectId = requireNonEmpty(projectId, "continuity_run_project_required");
    const normalizedTaskId = requireNonEmpty(taskId, "continuity_run_task_required");
    return parseRun(
      this.db
        .prepare(
          `SELECT * FROM continuity_runs
           WHERE project_id = ?
             AND task_id = ?
             AND parent_run_id IS NULL
             AND status IN (${ACTIVE_ROOT_STATUSES.map(() => "?").join(",")})
           ORDER BY created_at DESC, run_id DESC
           LIMIT 1`,
        )
        .get(normalizedProjectId, normalizedTaskId, ...ACTIVE_ROOT_STATUSES) as Row | undefined,
    );
  }

  /**
   * Synchronous transaction boundary for approval/reservation/state/event work.
   * Call reserve(), appendEvent(), or transitionWithEventInTransaction() inside
   * the callback; those methods do not open a nested transaction.
   */
  withImmediateTransaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the operation error if SQLite already rolled back.
      }
      throw error;
    }
  }

  updateState(runId: string, input: UpdateContinuityRunStateInput): ContinuityRun {
    const normalizedRunId = requireNonEmpty(runId, "continuity_run_id_required");
    const existing = this.get(normalizedRunId);
    if (!existing) throw new Error("continuity_run_missing");
    return this.transitionWithEvent({
      ...input,
      run_id: normalizedRunId,
      expected_state_version: existing.state_version,
      expected_status: existing.status,
      event_type: "runner.state_changed",
      payload: { from_status: existing.status, to_status: input.status },
      occurred_at: input.updated_at,
    }).run;
  }

  transitionWithEvent(input: TransitionContinuityRunWithEventInput): TransitionContinuityRunWithEventResult {
    return this.withImmediateTransaction(() => this.transitionWithEventInTransaction(input));
  }

  /** Caller must invoke this within withImmediateTransaction or an equivalent DB transaction. */
  transitionWithEventInTransaction(
    input: TransitionContinuityRunWithEventInput,
  ): TransitionContinuityRunWithEventResult {
    const runId = requireNonEmpty(input.run_id, "continuity_run_id_required");
    if (!Number.isSafeInteger(input.expected_state_version) || input.expected_state_version < 0) {
      throw new Error("continuity_run_state_version_invalid");
    }
    if (!RUN_STATUSES.has(input.status)) throw new Error("continuity_run_status_invalid");
    if (input.expected_status && !RUN_STATUSES.has(input.expected_status)) {
      throw new Error("continuity_run_expected_status_invalid");
    }
    if (input.pid !== null && input.pid !== undefined && (!Number.isSafeInteger(input.pid) || input.pid <= 0)) {
      throw new Error("continuity_run_pid_invalid");
    }
    const eventType = requireNonEmpty(input.event_type, "continuity_run_event_type_required");
    const occurredAt = normalizeTimestamp(
      input.occurred_at ?? input.updated_at,
      "continuity_run_event_occurred_at_invalid",
    );
    const heartbeatAt = normalizeOptionalTimestamp(input.heartbeat_at, "continuity_run_heartbeat_invalid");
    const processStartedAt = normalizeOptionalTimestamp(
      input.process_started_at,
      "continuity_run_process_started_at_invalid",
    );
    const processFingerprint = normalizeProcessFingerprint(input.process_fingerprint);
    const leaseExpiresAt = normalizeOptionalTimestamp(
      input.lease_expires_at,
      "continuity_run_lease_expires_at_invalid",
    );
    const existing = this.get(runId);
    if (!existing) throw new Error("continuity_run_missing");
    if (
      existing.state_version !== input.expected_state_version ||
      (input.expected_status !== undefined && existing.status !== input.expected_status)
    ) {
      throw new Error("continuity_run_state_stale");
    }
    if (!isLegalRunTransition(existing.status, input.status)) {
      throw new Error(`continuity_run_transition_invalid:${existing.status}:${input.status}`);
    }
    const ownerInstanceId =
      input.owner_instance_id === undefined
        ? existing.owner_instance_id
        : input.owner_instance_id === null
          ? null
          : requireNonEmpty(input.owner_instance_id, "continuity_run_owner_required");
    const nextLeaseExpiresAt = leaseExpiresAt === undefined ? existing.lease_expires_at : leaseExpiresAt;
    if (nextLeaseExpiresAt && !ownerInstanceId) throw new Error("continuity_run_lease_owner_required");
    const payloadJson = JSON.stringify(sanitizeContinuityRunEventPayload(input.payload));
    const payloadSha256 = hashContinuityRunEventPayload(payloadJson);
    const nextSequence = existing.last_event_sequence + 1;

    const update = this.db
      .prepare(
        `UPDATE continuity_runs
         SET status = ?, state_version = state_version + 1,
             provider_native_session_id = ?, pid = ?, process_started_at = ?,
             process_fingerprint = ?, owner_instance_id = ?, lease_expires_at = ?,
             heartbeat_at = ?, updated_at = ?
         WHERE run_id = ? AND state_version = ? AND status = ?`,
      )
      .run(
        input.status,
        input.provider_native_session_id === undefined
          ? existing.provider_native_session_id
          : input.provider_native_session_id?.trim() || null,
        input.pid === undefined ? existing.pid : input.pid,
        processStartedAt === undefined ? existing.process_started_at : processStartedAt,
        processFingerprint === undefined ? existing.process_fingerprint : processFingerprint,
        ownerInstanceId,
        nextLeaseExpiresAt,
        heartbeatAt === undefined ? existing.heartbeat_at : heartbeatAt,
        occurredAt,
        runId,
        input.expected_state_version,
        existing.status,
      );
    if (Number(update.changes) !== 1) throw new Error("continuity_run_state_stale");
    this.db
      .prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, nextSequence, eventType, payloadJson, payloadSha256, occurredAt, occurredAt);

    const run = this.get(runId);
    if (!run) throw new Error("continuity_run_missing");
    const eventRow = this.db
      .prepare("SELECT * FROM continuity_run_events WHERE run_id = ? AND sequence = ?")
      .get(runId, nextSequence) as Row | undefined;
    if (!eventRow) throw new Error("continuity_run_event_persistence_failed");
    return { run, event: parseEvent(eventRow) };
  }

  appendEvent(input: AppendContinuityRunEventInput): ContinuityRunEvent {
    const runId = requireNonEmpty(input.run_id, "continuity_run_id_required");
    if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) {
      throw new Error("continuity_run_event_sequence_invalid");
    }
    const eventType = requireNonEmpty(input.event_type, "continuity_run_event_type_required");
    const occurredAt = normalizeTimestamp(input.occurred_at, "continuity_run_event_occurred_at_invalid");
    const payloadJson = JSON.stringify(sanitizeContinuityRunEventPayload(input.payload));
    const payloadSha256 = hashContinuityRunEventPayload(payloadJson);
    this.db
      .prepare(
        `INSERT INTO continuity_run_events (
          run_id, sequence, event_type, payload_json, payload_sha256, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, input.sequence, eventType, payloadJson, payloadSha256, occurredAt, occurredAt);
    const row = this.db
      .prepare("SELECT * FROM continuity_run_events WHERE run_id = ? AND sequence = ?")
      .get(runId, input.sequence) as Row | undefined;
    if (!row) throw new Error("continuity_run_event_persistence_failed");
    return parseEvent(row);
  }

  listEvents(runId: string, afterSequence = 0, limit = 200): ContinuityRunEvent[] {
    const boundedAfter = Number.isSafeInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
    const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(500, limit)) : 200;
    return (
      this.db
        .prepare(
          `SELECT * FROM continuity_run_events
           WHERE run_id = ? AND sequence > ?
           ORDER BY sequence ASC LIMIT ?`,
        )
        .all(runId.trim(), boundedAfter, boundedLimit) as Row[]
    ).map(parseEvent);
  }
}
