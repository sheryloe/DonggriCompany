import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runMigrations, runSeed } from "@workspace/db";

import { createServer } from "../app.js";

const setupDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-server-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const installOAuthEnv = (): Record<string, string | undefined> => {
  const previous = {
    OFFICE_OAUTH_CODEX_AUTH_URL: process.env.OFFICE_OAUTH_CODEX_AUTH_URL,
    OFFICE_OAUTH_CODEX_TOKEN_URL: process.env.OFFICE_OAUTH_CODEX_TOKEN_URL,
    OFFICE_OAUTH_CODEX_CLIENT_ID: process.env.OFFICE_OAUTH_CODEX_CLIENT_ID,
    OFFICE_OAUTH_CODEX_REDIRECT_URI: process.env.OFFICE_OAUTH_CODEX_REDIRECT_URI,
    OFFICE_OAUTH_CODEX_SCOPE: process.env.OFFICE_OAUTH_CODEX_SCOPE,
    OFFICE_OAUTH_ENCRYPTION_KEY: process.env.OFFICE_OAUTH_ENCRYPTION_KEY
  };

  process.env.OFFICE_OAUTH_CODEX_AUTH_URL = "https://auth.example.com/oauth/authorize";
  process.env.OFFICE_OAUTH_CODEX_TOKEN_URL = "https://auth.example.com/oauth/token";
  process.env.OFFICE_OAUTH_CODEX_CLIENT_ID = "client-step6";
  process.env.OFFICE_OAUTH_CODEX_REDIRECT_URI = "http://localhost:7777/api/oauth/codex/callback";
  process.env.OFFICE_OAUTH_CODEX_SCOPE = "profile";
  process.env.OFFICE_OAUTH_ENCRYPTION_KEY = "step6-encryption-key-for-tests";
  return previous;
};

const restoreEnv = (snapshot: Record<string, string | undefined>): void => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test("step6 routes: agent-models and oauth lifecycle", async () => {
  const dbPath = setupDbPath();
  const previousDbPath = process.env.WORKSPACE_DB_PATH;
  process.env.WORKSPACE_DB_PATH = dbPath;
  const oauthEnvSnapshot = installOAuthEnv();
  const originalFetch = global.fetch;

  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        access_token: "token-123",
        refresh_token: "refresh-123",
        token_type: "Bearer",
        scope: "profile",
        expires_in: 3600
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  const server = createServer();

  try {
    const upsertResponse = await server.inject({
      method: "PUT",
      url: "/api/agent-models/router",
      payload: {
        provider: "codex",
        accountPoolId: "pool_codex_pro_main",
        runtimeProfileId: "rt_codex_builder_pro_a"
      }
    });
    assert.equal(upsertResponse.statusCode, 200);

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/agent-models"
    });
    assert.equal(listResponse.statusCode, 200);
    const listBody = JSON.parse(listResponse.body) as { assignments: Array<{ agentId: string }> };
    assert.equal(listBody.assignments.some((item) => item.agentId === "router"), true);

    const oauthStartResponse = await server.inject({
      method: "POST",
      url: "/api/oauth/codex/start",
      payload: {
        accountPoolId: "pool_codex_pro_main",
        clientOrigin: "http://localhost:7777"
      }
    });
    assert.equal(oauthStartResponse.statusCode, 200);
    const oauthStartBody = JSON.parse(oauthStartResponse.body) as {
      authorizeUrl: string;
      state: string;
    };
    assert.match(oauthStartBody.authorizeUrl, /code_challenge=/);

    const callbackResponse = await server.inject({
      method: "GET",
      url: `/api/oauth/codex/callback?state=${encodeURIComponent(oauthStartBody.state)}&code=sample-code`
    });
    assert.equal(callbackResponse.statusCode, 200);
    assert.match(callbackResponse.body, /OAuth connected successfully/);

    const statusResponse = await server.inject({
      method: "GET",
      url: "/api/oauth/codex/status?accountPoolId=pool_codex_pro_main"
    });
    assert.equal(statusResponse.statusCode, 200);
    const statusBody = JSON.parse(statusResponse.body) as {
      sessions: Array<{ connected: boolean; status: string }>;
    };
    assert.equal(statusBody.sessions[0]?.connected, true);
    assert.equal(statusBody.sessions[0]?.status, "connected");

    const disconnectResponse = await server.inject({
      method: "POST",
      url: "/api/oauth/codex/disconnect",
      payload: {
        accountPoolId: "pool_codex_pro_main"
      }
    });
    assert.equal(disconnectResponse.statusCode, 200);
  } finally {
    await server.close();
    global.fetch = originalFetch;
    restoreEnv(oauthEnvSnapshot);
    if (previousDbPath === undefined) {
      delete process.env.WORKSPACE_DB_PATH;
    } else {
      process.env.WORKSPACE_DB_PATH = previousDbPath;
    }
    rmSync(dbPath, { force: true });
  }
});
