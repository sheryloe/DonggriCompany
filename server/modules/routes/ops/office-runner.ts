import { randomUUID } from "node:crypto";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  OAuthGateError,
  OAuthGateService,
  ensureRunnerBodyProviderAndPool,
  isExecutionProvider,
} from "../../services/oauth-gate-service.ts";
import { OfficeRunnerOrchestrator, type ActivateRunnerRequestPayload } from "../../services/runner-orchestrator.ts";

type CliRunRow = {
  id: string;
  provider: string;
  account_pool_id: string;
  runner_key: string;
  prompt: string | null;
  project_path: string | null;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  queue_item_id: string | null;
  started_at: number | null;
  ended_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
};

export function registerOfficeRunnerRoutes(ctx: RuntimeContext): void {
  const { app, db, nowMs, broadcast } = ctx;
  const oauthGateService = new OAuthGateService({ db, nowMs });
  const runnerOrchestrator = new OfficeRunnerOrchestrator({ db, nowMs, broadcast });

  const pruneInterval = Math.min(Math.max(runnerOrchestrator.getConfig().idleTtlMs, 60_000), 300_000);
  const pruneTimer = setInterval(() => {
    try {
      runnerOrchestrator.pruneIdleRunners();
    } catch (error) {
      console.error("[office-runner] idle prune failed:", error);
    }
  }, pruneInterval);
  if (typeof pruneTimer.unref === "function") {
    pruneTimer.unref();
  }

  app.get("/api/office/runners", (_req, res) => {
    res.json({
      ok: true,
      maxActive: runnerOrchestrator.getConfig().maxActive,
      idleTtlMs: runnerOrchestrator.getConfig().idleTtlMs,
      dockerEnabled: runnerOrchestrator.getConfig().dockerEnabled,
      runners: runnerOrchestrator.listRunners(),
    });
  });

  app.get("/api/office/runners/queue", (_req, res) => {
    res.json({
      ok: true,
      queue: runnerOrchestrator.listQueue(),
    });
  });

  app.get("/api/office/oauth/sessions", (_req, res) => {
    res.json({
      ok: true,
      sessions: oauthGateService.listSessions(),
    });
  });

  app.post("/api/office/oauth/connect", (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      const session = oauthGateService.connectSession(provider, accountPoolId);
      res.json({ ok: true, session });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });

  app.post("/api/office/oauth/disconnect", (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      const session = oauthGateService.disconnectSession(provider, accountPoolId);
      res.json({ ok: true, session });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });

  app.post("/api/office/runners/activate", (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      const result = runnerOrchestrator.requestRunner(provider, accountPoolId, { kind: "activate" });
      res.json({
        ok: true,
        status: result.status,
        runner: result.runner,
        queueItem: result.queueItem,
      });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });

  app.post("/api/office/runners/deactivate", (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      const runner = runnerOrchestrator.deactivateRunner(provider, accountPoolId);
      if (!runner) return res.status(404).json({ error: "runner_not_found" });
      res.json({ ok: true, runner });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });

  app.post("/api/office/cli/run", async (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(payload);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      await oauthGateService.ensureProviderPoolConnected(provider, accountPoolId);

      const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
      const projectPath = typeof payload.projectPath === "string" ? payload.projectPath.trim() : "";
      const now = nowMs();
      const runId = randomUUID();
      const runnerKey = `${provider}:${accountPoolId}`;
      db.prepare(
        `INSERT INTO office_cli_runs (
            id, provider, account_pool_id, runner_key, prompt, project_path,
            status, queue_item_id, started_at, ended_at, error_message, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, NULL, NULL, ?, ?)`,
      ).run(runId, provider, accountPoolId, runnerKey, prompt || null, projectPath || null, now, now);

      const runnerRequest: ActivateRunnerRequestPayload = {
        kind: "cli_run",
        runId,
        payload: { prompt, projectPath },
      };
      const result = runnerOrchestrator.requestRunner(provider, accountPoolId, runnerRequest);
      if (result.queueItem?.id) {
        db.prepare("UPDATE office_cli_runs SET queue_item_id = ?, updated_at = ? WHERE id = ?").run(
          result.queueItem.id,
          nowMs(),
          runId,
        );
      }
      const run = getCliRunById(db, runId);
      res.json({ ok: true, status: result.status, run, runner: result.runner, queueItem: result.queueItem });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });

  app.post("/api/provider-probes/run", async (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(payload);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      await oauthGateService.ensureProviderPoolConnected(provider, accountPoolId);
      const result = runnerOrchestrator.requestRunner(provider, accountPoolId, {
        kind: "probe_run",
        payload,
      });
      res.json({ ok: true, status: result.status, runner: result.runner, queueItem: result.queueItem });
    } catch (error) {
      handleRunnerRouteError(res, error);
    }
  });
}

function getCliRunById(db: Pick<RuntimeContext["db"], "prepare">, runId: string): CliRunRow | null {
  const row = db
    .prepare(
      `SELECT id, provider, account_pool_id, runner_key, prompt, project_path,
              status, queue_item_id, started_at, ended_at, error_message, created_at, updated_at
       FROM office_cli_runs
       WHERE id = ?`,
    )
    .get(runId) as CliRunRow | undefined;
  return row ?? null;
}

function handleRunnerRouteError(
  res: {
    status: (code: number) => { json: (payload: unknown) => unknown };
  },
  error: unknown,
): void {
  if (error instanceof OAuthGateError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === "accountPoolId_required") {
    res.status(400).json({ error: "account_pool_required", message });
    return;
  }
  if (message.startsWith("unsupported_runner_provider:")) {
    res.status(400).json({ error: "unsupported_provider", message });
    return;
  }
  res.status(500).json({ error: "runner_route_failed", message });
}
