import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyTaskSchemaMigrations } from "../../bootstrap/schema/task-schema-migrations.ts";
import { registerProjectRoutes } from "./projects.ts";

function createHarness(activeProcesses = new Map<string, unknown>()) {
  const app = express();
  app.use(express.json());
  const db = new DatabaseSync(":memory:");
  const broadcasts: Array<{ event: string; payload: any }> = [];
  const notifyProjectHealthAction = vi.fn(async () => undefined);
  applyBaseSchema(db);
  applyTaskSchemaMigrations(db);

  registerProjectRoutes({
    app,
    db,
    broadcast: (event: string, payload: unknown) => {
      broadcasts.push({ event, payload });
    },
    notifyProjectHealthAction,
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

  return { app, db, broadcasts, notifyProjectHealthAction };
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
  let broadcasts: Array<{ event: string; payload: any }> = [];
  let notifyProjectHealthAction: ReturnType<typeof vi.fn>;
  let tempDirs: string[] = [];

  beforeEach(() => {
    const harness = createHarness();
    app = harness.app;
    db = harness.db;
    broadcasts = harness.broadcasts;
    notifyProjectHealthAction = harness.notifyProjectHealthAction;
    seedBase(db);
  });

  afterEach(() => {
    db?.close();
    db = null;
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs = [];
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
    insertTask(db!, {
      id: "task-path-blocked",
      title: "Blocked runtime rerun",
      status: "pending",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });
    db!.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, 3)").run(
      "task-delegated",
      "Recovery watchdog moved orphan task to inbox.",
    );
    db!.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'error', ?, 4)").run(
      "task-path-blocked",
      "Execution blocked (project_path_not_allowed): Project path is outside allowed roots.",
    );
    db!.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, 5)").run(
      "task-path-blocked",
      "policy_snapshot_missing_on_legacy_row (api.tasks.list) -> bound 2026-05-06-26b847e3ba1d",
    );

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.health).toBe("critical");
    expect(res.body.summary).toMatchObject({
      total_tasks: 4,
      open_tasks: 4,
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
    expect(res.body.blockers.some((task: any) => task.evidence_reason === "project_path_not_allowed")).toBe(true);
  });

  it("does not keep completed QA evidence text as an active blocker", async () => {
    insertTask(db!, {
      id: "task-qa-done",
      title: "QA GO/NO-GO Hold resolved",
      status: "done",
      departmentId: "qa",
      result: "QA Hold evidence covered: empty state, error state, and 430px screenshot captured.",
    });

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.health).toBe("good");
    expect(res.body.summary).toMatchObject({
      open_tasks: 0,
      done_tasks: 1,
      qa_hold_items: 0,
    });
    expect(res.body.blockers).toEqual([]);
  });

  it("does not classify generic hold text as QA Hold evidence gap", async () => {
    insertTask(db!, {
      id: "task-business-hold",
      title: "Hold release for business approval",
      status: "review",
      departmentId: "dev",
      result: "Hold is waiting for product owner approval. Screenshot evidence is complete.",
    });
    insertTask(db!, {
      id: "task-qa-pass",
      title: "QA smoke evidence captured",
      status: "review",
      departmentId: "qa",
      result: "430px, empty state, and error state screenshots captured.",
    });

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.summary.qa_hold_items).toBe(0);
    expect(res.body.blockers.every((task: any) => task.evidence_reason !== "qa_hold_evidence")).toBe(true);
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
    expect(notifyProjectHealthAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "orphan_requeued",
        project_id: "project-1",
        project_name: "Health Project",
        task_id: "task-delegated",
        previous_status: "inbox",
        status: "planned",
      }),
    );
  });

  it("supersedes orphan task with evidence instead of requeueing it", async () => {
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
      .send({ mode: "supersede", evidence: { commit: "557b3ec", note: "covered by runtime commit" } })
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      previous_status: "inbox",
      status: "cancelled",
      mode: "supersede",
    });
    expect(db!.prepare("SELECT status, completed_at FROM tasks WHERE id = 'task-delegated'").get()).toMatchObject({
      status: "cancelled",
      completed_at: 1_700_000_000_000,
    });
    const task = db!.prepare("SELECT workflow_meta_json FROM tasks WHERE id = 'task-delegated'").get() as {
      workflow_meta_json: string;
    };
    expect(JSON.parse(task.workflow_meta_json).superseded_by).toMatchObject({ commit: "557b3ec" });
    expect(notifyProjectHealthAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task_superseded",
        project_id: "project-1",
        task_id: "task-delegated",
        previous_status: "inbox",
        status: "cancelled",
        evidence_commit: "557b3ec",
      }),
    );
  });

  it("supersedes path-blocked pending task even when it is not an orphan candidate", async () => {
    insertTask(db!, {
      id: "task-path-blocked",
      title: "Blocked runtime rerun",
      status: "pending",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });
    db!.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'error', ?, 4)").run(
      "task-path-blocked",
      "Execution blocked (project_path_not_allowed): Project path is outside allowed roots.",
    );

    const res = await request(app)
      .post("/api/projects/project-1/orphan-tasks/task-path-blocked/recover")
      .send({ mode: "supersede", evidence: { commit: "557b3ec", note: "replaced by verified runtime commit" } })
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      previous_status: "pending",
      status: "cancelled",
      mode: "supersede",
    });
    expect(db!.prepare("SELECT status FROM tasks WHERE id = 'task-path-blocked'").get()).toEqual({
      status: "cancelled",
    });
    expect(notifyProjectHealthAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task_superseded",
        task_id: "task-path-blocked",
        previous_status: "pending",
        status: "cancelled",
        evidence_commit: "557b3ec",
      }),
    );
  });

  it("does not requeue non-orphan project health tasks", async () => {
    insertTask(db!, {
      id: "task-planned",
      title: "Normal planned work",
      status: "planned",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });

    const res = await request(app)
      .post("/api/projects/project-1/orphan-tasks/task-planned/recover")
      .send({})
      .expect(400);

    expect(res.body).toMatchObject({ error: "not_orphan_candidate", status: "planned" });
    expect(db!.prepare("SELECT status FROM tasks WHERE id = 'task-planned'").get()).toEqual({ status: "planned" });
  });

  it("approves review task and records review consent evidence", async () => {
    insertTask(db!, {
      id: "task-review",
      title: "Review gate waiting",
      status: "review",
      departmentId: "qa",
      assignedAgentId: "agent-1",
    });

    const res = await request(app)
      .post("/api/projects/project-1/review-tasks/task-review/approve")
      .send({ evidence: { commit: "557b3ec", note: "evidence verified" } })
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      previous_status: "review",
      status: "done",
    });
    const task = db!.prepare("SELECT status, completed_at, workflow_meta_json FROM tasks WHERE id = 'task-review'").get() as {
      status: string;
      completed_at: number;
      workflow_meta_json: string;
    };
    expect(task.status).toBe("done");
    expect(task.completed_at).toBe(1_700_000_000_000);
    expect(JSON.parse(task.workflow_meta_json).review_consent).toMatchObject({
      state: "approved",
      approved_by: "project_health",
    });
    expect(notifyProjectHealthAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review_approved",
        project_id: "project-1",
        task_id: "task-review",
        previous_status: "review",
        status: "done",
        evidence_commit: "557b3ec",
      }),
    );
  });

  it("cleans stale agent assignments for completed project tasks", async () => {
    insertTask(db!, {
      id: "task-done",
      title: "Completed work",
      status: "done",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });
    db!.prepare("UPDATE agents SET status = 'idle', current_task_id = 'task-done' WHERE id = 'agent-1'").run();

    const health = await request(app).get("/api/projects/project-1/health").expect(200);
    expect(health.body.summary.stale_assignments).toBe(1);

    const res = await request(app).post("/api/projects/project-1/stale-assignments/cleanup").send({}).expect(200);
    expect(res.body).toMatchObject({ ok: true, cleared_count: 1, agent_ids: ["agent-1"] });
    expect(db!.prepare("SELECT status, current_task_id FROM agents WHERE id = 'agent-1'").get()).toEqual({
      status: "idle",
      current_task_id: null,
    });
    expect(
      broadcasts.some(
        (item) =>
          item.event === "agent_status" && item.payload?.id === "agent-1" && item.payload?.current_task_id === null,
      ),
    ).toBe(true);
    expect(notifyProjectHealthAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stale_assignments_cleaned",
        project_id: "project-1",
        cleared_count: 1,
        agent_ids: ["agent-1"],
      }),
    );
  });

  it("flags unavailable CLI account pools as health blockers", async () => {
    db!.exec(`
      CREATE TABLE cli_account_pools (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        account_pool_id TEXT NOT NULL,
        label TEXT NOT NULL,
        profile_home TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    db!.prepare("UPDATE agents SET cli_provider = 'codex', cli_account_pool_id = 'codex-main' WHERE id = 'agent-1'").run();
    db!.prepare(
      `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status)
       VALUES ('pool-1', 'codex', 'codex-main', 'Codex Main', 'G:\\missing\\codex-main', 'connected')`,
    ).run();
    insertTask(db!, {
      id: "task-provider",
      title: "Needs Codex",
      status: "planned",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.summary.provider_account_unavailable).toBe(1);
    expect(res.body.blockers.some((task: any) => task.evidence_reason === "provider_account_unavailable")).toBe(true);
  });

  it("flags connected CLI pools without auth artifacts as health blockers", async () => {
    db!.exec(`
      CREATE TABLE cli_account_pools (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        account_pool_id TEXT NOT NULL,
        label TEXT NOT NULL,
        profile_home TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    const profileHome = fs.mkdtempSync(path.join(os.tmpdir(), "project-health-no-auth-"));
    tempDirs.push(profileHome);
    db!.prepare("UPDATE agents SET cli_provider = 'codex', cli_account_pool_id = 'codex-main' WHERE id = 'agent-1'").run();
    db!.prepare(
      `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status)
       VALUES ('pool-1', 'codex', 'codex-main', 'Codex Main', ?, 'connected')`,
    ).run(profileHome);
    insertTask(db!, {
      id: "task-provider",
      title: "Needs Codex",
      status: "planned",
      departmentId: "dev",
      assignedAgentId: "agent-1",
    });

    const res = await request(app).get("/api/projects/project-1/health").expect(200);

    expect(res.body.summary.provider_account_unavailable).toBe(1);
    expect(res.body.blockers.some((task: any) => task.evidence_reason === "provider_account_unavailable")).toBe(true);
  });
});
