import { randomUUID } from "node:crypto";

import type {
  CreateOfficeKanbanTaskRequest,
  DepartmentView,
  OfficeKanbanTasksResponse,
  OfficeTaskStatus,
  TaskSummaryView,
  UpdateOfficeKanbanTaskRequest
} from "@workspace/shared";
import { z } from "zod";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { dbBadRequest, dbNotFound } from "./errors.js";

const taskStatusSchema = z.enum([
  "inbox",
  "planned",
  "in_progress",
  "review",
  "done",
  "cancelled"
]);

export const createOfficeKanbanTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(4000).nullable().optional(),
  status: taskStatusSchema.optional(),
  departmentId: z.string().min(1).nullable().optional(),
  assigneeAgentId: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(1).max(5).optional()
});

export const updateOfficeKanbanTaskSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().max(4000).nullable().optional(),
  status: taskStatusSchema.optional(),
  departmentId: z.string().min(1).nullable().optional(),
  assigneeAgentId: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(1).max(5).optional()
});

type DepartmentRow = {
  id: string;
  key: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: OfficeTaskStatus;
  department_id: string | null;
  assignee_agent_id: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

const toDepartmentView = (row: DepartmentRow): DepartmentView => ({
  id: row.id,
  key: row.key,
  name: row.name,
  color: row.color,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toTaskView = (row: TaskRow): TaskSummaryView => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  departmentId: row.department_id,
  assigneeAgentId: row.assignee_agent_id,
  priority: row.priority,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const ensureDepartmentExists = (
  db: DatabaseHandle,
  departmentId: string | null | undefined
): void => {
  if (!departmentId) {
    return;
  }
  const row = db
    .prepare("SELECT id FROM office_departments WHERE id = ?")
    .get(departmentId) as { id: string } | undefined;
  if (!row) {
    throw dbBadRequest(`Department not found: ${departmentId}`);
  }
};

export class KanbanTaskService {
  constructor(private readonly dbPath = getDbPath()) {}

  list(): OfficeKanbanTasksResponse {
    return withDatabase((db) => {
      const departmentRows = db
        .prepare(
          `
          SELECT id, key, name, color, sort_order, created_at, updated_at
          FROM office_departments
          ORDER BY sort_order ASC, name ASC
          `
        )
        .all() as DepartmentRow[];

      const taskRows = db
        .prepare(
          `
          SELECT
            id,
            title,
            description,
            status,
            department_id,
            assignee_agent_id,
            priority,
            created_at,
            updated_at
          FROM office_kanban_tasks
          ORDER BY
            CASE status
              WHEN 'inbox' THEN 1
              WHEN 'planned' THEN 2
              WHEN 'in_progress' THEN 3
              WHEN 'review' THEN 4
              WHEN 'done' THEN 5
              WHEN 'cancelled' THEN 6
              ELSE 99
            END,
            priority ASC,
            updated_at DESC
          `
        )
        .all() as TaskRow[];

      return {
        ok: true,
        departments: departmentRows.map(toDepartmentView),
        tasks: taskRows.map(toTaskView)
      };
    }, this.dbPath);
  }

  create(payload: CreateOfficeKanbanTaskRequest): TaskSummaryView {
    const parsed = createOfficeKanbanTaskSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid kanban task payload");
    }

    const nowIso = new Date().toISOString();

    return withDatabase((db) => {
      ensureDepartmentExists(db, parsed.data.departmentId);
      const id = randomUUID();
      db.prepare(
        `
        INSERT INTO office_kanban_tasks (
          id,
          title,
          description,
          status,
          department_id,
          assignee_agent_id,
          priority,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        parsed.data.title,
        parsed.data.description ?? null,
        parsed.data.status ?? "inbox",
        parsed.data.departmentId ?? null,
        parsed.data.assigneeAgentId ?? null,
        parsed.data.priority ?? 3,
        nowIso,
        nowIso
      );

      const row = db
        .prepare(
          `
          SELECT
            id,
            title,
            description,
            status,
            department_id,
            assignee_agent_id,
            priority,
            created_at,
            updated_at
          FROM office_kanban_tasks
          WHERE id = ?
          `
        )
        .get(id) as TaskRow | undefined;

      if (!row) {
        throw dbNotFound(`Kanban task not found after create: ${id}`);
      }

      return toTaskView(row);
    }, this.dbPath);
  }

  update(id: string, payload: UpdateOfficeKanbanTaskRequest): TaskSummaryView {
    const parsed = updateOfficeKanbanTaskSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid kanban task update payload");
    }
    if (Object.keys(parsed.data).length === 0) {
      throw dbBadRequest("At least one field is required for task update");
    }

    return withDatabase((db) => {
      const existing = db
        .prepare("SELECT id FROM office_kanban_tasks WHERE id = ?")
        .get(id) as { id: string } | undefined;
      if (!existing) {
        throw dbNotFound(`Kanban task not found: ${id}`);
      }

      if (parsed.data.departmentId !== undefined) {
        ensureDepartmentExists(db, parsed.data.departmentId);
      }

      const patches: string[] = ["updated_at = @updated_at"];
      const params: Record<string, unknown> = {
        id,
        updated_at: new Date().toISOString()
      };

      if (parsed.data.title !== undefined) {
        patches.push("title = @title");
        params.title = parsed.data.title;
      }
      if (parsed.data.description !== undefined) {
        patches.push("description = @description");
        params.description = parsed.data.description;
      }
      if (parsed.data.status !== undefined) {
        patches.push("status = @status");
        params.status = parsed.data.status;
      }
      if (parsed.data.departmentId !== undefined) {
        patches.push("department_id = @department_id");
        params.department_id = parsed.data.departmentId;
      }
      if (parsed.data.assigneeAgentId !== undefined) {
        patches.push("assignee_agent_id = @assignee_agent_id");
        params.assignee_agent_id = parsed.data.assigneeAgentId;
      }
      if (parsed.data.priority !== undefined) {
        patches.push("priority = @priority");
        params.priority = parsed.data.priority;
      }

      db.prepare(`UPDATE office_kanban_tasks SET ${patches.join(", ")} WHERE id = @id`).run(params);

      const row = db
        .prepare(
          `
          SELECT
            id,
            title,
            description,
            status,
            department_id,
            assignee_agent_id,
            priority,
            created_at,
            updated_at
          FROM office_kanban_tasks
          WHERE id = ?
          `
        )
        .get(id) as TaskRow | undefined;

      if (!row) {
        throw dbNotFound(`Kanban task not found after update: ${id}`);
      }

      return toTaskView(row);
    }, this.dbPath);
  }
}
