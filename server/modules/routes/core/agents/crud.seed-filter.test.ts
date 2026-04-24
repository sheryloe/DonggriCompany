import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
      workflow_pack_key TEXT,
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
      workflow_profile TEXT,
      family TEXT,
      career_stage TEXT,
      specialization_key TEXT,
      authority_level INTEGER NOT NULL DEFAULT 0,
      execution_capability_profile TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '?',
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

const generatedUnassignedGuideNames = [
  "Codex_Main_Agent",
  "Codex_Planner",
  "Codex_Planner_agent1",
  "Compatibility_Legacy_Agent",
  "Compatibility_Workflow_Role_Agent",
  "Gemini_Agent",
  "Invalid_Role_Agent",
  "Jules_Agent",
  "Lead_B",
  "Legacy_Intern",
  "Legacy_Role_Agent",
  "Legacy_Workflow_Role_Agent",
  "Planner",
  "Profiled_Agent",
  "Role_Compatibility_Agent",
];

function cleanupGeneratedUnassignedGuides(): void {
  const unassignedRoot = path.join(process.cwd(), "agents", "unassigned");
  for (const guideName of generatedUnassignedGuideNames) {
    fs.rmSync(path.join(unassignedRoot, guideName), { recursive: true, force: true });
  }
  try {
    if (fs.existsSync(unassignedRoot) && fs.readdirSync(unassignedRoot).length === 0) {
      fs.rmSync(unassignedRoot, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup only; test assertions do not depend on guide filesystem state.
  }
}

describe("agent CRUD seed filter", () => {
  const previousGuideRoot = process.env.AGENT_GUIDE_ROOT;
  let tempGuideRoot: string | null = null;

  beforeEach(() => {
    tempGuideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crud-agent-guides-"));
    process.env.AGENT_GUIDE_ROOT = tempGuideRoot;
  });

  afterEach(() => {
    cleanupGeneratedUnassignedGuides();
    if (tempGuideRoot) {
      fs.rmSync(tempGuideRoot, { recursive: true, force: true });
      tempGuideRoot = null;
    }
    if (previousGuideRoot === undefined) {
      delete process.env.AGENT_GUIDE_ROOT;
    } else {
      process.env.AGENT_GUIDE_ROOT = previousGuideRoot;
    }
  });

  it("GET /api/agents excludes seed agents by default", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', 'Development', '#3b82f6')").run();
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

  it("GET /api/agents?include_seed=true includes seed agents", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', 'Development', '#3b82f6')").run();
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

  it("PATCH /api/agents/:id ignores planning leader override and returns canonical warning", () => {
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

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { warnings?: string[] };
      expect(payload.warnings).toContain("acts_as_planning_leader_ignored_canonical_authority_only");
      expect(payload.warnings).toContain("workflow_pack_key_ignored_projection_only");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id force override compatibility-only warning only", () => {
    const { db, routes } = createHarness();
    try {
      const officePackProfiles = {
        video_preprod: {
          departments: [{ id: "planning" }],
          agents: [{ id: "video_preprod-seed-1" }, { id: "video_preprod-seed-2" }],
        },
      };
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "video_preprod");
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify(officePackProfiles),
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
      const payload = res.payload as { warnings?: string[] };
      const before = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-1") as { acts_as_planning_leader: number } | undefined;
      const after = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-2") as { acts_as_planning_leader: number } | undefined;
      expect(before?.acts_as_planning_leader).toBe(1);
      expect(after?.acts_as_planning_leader).toBe(0);
      expect(payload.warnings).toContain("acts_as_planning_leader_ignored_canonical_authority_only");
      expect(payload.warnings).toContain("workflow_pack_key_ignored_projection_only");
      expect(payload.warnings).toContain("force_planning_leader_override_ignored");

      const profileRow = db.prepare("SELECT value FROM settings WHERE key = 'officePackProfiles'").get() as
        | { value?: string }
        | undefined;
      const parsed = profileRow?.value ? (JSON.parse(profileRow.value) as typeof officePackProfiles) : null;
      expect(parsed).toEqual(officePackProfiles);
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id ignores workflow_role and returns compatibility warning", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        "INSERT INTO agents (id, name, role, authority_level, execution_capability_profile, created_at) VALUES (?, ?, 'junior', 1, 'reviewer', 1)",
      ).run("agent-compat", "Compatibility Workflow Role Agent");

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-compat" },
          body: {
            workflow_role: "reviewer",
            authority_level: 5,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { warnings?: string[] };
      expect(payload.warnings).toContain("workflow_role_ignored_compatibility_only");

      const updated = db
        .prepare("SELECT authority_level, execution_capability_profile FROM agents WHERE id = ?")
        .get("agent-compat") as { authority_level: number; execution_capability_profile: string | null } | undefined;
      expect(updated?.authority_level).toBe(5);
      expect(updated?.execution_capability_profile).toBe("reviewer");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id ignores legacy role input and recomputes compatibility role from canonical fields", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        "INSERT INTO agents (id, name, role, authority_level, execution_capability_profile, created_at) VALUES (?, ?, 'junior', 1, 'reviewer', 1)",
      ).run("agent-role-compat", "Role Compatibility Agent");

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-role-compat" },
          body: {
            role: "team_leader",
            authority_level: 7,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { warnings?: string[] };
      expect(payload.warnings).toContain("role_ignored_compatibility_only");
      const updated = db
        .prepare("SELECT role, authority_level FROM agents WHERE id = ?")
        .get("agent-role-compat") as { role: string; authority_level: number } | undefined;
      expect(updated?.role).toBe("team_leader");
      expect(updated?.authority_level).toBe(7);
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

  it("POST /api/agents ignores invalid legacy role as compatibility-only", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Invalid Role Agent",
            role: "staff",
            cli_provider: "claude",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { warnings?: string[]; agent?: { role?: string; canonical_identity_source?: string } };
      expect(payload.warnings).toContain("role_ignored_compatibility_only");
      expect(payload.agent?.role).toBe("junior");
      expect(payload.agent?.canonical_identity_source).toBe("stored");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id ignores invalid role as compatibility-only and keeps role unchanged", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        "INSERT INTO agents (id, name, role, cli_provider, status, created_at) VALUES (?, ?, 'junior', 'claude', 'idle', 1)",
      ).run("agent-1", "Agent One");

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-1" },
          body: {
            role: "staff",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { warnings?: string[]; agent?: { role?: string } };
      expect(payload.warnings).toContain("role_ignored_compatibility_only");
      expect(payload.agent?.role).toBe("junior");

      const row = db.prepare("SELECT role FROM agents WHERE id = ?").get("agent-1") as { role: string } | undefined;
      expect(row?.role).toBe("junior");
    } finally {
      db.close();
    }
  });

  it("POST /api/agents normalizes intern role input to junior", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Legacy Intern",
            role: "intern",
            cli_provider: "claude",
            agent_profile: {
              capabilities: {
                execution: 5,
              },
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as {
        agent?: {
          id?: string;
          role?: string;
          agent_profile?: {
            role_template?: string;
            capabilities?: { execution?: number };
          };
        };
      };
      expect(payload.agent?.role).toBe("junior");
      expect(payload.agent?.agent_profile?.role_template).toBe("junior");
      expect(payload.agent?.agent_profile?.capabilities?.execution).toBe(5);

      const agentId = payload.agent?.id ?? "";
      const row = db.prepare("SELECT role, agent_profile_json FROM agents WHERE id = ?").get(agentId) as
        | { role?: string | null; agent_profile_json?: string | null }
        | undefined;
      expect(row?.role).toBe("junior");
      expect(row?.agent_profile_json).toContain('"role_template":"junior"');
    } finally {
      db.close();
    }
  });

  it("POST /api/agents strips legacy planning leader/pack override fields into warnings", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "development");
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Compatibility Legacy Agent",
            role: "junior",
            cli_provider: "claude",
            workflow_pack_key: "video_preprod",
            acts_as_planning_leader: 1,
            force_planning_leader_override: true,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { warnings?: string[] };
      expect(payload.warnings).toContain("acts_as_planning_leader_ignored_canonical_authority_only");
      expect(payload.warnings).toContain("workflow_pack_key_ignored_projection_only");
      expect(payload.warnings).toContain("force_planning_leader_override_ignored");

      const created = db
        .prepare("SELECT workflow_pack_key, acts_as_planning_leader FROM agents WHERE name = ?")
        .get("Compatibility Legacy Agent") as { workflow_pack_key: string; acts_as_planning_leader: number } | undefined;
      expect(created?.workflow_pack_key).toBe("development");
      expect(created?.acts_as_planning_leader).toBe(0);
    } finally {
      db.close();
    }
  });

  it("POST /api/agents reports legacy role as compatibility-only", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Legacy Role Agent",
            role: "team_leader",
            cli_provider: "claude",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as {
        warnings?: string[];
        agent?: { role?: string; family?: string; canonical_identity_source?: string; career_stage?: string };
      };
      expect(payload.warnings).toContain("role_ignored_compatibility_only");
      expect(payload.agent?.role).toBe("junior");
      expect(payload.agent?.family).toBe("backend");
      expect(payload.agent?.career_stage).toBe("junior");
      expect(payload.agent?.canonical_identity_source).toBe("stored");

      const row = db
        .prepare("SELECT role, family, career_stage FROM agents WHERE name = ?")
        .get("Legacy Role Agent") as { role: string; family: string; career_stage: string } | undefined;
      expect(row?.role).toBe("junior");
      expect(row?.family).toBe("backend");
      expect(row?.career_stage).toBe("junior");
    } finally {
      db.close();
    }
  });

  it("POST /api/agents strips legacy workflow_role into compatibility warning", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Legacy Workflow Role Agent",
            role: "junior",
            cli_provider: "claude",
            workflow_role: "reviewer",
            execution_capability_profile: "reviewer",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const payload = res.payload as { warnings?: string[]; agent?: { execution_capability_profile?: string | null } };
      expect(payload.warnings).toContain("workflow_role_ignored_compatibility_only");
      expect(payload.agent?.execution_capability_profile).toBe("reviewer");
      const row = db
        .prepare("SELECT execution_capability_profile FROM agents WHERE name = ?")
        .get("Legacy Workflow Role Agent") as { execution_capability_profile: string | null } | undefined;
      expect(row?.execution_capability_profile).toBe("reviewer");
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

  it("POST /api/agents derives canonical identity without using legacy role input", () => {
    const { db, routes } = createHarness();
    try {
      const handler = routes.get("POST /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          body: {
            name: "Planner",
            name_ko: "Planning Agent",
            role: "team_leader",
            cli_provider: "claude",
            workflow_profile: {
              role: "primary_author",
              review_lenses: [],
              two_pass_required: true,
              max_review_rounds: 2,
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(201);
      const agent = (res.payload as { agent?: Record<string, unknown> }).agent ?? {};
      expect(agent.family).toBe("backend");
      expect(agent.career_stage).toBe("junior");
      expect(agent.authority_level).toBe(1);
      expect(agent.execution_capability_profile).toBe("primary_author");
      expect(agent.canonical_identity_source).toBe("stored");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id persists explicit canonical identity overrides", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        `INSERT INTO agents (
          id, name, role, cli_provider, workflow_profile, family, career_stage, specialization_key, authority_level, execution_capability_profile, status, created_at
        ) VALUES (?, ?, 'junior', 'claude', ?, 'backend', 'junior', NULL, 1, 'reviewer', 'idle', 1)`,
      ).run(
        "agent-1",
        "Agent One",
        JSON.stringify({
          role: "reviewer",
          review_lenses: ["general"],
          two_pass_required: true,
          max_review_rounds: null,
        }),
      );

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "agent-1" },
          body: {
            family: "researcher",
            career_stage: "pro-senior",
            specialization_key: "research.deep-dive",
            authority_level: 5,
            execution_capability_profile: "analysis",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const agent = (res.payload as { agent?: Record<string, unknown> }).agent ?? {};
      expect(agent.family).toBe("researcher");
      expect(agent.career_stage).toBe("pro-senior");
      expect(agent.specialization_key).toBe("research.deep-dive");
      expect(agent.authority_level).toBe(5);
      expect(agent.execution_capability_profile).toBe("analysis");
      expect(agent.canonical_identity_source).toBe("stored");
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

