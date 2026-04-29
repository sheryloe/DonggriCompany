import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { registerTaskCrudRoutes } from "./crud.ts";

type RouteHandler = (req: any, res: any) => any;

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    payload: null,
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

function createTaskCrudHarness(): { db: DatabaseSync; routes: Map<string, RouteHandler> } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      department_id TEXT,
      assigned_agent_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      workflow_pack_key TEXT NOT NULL DEFAULT 'development',
      policy_version TEXT,
      resolved_execution_policy_json TEXT,
      required_artifacts_json TEXT,
      approval_gate_state_json TEXT,
      workflow_meta_json TEXT,
      output_format TEXT,
      project_path TEXT,
      base_branch TEXT,
      result TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      source_task_id TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT,
      avatar_emoji TEXT
    );
    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT,
      icon TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      core_goal TEXT,
      project_path TEXT,
      default_pack_key TEXT NOT NULL DEFAULT 'development',
      last_used_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      delegated_task_id TEXT
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

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
    patch(path: string, handler: RouteHandler) {
      routes.set(`PATCH ${path}`, handler);
      return this;
    },
    delete(path: string, handler: RouteHandler) {
      routes.set(`DELETE ${path}`, handler);
      return this;
    },
  };

  registerTaskCrudRoutes({
    app: app as any,
    db: db as any,
    nowMs: () => Date.now(),
    firstQueryValue: (value: unknown) => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === "string");
        return typeof first === "string" ? first : undefined;
      }
      return undefined;
    },
    reconcileCrossDeptSubtasks: () => {},
    normalizeTextField: (raw: unknown) => {
      if (typeof raw !== "string") return null;
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    recordTaskCreationAudit: () => {},
    appendTaskLog: () => {},
    broadcast: () => {},
    setTaskCreationAuditCompletion: () => {},
    clearTaskWorkflowState: () => {},
    endTaskExecutionSession: () => {},
    activeProcesses: new Map(),
    stopRequestedTasks: new Set(),
    killPidTree: () => {},
    logsDir: "/tmp",
  });

  return { db, routes };
}

describe("task CRUD workflow pack behavior", () => {
  it("applies workflow_pack_key filter on GET /api/tasks", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, department_id, assigned_agent_id, project_id,
            status, priority, task_type, workflow_pack_key, workflow_meta_json, output_format,
            project_path, base_branch, result, started_at, completed_at, source_task_id, hidden, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        "task-report-1",
        "Report task",
        null,
        null,
        null,
        null,
        "inbox",
        1,
        "general",
        "report",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
        1,
      );
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, department_id, assigned_agent_id, project_id,
            status, priority, task_type, workflow_pack_key, workflow_meta_json, output_format,
            project_path, base_branch, result, started_at, completed_at, source_task_id, hidden, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        "task-dev-1",
        "Dev task",
        null,
        null,
        null,
        null,
        "inbox",
        1,
        "general",
        "development",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
        1,
      );

      const handler = routes.get("GET /api/tasks");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: { workflow_pack_key: "report" } }, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { tasks: Array<{ id: string; workflow_pack_key: string }> };
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]).toMatchObject({
        id: "task-report-1",
        workflow_pack_key: "report",
      });
    } finally {
      db.close();
    }
  });

  it("returns 400 for invalid workflow_pack_key filter", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("GET /api/tasks");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: { workflow_pack_key: "invalid-pack" } }, res);

      expect(res.statusCode).toBe(400);
      expect(res.payload).toEqual({ error: "invalid_workflow_pack_key" });
    } finally {
      db.close();
    }
  });

  it("inherits project default_pack_key when workflow_pack_key is omitted", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      db.prepare(
        `
          INSERT INTO projects (id, name, core_goal, project_path, default_pack_key)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run("project-novel", "Novel Project", "goal", "/tmp/novel-project", "novel");

      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "Project-default pack task",
            project_id: "project-novel",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task: { workflow_pack_key: string; project_id: string; project_path: string } };
      expect(payload.task.workflow_pack_key).toBe("novel");
      expect(payload.task.project_id).toBe("project-novel");
      expect(payload.task.project_path).toBe("/tmp/novel-project");
    } finally {
      db.close();
    }
  });

  it("auto-routes to donggri for instagram card news task without hydrated pack side effects", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "인스타그램 카드뉴스 로컬 제작",
            description: "동그리 스타일 카드뉴스 5장 만들어줘",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task: { workflow_pack_key: string } };
      expect(payload.task.workflow_pack_key).toBe("donggri");

      const hydratedRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("officePackHydratedPacks") as
        | { value?: string }
        | undefined;
      expect(hydratedRow).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("keeps explicit workflow_pack_key priority over auto-routing", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "인스타그램 카드뉴스 로컬 제작",
            workflow_pack_key: "report",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task: { workflow_pack_key: string } };
      expect(payload.task.workflow_pack_key).toBe("report");
    } finally {
      db.close();
    }
  });

  it("stores canonical goal command metadata and applies preset defaults", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "Research provider options",
            description: "Compare current docs",
            workflow_meta_json: {
              goal_command: "research",
              route_source: "task_create_goal_chooser",
              routing_reason: "user_selected_goal",
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as {
        task: {
          workflow_pack_key: string;
          department_id: string;
          task_type: string;
          priority: number;
          workflow_meta_json: string;
        };
      };
      expect(payload.task.workflow_pack_key).toBe("web_research_report");
      expect(payload.task.department_id).toBe("api-research");
      expect(payload.task.task_type).toBe("analysis");
      expect(payload.task.priority).toBe(3);
      expect(JSON.parse(payload.task.workflow_meta_json)).toMatchObject({
        goal_command: "research",
        goal_command_version: "donggri_goal_commands_v1",
        team_preset: "research_report",
        route_source: "task_create_goal_chooser",
        routing_reason: "user_selected_goal",
        required_departments: ["pmo", "api-research", "knowledge-docs"],
        max_parallel_workstreams: 2,
      });
    } finally {
      db.close();
    }
  });

  it("parses native /dg commands in task text without enabling /octo aliases", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "/dg-release prepare release handoff",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task: { workflow_meta_json: string; department_id: string } };
      expect(payload.task.department_id).toBe("cicd-repo");
      expect(JSON.parse(payload.task.workflow_meta_json)).toMatchObject({
        goal_command: "release",
        team_preset: "release_gate",
        route_source: "slash_command_parser",
        routing_reason: "slash_command_detected",
        required_departments: ["pmo", "cicd-repo", "qa", "security-approval", "knowledge-docs"],
        max_parallel_workstreams: 3,
      });

      const octoRes = createFakeResponse();
      handler?.(
        {
          body: {
            title: "/octo-release prepare release handoff",
          },
        },
        octoRes,
      );
      expect(octoRes.statusCode).toBe(200);
      const octoPayload = octoRes.payload as { task: { workflow_meta_json: string | null } };
      expect(octoPayload.task.workflow_meta_json).toBeNull();
    } finally {
      db.close();
    }
  });

  it("rejects invalid native /dg commands", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "/dg-unknown do something",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(400);
      expect(res.payload).toEqual({ error: "invalid_goal_command" });
    } finally {
      db.close();
    }
  });

  it("pins policy_version when creating a task", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      const handler = routes.get("POST /api/tasks") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            title: "Pinned policy task",
            description: "Implement backend task flow",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task?: { policy_version?: string | null } };
      expect(payload.task?.policy_version).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("keeps policy_version pinned after task patch", () => {
    const { db, routes } = createTaskCrudHarness();
    try {
      db.prepare(
        `INSERT INTO tasks (
          id, title, description, department_id, assigned_agent_id, project_id,
          status, priority, task_type, workflow_pack_key, policy_version,
          resolved_execution_policy_json, required_artifacts_json, approval_gate_state_json,
          workflow_meta_json, output_format, project_path, base_branch, result,
          started_at, completed_at, source_task_id, hidden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "task-1",
        "Initial title",
        "Initial description",
        null,
        null,
        null,
        "inbox",
        1,
        "general",
        "development",
        "2026-04-15-abcdef123456",
        "{}",
        "[]",
        '{"gates":[]}',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
        1,
      );

      const handler = routes.get("PATCH /api/tasks/:id") as RouteHandler | undefined;
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "task-1" },
          body: { title: "Updated title" },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { task?: { policy_version?: string | null } };
      expect(payload.task?.policy_version).toBe("2026-04-15-abcdef123456");
    } finally {
      db.close();
    }
  });
});
