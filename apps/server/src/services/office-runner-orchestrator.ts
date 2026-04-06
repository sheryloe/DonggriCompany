import { OfficeRunnerService } from "@workspace/db";
import type {
  OfficeRunnerQueueItemView,
  OfficeRunnerStatusView,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import { spawnSync } from "node:child_process";

import { badRequest } from "../errors.js";

type ActivateRunnerResult = {
  runner: OfficeRunnerStatusView;
  queued: boolean;
  queueItem: OfficeRunnerQueueItemView | null;
};

type DeactivateRunnerResult = {
  runner: OfficeRunnerStatusView;
  promotedQueueItem: OfficeRunnerQueueItemView | null;
  promotedRunner: OfficeRunnerStatusView | null;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "runner orchestration failed";
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const slugify = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
};

export class OfficeRunnerOrchestrator {
  private readonly maxActive = parsePositiveInteger(process.env.OFFICE_RUNNER_MAX_ACTIVE, 5);
  private readonly idleTtlMs = parsePositiveInteger(process.env.OFFICE_RUNNER_IDLE_TTL_MS, 900_000);
  private readonly dockerEnabled = process.env.OFFICE_RUNNER_DOCKER_ENABLED === "1";
  private readonly dockerBin = process.env.OFFICE_RUNNER_DOCKER_BIN ?? "docker";
  private readonly runnerImage = process.env.OFFICE_RUNNER_IMAGE ?? "node:22-bookworm";
  private readonly runnerNetwork = process.env.OFFICE_RUNNER_NETWORK ?? "";
  private readonly volumePrefix = process.env.OFFICE_RUNNER_VOLUME_PREFIX ?? "office-runner";

  constructor(private readonly runnerService = new OfficeRunnerService()) {}

  listRunners(): OfficeRunnerStatusView[] {
    return this.runnerService.listRunners();
  }

  listQueue(limit = 200): OfficeRunnerQueueItemView[] {
    return this.runnerService.listQueue(limit);
  }

  activate(
    provider: ProviderUsageProbeProvider,
    accountPoolId: string,
    requestJson: string
  ): ActivateRunnerResult {
    this.pruneIdleRunners();

    const containerName = this.toContainerName(provider, accountPoolId);
    const ensured = this.runnerService.ensureRunner({
      provider,
      accountPoolId,
      containerName,
      requestJson,
      maxActive: this.maxActive
    });

    if (ensured.queued) {
      return ensured;
    }

    try {
      this.ensureDockerRuntime(containerName, provider, accountPoolId);
      return ensured;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const failedRunner = this.runnerService.deactivateRunner({
        provider,
        accountPoolId,
        containerName,
        status: "error",
        lastError: errorMessage
      });
      return {
        runner: failedRunner,
        queued: false,
        queueItem: null
      };
    }
  }

  deactivate(
    provider: ProviderUsageProbeProvider,
    accountPoolId: string,
    reason: string
  ): DeactivateRunnerResult {
    const containerName = this.toContainerName(provider, accountPoolId);
    const runner = this.runnerService.deactivateRunner({
      provider,
      accountPoolId,
      containerName,
      status: "stopped",
      lastError: reason ? `deactivated:${reason}` : null
    });
    this.stopDockerRuntime(containerName);

    const promoted = this.promoteNextQueued();

    if (!promoted) {
      return {
        runner,
        promotedQueueItem: null,
        promotedRunner: null
      };
    }

    return {
      runner,
      promotedQueueItem: promoted.queueItem,
      promotedRunner: promoted.runner
    };
  }

  touchRunner(provider: ProviderUsageProbeProvider, accountPoolId: string): OfficeRunnerStatusView | null {
    return this.runnerService.markRunnerUsed(provider, accountPoolId);
  }

  private pruneIdleRunners(): void {
    const idleBeforeIso = new Date(Date.now() - this.idleTtlMs).toISOString();
    const idles = this.runnerService.listIdleActiveRunners(idleBeforeIso);
    for (const idle of idles) {
      this.runnerService.deactivateRunner({
        provider: idle.provider,
        accountPoolId: idle.accountPoolId,
        containerName: idle.containerName,
        status: "stopped",
        lastError: "auto-idle-stop"
      });
      this.stopDockerRuntime(idle.containerName);
    }
    while (true) {
      const promoted = this.promoteNextQueued();
      if (!promoted) {
        break;
      }
    }
  }

  private toContainerName(provider: ProviderUsageProbeProvider, accountPoolId: string): string {
    return `office-runner-${slugify(provider)}-${slugify(accountPoolId)}`;
  }

  private toVolumeName(provider: ProviderUsageProbeProvider, accountPoolId: string): string {
    return `${slugify(this.volumePrefix)}-${slugify(provider)}-${slugify(accountPoolId)}`;
  }

  private ensureDockerRuntime(
    containerName: string,
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ): void {
    if (!this.dockerEnabled) {
      return;
    }

    const inspect = spawnSync(this.dockerBin, ["inspect", "-f", "{{.State.Running}}", containerName], {
      encoding: "utf8",
      timeout: 8_000
    });

    if (inspect.status === 0) {
      if ((inspect.stdout ?? "").trim() === "true") {
        return;
      }
      const start = spawnSync(this.dockerBin, ["start", containerName], {
        encoding: "utf8",
        timeout: 8_000
      });
      if (start.status !== 0) {
        throw badRequest(`Failed to start runner container: ${containerName}`);
      }
      return;
    }

    const args = ["run", "-d", "--name", containerName];
    if (this.runnerNetwork.trim()) {
      args.push("--network", this.runnerNetwork.trim());
    }
    args.push(
      "-v",
      `${this.toVolumeName(provider, accountPoolId)}:/runner-home`,
      "-e",
      `OFFICE_RUNNER_PROVIDER=${provider}`,
      "-e",
      `OFFICE_RUNNER_ACCOUNT_POOL_ID=${accountPoolId}`,
      this.runnerImage,
      "sleep",
      "infinity"
    );

    const run = spawnSync(this.dockerBin, args, {
      encoding: "utf8",
      timeout: 12_000
    });
    if (run.status !== 0) {
      throw badRequest(`Failed to create runner container: ${run.stderr || containerName}`);
    }
  }

  private stopDockerRuntime(containerName: string): void {
    if (!this.dockerEnabled) {
      return;
    }
    spawnSync(this.dockerBin, ["stop", containerName], {
      encoding: "utf8",
      timeout: 8_000
    });
  }

  private promoteNextQueued():
    | { runner: OfficeRunnerStatusView; queueItem: OfficeRunnerQueueItemView }
    | null {
    const promoted = this.runnerService.promoteNextQueued(
      this.maxActive,
      (queuedProvider, queuedPoolId) => this.toContainerName(queuedProvider, queuedPoolId)
    );
    if (!promoted) {
      return null;
    }

    try {
      this.ensureDockerRuntime(
        promoted.runner.containerName,
        promoted.runner.provider,
        promoted.runner.accountPoolId
      );
      return promoted;
    } catch (error) {
      const message = toErrorMessage(error);
      this.runnerService.deactivateRunner({
        provider: promoted.runner.provider,
        accountPoolId: promoted.runner.accountPoolId,
        containerName: promoted.runner.containerName,
        status: "error",
        lastError: message
      });
      this.runnerService.failQueueItem(promoted.queueItem.id, message);
      return null;
    }
  }
}
