import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { applyOAuthRunnerIsolationSchema } from "../../bootstrap/schema/oauth-runner-isolation.ts";
import { applyContinuityCheckpointSchema } from "../../bootstrap/schema/continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "../../bootstrap/schema/continuity-run-schema.ts";
import { registerOfficeRunnerRoutes } from "./office-runner.ts";
import { CliAccountGateService } from "../../services/cli-account-gate-service.ts";
import { RunnerSupervisor, type RunnerChildPort } from "../../services/runner-supervisor.ts";
import { SqliteContinuityRunLedger } from "../../workflow/continuity/run-ledger.ts";

describe("office runner routes", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    applyContinuityCheckpointSchema(db);
    applyContinuityRunSchema(db);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  async function createApp(supervisor?: RunnerSupervisor) {
    const app = express();
    app.use(express.json());

    registerOfficeRunnerRoutes(
      {
        app,
        db,
        nowMs: () => Date.now(),
        broadcast: () => {
          // no-op
        },
      } as unknown as RuntimeContext,
      { supervisor },
    );

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

  it("creates cli account pools but fails closed for the unbound host-native login command", async () => {
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
    expect(commandResponse.status).toBe(503);
    expect(commandResponse.body).toMatchObject({
      error: "runner_supervisor_unbound",
    });
    expect(JSON.stringify(commandResponse.body)).not.toContain("docker exec");
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

  it("fails closed after readiness and before persisting a CLI prompt", async () => {
    const readiness = vi.spyOn(CliAccountGateService.prototype, "ensureProviderPoolReady").mockReturnValue({
      id: "pool-row",
      provider: "codex",
      accountPoolId: "codex-main",
      label: "Codex Main",
      profileHome: "/profiles/codex-main",
      status: "connected",
      lastVerifiedAt: Date.now(),
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { app } = await createApp();

    const response = await request(app).post("/api/office/cli/run").send({
      provider: "codex",
      accountPoolId: "codex-main",
      prompt: "raw prompt must never be stored",
      projectPath: "C:/workspace",
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "runner_supervisor_unbound",
      retryable: false,
    });
    expect(readiness).toHaveBeenCalledWith("codex", "codex-main");
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_cli_runs").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_runner_instances").get() as { count: number }).count).toBe(
      0,
    );
  });

  it("reports activate and probe as an explicit non-retryable Supervisor hold", async () => {
    vi.spyOn(CliAccountGateService.prototype, "ensureProviderPoolReady").mockReturnValue({
      id: "pool-row",
      provider: "codex",
      accountPoolId: "codex-main",
      label: "Codex Main",
      profileHome: "/profiles/codex-main",
      status: "connected",
      lastVerifiedAt: Date.now(),
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { app } = await createApp();
    const payload = { provider: "codex", accountPoolId: "codex-main" };

    const activate = await request(app).post("/api/office/runners/activate").send(payload);
    const probe = await request(app).post("/api/provider-probes/run").send(payload);

    for (const response of [activate, probe]) {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: "runner_supervisor_unbound",
        retryable: false,
      });
    }
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_runner_instances").get() as { count: number }).count).toBe(
      0,
    );
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get() as { count: number }).count).toBe(0);
  });

  it("starts an already reserved run through an injected fake Supervisor without persisting prompt fields", async () => {
    vi.spyOn(CliAccountGateService.prototype, "ensureProviderPoolReady").mockReturnValue({
      id: "pool-row",
      provider: "codex",
      accountPoolId: "codex-main",
      label: "Codex Main",
      profileHome: "/profiles/codex-main",
      status: "connected",
      lastVerifiedAt: Date.now(),
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    let spawnCount = 0;
    const childPort: RunnerChildPort = {
      bound: true,
      start: () => {
        spawnCount += 1;
        return {
          pid: 6060,
          processStartedAt: "2026-08-29T00:00:00.000Z",
          processFingerprint: "d".repeat(64),
          providerNativeSessionId: "native-route-1",
        };
      },
      close: () => ({
        acknowledged: true,
        alive: false,
        pid: 6060,
        processFingerprint: "d".repeat(64),
      }),
    };
    const supervisor = new RunnerSupervisor(db, { childPort, instanceId: "route-test" });
    new SqliteContinuityRunLedger(db).reserve({
      run_id: "run-route-1",
      project_id: "project-1",
      task_id: "task-1",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "codex-main",
      dispatch_id: "dispatch-route-1",
      created_at: "2026-08-29T00:00:00.000Z",
    });
    const { app } = await createApp(supervisor);

    const response = await request(app).post("/api/office/cli/run").send({
      provider: "codex",
      accountPoolId: "codex-main",
      runId: "run-route-1",
      dispatchId: "dispatch-route-1",
      prompt: "must not persist",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      status: "active",
      runner: { status: "active", containerName: "host-native:run-route-1" },
    });
    expect(spawnCount).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_cli_runs").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM office_runner_queue").get() as { count: number }).count).toBe(0);
  });

  it("syncs codex pools from the dedicated route", async () => {
    vi.spyOn(CliAccountGateService.prototype, "syncCodexPoolsFromMultiAuth").mockReturnValue({
      pools: [
        {
          id: "codex-main",
          provider: "codex",
          accountPoolId: "codex-main",
          label: "Codex Main",
          profileHome: "/app/.office-accounts/codex/codex-main",
          status: "connected",
          lastVerifiedAt: Date.now(),
          lastError: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      accounts: [
        {
          index: 0,
          poolId: "codex-main",
          label: "Codex Main",
          isCurrent: true,
          availability: "ready",
          riskScore: 0,
          waitMs: 0,
          usageSummary: "5h 99% left",
          lastUsedAt: 1710000000000,
          expiresAt: 1711000000000,
          source: "auth_report",
        },
      ],
    });

    const { app } = await createApp();
    const response = await request(app).post("/api/office/cli-accounts/codex/sync").send({ live: true });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.pools)).toBe(true);
    expect(Array.isArray(response.body.accounts)).toBe(true);
    expect(response.body.accounts[0]?.source).toBe("auth_report");
  });
});
