import { randomUUID } from "node:crypto";

import type {
  OfficeRunnerQueueItemView,
  OfficeRunnerQueueStatus,
  OfficeRunnerStatus,
  OfficeRunnerStatusView,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import { z } from "zod";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbNotFound } from "./errors.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);
const runnerStatusSchema = z.enum(["active", "stopped", "error"]);
const queueStatusSchema = z.enum(["queued", "running", "done", "failed"]);

type RunnerRow = {
  provider: ProviderUsageProbeProvider;
  account_pool_id: string;
  container_name: string;
  status: OfficeRunnerStatus;
  last_used_at: string;
  updated_at: string;
  last_error: string | null;
};

type QueueRow = {
  id: string;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string;
  request_json: string;
  status: OfficeRunnerQueueStatus;
  enqueued_at: string;
  started_at: string | null;
  ended_at: string | null;
  error_message: string | null;
};

type EnsureRunnerInput = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  containerName: string;
  requestJson: string;
  maxActive: number;
};

type DeactivateRunnerInput = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  containerName: string;
  status?: OfficeRunnerStatus;
  lastError?: string | null;
};

type UpsertRunnerInput = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  containerName: string;
  status: OfficeRunnerStatus;
  lastError: string | null;
  lastUsedAt: string;
};

const toRunnerView = (row: RunnerRow): OfficeRunnerStatusView => {
  return {
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    containerName: row.container_name,
    status: row.status,
    lastUsedAt: row.last_used_at,
    updatedAt: row.updated_at,
    lastError: row.last_error
  };
};

const toQueueView = (row: QueueRow): OfficeRunnerQueueItemView => {
  return {
    id: row.id,
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    requestJson: row.request_json,
    status: row.status,
    enqueuedAt: row.enqueued_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    errorMessage: row.error_message
  };
};

const clampLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 200;
  }
  return Math.max(1, Math.min(500, Math.floor(value)));
};

export class OfficeRunnerService {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly accountPoolRepository = new AccountPoolRepository()
  ) {}

  listRunners(): OfficeRunnerStatusView[] {
    return withDatabase((db) => {
      const rows = db
        .prepare(
          `
          SELECT
            provider,
            account_pool_id,
            container_name,
            status,
            last_used_at,
            updated_at,
            last_error
          FROM office_runner_instances
          ORDER BY updated_at DESC
          `
        )
        .all() as RunnerRow[];
      return rows.map(toRunnerView);
    }, this.dbPath);
  }

  listQueue(limit = 200): OfficeRunnerQueueItemView[] {
    return withDatabase((db) => {
      const rows = db
        .prepare(
          `
          SELECT
            id,
            provider,
            account_pool_id,
            request_json,
            status,
            enqueued_at,
            started_at,
            ended_at,
            error_message
          FROM office_runner_queue
          ORDER BY enqueued_at ASC
          LIMIT ?
          `
        )
        .all(clampLimit(limit)) as QueueRow[];
      return rows.map(toQueueView);
    }, this.dbPath);
  }

  ensureRunner(
    input: EnsureRunnerInput
  ): { runner: OfficeRunnerStatusView; queued: false; queueItem: null } | { runner: OfficeRunnerStatusView; queued: true; queueItem: OfficeRunnerQueueItemView } {
    const parsedProvider = providerSchema.safeParse(input.provider);
    if (!parsedProvider.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!input.accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }
    if (!input.containerName.trim()) {
      throw dbBadRequest("containerName is required");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, input.accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${input.accountPoolId}`);
      }
      if (accountPool.provider !== parsedProvider.data) {
        throw dbBadRequest(
          `Account pool/provider mismatch: expected ${accountPool.provider}, got ${parsedProvider.data}`
        );
      }

      const existingRunner = this.getRunnerRow(db, parsedProvider.data, input.accountPoolId);
      const nowIso = new Date().toISOString();
      const pendingQueue = this.getPendingQueueByPool(
        db,
        parsedProvider.data,
        input.accountPoolId
      );

      if (existingRunner?.status === "active") {
        const refreshed = this.upsertRunnerRow(db, {
          provider: parsedProvider.data,
          accountPoolId: input.accountPoolId,
          containerName: input.containerName,
          status: "active",
          lastError: existingRunner.last_error,
          lastUsedAt: nowIso
        });
        return {
          runner: toRunnerView(refreshed),
          queued: false,
          queueItem: null
        };
      }

      const activeCount = this.countActive(db);
      if (activeCount >= input.maxActive) {
        if (pendingQueue) {
          const stoppedRunner = this.upsertRunnerRow(db, {
            provider: parsedProvider.data,
            accountPoolId: input.accountPoolId,
            containerName: input.containerName,
            status: existingRunner?.status ?? "stopped",
            lastError: existingRunner?.last_error ?? null,
            lastUsedAt: existingRunner?.last_used_at ?? nowIso
          });
          return {
            runner: toRunnerView(stoppedRunner),
            queued: true,
            queueItem: toQueueView(pendingQueue)
          };
        }

        const queueItem = this.enqueue(db, {
          provider: parsedProvider.data,
          accountPoolId: input.accountPoolId,
          requestJson: input.requestJson,
          status: "queued"
        });
        const stoppedRunner = this.upsertRunnerRow(db, {
          provider: parsedProvider.data,
          accountPoolId: input.accountPoolId,
          containerName: input.containerName,
          status: existingRunner?.status ?? "stopped",
          lastError: existingRunner?.last_error ?? null,
          lastUsedAt: existingRunner?.last_used_at ?? nowIso
        });
        return {
          runner: toRunnerView(stoppedRunner),
          queued: true,
          queueItem: toQueueView(queueItem)
        };
      }

      const activated = this.upsertRunnerRow(db, {
        provider: parsedProvider.data,
        accountPoolId: input.accountPoolId,
        containerName: input.containerName,
        status: "active",
        lastError: null,
        lastUsedAt: nowIso
      });

      return {
        runner: toRunnerView(activated),
        queued: false,
        queueItem: null
      };
    }, this.dbPath);
  }

  deactivateRunner(input: DeactivateRunnerInput): OfficeRunnerStatusView {
    const parsedProvider = providerSchema.safeParse(input.provider);
    if (!parsedProvider.success) {
      throw dbBadRequest("Invalid provider");
    }
    const nextStatus = runnerStatusSchema.safeParse(input.status ?? "stopped");
    if (!nextStatus.success) {
      throw dbBadRequest("Invalid runner status");
    }
    if (!input.accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }

    return withDatabase((db) => {
      const existing = this.getRunnerRow(db, parsedProvider.data, input.accountPoolId);
      const nowIso = new Date().toISOString();
      const row = this.upsertRunnerRow(db, {
        provider: parsedProvider.data,
        accountPoolId: input.accountPoolId,
        containerName: existing?.container_name ?? input.containerName,
        status: nextStatus.data,
        lastError: input.lastError ?? existing?.last_error ?? null,
        lastUsedAt: existing?.last_used_at ?? nowIso
      });
      return toRunnerView(row);
    }, this.dbPath);
  }

  promoteNextQueued(
    maxActive: number,
    containerNameFactory: (provider: ProviderUsageProbeProvider, accountPoolId: string) => string
  ): { runner: OfficeRunnerStatusView; queueItem: OfficeRunnerQueueItemView } | null {
    return withDatabase((db) => {
      if (this.countActive(db) >= maxActive) {
        return null;
      }

      const candidate = db
        .prepare(
          `
          SELECT
            id,
            provider,
            account_pool_id,
            request_json,
            status,
            enqueued_at,
            started_at,
            ended_at,
            error_message
          FROM office_runner_queue
          WHERE status = 'queued'
          ORDER BY enqueued_at ASC
          LIMIT 1
          `
        )
        .get() as QueueRow | undefined;

      if (!candidate) {
        return null;
      }

      const nowIso = new Date().toISOString();
      const tx = db.transaction(() => {
        db.prepare(
          `
          UPDATE office_runner_queue
          SET status = 'running', started_at = ?, error_message = NULL
          WHERE id = ?
          `
        ).run(nowIso, candidate.id);

        const runnerRow = this.upsertRunnerRow(db, {
          provider: candidate.provider,
          accountPoolId: candidate.account_pool_id,
          containerName: containerNameFactory(candidate.provider, candidate.account_pool_id),
          status: "active",
          lastError: null,
          lastUsedAt: nowIso
        });

        db.prepare(
          `
          UPDATE office_runner_queue
          SET status = 'done', ended_at = ?
          WHERE id = ?
          `
        ).run(nowIso, candidate.id);

        const doneQueue = db
          .prepare(
            `
            SELECT
              id,
              provider,
              account_pool_id,
              request_json,
              status,
              enqueued_at,
              started_at,
              ended_at,
              error_message
            FROM office_runner_queue
            WHERE id = ?
            LIMIT 1
            `
          )
          .get(candidate.id) as QueueRow;

        return {
          runner: toRunnerView(runnerRow),
          queueItem: toQueueView(doneQueue)
        };
      });

      return tx();
    }, this.dbPath);
  }

  failQueueItem(queueId: string, message: string): OfficeRunnerQueueItemView | null {
    if (!queueId) {
      return null;
    }
    return withDatabase((db) => {
      const nowIso = new Date().toISOString();
      db.prepare(
        `
        UPDATE office_runner_queue
        SET status = 'failed', ended_at = ?, error_message = ?
        WHERE id = ?
        `
      ).run(nowIso, message, queueId);

      const row = db
        .prepare(
          `
          SELECT
            id,
            provider,
            account_pool_id,
            request_json,
            status,
            enqueued_at,
            started_at,
            ended_at,
            error_message
          FROM office_runner_queue
          WHERE id = ?
          LIMIT 1
          `
        )
        .get(queueId) as QueueRow | undefined;
      return row ? toQueueView(row) : null;
    }, this.dbPath);
  }

  listIdleActiveRunners(idleBeforeIso: string): OfficeRunnerStatusView[] {
    return withDatabase((db) => {
      const rows = db
        .prepare(
          `
          SELECT
            provider,
            account_pool_id,
            container_name,
            status,
            last_used_at,
            updated_at,
            last_error
          FROM office_runner_instances
          WHERE status = 'active' AND last_used_at < ?
          ORDER BY last_used_at ASC
          `
        )
        .all(idleBeforeIso) as RunnerRow[];
      return rows.map(toRunnerView);
    }, this.dbPath);
  }

  markRunnerUsed(provider: ProviderUsageProbeProvider, accountPoolId: string): OfficeRunnerStatusView | null {
    const parsedProvider = providerSchema.safeParse(provider);
    if (!parsedProvider.success || !accountPoolId) {
      return null;
    }

    return withDatabase((db) => {
      const existing = this.getRunnerRow(db, parsedProvider.data, accountPoolId);
      if (!existing) {
        return null;
      }
      const row = this.upsertRunnerRow(db, {
        provider: parsedProvider.data,
        accountPoolId,
        containerName: existing.container_name,
        status: existing.status,
        lastError: existing.last_error,
        lastUsedAt: new Date().toISOString()
      });
      return toRunnerView(row);
    }, this.dbPath);
  }

  private countActive(db: DatabaseHandle): number {
    const row = db
      .prepare(
        `
        SELECT COUNT(1) AS count
        FROM office_runner_instances
        WHERE status = 'active'
        `
      )
      .get() as { count: number };
    return row.count;
  }

  private enqueue(
    db: DatabaseHandle,
    input: {
      provider: ProviderUsageProbeProvider;
      accountPoolId: string;
      requestJson: string;
      status: OfficeRunnerQueueStatus;
    }
  ): QueueRow {
    const statusParsed = queueStatusSchema.safeParse(input.status);
    if (!statusParsed.success) {
      throw dbBadRequest("Invalid queue status");
    }

    const id = randomUUID();
    const nowIso = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO office_runner_queue (
        id,
        provider,
        account_pool_id,
        request_json,
        status,
        enqueued_at,
        started_at,
        ended_at,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `
    ).run(id, input.provider, input.accountPoolId, input.requestJson, statusParsed.data, nowIso);

    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          request_json,
          status,
          enqueued_at,
          started_at,
          ended_at,
          error_message
        FROM office_runner_queue
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(id) as QueueRow | undefined;

    if (!row) {
      throw new Error("Failed to enqueue runner request");
    }
    return row;
  }

  private getRunnerRow(
    db: DatabaseHandle,
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ): RunnerRow | undefined {
    return db
      .prepare(
        `
        SELECT
          provider,
          account_pool_id,
          container_name,
          status,
          last_used_at,
          updated_at,
          last_error
        FROM office_runner_instances
        WHERE provider = ? AND account_pool_id = ?
        LIMIT 1
        `
      )
      .get(provider, accountPoolId) as RunnerRow | undefined;
  }

  private getPendingQueueByPool(
    db: DatabaseHandle,
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ): QueueRow | undefined {
    return db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          request_json,
          status,
          enqueued_at,
          started_at,
          ended_at,
          error_message
        FROM office_runner_queue
        WHERE provider = ? AND account_pool_id = ? AND status IN ('queued', 'running')
        ORDER BY enqueued_at ASC
        LIMIT 1
        `
      )
      .get(provider, accountPoolId) as QueueRow | undefined;
  }

  private upsertRunnerRow(
    db: DatabaseHandle,
    input: UpsertRunnerInput
  ): RunnerRow {
    const statusParsed = runnerStatusSchema.safeParse(input.status);
    if (!statusParsed.success) {
      throw dbBadRequest("Invalid runner status");
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO office_runner_instances (
        id,
        provider,
        account_pool_id,
        container_name,
        status,
        last_used_at,
        updated_at,
        last_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, account_pool_id) DO UPDATE SET
        container_name = excluded.container_name,
        status = excluded.status,
        last_used_at = excluded.last_used_at,
        updated_at = excluded.updated_at,
        last_error = excluded.last_error
      `
    ).run(
      `runner:${input.provider}:${input.accountPoolId}`,
      input.provider,
      input.accountPoolId,
      input.containerName,
      statusParsed.data,
      input.lastUsedAt,
      nowIso,
      input.lastError
    );

    const row = this.getRunnerRow(db, input.provider, input.accountPoolId);
    if (!row) {
      throw new Error("Failed to upsert office runner");
    }
    return row;
  }
}
