import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { registerAgentCrudRoutes } from "./crud.ts";

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

function createHarness(): { db: DatabaseSync; routes: Map<string, RouteHandler> } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_ko TEXT,
      color TEXT
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL DEFAULT '',
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      department_id TEXT,
      role TEXT NOT NULL,
      acts_as_planning_leader INTEGER NOT NULL DEFAULT 0,
      cli_provider TEXT,
      oauth_account_id TEXT,
      api_provider_id TEXT,
      api_model TEXT,
      cli_model TEXT,
      cli_reasoning_level TEXT,
      run_mode TEXT NOT NULL DEFAULT 'standard',
      cli_account_pool_id TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '🤖',
      sprite_number INTEGER,
      personality TEXT,
      agent_profile_json TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      stats_tasks_done INTEGER NOT NULL DEFAULT 0,
      stats_xp INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE cli_account_pools (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_pool_id TEXT NOT NULL,
      label TEXT NOT NULL,
      profile_home TEXT NOT NULL,
      status TEXT NOT NULL,
      last_verified_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(provider, account_pool_id)
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

  registerAgentCrudRoutes({
    app: app as any,
    db: db as any,
    broadcast: () => {},
    runInTransaction: (fn: () => void) => fn(),
    nowMs: () => Date.now(),
    meetingPresenceUntil: new Map(),
    meetingSeatIndexByAgent: new Map(),
    meetingPhaseByAgent: new Map(),
    meetingTaskIdByAgent: new Map(),
    meetingReviewDecisionByAgent: new Map(),
  } as any);

  return { db, routes };
}

describe("agent CRUD seed filter", () => {
  it("GET /api/agents 기본 응답은 seed 에이전트를 제외한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', '개발팀', '#3b82f6')").run();
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 1)",
      ).run("dev-leader", "Dev Leader");
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 2)",
      ).run("video_preprod-seed-2", "Video Seed");

      const handler = routes.get("GET /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: {} }, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { agents: Array<{ id: string }> };
      expect(payload.agents.map((agent) => agent.id)).toEqual(["dev-leader"]);
    } finally {
      db.close();
    }
  });

  it("GET /api/agents?include_seed=true 는 seed 에이전트를 포함한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', '개발팀', '#3b82f6')").run();
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 1)",
      ).run("dev-leader", "Dev Leader");
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 2)",
      ).run("video_preprod-seed-2", "Video Seed");

      const handler = routes.get("GET /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: { include_seed: "true" } }, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { agents: Array<{ id: string }> };
      expect(payload.agents.map((agent) => agent.id)).toEqual(["dev-leader", "video_preprod-seed-2"]);
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id 는 팩 내 기존 Lead가 있으면 409를 반환한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "video_preprod");
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning" }],
            agents: [{ id: "video_preprod-seed-1" }, { id: "video_preprod-seed-2" }],
          },
        }),
      );
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-1", "Lead A", 1, 1);
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-2", "Lead B", 0, 2);

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");
      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "video_preprod-seed-2" },
          body: {
            acts_as_planning_leader: 1,
            workflow_pack_key: "video_preprod",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect((res.payload as { error?: string }).error).toBe("planning_leader_exists");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id force override 로 팩 리더를 교체한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "video_preprod");
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning" }],
            agents: [{ id: "video_preprod-seed-1" }, { id: "video_preprod-seed-2" }],
          },
        }),
      );
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-1", "Lead A", 1, 1);
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-2", "Lead B", 0, 2);

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");
      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "video_preprod-seed-2" },
          body: {
            acts_as_planning_leader: 1,
            workflow_pack_key: "video_preprod",
            force_planning_leader_override: true,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const before = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-1") as { acts_as_planning_leader: number } | undefined;
      const after = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-2") as { acts_as_planning_leader: number } | undefined;
      expect(before?.acts_as_planning_leader).toBe(0);
      expect(after?.acts_as_planning_leader).toBe(1);

      const profileRow = db.prepare("SELECT value FROM settings WHERE key = 'officePackProfiles'").get() as
        | { value?: string }
        | undefined;
      const parsed = profileRow?.value ? (JSON.parse(profileRow.value) as any) : null;
      const leadFlags = (parsed?.video_preprod?.agents ?? []).map((agent: any) => ({
        id: agent.id,
        acts: agent.acts_as_planning_leader ?? 0,
      }));
      expect(leadFlags).toEqual([
        { id: "video_preprod-seed-1", acts: 0 },
        { id: "video_preprod-seed-2", acts: 1 },
      ]);
    } finally {
      db.close();
    }
  });

  it("POST /api/agents saves valid codex cli_account_pool_id", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', '/tmp/codex-main', 'connected', 1, 1)`,
      ).run("pool-1");

      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Codex Main Agent",
            name_ko: "Codex Main",
            role: "junior",
            cli_provider: "codex",
            cli_account_pool_id: "codex-main",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { agent?: { cli_account_pool_id?: string | null } };
      expect(payload.agent?.cli_account_pool_id).toBe("codex-main");
    } finally {
      db.close();
    }
  });

  it("POST /api/agents persists agent_profile_json and returns parsed agent_profile", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Profiled Agent",
            role: "senior",
            cli_provider: "claude",
            personality: "Keep responses concise.",
            agent_profile: {
              role_template: "senior",
              growth_tier: 5,
              capabilities: {
                execution: 5,
                architecture: 4,
                review: 4,
                research: 3,
                communication: 3,
                leadership: 3,
              },
              prompt_style: {
                tone: 3,
                autonomy: 4,
                strictness: 4,
                collaboration: 3,
              },
              specialties: ["backend", "review"],
              custom_prompt_override: "Keep responses concise.",
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as {
        agent?: { id?: string; agent_profile?: { growth_tier?: number; specialties?: string[] } };
      };
      expect(payload.agent?.id).toBeTruthy();
      expect(payload.agent?.agent_profile?.growth_tier).toBe(5);
      expect(payload.agent?.agent_profile?.specialties).toEqual(["backend", "review"]);

      const agentId = payload.agent?.id ?? "";
      const row = db.prepare("SELECT agent_profile_json FROM agents WHERE id = ?").get(agentId) as
        | { agent_profile_json?: string | null }
        | undefined;
      expect(row?.agent_profile_json).toContain('"growth_tier":5');
    } finally {
      db.close();
    }
  });

  it("POST /api/agents returns 400 when codex cli_account_pool_id does not exist", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Codex Missing Pool",
            role: "junior",
            cli_provider: "codex",
            cli_account_pool_id: "missing-pool",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(400);
      expect((res.payload as { error?: string }).error).toBe("cli_account_pool_not_found");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id clears cli_account_pool_id when provider changes away from codex", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', '/tmp/codex-main', 'connected', 1, 1)`,
      ).run("pool-1");
      db.prepare(
        `INSERT INTO agents (id, name, role, cli_provider, cli_account_pool_id, created_at)
         VALUES ('agent-1', 'Agent One', 'junior', 'codex', 'codex-main', 1)`,
      ).run();

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-1" },
          body: { cli_provider: "claude" },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const row = db.prepare("SELECT cli_provider, cli_account_pool_id FROM agents WHERE id = ?").get("agent-1") as
        | { cli_provider: string | null; cli_account_pool_id: string | null }
        | undefined;
      expect(row).toEqual({ cli_provider: "claude", cli_account_pool_id: null });
    } finally {
      db.close();
    }
  });

  it("POST /api/agents accepts jules provider", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Jules Agent",
            role: "junior",
            cli_provider: "jules",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { agent?: { cli_provider?: string; cli_account_pool_id?: string | null } };
      expect(payload.agent?.cli_provider).toBe("jules");
      expect(payload.agent?.cli_account_pool_id ?? null).toBe(null);
    } finally {
      db.close();
    }
  });

  it("POST /api/agents saves valid gemini cli_account_pool_id", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'gemini', 'gemini-main', 'Main Gemini', '/tmp/gemini-main', 'connected', 1, 1)`,
      ).run("pool-gemini");

      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Gemini Agent",
            role: "junior",
            cli_provider: "gemini",
            cli_account_pool_id: "gemini-main",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { agent?: { cli_provider?: string; cli_account_pool_id?: string | null } };
      expect(payload.agent?.cli_provider).toBe("gemini");
      expect(payload.agent?.cli_account_pool_id).toBe("gemini-main");
    } finally {
      db.close();
    }
  });

  it("POST /api/agents returns 400 when jules cli_account_pool_id does not exist", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Jules Missing Pool",
            role: "junior",
            cli_provider: "jules",
            cli_account_pool_id: "missing-jules-pool",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(400);
      expect((res.payload as { error?: string }).error).toBe("cli_account_pool_not_found");
    } finally {
      db.close();
    }
  });

  it("POST /api/agents allows Codex plan mode only when a model is explicitly selected", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Codex Planner",
            role: "junior",
            cli_provider: "codex",
            cli_model: "gpt-5.4",
            cli_reasoning_level: "high",
            run_mode: "plan",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as {
        agent?: { cli_model?: string | null; cli_reasoning_level?: string | null; run_mode?: string | null };
      };
      expect(payload.agent).toEqual(
        expect.objectContaining({
          cli_model: "gpt-5.4",
          cli_reasoning_level: "high",
          run_mode: "plan",
        }),
      );
    } finally {
      db.close();
    }
  });

  it("POST /api/agents rejects plan mode without a Codex model", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Broken Planner",
            role: "junior",
            cli_provider: "codex",
            run_mode: "plan",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(400);
      expect((res.payload as { error?: string }).error).toBe("run_mode_requires_codex_model");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id resets plan mode to standard when Codex model is cleared", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        `INSERT INTO agents (id, name, role, cli_provider, cli_model, cli_reasoning_level, run_mode, status, created_at)
         VALUES ('agent-1', 'Codex Planner', 'junior', 'codex', 'gpt-5.4', 'high', 'plan', 'idle', 1)`,
      ).run();

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-1" },
          body: {
            cli_model: null,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const row = db.prepare("SELECT cli_model, run_mode FROM agents WHERE id = ?").get("agent-1") as
        | { cli_model: string | null; run_mode: string }
        | undefined;
      expect(row).toEqual({
        cli_model: null,
        run_mode: "standard",
      });
    } finally {
      db.close();
    }
  });
});
