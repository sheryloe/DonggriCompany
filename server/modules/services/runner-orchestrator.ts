import type { DatabaseSync } from "node:sqlite";
import { isExecutionProvider } from "./oauth-gate-service.ts";
import { RUNNER_SUPERVISOR_UNBOUND, runnerSupervisorRegistry } from "./runner-supervisor.ts";
import type { RunnerSupervisor } from "./runner-supervisor.ts";
import type { ContinuityRun, ContinuityRunStatus } from "../workflow/continuity/run-ledger.ts";

export { RUNNER_SUPERVISOR_UNBOUND } from "./runner-supervisor.ts";

export type RunnerProvider = "codex" | "claude";
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
  dispatchId?: string;
};

export type RunnerRequestResult = {
  status: RunnerStatus | "queued";
  runner: OfficeRunnerStatusView | null;
  queueItem: OfficeRunnerQueueItemView | null;
};

type RunnerOrchestratorDeps = {
  db: DatabaseSync;
  nowMs: () => number;
  broadcast: (event: "runner.updated" | "runner.queue.updated", payload: unknown) => void;
  supervisor?: RunnerSupervisor;
};

type RunnerConfig = {
  dockerEnabled: false;
  image: string;
  network: string;
  maxActive: number;
  idleTtlMs: number;
};

const ALL_RUN_STATUSES: readonly ContinuityRunStatus[] = [
  "reserved",
  "starting",
  "running",
  "pause_requested",
  "paused",
  "dispatch_uncertain",
  "stale",
  "completed",
  "failed",
  "canceled",
];

/**
 * Backward-compatible Office API projection over the single durable
 * RunnerSupervisor. It does not own a queue, persist prompts, or spawn a fake
 * "done" runner. New workflow code should call RunnerSupervisor directly.
 */
export class OfficeRunnerOrchestrator {
  private readonly supervisor: RunnerSupervisor;
  private readonly broadcast: RunnerOrchestratorDeps["broadcast"];
  private readonly config: RunnerConfig;

  constructor(deps: RunnerOrchestratorDeps) {
    this.supervisor = deps.supervisor ?? runnerSupervisorRegistry.getOrCreate(deps.db);
    this.broadcast = deps.broadcast;
    this.config = {
      dockerEnabled: false,
      image: "host-native-supervisor",
      network: "none",
      maxActive: parsePositiveInt(process.env.OFFICE_RUNNER_MAX_ACTIVE, 5),
      idleTtlMs: parsePositiveInt(process.env.OFFICE_RUNNER_IDLE_TTL_MS, 900_000),
    };
    void deps.nowMs;
  }

  getConfig(): RunnerConfig {
    return { ...this.config };
  }

  getReadiness() {
    return this.supervisor.getReadiness();
  }

  listRunners(): OfficeRunnerStatusView[] {
    return latestPerRunner(this.supervisor.listRuns(ALL_RUN_STATUSES)).map(toRunnerView);
  }

  listQueue(): OfficeRunnerQueueItemView[] {
    return this.supervisor.listRuns(ALL_RUN_STATUSES).map(toQueueView);
  }

  async requestRunner(
    provider: string,
    accountPoolId: string,
    requestPayload: ActivateRunnerRequestPayload,
  ): Promise<RunnerRequestResult> {
    const normalizedProvider = normalizeProvider(provider);
    const pool = requirePool(accountPoolId);
    const readiness = this.supervisor.getReadiness();
    if (!readiness.ready) throw new Error(readiness.reason ?? RUNNER_SUPERVISOR_UNBOUND);

    if (requestPayload.kind === "activate") {
      const latest = this.findLatest(normalizedProvider, pool);
      const runner = latest ? toRunnerView(latest) : null;
      return {
        status: runner?.status ?? "idle",
        runner,
        queueItem: latest ? toQueueView(latest) : null,
      };
    }

    const runId = requestPayload.runId?.trim();
    if (!runId) throw new Error("continuity_run_id_required");
    const reserved = this.supervisor.getRun(runId);
    if (!reserved) throw new Error("continuity_run_missing");
    if (reserved.provider !== normalizedProvider || reserved.account_pool_id !== pool) {
      throw new Error("continuity_run_runner_identity_mismatch");
    }
    const run = await this.supervisor.startReserved(runId, requestPayload.dispatchId);
    const runner = toRunnerView(run);
    const queueItem = toQueueView(run);
    this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey: runner.runnerKey });
    this.broadcast("runner.queue.updated", { queue: this.listQueue(), runId: run.run_id });
    return { status: runner.status, runner, queueItem };
  }

  async deactivateRunner(provider: string, accountPoolId: string): Promise<OfficeRunnerStatusView | null> {
    const normalizedProvider = normalizeProvider(provider);
    const pool = requirePool(accountPoolId);
    const candidate = this.supervisor
      .listRuns(["running", "pause_requested"])
      .find((run) => run.provider === normalizedProvider && run.account_pool_id === pool);
    if (!candidate) return null;
    const paused = await this.supervisor.pause(candidate.run_id, "office_compatibility_deactivate");
    const view = toRunnerView(paused);
    this.broadcast("runner.updated", { runners: this.listRunners(), runnerKey: view.runnerKey });
    this.broadcast("runner.queue.updated", { queue: this.listQueue(), runId: paused.run_id });
    return view;
  }

  pruneIdleRunners(): void {
    // Compatibility no-op. The Supervisor lifecycle is task/run owned and must
    // never kill a process merely because a legacy idle TTL elapsed.
  }

  private findLatest(provider: RunnerProvider, accountPoolId: string): ContinuityRun | null {
    return (
      this.supervisor
        .listRuns(ALL_RUN_STATUSES)
        .filter((run) => run.provider === provider && run.account_pool_id === accountPoolId)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null
    );
  }
}

function normalizeProvider(provider: string): RunnerProvider {
  const normalized = provider.trim().toLowerCase();
  if (!isExecutionProvider(normalized) || (normalized !== "codex" && normalized !== "claude")) {
    throw new Error(`unsupported_runner_provider:${provider}`);
  }
  return normalized;
}

function requirePool(accountPoolId: string): string {
  const pool = accountPoolId.trim();
  if (!pool) throw new Error("accountPoolId_required");
  return pool;
}

function latestPerRunner(runs: ContinuityRun[]): ContinuityRun[] {
  const latest = new Map<string, ContinuityRun>();
  for (const run of runs) {
    const key = `${run.provider}:${run.account_pool_id}`;
    const existing = latest.get(key);
    if (!existing || existing.updated_at.localeCompare(run.updated_at) < 0) latest.set(key, run);
  }
  return [...latest.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function toRunnerView(run: ContinuityRun): OfficeRunnerStatusView {
  const updatedAt = Date.parse(run.updated_at);
  return {
    provider: run.provider,
    accountPoolId: run.account_pool_id,
    runnerKey: `${run.provider}:${run.account_pool_id}`,
    containerName: `host-native:${run.run_id}`,
    status: toRunnerStatus(run.status),
    lastUsedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function toQueueView(run: ContinuityRun): OfficeRunnerQueueItemView {
  const createdAt = Date.parse(run.created_at);
  const updatedAt = Date.parse(run.updated_at);
  const terminal = run.status === "completed" || run.status === "failed" || run.status === "canceled";
  return {
    id: run.dispatch_id,
    provider: run.provider,
    accountPoolId: run.account_pool_id,
    runnerKey: `${run.provider}:${run.account_pool_id}`,
    status: toQueueStatus(run.status),
    enqueuedAt: Number.isFinite(createdAt) ? createdAt : 0,
    startedAt: run.process_started_at ? Date.parse(run.process_started_at) : null,
    endedAt: terminal && Number.isFinite(updatedAt) ? updatedAt : null,
    errorMessage: run.status === "stale" || run.status === "failed" ? `continuity_run_${run.status}` : null,
  };
}

function toRunnerStatus(status: ContinuityRunStatus): RunnerStatus {
  if (status === "running") return "active";
  if (status === "pause_requested") return "stopping";
  if (status === "stale" || status === "failed" || status === "canceled") return "error";
  return "idle";
}

function toQueueStatus(status: ContinuityRunStatus): RunnerQueueStatus {
  if (status === "reserved") return "queued";
  if (status === "starting" || status === "running" || status === "pause_requested") return "running";
  if (status === "failed" || status === "stale" || status === "dispatch_uncertain") return "failed";
  if (status === "canceled") return "canceled";
  return "done";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}
