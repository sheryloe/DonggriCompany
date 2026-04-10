import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { applyOAuthRunnerIsolationSchema } from "../../bootstrap/schema/oauth-runner-isolation.ts";
import { registerOfficeRunnerRoutes } from "./office-runner.ts";

describe("office runner routes", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  async function createApp() {
    const app = express();
    app.use(express.json());

    registerOfficeRunnerRoutes({
      app,
      db,
      nowMs: () => Date.now(),
      broadcast: () => {
        // no-op
      },
    } as unknown as RuntimeContext);

    return { app };
  }

  it("returns 410 for deprecated office oauth routes", async () => {
    const { app } = await createApp();

    const listResponse = await request(app).get("/api/office/oauth/sessions");
    expect(listResponse.status).toBe(410);
    expect(listResponse.body.error).toBe("oauth_rolled_back");

    const connectResponse = await request(app).post("/api/office/oauth/connect").send({
      provider: "codex",
      accountPoolId: "codex-main",
    });
    expect(connectResponse.status).toBe(410);
    expect(connectResponse.body.error).toBe("oauth_rolled_back");
  });

  it("creates cli account pools and returns login command", async () => {
    const { app } = await createApp();

    const createResponse = await request(app).post("/api/office/cli-accounts").send({
      provider: "claude",
      accountPoolId: "claude-main",
      label: "Claude Main",
    });
    expect(createResponse.status).toBe(200);
    expect(createResponse.body.pool.provider).toBe("claude");
    expect(createResponse.body.pool.accountPoolId).toBe("claude-main");

    const listResponse = await request(app).get("/api/office/cli-accounts");
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.pools)).toBe(true);
    expect(listResponse.body.pools.length).toBe(1);

    const commandResponse = await request(app).get("/api/office/cli-accounts/claude/claude-main/login-command");
    expect(commandResponse.status).toBe(200);
    expect(commandResponse.body.provider).toBe("claude");
    expect(String(commandResponse.body.command)).toContain("docker exec -it");
    expect(String(commandResponse.body.command)).toContain("claude");
  });

  it("returns 400 when accountPoolId is missing", async () => {
    const { app } = await createApp();

    const response = await request(app).post("/api/office/cli/run").send({
      provider: "codex",
      prompt: "run smoke",
      projectPath: "/app",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("account_pool_required");
  });

  it("blocks run when cli account pool is not registered", async () => {
    const { app } = await createApp();

    const response = await request(app).post("/api/office/cli/run").send({
      provider: "codex",
      accountPoolId: "codex-main",
      prompt: "run smoke",
      projectPath: "/app",
    });

    expect(response.status).toBe(412);
    expect(response.body.error).toBe("cli_not_connected");
  });
});
