import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isExecutionProvider } from "./oauth-gate-service.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

export type RunnerProvider = "codex" | "gemini" | "claude" | "jules";
export type RunnerStatus = "active" | "idle" | "stopping" | "error";
export type RunnerQueueStatus = "queued" | "running" | "done" | "failed" | "canceled";

export type OfficeRunnerStatusView = {
  provider: string;
  accountPoolId: string;
  runnerKey: string;
  containerName: string;
  status: RunnerStatus;
  lastUsedAt: number;
  updatedAt: number;
};

export type OfficeRunnerQueueItemView = {
  id: string;
  provider: string;
  accountPoolId: string;
  runnerKey: string;
  status: RunnerQueueStatus;
  enqueuedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  errorMessage: string | null;
};

export type ActivateRunnerRequestPayload = {
  kind: "activate" | "cli_run" | "probe_run";
  runId?: string;
  payload?: Record<string, unknown>;
};

export type RunnerRequestResult = {
  status: "active" | "queued";
  runner: OfficeRunnerStatusView | null;
  queueItem: OfficeRunnerQueueItemView | null;
};

type RunnerOrchestratorDeps = {
  db: DbLike;
  nowMs: () => number;
  broadcast: (event: "runner.updated" | "runner.queue.updated", payload: unknown) => void;
};

type RunnerConfig = {
  dockerEnabled: boolean;
  image: string;
  network: string;
  maxActive: number;
  idleTtlMs: number;
};

type RunnerInstanceRow = {
  id: string;
  provider: string;
  account_pool_id: string;
  runner_key: string;
  container_name: string;
  status: RunnerStatus;
  last_used_at: number;
  created_at: number;
  updated_at: number;
};

type RunnerQueueRow = {
  id: string;
  provider: string;
  account_pool_id: string;
  runner_key: string;
  request_json: string;
  status: RunnerQueueStatus;
  enqueued_at: number;
  started_at: number | null;
  ended_at: number | null;
  error_message: string | null;
};

export class OfficeRunnerOrchestrator {
  private readonly db: DbLike;
  private readonly nowMs: () => number;
  private readonly broadcast: (event: "runner.updated" | "runner.queue.updated", payload: unknown) => void;
  private readonly config: RunnerConfig;

  constructor(deps: RunnerOrchestratorDeps) {
    this.db = deps.db;
    this.nowMs = deps.nowMs;
    this.broadcast = deps.broadcast;
    this.config = {
      dockerEnabled: process.env.OFFICE_RUNNER_DOCKER_ENABLED === "1",
      image: process.env.OFFICE_RUNNER_IMAGE?.trim() || "donggricompany-runner:latest",
      network: process.env.OFFICE_RUNNER_NETWORK?.trim() || "bridge",
      maxActive: parsePositiveInt(process.env.OFFICE_RUNNER_MAX_ACTIVE, 5),
      idleTtlMs: parsePositiveInt(process.env.OFFICE_RUNNER_IDLE_TTL_MS, 900_000),
    };
  }

  getConfig(): RunnerConfig {
    return { ...this.config };
  }

  listRunners(): OfficeRunnerStatusView[] {
    const rows = this.db
      .prepare(
        `SELECT provider, account_pool_id, runner_key, container_name, status, last_used_at, updated_at
         FROM office_runner_instances
         ORDER BY updated_at DESC`,
      )
      .all() as Array<{
      provider: string;
      account_pool_id: string;
      runner_key: string;
      container_name: string;
      status: RunnerStatus;
      last_used_at: number;
      updated_at: number;
    }>;
    return rows.map((row) => this.toRunnerView(row));
  }

  listQueue(): OfficeRunnerQueueItemView[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, runner_key, status, enqueued_at, started_at, ended_at, error_message
         FROM office_runner_queue
         ORDER BY enqueued_at ASC`,
      )
      .all() as Array<{
      id: string;
      provider: string;
      account_pool_id: string;
      runner_key: string;
      status: RunnerQueueStatus;
      enqueued_at: number;
      started_at: number | null;
      ended_at: number | null;
      error_message: string | null;
    }>;
    return rows.map((row) => this.toQueueView(row));
  }

  requestRunner(
    provider: string,
    accountPoolId: string,
    requestPayload: ActivateRunnerRequestPayload,
  ): RunnerRequestResult {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!isExecutionProvider(normalizedProvider)) {
      throw new Error(`unsupported_runner_provider:${provider}`);
    }
    const pool = accountPoolId.trim();
    if (!pool) throw new Error("accountPoolId_required");

    this.pruneIdleRunners();
    const now = this.nowMs();
    const runnerKey = toRunnerKey(normalizedProvider, pool);
    const existing = this.getRunner(normalizedProvider, pool);

    if (existing?.status === "active") {
      this.touchRunner(existing.id, now);
      const result = this.executePayload(existing, requestPayload);
      if (!result.ok) {
        throw new Error(result.errorMessage ?? "runner_payload_failed");
      }
      return {
        status: "active",
        runner: this.toRunnerView(this.mustGetRunner(normalizedProvider, pool)),
        queueItem: null,
      };
    }

    if (this.countActiveRunners() >= this.config.maxActive) {
      const queueItem = this.enqueueRequest(normalizedProvider, pool, runnerKey, requestPayload);
      this.broadcast("runner.queue.updated", { queue: this.listQueue(), changed: queueItem });
      return { status: "queued", runner: null, queueItem };
    }

    const activated = this.activateRunner(normalizedProvider, pool, existing?.id ?? null);
    const executionResult = this.executePayload(activated, requestPayload);
    if (!executionResult.ok) {
      this.markRunnerError(activated.id, executionResult.errorMessage ?? "runner_execute_failed");
      this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey });
      throw new Error(executionResult.errorMessage ?? "runner_execute_failed");
    }
    this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey });
    this.promoteQueue();
    return {
      status: "active",
      runner: this.toRunnerView(this.mustGetRunner(normalizedProvider, pool)),
      queueItem: null,
    };
  }

  deactivateRunner(provider: string, accountPoolId: string): OfficeRunnerStatusView | null {
    const normalizedProvider = provider.trim().toLowerCase();
    const pool = accountPoolId.trim();
    const existing = this.getRunner(normalizedProvider, pool);
    if (!existing) return null;
    const now = this.nowMs();
    this.db
      .prepare("UPDATE office_runner_instances SET status = 'stopping', updated_at = ? WHERE id = ?")
      .run(now, existing.id);
    try {
      this.stopRunnerContainer(existing.container_name);
      this.db
        .prepare("UPDATE office_runner_instances SET status = 'idle', last_used_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, existing.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.markRunnerError(existing.id, message);
    }
    this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey: existing.runner_key });
    this.promoteQueue();
    return this.toRunnerView(this.mustGetRunner(normalizedProvider, pool));
  }

  pruneIdleRunners(): void {
    const threshold = this.nowMs() - this.config.idleTtlMs;
    const rows = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, runner_key, container_name, status, last_used_at, created_at, updated_at
         FROM office_runner_instances
         WHERE status = 'active' AND last_used_at < ?`,
      )
      .all(threshold) as RunnerInstanceRow[];
    if (rows.length === 0) return;

    const now = this.nowMs();
    for (const row of rows) {
      try {
        this.stopRunnerContainer(row.container_name);
        this.db
          .prepare("UPDATE office_runner_instances SET status = 'idle', updated_at = ?, last_used_at = ? WHERE id = ?")
          .run(now, now, row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.markRunnerError(row.id, message);
      }
    }
    this.broadcast("runner.updated", { runners: this.listRunners() });
    this.promoteQueue();
  }

  private countActiveRunners(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS cnt FROM office_runner_instances WHERE status = 'active'")
      .get() as { cnt: number };
    return row.cnt;
  }

  private enqueueRequest(
    provider: string,
    accountPoolId: string,
    runnerKey: string,
    requestPayload: ActivateRunnerRequestPayload,
  ): OfficeRunnerQueueItemView {
    const now = this.nowMs();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO office_runner_queue (
            id, provider, account_pool_id, runner_key, request_json, status,
            enqueued_at, started_at, ended_at, error_message
         ) VALUES (?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL)`,
      )
      .run(id, provider, accountPoolId, runnerKey, JSON.stringify(requestPayload), now);
    return this.toQueueView({
      id,
      provider,
      account_pool_id: accountPoolId,
      runner_key: runnerKey,
      status: "queued",
      enqueued_at: now,
      started_at: null,
      ended_at: null,
      error_message: null,
    });
  }

  private promoteQueue(): void {
    this.pruneDoneQueueRows();
    let activeCount = this.countActiveRunners();
    if (activeCount >= this.config.maxActive) return;

    while (activeCount < this.config.maxActive) {
      const candidate = this.db
        .prepare(
          `SELECT id, provider, account_pool_id, runner_key, request_json, status,
                  enqueued_at, started_at, ended_at, error_message
           FROM office_runner_queue
           WHERE status = 'queued'
           ORDER BY enqueued_at ASC
           LIMIT 1`,
        )
        .get() as RunnerQueueRow | undefined;
      if (!candidate) break;

      const now = this.nowMs();
      this.db
        .prepare("UPDATE office_runner_queue SET status = 'running', started_at = ? WHERE id = ?")
        .run(now, candidate.id);

      let queueStatus: RunnerQueueStatus = "done";
      let queueError: string | null = null;
      try {
        const runner = this.activateRunner(candidate.provider, candidate.account_pool_id);
        const payload = parseRequestPayload(candidate.request_json);
        const result = this.executePayload(runner, payload);
        if (!result.ok) {
          queueStatus = "failed";
          queueError = result.errorMessage ?? "runner_execute_failed";
          this.markRunnerError(runner.id, queueError);
        }
      } catch (error) {
        queueStatus = "failed";
        queueError = error instanceof Error ? error.message : String(error);
      }

      const endedAt = this.nowMs();
      this.db
        .prepare("UPDATE office_runner_queue SET status = ?, ended_at = ?, error_message = ? WHERE id = ?")
        .run(queueStatus, endedAt, queueError, candidate.id);
      this.broadcast("runner.queue.updated", { queue: this.listQueue(), changedId: candidate.id });
      this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey: candidate.runner_key });

      activeCount = this.countActiveRunners();
      if (queueStatus === "failed") break;
    }
  }

  private activateRunner(provider: string, accountPoolId: string, existingId: string | null = null): RunnerInstanceRow {
    const now = this.nowMs();
    const runnerKey = toRunnerKey(provider, accountPoolId);
    const containerName = toContainerName(provider, accountPoolId);
    const id = existingId ?? randomUUID();

    try {
      this.startRunnerContainer(containerName, runnerKey);
      this.db
        .prepare(
          `INSERT INTO office_runner_instances (
              id, provider, account_pool_id, runner_key, container_name, status, last_used_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
           ON CONFLICT(provider, account_pool_id) DO UPDATE SET
             runner_key = excluded.runner_key,
             container_name = excluded.container_name,
             status = 'active',
             last_used_at = excluded.last_used_at,
             updated_at = excluded.updated_at`,
        )
        .run(id, provider, accountPoolId, runnerKey, containerName, now, now, now);
      return this.mustGetRunner(provider, accountPoolId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db
        .prepare(
          `INSERT INTO office_runner_instances (
              id, provider, account_pool_id, runner_key, container_name, status, last_used_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'error', ?, ?, ?)
           ON CONFLICT(provider, account_pool_id) DO UPDATE SET
             status = 'error',
             updated_at = excluded.updated_at`,
        )
        .run(id, provider, accountPoolId, runnerKey, containerName, now, now, now);
      throw new Error(message);
    }
  }

  private executePayload(
    runner: RunnerInstanceRow,
    payload: ActivateRunnerRequestPayload,
  ): { ok: true } | { ok: false; errorMessage: string } {
    const now = this.nowMs();
    this.touchRunner(runner.id, now);
    if (payload.kind !== "cli_run" || !payload.runId) {
      return { ok: true };
    }

    try {
      this.db
        .prepare(
          `UPDATE office_cli_runs
           SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
           WHERE id = ?`,
        )
        .run(now, now, payload.runId);
      this.db
        .prepare(
          `UPDATE office_cli_runs
           SET status = 'done', ended_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(now, now, payload.runId);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db
        .prepare(
          `UPDATE office_cli_runs
           SET status = 'failed', ended_at = ?, updated_at = ?, error_message = ?
           WHERE id = ?`,
        )
        .run(now, now, message.slice(0, 500), payload.runId);
      return { ok: false, errorMessage: message };
    }
  }

  private touchRunner(id: string, now: number): void {
    this.db
      .prepare("UPDATE office_runner_instances SET status = 'active', last_used_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  private markRunnerError(id: string, message: string): void {
    const now = this.nowMs();
    this.db.prepare("UPDATE office_runner_instances SET status = 'error', updated_at = ? WHERE id = ?").run(now, id);
    this.broadcast("runner.updated", { runners: this.listRunners(), error: message.slice(0, 500) });
  }

  private getRunner(provider: string, accountPoolId: string): RunnerInstanceRow | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, runner_key, container_name, status, last_used_at, created_at, updated_at
         FROM office_runner_instances
         WHERE provider = ? AND account_pool_id = ?`,
      )
      .get(provider, accountPoolId) as RunnerInstanceRow | undefined;
    return row ?? null;
  }

  private mustGetRunner(provider: string, accountPoolId: string): RunnerInstanceRow {
    const row = this.getRunner(provider, accountPoolId);
    if (!row) throw new Error(`runner_missing:${provider}:${accountPoolId}`);
    return row;
  }

  private startRunnerContainer(containerName: string, runnerKey: string): void {
    if (!this.config.dockerEnabled) return;
    const volumeName = toVolumeName(runnerKey);
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--restart",
        "unless-stopped",
        "--name",
        containerName,
        "--network",
        this.config.network,
        "-v",
        `${volumeName}:/runner-data`,
        this.config.image,
      ],
      { stdio: "pipe", timeout: 20_000 },
    );
  }

  private stopRunnerContainer(containerName: string): void {
    if (!this.config.dockerEnabled) return;
    try {
      execFileSync("docker", ["stop", containerName], { stdio: "pipe", timeout: 10_000 });
    } catch {
      // ignore stop errors
    }
    try {
      execFileSync("docker", ["rm", containerName], { stdio: "pipe", timeout: 10_000 });
    } catch {
      // ignore remove errors
    }
  }

  private pruneDoneQueueRows(): void {
    this.db
      .prepare(
        `DELETE FROM office_runner_queue
         WHERE status IN ('done','failed','canceled')
           AND ended_at IS NOT NULL
           AND ended_at < ?`,
      )
      .run(this.nowMs() - 3 * 24 * 60 * 60 * 1000);
  }

  private toRunnerView(row: {
    provider: string;
    account_pool_id: string;
    runner_key: string;
    container_name: string;
    status: RunnerStatus;
    last_used_at: number;
    updated_at: number;
  }): OfficeRunnerStatusView {
    return {
      provider: row.provider,
      accountPoolId: row.account_pool_id,
      runnerKey: row.runner_key,
      containerName: row.container_name,
      status: row.status,
      lastUsedAt: row.last_used_at,
      updatedAt: row.updated_at,
    };
  }

  private toQueueView(row: {
    id: string;
    provider: string;
    account_pool_id: string;
    runner_key: string;
    status: RunnerQueueStatus;
    enqueued_at: number;
    started_at: number | null;
    ended_at: number | null;
    error_message: string | null;
  }): OfficeRunnerQueueItemView {
    return {
      id: row.id,
      provider: row.provider,
      accountPoolId: row.account_pool_id,
      runnerKey: row.runner_key,
      status: row.status,
      enqueuedAt: row.enqueued_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      errorMessage: row.error_message,
    };
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function sanitizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function toRunnerKey(provider: string, accountPoolId: string): string {
  return `${provider}:${accountPoolId}`;
}

function toContainerName(provider: string, accountPoolId: string): string {
  const providerSafe = sanitizeToken(provider) || "runner";
  const poolSafe = sanitizeToken(accountPoolId) || "pool";
  return `office-runner-${providerSafe}-${poolSafe}`;
}

function toVolumeName(runnerKey: string): string {
  return `office-runner-vol-${sanitizeToken(runnerKey) || "default"}`;
}

function parseRequestPayload(raw: string): ActivateRunnerRequestPayload {
  try {
    const parsed = JSON.parse(raw) as ActivateRunnerRequestPayload;
    if (!parsed || typeof parsed !== "object") return { kind: "activate" };
    if (parsed.kind !== "activate" && parsed.kind !== "cli_run" && parsed.kind !== "probe_run") {
      return { kind: "activate" };
    }
    return parsed;
  } catch {
    return { kind: "activate" };
  }
}
