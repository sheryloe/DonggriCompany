import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { registerMemoryRoutes } from "./memory.ts";

type RouteHandler = (req: any, res: any) => any;

function createFakeResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
      return this;
    },
  };
  registerMemoryRoutes({
    app: app as any,
    db,
    nowMs: () => 1_700_000_000_000,
    normalizeTextField: (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null),
  });
  return { db, routes };
}

function seedProjectAndAgent(db: DatabaseSync) {
  db.prepare(
    `
    INSERT INTO agents (id, name, name_ko, department_id, role, cli_provider, status, stats_tasks_done, stats_xp)
    VALUES ('agent-1', 'Memory Agent', '메모리 에이전트', NULL, 'junior', 'codex', 'idle', 0, 0)
  `,
  ).run();
  db.prepare(
    `
    INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
    VALUES ('project-1', 'Memory Project', ?, 'Build durable project memory.', 1, 1, 1)
  `,
  ).run(process.cwd());
}

describe("memory routes", () => {
  let db: DatabaseSync | null = null;
  let routes: Map<string, RouteHandler>;

  beforeEach(() => {
    const harness = createHarness();
    db = harness.db;
    routes = harness.routes;
    seedProjectAndAgent(db);
  });

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("creates and lists agent memory with Korean display summary", () => {
    const postHandler = routes.get("POST /api/agents/:id/memory");
    const getHandler = routes.get("GET /api/agents/:id/memory");
    expect(postHandler).toBeTypeOf("function");
    expect(getHandler).toBeTypeOf("function");

    const postRes = createFakeResponse();
    postHandler?.(
      {
        params: { id: "agent-1" },
        body: {
          title: "OAuth reconnect lesson",
          body: "Check execution account readiness before assigning provider-specific work.",
          memory_type: "lesson",
          display_summary_ko: "실행 계정 준비 상태를 먼저 확인한다.",
          tags: ["oauth", "provider"],
        },
      },
      postRes,
    );

    expect(postRes.statusCode).toBe(201);
    expect(postRes.payload).toMatchObject({
      ok: true,
      memory: {
        agent_id: "agent-1",
        memory_type: "lesson",
        display_summary_ko: "실행 계정 준비 상태를 먼저 확인한다.",
      },
    });

    const getRes = createFakeResponse();
    getHandler?.({ params: { id: "agent-1" } }, getRes);
    expect(getRes.statusCode).toBe(200);
    expect((getRes.payload as { memories: unknown[] }).memories).toHaveLength(1);
  });

  it("reconciles completed tasks into project memory and skill usage", () => {
    db!
      .prepare(
        `
      INSERT INTO tasks (
        id, title, description, assigned_agent_id, project_id, status, task_type,
        workflow_pack_key, workflow_meta_json, project_path, result, created_at, updated_at, completed_at
      ) VALUES (
        'task-1', 'Build login flow', 'Implement auth UI', 'agent-1', 'project-1', 'done',
        'development', 'development', ?, ?, 'Implemented and tested login flow.', 1, 2, 3
      )
    `,
      )
      .run(JSON.stringify({ goal_command: "feature" }), process.cwd());

    const handler = routes.get("POST /api/projects/:id/memory/reconcile");
    const res = createFakeResponse();
    handler?.({ params: { id: "project-1" }, body: { include_beads: false } }, res);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { reconciled_tasks: number; memories: Array<{ title: string }>; beads_import: null };
    expect(payload.reconciled_tasks).toBe(1);
    expect(payload.beads_import).toBeNull();
    expect(payload.memories.some((memory) => memory.title.includes("Build login flow"))).toBe(true);

    const skillRows = db!
      .prepare("SELECT skill_id FROM skill_usage_events WHERE task_id = ? ORDER BY skill_id")
      .all("task-1") as Array<{ skill_id: string }>;
    expect(skillRows.map((row) => row.skill_id)).toEqual(["development", "feature"]);
  });

  it("keeps Beads write bridge disabled by default", () => {
    const handler = routes.get("POST /api/memory/beads/export");
    const res = createFakeResponse();
    handler?.(
      {
        body: {
          project_id: "project-1",
          title: "Follow-up issue",
          body: "Persist only when beadsWriteEnabled is true.",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload).toMatchObject({ error: "beads_write_disabled" });
  });
});
