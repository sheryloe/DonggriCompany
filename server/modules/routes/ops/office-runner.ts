import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  OAuthGateError,
  ensureRunnerBodyProviderAndPool,
  isExecutionProvider,
} from "../../services/oauth-gate-service.ts";
import { OfficeRunnerOrchestrator, RUNNER_SUPERVISOR_UNBOUND } from "../../services/runner-orchestrator.ts";
import type { RunnerSupervisor } from "../../services/runner-supervisor.ts";
import { CliAccountGateError, CliAccountGateService } from "../../services/cli-account-gate-service.ts";

export type OfficeRunnerRouteOptions = {
  supervisor?: RunnerSupervisor;
};

export function registerOfficeRunnerRoutes(ctx: RuntimeContext, options: OfficeRunnerRouteOptions = {}): void {
  const { app, db, nowMs, broadcast } = ctx;
  const cliAccountGateService = new CliAccountGateService({ db, nowMs });
  const runnerOrchestrator = new OfficeRunnerOrchestrator({ db, nowMs, broadcast, supervisor: options.supervisor });
  const getResponseLang = () => resolveRunnerApiLanguage(db);

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
      readiness: runnerOrchestrator.getReadiness(),
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
    const lang = getResponseLang();
    res.status(410).json({
      error: "oauth_rolled_back",
      message: localizeRunnerApiMessage(
        "oauth_rolled_back",
        "OAuth office routes are deprecated for CLI multi-account mode",
        lang,
      ),
    });
  });

  app.post("/api/office/oauth/connect", (_req, res) => {
    const lang = getResponseLang();
    res.status(410).json({
      error: "oauth_rolled_back",
      message: localizeRunnerApiMessage(
        "oauth_rolled_back",
        "OAuth office routes are deprecated for CLI multi-account mode",
        lang,
      ),
    });
  });

  app.post("/api/office/oauth/disconnect", (_req, res) => {
    const lang = getResponseLang();
    res.status(410).json({
      error: "oauth_rolled_back",
      message: localizeRunnerApiMessage(
        "oauth_rolled_back",
        "OAuth office routes are deprecated for CLI multi-account mode",
        lang,
      ),
    });
  });

  app.get("/api/office/cli-accounts", (_req, res) => {
    res.json({
      ok: true,
      pools: cliAccountGateService.listPools(),
    });
  });

  app.post("/api/office/cli-accounts", (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const provider = typeof payload.provider === "string" ? payload.provider : "";
      const accountPoolId = typeof payload.accountPoolId === "string" ? payload.accountPoolId : "";
      const label = typeof payload.label === "string" ? payload.label : undefined;
      const pool = cliAccountGateService.createPool(provider, accountPoolId, label);
      res.json({ ok: true, pool });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.patch("/api/office/cli-accounts/:provider/:accountPoolId", (req, res) => {
    try {
      const provider = String(req.params.provider ?? "");
      const accountPoolId = String(req.params.accountPoolId ?? "");
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const label = typeof payload.label === "string" ? payload.label : undefined;
      const pool = cliAccountGateService.updatePool(provider, accountPoolId, { label });
      res.json({ ok: true, pool });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.delete("/api/office/cli-accounts/:provider/:accountPoolId", (req, res) => {
    try {
      const provider = String(req.params.provider ?? "");
      const accountPoolId = String(req.params.accountPoolId ?? "");
      cliAccountGateService.deletePool(provider, accountPoolId);
      res.json({ ok: true });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/office/cli-accounts/:provider/:accountPoolId/verify", (req, res) => {
    try {
      const provider = String(req.params.provider ?? "");
      const accountPoolId = String(req.params.accountPoolId ?? "");
      const result = cliAccountGateService.verifyPool(provider, accountPoolId);
      res.json({ ok: true, ...result });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/office/cli-accounts/codex/sync", (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const live = typeof payload.live === "boolean" ? payload.live : true;
      const result = cliAccountGateService.syncCodexPoolsFromMultiAuth({ live });
      res.json({ ok: true, pools: result.pools, accounts: result.accounts });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.get("/api/office/cli-accounts/:provider/:accountPoolId/login-command", (req, res) => {
    try {
      const provider = String(req.params.provider ?? "");
      const accountPoolId = String(req.params.accountPoolId ?? "");
      const result = cliAccountGateService.getLoginCommand(provider, accountPoolId);
      res.json({ ok: true, ...result });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/office/runners/activate", async (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      cliAccountGateService.ensureProviderPoolReady(provider, accountPoolId);
      const result = await runnerOrchestrator.requestRunner(provider, accountPoolId, { kind: "activate" });
      res.json({
        ok: true,
        status: result.status,
        runner: result.runner,
        queueItem: result.queueItem,
      });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/office/runners/deactivate", async (req, res) => {
    try {
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(req.body);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      const runner = await runnerOrchestrator.deactivateRunner(provider, accountPoolId);
      if (!runner) {
        const lang = getResponseLang();
        return res.status(404).json({
          error: "runner_not_found",
          message: localizeRunnerApiMessage("runner_not_found", "Runner not found", lang),
        });
      }
      res.json({ ok: true, runner });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/office/cli/run", async (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(payload);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      cliAccountGateService.ensureProviderPoolReady(provider, accountPoolId);
      const runId = typeof payload.runId === "string" ? payload.runId : "";
      const dispatchId = typeof payload.dispatchId === "string" ? payload.dispatchId : undefined;
      const result = await runnerOrchestrator.requestRunner(provider, accountPoolId, {
        kind: "cli_run",
        runId,
        dispatchId,
      });
      res.json({ ok: true, status: result.status, runner: result.runner, queueItem: result.queueItem });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });

  app.post("/api/provider-probes/run", async (req, res) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const { provider, accountPoolId } = ensureRunnerBodyProviderAndPool(payload);
      if (!isExecutionProvider(provider)) {
        return res.status(400).json({ error: "unsupported_provider", provider });
      }
      cliAccountGateService.ensureProviderPoolReady(provider, accountPoolId);
      const result = runnerOrchestrator.requestRunner(provider, accountPoolId, {
        kind: "probe_run",
        runId: typeof payload.runId === "string" ? payload.runId : "",
        dispatchId: typeof payload.dispatchId === "string" ? payload.dispatchId : undefined,
      });
      const resolved = await result;
      res.json({ ok: true, status: resolved.status, runner: resolved.runner, queueItem: resolved.queueItem });
    } catch (error) {
      handleRunnerRouteError(res, error, getResponseLang());
    }
  });
}

function handleRunnerRouteError(
  res: {
    status: (code: number) => { json: (payload: unknown) => unknown };
  },
  error: unknown,
  lang: "ko" | "en" = "en",
): void {
  if (error instanceof CliAccountGateError) {
    res
      .status(error.status)
      .json({ error: error.code, message: localizeRunnerApiMessage(error.code, error.message, lang) });
    return;
  }
  if (error instanceof OAuthGateError) {
    if (error.status === 400) {
      res.status(400).json({
        error: "account_pool_required",
        message: localizeRunnerApiMessage("account_pool_required", error.message, lang),
      });
      return;
    }
    res
      .status(error.status)
      .json({ error: error.code, message: localizeRunnerApiMessage(error.code, error.message, lang) });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === "accountPoolId_required") {
    res.status(400).json({
      error: "account_pool_required",
      message: localizeRunnerApiMessage("account_pool_required", message, lang),
    });
    return;
  }
  if (message.startsWith("unsupported_runner_provider:")) {
    res.status(400).json({
      error: "unsupported_provider",
      message: localizeRunnerApiMessage("unsupported_provider", message, lang),
    });
    return;
  }
  if (message === RUNNER_SUPERVISOR_UNBOUND) {
    res.status(503).json({
      error: RUNNER_SUPERVISOR_UNBOUND,
      message: localizeRunnerApiMessage(RUNNER_SUPERVISOR_UNBOUND, message, lang),
      retryable: false,
    });
    return;
  }
  if (
    message === "runner_supervisor_shutting_down" ||
    message === "runner_supervisor_boot_reconcile_failed" ||
    message === "runner_supervisor_child_state_uncertain"
  ) {
    res.status(503).json({
      error: message,
      message: localizeRunnerApiMessage(message, message, lang),
      retryable: false,
    });
    return;
  }
  if (message === "continuity_run_id_required") {
    res.status(400).json({ error: message, message: localizeRunnerApiMessage(message, message, lang) });
    return;
  }
  if (message === "continuity_run_missing") {
    res.status(404).json({ error: message, message: localizeRunnerApiMessage(message, message, lang) });
    return;
  }
  if (
    message === "continuity_run_dispatch_mismatch" ||
    message === "continuity_run_runner_identity_mismatch" ||
    message === "runner_start_ownership_uncertain" ||
    message.startsWith("runner_run_not_startable:")
  ) {
    res.status(409).json({ error: message, message: localizeRunnerApiMessage(message, message, lang) });
    return;
  }
  res
    .status(500)
    .json({ error: "runner_route_failed", message: localizeRunnerApiMessage("runner_route_failed", message, lang) });
}

function resolveRunnerApiLanguage(db: Pick<RuntimeContext["db"], "prepare">): "ko" | "en" {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'language' LIMIT 1").get() as
      | { value?: string }
      | undefined;
    if (!row?.value) return "en";
    try {
      const parsed = JSON.parse(row.value);
      return parsed === "ko" ? "ko" : "en";
    } catch {
      return row.value.trim().toLowerCase() === "ko" ? "ko" : "en";
    }
  } catch {
    return "en";
  }
}

function localizeRunnerApiMessage(code: string, fallback: string, lang: "ko" | "en"): string {
  if (lang !== "ko") return fallback;
  if (code === "oauth_rolled_back") return "OAuth 오피스 라우트는 CLI 멀티 계정 모드에서 더 이상 지원되지 않습니다.";
  if (code === "cli_install_required") return "Codex CLI가 설치되어 있지 않습니다.";
  if (code === "cli_sync_failed") return "Codex 다중 인증 풀 동기화에 실패했습니다.";
  if (code === "cli_not_connected") return "CLI 계정풀이 연결되지 않았습니다.";
  if (code === "cli_auth_required") return "CLI 인증이 필요합니다.";
  if (code === "cli_profile_error") return "CLI 프로필 경로에 오류가 있습니다.";
  if (code === "account_pool_required") return "계정풀이 필요합니다.";
  if (code === "unsupported_provider") return "지원하지 않는 provider입니다.";
  if (code === "runner_not_found") return "요청한 러너를 찾을 수 없습니다.";
  if (code === RUNNER_SUPERVISOR_UNBOUND) return "Runner Supervisor가 연결되지 않아 CLI 실행이 비활성화되어 있습니다.";
  if (code === "runner_supervisor_shutting_down")
    return "Runner Supervisor가 종료 중이라 새 실행을 시작할 수 없습니다.";
  if (code === "runner_supervisor_boot_reconcile_failed")
    return "Runner Supervisor 시작 상태 복구가 실패하여 실행이 차단되었습니다.";
  if (code === "runner_supervisor_child_state_uncertain")
    return "Runner 자식 프로세스 상태가 불확실하여 새 실행이 차단되었습니다.";
  if (code === "continuity_run_id_required") return "사전 예약된 연속 실행 ID가 필요합니다.";
  if (code === "continuity_run_missing") return "사전 예약된 연속 실행을 찾을 수 없습니다.";
  if (code === "runner_route_failed") return "러너 처리 중 오류가 발생했습니다.";
  return fallback;
}
