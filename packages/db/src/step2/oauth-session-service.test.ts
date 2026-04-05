import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { DbServiceError, OAuthSessionService } from "../index.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-oauth-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("OAuthSessionService supports pkce state lifecycle and connection status updates", () => {
  const dbPath = createSeededDbPath();
  const service = new OAuthSessionService(dbPath);

  try {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const created = service.createPkceState({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      stateToken: `state-${randomUUID()}`,
      codeVerifier: `verifier-${randomUUID()}-x`,
      redirectUri: "http://localhost:7777/api/oauth/codex/callback",
      clientOrigin: "http://localhost:7777",
      expiresAt
    });

    const consumed = service.consumePkceState("codex", created.stateToken);
    assert.equal(consumed.provider, "codex");
    assert.equal(consumed.accountPoolId, "pool_codex_pro_main");

    const connected = service.upsertConnectedSession({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      accessTokenEncrypted: "enc-token",
      refreshTokenEncrypted: "enc-refresh",
      tokenType: "Bearer",
      scope: "profile",
      expiresAt: new Date(Date.now() + 3600_000).toISOString()
    });
    assert.equal(connected.connected, true);

    const statuses = service.listStatus("codex", "pool_codex_pro_main");
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0]?.connected, true);

    const disconnected = service.disconnect("codex", "pool_codex_pro_main");
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.status, "disconnected");
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("OAuthSessionService rejects invalid state token consumption", () => {
  const dbPath = createSeededDbPath();
  const service = new OAuthSessionService(dbPath);

  try {
    assert.throws(
      () => service.consumePkceState("codex", `missing-${randomUUID()}`),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});
