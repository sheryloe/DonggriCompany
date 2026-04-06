import { randomUUID } from "node:crypto";

import type {
  AddBossCommandMessageRequest,
  BossCommandThreadStatus,
  BossCommandThreadView,
  CreateBossCommandThreadRequest,
  OfficeEventLogCategory,
  OfficeEventLogView,
  OfficeRuntimeStateView,
  UpdateBossCommandThreadStatusRequest
} from "@workspace/shared";
import { z } from "zod";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { dbBadRequest, dbNotFound } from "./errors.js";

const logCategorySchema = z.enum(["system", "agent", "validation", "error"]);
const threadStatusSchema = z.enum(["draft", "sent", "acknowledged", "feedback", "closed"]);
const threadRecipientSchema = z.enum(["pm", "router", "runtime", "probe", "history"]);

const clampLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 120;
  }
  return Math.max(1, Math.min(500, Math.floor(value)));
};

const safeParseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const mapThreadRows = (
  db: DatabaseHandle,
  threadRows: Array<{
    id: string;
    recipient: string;
    summary: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>
): BossCommandThreadView[] => {
  if (threadRows.length === 0) {
    return [];
  }

  const messageRows = db
    .prepare(
      `
      SELECT id, thread_id, sender, body, created_at
      FROM office_command_messages
      WHERE thread_id IN (${threadRows.map(() => "?").join(",")})
      ORDER BY created_at ASC, id ASC
      `
    )
    .all(...threadRows.map((row) => row.id)) as Array<{
    id: string;
    thread_id: string;
    sender: string;
    body: string;
    created_at: string;
  }>;

  const messagesByThreadId = new Map<string, BossCommandThreadView["messages"]>();
  for (const row of messageRows) {
    const list = messagesByThreadId.get(row.thread_id) ?? [];
    list.push({
      id: row.id,
      sender: row.sender as BossCommandThreadView["messages"][number]["sender"],
      body: row.body,
      createdAt: row.created_at
    });
    messagesByThreadId.set(row.thread_id, list);
  }

  return threadRows.map((row) => ({
    id: row.id,
    recipient: row.recipient as BossCommandThreadView["recipient"],
    summary: row.summary,
    status: row.status as BossCommandThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: messagesByThreadId.get(row.id) ?? []
  }));
};

const ensureThreadExists = (db: DatabaseHandle, threadId: string): void => {
  const row = db
    .prepare("SELECT id FROM office_command_threads WHERE id = ?")
    .get(threadId) as { id: string } | undefined;
  if (!row) {
    throw dbNotFound(`Boss command thread not found: ${threadId}`);
  }
};

export type AppendOfficeLogInput = {
  tick: number;
  category: OfficeEventLogCategory;
  message: string;
  actorId?: string | null;
  speaker?: string | null;
  createdAt?: string;
};

export class OfficeRuntimeStoreService {
  constructor(private readonly dbPath = getDbPath()) {}

  loadRuntimeState(): OfficeRuntimeStateView | null {
    return withDatabase((db) => {
      const row = db
        .prepare(
          `
          SELECT
            tick,
            seed,
            sim_speed,
            is_paused,
            loop_state,
            phase_ticks,
            job_queue,
            completed_jobs,
            pm_reports,
            last_loop_event_json,
            agent_load_json,
            actors_json,
            updated_at
          FROM office_runtime_state
          WHERE id = 1
          `
        )
        .get() as
        | {
            tick: number;
            seed: number;
            sim_speed: OfficeRuntimeStateView["simSpeed"];
            is_paused: number;
            loop_state: OfficeRuntimeStateView["loopState"];
            phase_ticks: number;
            job_queue: number;
            completed_jobs: number;
            pm_reports: number;
            last_loop_event_json: string | null;
            agent_load_json: string;
            actors_json: string;
            updated_at: string;
          }
        | undefined;

      if (!row) {
        return null;
      }

      return {
        tick: row.tick,
        seed: row.seed,
        simSpeed: row.sim_speed,
        isPaused: row.is_paused === 1,
        loopState: row.loop_state,
        phaseTicks: row.phase_ticks,
        jobQueue: row.job_queue,
        completedJobs: row.completed_jobs,
        pmReports: row.pm_reports,
        lastLoopEvent: safeParseJson(row.last_loop_event_json, null),
        agentLoadById: safeParseJson<Record<string, number>>(row.agent_load_json, {}),
        actors: safeParseJson<OfficeRuntimeStateView["actors"]>(row.actors_json, []),
        kpi: {
          throughput: 0,
          queueDepth: row.job_queue,
          slaRisk: "low",
          probeConfidence: "none",
          avgAgentLoad: 0
        },
        updatedAt: row.updated_at
      };
    }, this.dbPath);
  }

  saveRuntimeState(state: OfficeRuntimeStateView): OfficeRuntimeStateView {
    return withDatabase((db) => {
      db.prepare(
        `
        INSERT INTO office_runtime_state (
          id,
          tick,
          seed,
          sim_speed,
          is_paused,
          loop_state,
          phase_ticks,
          job_queue,
          completed_jobs,
          pm_reports,
          last_loop_event_json,
          agent_load_json,
          actors_json,
          updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          tick = excluded.tick,
          seed = excluded.seed,
          sim_speed = excluded.sim_speed,
          is_paused = excluded.is_paused,
          loop_state = excluded.loop_state,
          phase_ticks = excluded.phase_ticks,
          job_queue = excluded.job_queue,
          completed_jobs = excluded.completed_jobs,
          pm_reports = excluded.pm_reports,
          last_loop_event_json = excluded.last_loop_event_json,
          agent_load_json = excluded.agent_load_json,
          actors_json = excluded.actors_json,
          updated_at = excluded.updated_at
        `
      ).run(
        state.tick,
        state.seed,
        state.simSpeed,
        state.isPaused ? 1 : 0,
        state.loopState,
        state.phaseTicks,
        state.jobQueue,
        state.completedJobs,
        state.pmReports,
        state.lastLoopEvent ? JSON.stringify(state.lastLoopEvent) : null,
        JSON.stringify(state.agentLoadById),
        JSON.stringify(state.actors),
        state.updatedAt
      );
      return state;
    }, this.dbPath);
  }

  appendLog(input: AppendOfficeLogInput): OfficeEventLogView {
    const parsedCategory = logCategorySchema.safeParse(input.category);
    if (!parsedCategory.success) {
      throw dbBadRequest("Invalid office log category");
    }
    if (!input.message.trim()) {
      throw dbBadRequest("Office log message is required");
    }

    const nextCreatedAt = input.createdAt ?? new Date().toISOString();
    const id = randomUUID();

    return withDatabase((db) => {
      db.prepare(
        `
        INSERT INTO office_event_logs (
          id,
          tick,
          category,
          message,
          actor_id,
          speaker,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        input.tick,
        parsedCategory.data,
        input.message,
        input.actorId ?? null,
        input.speaker ?? null,
        nextCreatedAt
      );

      return {
        id,
        tick: input.tick,
        category: parsedCategory.data,
        message: input.message,
        actorId: input.actorId ?? null,
        speaker: input.speaker ?? null,
        createdAt: nextCreatedAt
      };
    }, this.dbPath);
  }

  listLogs(limit = 120): OfficeEventLogView[] {
    const safeLimit = clampLimit(limit);
    return withDatabase((db) => {
      const rows = db
        .prepare(
          `
          SELECT id, tick, category, message, actor_id, speaker, created_at
          FROM office_event_logs
          ORDER BY seq DESC
          LIMIT ?
          `
        )
        .all(safeLimit) as Array<{
        id: string;
        tick: number;
        category: OfficeEventLogCategory;
        message: string;
        actor_id: string | null;
        speaker: string | null;
        created_at: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        tick: row.tick,
        category: row.category,
        message: row.message,
        actorId: row.actor_id,
        speaker: row.speaker,
        createdAt: row.created_at
      }));
    }, this.dbPath);
  }

  listThreads(): BossCommandThreadView[] {
    return withDatabase((db) => {
      const threadRows = db
        .prepare(
          `
          SELECT id, recipient, summary, status, created_at, updated_at
          FROM office_command_threads
          ORDER BY updated_at DESC, id DESC
          `
        )
        .all() as Array<{
        id: string;
        recipient: string;
        summary: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      return mapThreadRows(db, threadRows);
    }, this.dbPath);
  }

  createThread(input: CreateBossCommandThreadRequest): BossCommandThreadView {
    const parsedRecipient = threadRecipientSchema.safeParse(input.recipient);
    if (!parsedRecipient.success) {
      throw dbBadRequest("Invalid thread recipient");
    }
    if (!input.summary.trim() || !input.body.trim()) {
      throw dbBadRequest("Thread summary and body are required");
    }

    const nowIso = new Date().toISOString();
    const threadId = randomUUID();
    const messageId = randomUUID();

    return withDatabase((db) => {
      const transaction = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO office_command_threads (id, recipient, summary, status, created_at, updated_at)
          VALUES (?, ?, ?, 'sent', ?, ?)
          `
        ).run(threadId, parsedRecipient.data, input.summary.trim(), nowIso, nowIso);

        db.prepare(
          `
          INSERT INTO office_command_messages (id, thread_id, sender, body, created_at)
          VALUES (?, ?, 'boss', ?, ?)
          `
        ).run(messageId, threadId, input.body.trim(), nowIso);
      });

      transaction();
      const rows = db
        .prepare(
          `
          SELECT id, recipient, summary, status, created_at, updated_at
          FROM office_command_threads
          WHERE id = ?
          `
        )
        .all(threadId) as Array<{
        id: string;
        recipient: string;
        summary: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      return mapThreadRows(db, rows)[0]!;
    }, this.dbPath);
  }

  appendThreadMessage(threadId: string, input: AddBossCommandMessageRequest): BossCommandThreadView {
    const parsedRecipient = threadRecipientSchema.safeParse(input.sender);
    if (!parsedRecipient.success) {
      throw dbBadRequest("Invalid message sender");
    }
    if (!input.body.trim()) {
      throw dbBadRequest("Feedback body is required");
    }

    const nowIso = new Date().toISOString();
    const messageId = randomUUID();

    return withDatabase((db) => {
      ensureThreadExists(db, threadId);
      const transaction = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO office_command_messages (id, thread_id, sender, body, created_at)
          VALUES (?, ?, ?, ?, ?)
          `
        ).run(messageId, threadId, parsedRecipient.data, input.body.trim(), nowIso);
        db.prepare(
          `
          UPDATE office_command_threads
          SET status = 'feedback', updated_at = ?
          WHERE id = ?
          `
        ).run(nowIso, threadId);
      });
      transaction();
      const rows = db
        .prepare(
          `
          SELECT id, recipient, summary, status, created_at, updated_at
          FROM office_command_threads
          WHERE id = ?
          `
        )
        .all(threadId) as Array<{
        id: string;
        recipient: string;
        summary: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      return mapThreadRows(db, rows)[0]!;
    }, this.dbPath);
  }

  updateThreadStatus(
    threadId: string,
    input: UpdateBossCommandThreadStatusRequest
  ): BossCommandThreadView {
    const parsedStatus = threadStatusSchema.safeParse(input.status);
    if (!parsedStatus.success) {
      throw dbBadRequest("Invalid thread status");
    }
    const nowIso = new Date().toISOString();

    return withDatabase((db) => {
      ensureThreadExists(db, threadId);
      db.prepare(
        `
        UPDATE office_command_threads
        SET status = ?, updated_at = ?
        WHERE id = ?
        `
      ).run(parsedStatus.data, nowIso, threadId);

      const rows = db
        .prepare(
          `
          SELECT id, recipient, summary, status, created_at, updated_at
          FROM office_command_threads
          WHERE id = ?
          `
        )
        .all(threadId) as Array<{
        id: string;
        recipient: string;
        summary: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      return mapThreadRows(db, rows)[0]!;
    }, this.dbPath);
  }
}
