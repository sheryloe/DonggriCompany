import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { registerOpsSettingsStatsRoutes } from "./settings-stats.ts";

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

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      name_ko TEXT NOT NULL DEFAULT '',
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#64748b',
      description TEXT,
      prompt TEXT,
      sort_order INTEGER NOT NULL DEFAULT 99,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      name_ko TEXT NOT NULL DEFAULT '',
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      department_id TEXT,
      role TEXT NOT NULL DEFAULT 'senior',
      acts_as_planning_leader INTEGER NOT NULL DEFAULT 0,
      cli_provider TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '🙂',
      personality TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      stats_tasks_done INTEGER NOT NULL DEFAULT 0,
      stats_xp INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      sprite_number INTEGER,
      cli_model TEXT,
      cli_reasoning_level TEXT
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      status TEXT,
      department_id TEXT,
      title TEXT,
      updated_at INTEGER,
      assigned_agent_id TEXT
    );

    CREATE TABLE task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      created_at INTEGER
    );
  `);
  return db;
}

function createHarness(db: DatabaseSync) {
  const getRoutes = new Map<string, RouteHandler>();
  const putRoutes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      getRoutes.set(path, handler);
      return this;
    },
    put(path: string, handler: RouteHandler) {
      putRoutes.set(path, handler);
      return this;
    },
  };

  registerOpsSettingsStatsRoutes({
    app: app as any,
    db: db as any,
    nowMs: () => Date.now(),
  } as any);

  return { getRoutes, putRoutes };
}

describe("ops settings seed init guard", () => {
  it("seed init guard ignores officePackProfiles and preserves seed agents", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning" }],
            agents: [{ id: "video_preprod-seed-1", department_id: "planning" }],
          },
        }),
      );
      db.prepare("INSERT INTO agents (id, name) VALUES (?, ?)").run("dev-leader", "Dev Leader");

      createHarness(db);

      const totalAgents = (db.prepare("SELECT COUNT(*) AS c FROM agents").get() as { c: number }).c;
      const seedAgents = (
        db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id LIKE '%-seed-%'").get() as {
          c: number;
        }
      ).c;
      expect(totalAgents).toBe(1);
      expect(seedAgents).toBe(0);
      expect(
        db.prepare("SELECT value FROM settings WHERE key = 'officePackSeedAgentsInitialized'").get(),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("PUT /api/settings rejects officePackProfiles updates as projection-only", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO agents (id, name) VALUES (?, ?)").run("dev-leader", "Dev Leader");
      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.(
        {
          body: {
            officePackProfiles: {
              video_preprod: {
                departments: [{ id: "planning" }],
                agents: [{ id: "video_preprod-seed-1", department_id: "planning" }],
              },
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.payload).toEqual({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: ["officePackProfiles"],
      });

      const totalAgents = (db.prepare("SELECT COUNT(*) AS c FROM agents").get() as { c: number }).c;
      const seedAgents = (
        db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id LIKE '%-seed-%'").get() as {
          c: number;
        }
      ).c;
      expect(totalAgents).toBe(1);
      expect(seedAgents).toBe(0);
      expect(
        db.prepare("SELECT value FROM settings WHERE key = 'officePackSeedAgentsInitialized'").get(),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("GET /api/settings returns stored values and does not hydrate seed agents", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning", name: "Planning", name_ko: "기획", icon: "🧭", color: "#f59e0b" }],
            agents: [
              {
                id: "video_preprod-seed-1",
                name: "Rian",
                name_ko: "리언",
                department_id: "planning",
                role: "team_leader",
                cli_provider: "claude",
                avatar_emoji: "🚀",
                sprite_number: 6,
              },
            ],
          },
        }),
      );
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", JSON.stringify("video_preprod"));

      const { getRoutes } = createHarness(db);
      const getHandler = getRoutes.get("/api/settings");
      expect(getHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      getHandler?.({}, res);
      expect(res.statusCode).toBe(200);
      expect((res.payload as any).settings.officeWorkflowPack).toBe("video_preprod");
      expect(Array.isArray((res.payload as any).settings.officePackProfiles.video_preprod.agents)).toBe(true);

      const seedAgent = db.prepare("SELECT id FROM agents WHERE id = 'video_preprod-seed-1'").get() as
        | { id: string }
        | undefined;
      const hydratedPacks = db.prepare("SELECT value FROM settings WHERE key = 'officePackHydratedPacks'").get() as
        | { value: string }
        | undefined;
      expect(seedAgent).toBeUndefined();
      expect(hydratedPacks).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("officeWorkflowPack PUT is rejected when officePackProfiles is included", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO agents (id, name) VALUES (?, ?)").run("dev-leader", "Dev Leader");
      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.(
        {
          body: {
            officeWorkflowPack: "video_preprod",
            officePackProfiles: {
              video_preprod: {
                departments: [{ id: "planning", name: "Planning" }],
                agents: [{ id: "video_preprod-seed-1", department_id: "planning" }],
              },
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.payload).toEqual({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: ["officePackProfiles"],
      });

      expect(db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get()).toBeUndefined();
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officePackProfiles'").get()).toBeUndefined();
      const seedAgentCount = (
        db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id LIKE 'video_preprod-seed-%'").get() as { c: number }
      ).c;
      expect(seedAgentCount).toBe(0);
    } finally {
      db.close();
    }
  });

  it("keeps existing hydrated packs when officePackHydratedPacks is omitted", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackHydratedPacks",
        JSON.stringify(["video_preprod"]),
      );

      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.({ body: { officeWorkflowPack: "video_preprod" } }, res);
      expect(res.statusCode).toBe(200);

      const hydrated = db.prepare("SELECT value FROM settings WHERE key = 'officePackHydratedPacks'").get() as
        | { value: string }
        | undefined;
      expect(hydrated?.value).toBe(JSON.stringify(["video_preprod"]));
    } finally {
      db.close();
    }
  });

  it("rejects officePackHydratedPacks as read-only at write time", () => {
    const db = setupDb();
    try {
      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.({ body: { officePackHydratedPacks: ["video_preprod", "novel"], officeWorkflowPack: "video_preprod" } }, res);

      expect(res.statusCode).toBe(409);
      expect(res.payload).toEqual({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: ["officePackHydratedPacks"],
      });

      expect(db.prepare("SELECT value FROM settings WHERE key = 'officePackHydratedPacks'").get()).toBeUndefined();
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("rejects when both officePackProfiles and officePackHydratedPacks are provided", () => {
    const db = setupDb();
    try {
      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.(
        {
          body: {
            officePackProfiles: {},
            officePackHydratedPacks: ["video_preprod", "novel"],
            officeWorkflowPack: "video_preprod",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.payload).toEqual({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: ["officePackProfiles", "officePackHydratedPacks"],
      });

      expect(db.prepare("SELECT value FROM settings WHERE key = 'officePackProfiles'").get()).toBeUndefined();
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officePackHydratedPacks'").get()).toBeUndefined();
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("rejects providerModelConfig writes as canonical projection read-only", () => {
    const db = setupDb();
    try {
      const { putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");

      const res = createFakeResponse();
      putHandler?.(
        {
          body: {
            providerModelConfig: {
              codex: { model: "gpt-5.3-codex", reasoningLevel: "medium" },
            },
            officeWorkflowPack: "development",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.payload).toEqual({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: ["providerModelConfig"],
      });

      expect(db.prepare("SELECT value FROM settings WHERE key = 'providerModelConfig'").get()).toBeUndefined();
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
