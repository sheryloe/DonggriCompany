import { randomUUID } from "node:crypto";

import type {
  OfficeCliActiveRunsResponse,
  OfficeCliLogView,
  OfficeCliLogsResponse,
  OfficeCliRunRequest,
  OfficeCliRunResponse,
  OfficeCliRunStatus,
  OfficeCliRunView,
  OfficeCliStopResponse,
  OfficeCliSubtaskView,
  OfficeCliSubtasksResponse
} from "@workspace/shared";
import { z } from "zod";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { dbBadRequest, dbNotFound } from "./errors.js";

const cliProviderSchema = z.enum(["claude", "codex", "gemini"]);

export const officeCliRunSchema = z.object({
  taskId: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-zA-Z0-9:_-]+$/, "taskId supports letters, numbers, colon, underscore, hyphen"),
  provider: cliProviderSchema,
  prompt: z.string().trim().min(1).max(8000),
  projectPath: z.string().trim().min(1).max(1000),
  accountPoolId: z.string().trim().min(1).max(120),
  model: z.string().trim().max(120).nullable().optional()
});

type CliRunRow = {
  task_id: string;
  provider: "claude" | "codex" | "gemini";
  account_pool_id: string;
  model: string | null;
  prompt: string;
  project_path: string;
  status: OfficeCliRunStatus;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  exit_code: number | null;
  error_message: string | null;
};

type CliLogRow = {
  id: string;
  task_id: string;
  seq: number;
  level: "info" | "error" | "system";
  line: string;
  created_at: string;
};

type CliSubtaskRow = {
  id: string;
  task_id: string;
  label: string;
  status: string;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
};

const HARD_TIMEOUT_DEFAULT_MS = 30 * 60_000;

const toRunView = (row: CliRunRow): OfficeCliRunView => ({
  taskId: row.task_id,
  provider: row.provider,
  accountPoolId: row.account_pool_id,
  model: row.model,
  prompt: row.prompt,
  projectPath: row.project_path,
  status: row.status,
  startedAt: row.started_at,
  updatedAt: row.updated_at,
  endedAt: row.ended_at,
  exitCode: row.exit_code,
  errorMessage: row.error_message
});

const toLogView = (row: CliLogRow): OfficeCliLogView => ({
  id: row.id,
  taskId: row.task_id,
  seq: row.seq,
  level: row.level,
  line: row.line,
  createdAt: row.created_at
});

const toSubtaskView = (row: CliSubtaskRow): OfficeCliSubtaskView => ({
  id: row.id,
  taskId: row.task_id,
  label: row.label,
  status: row.status,
  payloadJson: row.payload_json,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const clampLogLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 120;
  }
  return Math.max(1, Math.min(500, Math.floor(value)));
};

const extractSubtasks = (prompt: string): Array<{ label: string; status: string }> => {
  const pattern = /^\s*[-*]\s*\[( |x|X)\]\s+(.+)$/gm;
  const subtasks: Array<{ label: string; status: string }> = [];
  let match = pattern.exec(prompt);
  while (match) {
    subtasks.push({
      label: match[2].trim(),
      status: match[1].toLowerCase() === "x" ? "done" : "open"
    });
    match = pattern.exec(prompt);
  }
  return subtasks.slice(0, 30);
};

export class CliExecutionService {
  private readonly hardTimeoutMs: number;
  private readonly timeoutTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly dbPath = getDbPath()) {
    const configured = Number(process.env.TASK_RUN_HARD_TIMEOUT_MS ?? HARD_TIMEOUT_DEFAULT_MS);
    this.hardTimeoutMs = Number.isFinite(configured) && configured > 0 ? configured : HARD_TIMEOUT_DEFAULT_MS;
  }

  run(payload: OfficeCliRunRequest): OfficeCliRunResponse {
    const parsed = officeCliRunSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid CLI run payload");
    }

    const nowIso = new Date().toISOString();

    const run = withDatabase((db) => {
      const running = db
        .prepare("SELECT task_id FROM office_cli_active_runs WHERE task_id = ?")
        .get(parsed.data.taskId) as { task_id: string } | undefined;
      if (running) {
        throw dbBadRequest(`CLI run is already active: ${parsed.data.taskId}`);
      }

      const transaction = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO office_cli_runs (
            task_id,
            provider,
            account_pool_id,
            model,
            prompt,
            project_path,
            status,
            started_at,
            updated_at,
            ended_at,
            exit_code,
            error_message
          )
          VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, NULL, NULL, NULL)
          ON CONFLICT(task_id) DO UPDATE SET
            provider = excluded.provider,
            account_pool_id = excluded.account_pool_id,
            model = excluded.model,
            prompt = excluded.prompt,
            project_path = excluded.project_path,
            status = 'running',
            started_at = excluded.started_at,
            updated_at = excluded.updated_at,
            ended_at = NULL,
            exit_code = NULL,
            error_message = NULL
          `
        ).run(
          parsed.data.taskId,
          parsed.data.provider,
          parsed.data.accountPoolId,
          parsed.data.model ?? null,
          parsed.data.prompt,
          parsed.data.projectPath,
          nowIso,
          nowIso
        );

        db.prepare(
          `
          INSERT INTO office_cli_active_runs (task_id, provider, started_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            provider = excluded.provider,
            started_at = excluded.started_at,
            updated_at = excluded.updated_at
          `
        ).run(parsed.data.taskId, parsed.data.provider, nowIso, nowIso);

        db.prepare("DELETE FROM office_cli_logs WHERE task_id = ?").run(parsed.data.taskId);
        db.prepare("DELETE FROM office_cli_subtasks WHERE task_id = ?").run(parsed.data.taskId);
      });

      transaction();

      this.appendLog(db, parsed.data.taskId, "system", `run started (${parsed.data.provider})`);

      const subtasks = extractSubtasks(parsed.data.prompt);
      if (subtasks.length > 0) {
        const insertSubtask = db.prepare(
          `
          INSERT INTO office_cli_subtasks (id, task_id, label, status, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        );
        for (const subtask of subtasks) {
          const ts = new Date().toISOString();
          insertSubtask.run(
            randomUUID(),
            parsed.data.taskId,
            subtask.label,
            subtask.status,
            null,
            ts,
            ts
          );
        }
      }

      return this.getRunByTaskId(db, parsed.data.taskId);
    }, this.dbPath);

    this.armHardTimeout(parsed.data.taskId);

    return {
      ok: true,
      run
    };
  }

  stop(taskId: string): OfficeCliStopResponse {
    const stopped = withDatabase((db) => {
      const row = this.getRunRowByTaskId(db, taskId);
      if (!row) {
        throw dbNotFound(`CLI run not found: ${taskId}`);
      }
      if (row.status !== "running" && row.status !== "queued") {
        return false;
      }
      this.updateRunStatus(db, taskId, "stopped", null, null, null);
      this.appendLog(db, taskId, "system", "run stopped by user");
      db.prepare("DELETE FROM office_cli_active_runs WHERE task_id = ?").run(taskId);
      return true;
    }, this.dbPath);

    this.clearTimeout(taskId);

    return {
      ok: true,
      taskId,
      stopped
    };
  }

  listLogs(taskId: string, limit = 120): OfficeCliLogsResponse {
    const safeLimit = clampLogLimit(limit);
    return withDatabase((db) => {
      const row = this.getRunRowByTaskId(db, taskId);
      if (!row) {
        throw dbNotFound(`CLI run not found: ${taskId}`);
      }

      const logs = db
        .prepare(
          `
          SELECT id, task_id, seq, level, line, created_at
          FROM office_cli_logs
          WHERE task_id = ?
          ORDER BY seq DESC
          LIMIT ?
          `
        )
        .all(taskId, safeLimit) as CliLogRow[];

      return {
        ok: true,
        taskId,
        logs: logs.reverse().map(toLogView)
      };
    }, this.dbPath);
  }

  listSubtasks(taskId: string): OfficeCliSubtasksResponse {
    return withDatabase((db) => {
      const row = this.getRunRowByTaskId(db, taskId);
      if (!row) {
        throw dbNotFound(`CLI run not found: ${taskId}`);
      }

      const subtasks = db
        .prepare(
          `
          SELECT id, task_id, label, status, payload_json, created_at, updated_at
          FROM office_cli_subtasks
          WHERE task_id = ?
          ORDER BY created_at ASC
          `
        )
        .all(taskId) as CliSubtaskRow[];

      return {
        ok: true,
        taskId,
        subtasks: subtasks.map(toSubtaskView)
      };
    }, this.dbPath);
  }

  listActiveRuns(): OfficeCliActiveRunsResponse {
    return withDatabase((db) => {
      const rows = db
        .prepare(
          `
          SELECT
            r.task_id,
            r.provider,
            r.account_pool_id,
            r.model,
            r.prompt,
            r.project_path,
            r.status,
            r.started_at,
            r.updated_at,
            r.ended_at,
            r.exit_code,
            r.error_message
          FROM office_cli_runs r
          INNER JOIN office_cli_active_runs a ON a.task_id = r.task_id
          ORDER BY r.started_at DESC
          `
        )
        .all() as CliRunRow[];

      return {
        ok: true,
        runs: rows.map(toRunView)
      };
    }, this.dbPath);
  }

  getRun(taskId: string): OfficeCliRunView {
    return withDatabase((db) => {
      const run = this.getRunByTaskId(db, taskId);
      if (!run) {
        throw dbNotFound(`CLI run not found: ${taskId}`);
      }
      return run;
    }, this.dbPath);
  }

  private armHardTimeout(taskId: string): void {
    this.clearTimeout(taskId);

    const timer = setTimeout(() => {
      try {
        withDatabase((db) => {
          const row = this.getRunRowByTaskId(db, taskId);
          if (!row || (row.status !== "running" && row.status !== "queued")) {
            return;
          }
          this.updateRunStatus(db, taskId, "timeout", null, null, "hard timeout");
          this.appendLog(db, taskId, "error", `run timed out (${this.hardTimeoutMs}ms)`);
          db.prepare("DELETE FROM office_cli_active_runs WHERE task_id = ?").run(taskId);
        }, this.dbPath);
      } finally {
        this.timeoutTimers.delete(taskId);
      }
    }, this.hardTimeoutMs);

    this.timeoutTimers.set(taskId, timer);
  }

  private clearTimeout(taskId: string): void {
    const timer = this.timeoutTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(taskId);
    }
  }

  private getRunRowByTaskId(db: DatabaseHandle, taskId: string): CliRunRow | null {
    const row = db
      .prepare(
        `
        SELECT
          task_id,
          provider,
          account_pool_id,
          model,
          prompt,
          project_path,
          status,
          started_at,
          updated_at,
          ended_at,
          exit_code,
          error_message
        FROM office_cli_runs
        WHERE task_id = ?
        `
      )
      .get(taskId) as CliRunRow | undefined;

    return row ?? null;
  }

  private getRunByTaskId(db: DatabaseHandle, taskId: string): OfficeCliRunView {
    const row = this.getRunRowByTaskId(db, taskId);
    if (!row) {
      throw dbNotFound(`CLI run not found: ${taskId}`);
    }
    return toRunView(row);
  }

  private appendLog(
    db: DatabaseHandle,
    taskId: string,
    level: "info" | "error" | "system",
    line: string
  ): OfficeCliLogView {
    const lastSeqRow = db
      .prepare("SELECT MAX(seq) as seq FROM office_cli_logs WHERE task_id = ?")
      .get(taskId) as { seq: number | null };
    const seq = (lastSeqRow.seq ?? 0) + 1;
    const id = randomUUID();
    const ts = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO office_cli_logs (id, task_id, seq, level, line, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(id, taskId, seq, level, line, ts);

    return {
      id,
      taskId,
      seq,
      level,
      line,
      createdAt: ts
    };
  }

  private updateRunStatus(
    db: DatabaseHandle,
    taskId: string,
    status: OfficeCliRunStatus,
    endedAt: string | null,
    exitCode: number | null,
    errorMessage: string | null
  ): void {
    const ts = new Date().toISOString();
    db.prepare(
      `
      UPDATE office_cli_runs
      SET
        status = ?,
        updated_at = ?,
        ended_at = ?,
        exit_code = ?,
        error_message = ?
      WHERE task_id = ?
      `
    ).run(status, ts, endedAt, exitCode, errorMessage, taskId);
  }
}
