import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "prepare">;

export type ExecutionProvider = "codex" | "gemini" | "jules";
const EXECUTION_PROVIDERS = new Set<ExecutionProvider>(["codex", "gemini", "jules"]);

export function isExecutionProvider(value: string): value is ExecutionProvider {
  return EXECUTION_PROVIDERS.has(value as ExecutionProvider);
}

export interface OAuthSessionRow {
  id: string;
  provider: string;
  account_pool_id: string;
  status: "connected" | "expired" | "error" | "disconnected";
  token_expires_at: number | null;
  refresh_token_expires_at: number | null;
  last_refreshed_at: number | null;
  refresh_fail_count: number;
  last_error: string | null;
  last_error_at: number | null;
  created_at: number;
  updated_at: number;
}

export class OAuthGateError extends Error {
  readonly code: "oauth_not_connected" | "oauth_expired" | "oauth_refresh_failed" | "oauth_error";
  readonly status: number;

  constructor(code: OAuthGateError["code"], status: number, message: string) {
    super(message);
    this.name = "OAuthGateError";
    this.code = code;
    this.status = status;
  }
}

type OAuthGateServiceDeps = {
  db: DbLike;
  nowMs: () => number;
  refreshWindowMs?: number;
  refreshSession?: (session: OAuthSessionRow) => Promise<{ tokenExpiresAt?: number | null } | null>;
};

export class OAuthGateService {
  private readonly db: DbLike;
  private readonly nowMs: () => number;
  private readonly refreshWindowMs: number;
  private readonly refreshSession:
    | ((session: OAuthSessionRow) => Promise<{ tokenExpiresAt?: number | null } | null>)
    | null;

  constructor(deps: OAuthGateServiceDeps) {
    this.db = deps.db;
    this.nowMs = deps.nowMs;
    this.refreshWindowMs = deps.refreshWindowMs ?? 60_000;
    this.refreshSession = deps.refreshSession ?? null;
  }

  listSessions(): OAuthSessionRow[] {
    return this.db
      .prepare(
        `SELECT id, provider, account_pool_id, status, token_expires_at,
                refresh_token_expires_at, last_refreshed_at, refresh_fail_count, last_error, last_error_at,
                created_at, updated_at
         FROM oauth_sessions
         ORDER BY provider ASC, account_pool_id ASC`,
      )
      .all() as unknown as OAuthSessionRow[];
  }

  connectSession(provider: string, accountPoolId: string): OAuthSessionRow {
    const now = this.nowMs();
    const existing = this.getSession(provider, accountPoolId);
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO oauth_sessions (
            id, provider, account_pool_id, status, token_expires_at,
            refresh_token_expires_at, last_refreshed_at, refresh_fail_count, last_error, last_error_at,
            created_at, updated_at
         ) VALUES (?, ?, ?, 'connected', NULL, NULL, ?, 0, NULL, NULL, ?, ?)
         ON CONFLICT(provider, account_pool_id) DO UPDATE SET
           status = 'connected',
           last_refreshed_at = excluded.last_refreshed_at,
           refresh_fail_count = 0,
           last_error = NULL,
           last_error_at = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(id, provider, accountPoolId, now, existing?.created_at ?? now, now);
    return this.mustGetSession(provider, accountPoolId);
  }

  disconnectSession(provider: string, accountPoolId: string): OAuthSessionRow {
    const now = this.nowMs();
    const existing = this.getSession(provider, accountPoolId);
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO oauth_sessions (
            id, provider, account_pool_id, status, token_expires_at,
            refresh_token_expires_at, last_refreshed_at, refresh_fail_count, last_error, last_error_at,
            created_at, updated_at
         ) VALUES (?, ?, ?, 'disconnected', NULL, NULL, NULL, 0, NULL, NULL, ?, ?)
         ON CONFLICT(provider, account_pool_id) DO UPDATE SET
           status = 'disconnected',
           updated_at = excluded.updated_at`,
      )
      .run(id, provider, accountPoolId, existing?.created_at ?? now, now);
    return this.mustGetSession(provider, accountPoolId);
  }

  async ensureProviderPoolConnected(provider: string, accountPoolId: string): Promise<OAuthSessionRow | null> {
    if (!isExecutionProvider(provider)) return null;

    const session = this.getSession(provider, accountPoolId);
    if (!session || session.status === "disconnected") {
      throw new OAuthGateError("oauth_not_connected", 412, `OAuth is not connected for ${provider}:${accountPoolId}`);
    }
    if (session.status === "error") {
      throw new OAuthGateError("oauth_error", 412, `OAuth is in error state for ${provider}:${accountPoolId}`);
    }

    const now = this.nowMs();
    const expiresAt = session.token_expires_at;
    const shouldRefresh = typeof expiresAt === "number" && expiresAt <= now + this.refreshWindowMs;

    if (!shouldRefresh && session.status === "connected") {
      return session;
    }

    if (!this.refreshSession) {
      const nextStatus = typeof expiresAt === "number" && expiresAt <= now ? "expired" : "error";
      this.markRefreshFailed(session, `${provider}:${accountPoolId} refresh handler is not configured`, nextStatus);
      throw new OAuthGateError(
        nextStatus === "expired" ? "oauth_expired" : "oauth_refresh_failed",
        412,
        `OAuth refresh failed for ${provider}:${accountPoolId}`,
      );
    }

    try {
      const refreshed = await this.refreshSession(session);
      const nextExpiresAt = refreshed?.tokenExpiresAt ?? session.token_expires_at ?? null;
      const updateSql = `UPDATE oauth_sessions
                         SET status = 'connected',
                             token_expires_at = ?,
                             last_refreshed_at = ?,
                             refresh_fail_count = 0,
                             last_error = NULL,
                             last_error_at = NULL,
                             updated_at = ?
                         WHERE provider = ? AND account_pool_id = ?`;
      this.db.prepare(updateSql).run(nextExpiresAt, now, now, provider, accountPoolId);
      return this.mustGetSession(provider, accountPoolId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expired = typeof expiresAt === "number" && expiresAt <= now;
      this.markRefreshFailed(session, message, expired ? "expired" : "error");
      throw new OAuthGateError(expired ? "oauth_expired" : "oauth_refresh_failed", 412, message);
    }
  }

  private markRefreshFailed(
    session: OAuthSessionRow,
    message: string,
    nextStatus: "expired" | "error",
  ): void {
    const now = this.nowMs();
    this.db
      .prepare(
        `UPDATE oauth_sessions
         SET status = ?,
             refresh_fail_count = COALESCE(refresh_fail_count, 0) + 1,
             last_error = ?,
             last_error_at = ?,
             updated_at = ?
         WHERE provider = ? AND account_pool_id = ?`,
      )
      .run(nextStatus, message.slice(0, 500), now, now, session.provider, session.account_pool_id);
  }

  private getSession(provider: string, accountPoolId: string): OAuthSessionRow | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, status, token_expires_at,
                refresh_token_expires_at, last_refreshed_at, refresh_fail_count, last_error, last_error_at,
                created_at, updated_at
         FROM oauth_sessions
         WHERE provider = ? AND account_pool_id = ?`,
      )
      .get(provider, accountPoolId) as OAuthSessionRow | undefined;
    return row ?? null;
  }

  private mustGetSession(provider: string, accountPoolId: string): OAuthSessionRow {
    const row = this.getSession(provider, accountPoolId);
    if (!row) {
      throw new Error(`oauth_session_missing:${provider}:${accountPoolId}`);
    }
    return row;
  }
}

export function normalizePoolId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export function normalizeProvider(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export function normalizeRunnerBodyProviderAndPool(body: unknown): { provider: string; accountPoolId: string } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const provider = normalizeProvider(payload.provider);
  const accountPoolId = normalizePoolId(payload.accountPoolId);
  return { provider, accountPoolId };
}

export function ensureRunnerBodyProviderAndPool(body: unknown): { provider: string; accountPoolId: string } {
  const parsed = normalizeRunnerBodyProviderAndPool(body);
  if (!parsed.provider || !parsed.accountPoolId) {
    throw new OAuthGateError(
      "oauth_not_connected",
      400,
      "provider and accountPoolId are required for runner-gated execution",
    );
  }
  return parsed;
}
