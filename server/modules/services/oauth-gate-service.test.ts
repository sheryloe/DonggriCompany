import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { applyOAuthRunnerIsolationSchema } from "../bootstrap/schema/oauth-runner-isolation.ts";
import { type OAuthGateError, OAuthGateService } from "./oauth-gate-service.ts";

describe("OAuthGateService", () => {
  let db: DatabaseSync;
  const nowBase = Date.now();
  let nowOffset = 0;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    nowOffset = 0;
  });

  afterEach(() => {
    db.close();
  });

  it("rejects execution provider when provider+pool session is disconnected", async () => {
    const service = new OAuthGateService({
      db,
      nowMs: () => nowBase + nowOffset,
    });

    await expect(service.ensureProviderPoolConnected("codex", "default")).rejects.toMatchObject({
      code: "oauth_not_connected",
      status: 412,
    } satisfies Partial<OAuthGateError>);
  });

  it("allows connected execution provider session", async () => {
    const service = new OAuthGateService({
      db,
      nowMs: () => nowBase + nowOffset,
    });
    service.connectSession("codex", "pool-a");

    const row = await service.ensureProviderPoolConnected("codex", "pool-a");
    expect(row?.status).toBe("connected");
  });

  it("marks expired/error when refresh handler is missing and token is expired", async () => {
    db.prepare(
      `INSERT INTO oauth_sessions (
          id, provider, account_pool_id, status, token_expires_at, refresh_token_expires_at,
          last_refreshed_at, refresh_fail_count, last_error, last_error_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, ?)`,
    ).run("s-1", "gemini", "pool-expired", "connected", nowBase - 1, nowBase, nowBase);

    const service = new OAuthGateService({
      db,
      nowMs: () => nowBase + nowOffset,
      refreshWindowMs: 60_000,
    });

    await expect(service.ensureProviderPoolConnected("gemini", "pool-expired")).rejects.toMatchObject({
      code: "oauth_expired",
      status: 412,
    } satisfies Partial<OAuthGateError>);

    const row = db
      .prepare("SELECT status, refresh_fail_count FROM oauth_sessions WHERE provider = ? AND account_pool_id = ?")
      .get("gemini", "pool-expired") as { status: string; refresh_fail_count: number };
    expect(row.status).toBe("expired");
    expect(row.refresh_fail_count).toBe(1);
  });

  it("refreshes near-expiry session when refresh handler succeeds", async () => {
    db.prepare(
      `INSERT INTO oauth_sessions (
          id, provider, account_pool_id, status, token_expires_at, refresh_token_expires_at,
          last_refreshed_at, refresh_fail_count, last_error, last_error_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 2, 'old', ?, ?, ?)`,
    ).run("s-2", "jules", "pool-refresh", "connected", nowBase + 10_000, nowBase - 1000, nowBase, nowBase);

    const service = new OAuthGateService({
      db,
      nowMs: () => nowBase + nowOffset,
      refreshWindowMs: 60_000,
      refreshSession: async () => ({ tokenExpiresAt: nowBase + 120_000 }),
    });

    const row = await service.ensureProviderPoolConnected("jules", "pool-refresh");
    expect(row?.status).toBe("connected");
    expect(row?.refresh_fail_count).toBe(0);
    expect((row?.token_expires_at ?? 0) > nowBase + 60_000).toBe(true);
  });
});
