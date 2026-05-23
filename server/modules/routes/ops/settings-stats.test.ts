import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  decryptMessengerChannelsForRuntime,
  MESSENGER_TOKEN_REDACTION_PLACEHOLDER,
} from "../../../messenger/token-crypto.ts";
import { registerOpsSettingsStatsRoutes } from "./settings-stats.ts";

type RouteHandler = (req: any, res: any) => any;

function createDb(): DatabaseSync {
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
      sort_order INTEGER NOT NULL DEFAULT 99,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'senior',
      status TEXT NOT NULL DEFAULT 'idle',
      avatar_emoji TEXT NOT NULL DEFAULT ':)'
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

function createResponse() {
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

describe("settings-stats projection write guard", () => {
  it("treats office pack projection settings as read-only", () => {
    const db = createDb();
    try {
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const res = createResponse();
      handler?.(
        {
          body: {
            officePackProfiles: { video_preprod: { agents: [{ id: "seed-1" }] } },
            officePackHydratedPacks: ["video_preprod"],
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

  it("treats providerModelConfig as compatibility-only read model", () => {
    const db = createDb();
    try {
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const res = createResponse();
      handler?.(
        {
          body: {
            providerModelConfig: {
              claude: { model: "claude-sonnet-4", reasoningLevel: "high" },
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

  it("does not partially write any settings when read-only keys are present", () => {
    const db = createDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("theme", JSON.stringify("dark"));
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const res = createResponse();
      handler?.(
        {
          body: {
            providerModelConfig: {
              codex: { model: "gpt-5.4", reasoningLevel: "high" },
            },
            theme: "light",
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
      expect((db.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as { value: string }).value).toBe(
        JSON.stringify("dark"),
      );
      expect(db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("enforces single-group messenger routing and strips department scoped sessions", () => {
    const db = createDb();
    try {
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const res = createResponse();
      handler?.(
        {
          body: {
            messengerChannels: {
              telegram: {
                token: "tg-main-token",
                receiveEnabled: true,
                sessions: [
                  {
                    id: "planning-chat",
                    name: "Planning Chat",
                    targetId: "-100111",
                    enabled: true,
                    token: "tg-session-token",
                    departmentId: "planning",
                  },
                  {
                    id: "dev-chat",
                    name: "Dev Chat",
                    targetId: "-100222",
                    enabled: true,
                    workflowPackKey: "development",
                  },
                  {
                    id: "global-group-chat",
                    name: "Claw-Empire global company meeting room",
                    targetId: "-100999",
                    enabled: true,
                  },
                ],
              },
              discord: {
                token: "discord-token",
                sessions: [{ id: "dc-1", name: "Ops", targetId: "123", enabled: true }],
              },
            },
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, warnings: ["messenger_single_group_enforced"] });

      const storedRaw = db.prepare("SELECT value FROM settings WHERE key = 'messengerChannels'").get() as
        | { value: string }
        | undefined;
      expect(storedRaw?.value).toBeTypeOf("string");
      const stored = JSON.parse(storedRaw?.value ?? "{}") as Record<string, unknown>;
      const telegram = stored.telegram as Record<string, unknown>;
      const telegramSessions = Array.isArray(telegram?.sessions) ? telegram.sessions : [];
      expect(telegramSessions).toHaveLength(1);
      expect(telegramSessions[0]).toMatchObject({
        id: "global",
        targetId: "-100999",
        enabled: true,
      });

      const discord = stored.discord as Record<string, unknown>;
      expect(Array.isArray(discord?.sessions) ? discord.sessions : []).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("redacts messenger tokens from settings reads", () => {
    const db = createDb();
    try {
      const { getRoutes, putRoutes } = createHarness(db);
      const putHandler = putRoutes.get("/api/settings");
      const getHandler = getRoutes.get("/api/settings");
      expect(putHandler).toBeTypeOf("function");
      expect(getHandler).toBeTypeOf("function");

      const writeRes = createResponse();
      putHandler?.(
        {
          body: {
            messengerChannels: {
              telegram: {
                token: "tg-main-secret",
                receiveEnabled: true,
                sessions: [
                  {
                    id: "global",
                    name: "Global Telegram Group",
                    targetId: "-100999",
                    enabled: true,
                    token: "tg-session-secret",
                  },
                ],
                departmentBots: {
                  qa: {
                    token: "tg-qa-secret",
                    targetId: "-100999",
                    enabled: true,
                  },
                },
              },
            },
          },
        },
        writeRes,
      );
      expect(writeRes.statusCode).toBe(200);

      const readRes = createResponse();
      getHandler?.({}, readRes);
      expect(readRes.statusCode).toBe(200);

      const payload = readRes.payload as { settings?: Record<string, any> };
      const messengerChannels = payload.settings?.messengerChannels as Record<string, any>;
      expect(messengerChannels.telegram.token).toBe(MESSENGER_TOKEN_REDACTION_PLACEHOLDER);
      expect(messengerChannels.telegram.sessions[0].token).toBe(MESSENGER_TOKEN_REDACTION_PLACEHOLDER);
      expect(messengerChannels.telegram.departmentBots.qa.token).toBe(MESSENGER_TOKEN_REDACTION_PLACEHOLDER);

      const serialized = JSON.stringify(readRes.payload);
      expect(serialized).not.toContain("tg-main-secret");
      expect(serialized).not.toContain("tg-session-secret");
      expect(serialized).not.toContain("tg-qa-secret");
    } finally {
      db.close();
    }
  });

  it("preserves stored messenger tokens when a settings write sends redaction placeholders", () => {
    const db = createDb();
    try {
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const firstWriteRes = createResponse();
      handler?.(
        {
          body: {
            messengerChannels: {
              telegram: {
                token: "tg-main-secret",
                receiveEnabled: true,
                sessions: [
                  {
                    id: "global",
                    name: "Global Telegram Group",
                    targetId: "-100999",
                    enabled: true,
                    token: "tg-session-secret",
                  },
                ],
              },
            },
          },
        },
        firstWriteRes,
      );
      expect(firstWriteRes.statusCode).toBe(200);

      const secondWriteRes = createResponse();
      handler?.(
        {
          body: {
            messengerChannels: {
              telegram: {
                token: MESSENGER_TOKEN_REDACTION_PLACEHOLDER,
                receiveEnabled: true,
                sessions: [
                  {
                    id: "global",
                    name: "Global Telegram Group",
                    targetId: "-100999",
                    enabled: false,
                    token: MESSENGER_TOKEN_REDACTION_PLACEHOLDER,
                  },
                ],
              },
            },
          },
        },
        secondWriteRes,
      );
      expect(secondWriteRes.statusCode).toBe(200);

      const storedRaw = db.prepare("SELECT value FROM settings WHERE key = 'messengerChannels'").get() as
        | { value: string }
        | undefined;
      expect(storedRaw?.value).toBeTypeOf("string");
      expect(storedRaw?.value).not.toContain(MESSENGER_TOKEN_REDACTION_PLACEHOLDER);

      const runtimeChannels = decryptMessengerChannelsForRuntime(
        JSON.parse(storedRaw?.value ?? "{}"),
      ) as Record<string, any>;
      expect(runtimeChannels.telegram.token).toBe("tg-main-secret");
      expect(runtimeChannels.telegram.sessions[0]).toMatchObject({
        id: "global",
        targetId: "-100999",
        enabled: false,
        token: "tg-session-secret",
      });
    } finally {
      db.close();
    }
  });

  it("writes allowed keys when no read-only projection key is included", () => {
    const db = createDb();
    try {
      const { putRoutes } = createHarness(db);
      const handler = putRoutes.get("/api/settings");
      expect(handler).toBeTypeOf("function");

      const res = createResponse();
      handler?.(
        {
          body: {
            officeWorkflowPack: "development",
            dashboardDensity: "wide",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, warnings: [] });
      expect(
        (db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack'").get() as { value: string }).value,
      ).toBe("development");
      expect(
        (db.prepare("SELECT value FROM settings WHERE key = 'dashboardDensity'").get() as { value: string }).value,
      ).toBe("wide");
    } finally {
      db.close();
    }
  });
});
