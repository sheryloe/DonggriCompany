import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyTaskSchemaMigrations } from "../../bootstrap/schema/task-schema-migrations.ts";
import { registerProjectRoutes } from "./projects.ts";

function createHarness(activeProcesses = new Map<string, unknown>()) {
  const app = express();
  app.use(express.json());
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  applyTaskSchemaMigrations(db);

  registerProjectRoutes({
    app,
    db,
    firstQueryValue: (value: unknown) =>
      Array.isArray(value) ? String(value[0]) : value == null ? undefined : String(value),
    normalizeTextField: (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null),
    runInTransaction: (fn: () => void) => {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    nowMs: () => 1_700_000_000_000,
    activeProcesses,
  });

  return { app, db };
}

function seedBase(db: DatabaseSync): void {
  db.prepare(
    `
      INSERT INTO departments (id, name, name_ko, icon, color)
      VALUES ('dev', 'Development', '개발', 'D', '#2563eb'),
             ('qa', 'QA', 'QA', 'Q', '#f59e0b')
    `,
  ).run();
  db.prepare(
    `
      INSERT INTO agents (
        id, name, name_ko, department_id, role, cli_provider, avatar_emoji,
        status, current_task_id, stats_tasks_done, stats_xp
      ) VALUES ('agent-1', 'Dev Agent', '개발 담당', 'dev', 'senior', 'codex', 'D', 'working', 'task-delegated', 0, 0)
    `,
  ).run();
  db.prepare(
    `
      INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
      VALUES ('project-1', 'Health Project', 'G:\\Donggri_DevDrive\\repos\\runtime\\health-project', 'Verify health', 1, 1, 1)
    `,
  ).run();
}

function insertTask(
  db: DatabaseSync,
  input: {
    id: string;
    title: string;
    status: string;
    departmentId: string;
    assignedAgentId?: string | null;
    sourceTaskId?: string | null;
    result?: string | null;
  },
): void {
  db.prepare(
    `
      INSERT INTO tasks (
        id, title, description, department_id, assigned_agent_id, project_id, status,
        task_type, workflow_pack_key, result, source_task_id, created_at, updated_at
      ) VALUES (?, ?, '', ?, ?, 'project-1', ?, 'development', 'development', ?, ?, 1, 2)
    `,
  ).run(
    input.id,
    input.title,
    input.departmentId,
    input.assignedAgentId ?? null,
    input.status,
    input.result ?? null,
    input.sourceTaskId ?? null,
  );
}

describe("project health routes", () => {
  let db: DatabaseSync | null = null;
  let app: express.Express;

  beforeEach(() => {
    const harness = createHarness();
    app = harness.app;
    db = harness.db;
    seedBase(db);
  });

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("summarizes orphan candidates and QA Hold evidence gaps", async () => {
    insertTask(db!, {
      id: "task-orphan",
      title: "Runtime process disappeared",
      status: "in_progress",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });
    insertTask(db!, {
      id: "task-delegated",
      title: "Delegated task recovered to inbox",
      status: "inbox",
      departmentId: "dev",
      assignedAgentId: "agent-1",
      sourceTaskId: "task-parent",
    });
    insertTask(db!, {
      id: "task-qa",
      title: "QA GO/NO-GO Hold",
      status: "review",
      departmentId: "qa",
      result: "QA Hold: empty state, error state, and 430px screenshot missing.",
    });
    db!.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, 3)").run(
      "task-delegated",
      "Recovery watchdog moved orphan task to inbox.",
    );

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.health).toBe("critical");
    expect(res.body.summary).toMatchObject({
      total_tasks: 3,
      open_tasks: 3,
      orphan_candidates: 2,
      qa_hold_items: 1,
      review_waiting: 1,
      active_running: 0,
    });
    expect(res.body.orphan_candidates.map((task: any) => task.id).sort()).toEqual([
      "task-delegated",
      "task-orphan",
    ]);
    expect(res.body.blockers.some((task: any) => task.evidence_reason === "qa_hold_evidence")).toBe(true);
  });

  it("recovers delegated orphan task into the planned queue with an audit log", async () => {
    insertTask(db!, {
      id: "task-delegated",
      title: "Delegated task recovered to inbox",
      status: "inbox",
      departmentId: "dev",
      assignedAgentId: "agent-1",
      sourceTaskId: "task-parent",
    });

    const res = await request(app)
      .post("/api/projects/project-1/orphan-tasks/task-delegated/recover")
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      previous_status: "inbox",
      status: "planned",
      task: {
        id: "task-delegated",
        status: "planned",
        evidence_reason: "orphan_recovered",
      },
    });
    expect(db!.prepare("SELECT status FROM tasks WHERE id = 'task-delegated'").get()).toEqual({ status: "planned" });
    expect(db!.prepare("SELECT status, current_task_id FROM agents WHERE id = 'agent-1'").get()).toEqual({
      status: "idle",
      current_task_id: null,
    });
    const log = db!.prepare("SELECT message FROM task_logs WHERE task_id = 'task-delegated'").get() as
      | { message: string }
      | undefined;
    expect(log?.message).toContain("ORPHAN_RECOVERY");
  });
});
