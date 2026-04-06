import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { OAuthSessionService, runMigrations, runSeed } from "@workspace/db";

import { createServer } from "../app.js";

const setupDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-runners-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

test("office runner routes: activate queue and deactivate promote", async () => {
  const dbPath = setupDbPath();
  const previousDbPath = process.env.WORKSPACE_DB_PATH;
  const previousWriteToken = process.env.OFFICE_WRITE_TOKEN;
  const previousRunnerMax = process.env.OFFICE_RUNNER_MAX_ACTIVE;
  const previousRunnerDockerEnabled = process.env.OFFICE_RUNNER_DOCKER_ENABLED;
  process.env.WORKSPACE_DB_PATH = dbPath;
  process.env.OFFICE_WRITE_TOKEN = "runner-token";
  process.env.OFFICE_RUNNER_MAX_ACTIVE = "1";
  process.env.OFFICE_RUNNER_DOCKER_ENABLED = "0";

  const oauth = new OAuthSessionService(dbPath);
  oauth.upsertConnectedSession({
    provider: "codex",
    accountPoolId: "pool_codex_pro_main",
    accessTokenEncrypted: "token-a",
    refreshTokenEncrypted: null,
    tokenType: "Bearer",
    scope: "profile",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  });
  oauth.upsertConnectedSession({
    provider: "codex",
    accountPoolId: "pool_codex_plus_main",
    accessTokenEncrypted: "token-b",
    refreshTokenEncrypted: null,
    tokenType: "Bearer",
    scope: "profile",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  });

  const server = createServer();

  try {
    const activateFirst = await server.inject({
      method: "POST",
      url: "/api/office/runners/activate",
      headers: { "x-office-write-token": "runner-token" },
      payload: {
        provider: "codex",
        accountPoolId: "pool_codex_pro_main"
      }
    });
    assert.equal(activateFirst.statusCode, 200);
    const firstBody = JSON.parse(activateFirst.body) as {
      queued: boolean;
      runner: { status: string };
    };
    assert.equal(firstBody.queued, false);
    assert.equal(firstBody.runner.status, "active");

    const activateSecond = await server.inject({
      method: "POST",
      url: "/api/office/runners/activate",
      headers: { "x-office-write-token": "runner-token" },
      payload: {
        provider: "codex",
        accountPoolId: "pool_codex_plus_main"
      }
    });
    assert.equal(activateSecond.statusCode, 202);
    const secondBody = JSON.parse(activateSecond.body) as {
      queued: boolean;
      queueItem: { status: string } | null;
    };
    assert.equal(secondBody.queued, true);
    assert.equal(secondBody.queueItem?.status, "queued");

    const queueResponse = await server.inject({
      method: "GET",
      url: "/api/office/runners/queue"
    });
    assert.equal(queueResponse.statusCode, 200);
    const queueBody = JSON.parse(queueResponse.body) as {
      queue: Array<{ accountPoolId: string; status: string }>;
    };
    assert.equal(
      queueBody.queue.some(
        (item) => item.accountPoolId === "pool_codex_plus_main" && item.status === "queued"
      ),
      true
    );

    const deactivate = await server.inject({
      method: "POST",
      url: "/api/office/runners/deactivate",
      headers: { "x-office-write-token": "runner-token" },
      payload: {
        provider: "codex",
        accountPoolId: "pool_codex_pro_main",
        reason: "test-deactivate"
      }
    });
    assert.equal(deactivate.statusCode, 200);
    const deactivateBody = JSON.parse(deactivate.body) as {
      promotedQueueItem: { accountPoolId: string } | null;
    };
    assert.equal(deactivateBody.promotedQueueItem?.accountPoolId, "pool_codex_plus_main");
  } finally {
    await server.close();
    if (previousDbPath === undefined) {
      delete process.env.WORKSPACE_DB_PATH;
    } else {
      process.env.WORKSPACE_DB_PATH = previousDbPath;
    }
    if (previousWriteToken === undefined) {
      delete process.env.OFFICE_WRITE_TOKEN;
    } else {
      process.env.OFFICE_WRITE_TOKEN = previousWriteToken;
    }
    if (previousRunnerMax === undefined) {
      delete process.env.OFFICE_RUNNER_MAX_ACTIVE;
    } else {
      process.env.OFFICE_RUNNER_MAX_ACTIVE = previousRunnerMax;
    }
    if (previousRunnerDockerEnabled === undefined) {
      delete process.env.OFFICE_RUNNER_DOCKER_ENABLED;
    } else {
      process.env.OFFICE_RUNNER_DOCKER_ENABLED = previousRunnerDockerEnabled;
    }
    rmSync(dbPath, { force: true });
  }
});
