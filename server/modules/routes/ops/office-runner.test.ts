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

    const events: Array<{ event: string; payload: unknown }> = [];
    registerOfficeRunnerRoutes({
      app,
      db,
      nowMs: () => Date.now(),
      broadcast: (event, payload) => {
        events.push({ event, payload });
      },
    } as RuntimeContext);

    return { app, events };
  }

  it("accepts jules provider for connect and activate flow", async () => {
    const { app } = await createApp();

    const connect = await request(app).post("/api/office/oauth/connect").send({
      provider: "jules",
      accountPoolId: "jules-main",
    });
    expect(connect.status).toBe(200);
    expect(connect.body.ok).toBe(true);
    expect(connect.body.session.provider).toBe("jules");
    expect(connect.body.session.account_pool_id).toBe("jules-main");

    const activate = await request(app).post("/api/office/runners/activate").send({
      provider: "jules",
      accountPoolId: "jules-main",
    });
    expect(activate.status).toBe(200);
    expect(activate.body.ok).toBe(true);
    expect(["active", "queued"]).toContain(activate.body.status);
  });

  it("returns 400 when accountPoolId is missing", async () => {
    const { app } = await createApp();

    const response = await request(app).post("/api/office/oauth/connect").send({
      provider: "jules",
    });

    expect(response.status).toBe(400);
  });

  it("blocks run when oauth session is not connected", async () => {
    const { app } = await createApp();

    const response = await request(app).post("/api/office/cli/run").send({
      provider: "jules",
      accountPoolId: "jules-main",
      prompt: "run smoke",
      projectPath: "D:/Donggri_Platform/DonggriCompany",
    });

    expect(response.status).toBe(412);
    expect(response.body.error).toBe("oauth_not_connected");
  });
});
