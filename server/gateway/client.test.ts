import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const TELEGRAM_DEPARTMENT_ENV_KEYS = [
  "TELEGRAM_DEPARTMENT_BOT_ROUTING",
  "TELEGRAM_GLOBAL_GROUP_CHAT_ID",
  "TELEGRAM_BOT_TOKEN_DEV",
  "TELEGRAM_CHAT_ID_DEV",
  "TELEGRAM_BOT_TOKEN_QA",
  "TELEGRAM_CHAT_ID_QA",
  "TELEGRAM_BOT_TOKEN_DESIGN",
  "TELEGRAM_CHAT_ID_DESIGN",
  "TELEGRAM_BOT_TOKEN_PLANNING",
  "TELEGRAM_CHAT_ID_PLANNING",
  "TELEGRAM_BOT_TOKEN_PMO",
  "TELEGRAM_CHAT_ID_PMO",
  "TELEGRAM_BOT_TOKEN_CEO_PMO",
  "TELEGRAM_CHAT_ID_CEO_PMO",
  "TELEGRAM_BOT_TOKEN_PM",
  "TELEGRAM_CHAT_ID_PM",
  "TELEGRAM_BOT_TOKEN_OPERATIONS",
  "TELEGRAM_CHAT_ID_OPERATIONS",
  "TELEGRAM_BOT_TOKEN_DEVSECOPS",
  "TELEGRAM_CHAT_ID_DEVSECOPS",
];

function createTestDb(options?: { messengerChannels?: unknown }): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-messenger-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    if (options && Object.prototype.hasOwnProperty.call(options, "messengerChannels")) {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run("messengerChannels", JSON.stringify(options.messengerChannels ?? {}));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

async function importGatewayModule(env: Record<string, string | undefined>) {
  vi.resetModules();

  process.env = { ...ORIGINAL_ENV };
  for (const key of TELEGRAM_DEPARTMENT_ENV_KEYS) {
    process.env[key] = "";
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return import("./client.ts");
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("gateway client", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("notifyTaskStatus sends to configured channel sessions", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [{ id: "tg-1", name: "Telegram", targetId: "-100123", enabled: true }],
        },
        discord: {
          token: "discord-token",
          sessions: [{ id: "dc-1", name: "Discord", targetId: "987654", enabled: true }],
        },
        slack: {
          token: "xoxb-test",
          sessions: [{ id: "sl-1", name: "Slack", targetId: "C123", enabled: true }],
        },
        whatsapp: {
          token: "wa-access-token|1234567890",
          sessions: [{ id: "wa-1", name: "WhatsApp", targetId: "+821012345678", enabled: true }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    gateway.notifyTaskStatus("task-1", "테스트 작업", "in_progress", "ko");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const calls = fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;

    const telegramCall = calls.find(([url]) => url.includes("api.telegram.org"));
    expect(telegramCall?.[0]).toBe("https://api.telegram.org/bottg-token/sendMessage");
    expect(telegramCall?.[1]?.method).toBe("POST");

    const discordCall = calls.find(([url]) => url.includes("discord.com/api/v10/channels"));
    expect(discordCall?.[0]).toBe("https://discord.com/api/v10/channels/987654/messages");
    expect((discordCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bot discord-token");

    const slackCall = calls.find(([url]) => url.includes("slack.com/api/chat.postMessage"));
    expect(slackCall?.[0]).toBe("https://slack.com/api/chat.postMessage");
    expect((slackCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bearer xoxb-test");

    const whatsappCall = calls.find(([url]) => url.includes("graph.facebook.com"));
    expect(whatsappCall?.[0]).toBe("https://graph.facebook.com/v22.0/1234567890/messages");
    expect((whatsappCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bearer wa-access-token");
  });

  it("notifyTaskStatus skips agent-bound sessions", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [
            { id: "agent-chat", name: "Agent Chat", targetId: "-100111", enabled: true, agentId: "agent-1" },
            { id: "broadcast", name: "Broadcast", targetId: "-100222", enabled: true },
          ],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    gateway.notifyTaskStatus("task-2", "agent task", "in_progress", "en");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-token/sendMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as { chat_id?: string };
    expect(body.chat_id).toBe("-100222");
  });

  it("notifyTaskStatus falls back to an enabled scoped Telegram session when no broadcast session exists", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [
            {
              id: "ops-room",
              name: "Operations Room",
              targetId: "-100333",
              enabled: true,
              departmentId: "operations",
            },
          ],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    gateway.notifyTaskStatus("task-3", "ISO 품질 기반 V-모델 생성 프로세스 수립", "in_progress", "ko");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-token/sendMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      chat_id?: string;
      text?: string;
    };
    expect(body.chat_id).toBe("-100333");
    expect(body.text).toContain("[진행 시작]");
  });

  it("listMessengerSessions exposes only one global Telegram session", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-db-token",
          departmentBots: {
            development: { token: "tg-dev-token", targetId: "-100999", enabled: true },
          },
          sessions: [
            { id: "ops", name: "Ops Alert", targetId: "-100999", enabled: true },
            {
              id: "global-group-chat",
              name: "Claw-Empire 통합 그룹방 (동그리컴퍼티 회의실)",
              targetId: "-100777",
              enabled: true,
            },
            { id: "silent", name: "Silent", targetId: "-100000", enabled: false },
          ],
        },
        whatsapp: {
          token: "wa-token",
          sessions: [{ id: "wa-main", name: "WA Main", targetId: "wa-123", enabled: true }],
        },
        googlechat: {
          token: "gc-token",
          sessions: [{ id: "gchat-1", name: "GChat", targetId: "spaces/AAA", enabled: true }],
        },
      },
    });

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const sessions = gateway.listMessengerSessions();
    expect(sessions).toEqual([
      {
        sessionKey: "telegram:global",
        channel: "telegram",
        targetId: "-100777",
        enabled: true,
        displayName: "Global Telegram Group",
      },
      {
        sessionKey: "whatsapp:wa-main",
        channel: "whatsapp",
        targetId: "wa-123",
        enabled: true,
        displayName: "WA Main",
      },
      {
        sessionKey: "googlechat:gchat-1",
        channel: "googlechat",
        targetId: "spaces/AAA",
        enabled: true,
        displayName: "GChat",
      },
    ]);
  });

  it("sendMessengerMessage sends directly to a target channel", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        discord: {
          token: "discord-db-token",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "discord",
      targetId: "123456",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://discord.com/api/v10/channels/123456/messages");
  });

  it("listDiscordChannelsByToken discovers guild channels with a Bot token", async () => {
    const dbPath = createTestDb();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/users/@me/guilds")) {
        return new Response(
          JSON.stringify([
            { id: "g2", name: "Beta Team" },
            { id: "g1", name: "Alpha Team" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/guilds/g1/channels")) {
        return new Response(
          JSON.stringify([
            { id: "c2", name: "general", type: 0 },
            { id: "c3", name: "voice", type: 2 },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/guilds/g2/channels")) {
        return new Response(JSON.stringify([{ id: "c1", name: "announcements", type: 5 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not_found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const channels = await gateway.listDiscordChannelsByToken("Bot test-token");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bot test-token");
    expect(channels).toEqual([
      {
        id: "c2",
        name: "general",
        guildId: "g1",
        guildName: "Alpha Team",
        type: 0,
      },
      {
        id: "c1",
        name: "announcements",
        guildId: "g2",
        guildName: "Beta Team",
        type: 5,
      },
    ]);
  });

  it("listDiscordChannelsByToken throws on auth failure", async () => {
    const dbPath = createTestDb();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"401: Unauthorized"}', { status: 401 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await expect(gateway.listDiscordChannelsByToken("invalid-token")).rejects.toThrow("discord api failed (401)");
  });

  it("sendMessengerMessage prefers the matched session token", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [
            { id: "ops-1", name: "Ops-1", targetId: "-100111", enabled: true, token: "tg-session-token" },
            { id: "ops-2", name: "Ops-2", targetId: "-100222", enabled: true },
          ],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "telegram",
      targetId: "-100111",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendMessengerSessionMessage uses the global session token", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100333", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerSessionMessage("telegram:global", "hello session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendDepartmentTelegramMessage routes a department through its send-only bot", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "global", name: "Global", targetId: "-100333", enabled: true, token: "tg-session-token" }],
          departmentBots: {
            development: { token: "tg-dev-token", targetId: "-100999", enabled: true },
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const result = await gateway.sendDepartmentTelegramMessage({
      sessionKey: "telegram:global",
      departmentId: "development",
      text: "hello department",
    });

    expect(result).toEqual({ routed: "department_bot", departmentId: "dev" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-dev-token/sendMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as { chat_id?: string };
    expect(body.chat_id).toBe("-100333");
  });

  it("sendDepartmentTelegramMessage preserves Korean text in the Telegram JSON payload", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "global", name: "Global", targetId: "-100333", enabled: true, token: "tg-session-token" }],
          departmentBots: {
            development: { token: "tg-dev-token", targetId: "-100999", enabled: true },
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const text = "[개발][task-1][계획됨]\n아리아(개발팀): 한국어 발신 테스트입니다.";
    await gateway.sendDepartmentTelegramMessage({
      sessionKey: "telegram:global",
      departmentId: "development",
      text,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as { text?: string };
    expect(body.text).toBe(text);
    expect(body.text).not.toMatch(/�|[?]{4,}|占|揶|筌|癰|域|嚥/);
  });

  it("sendDepartmentTelegramMessage falls back to the global bot when no department bot is mapped", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "global", name: "Global", targetId: "-100333", enabled: true, token: "tg-session-token" }],
          departmentBots: {
            development: { token: "tg-dev-token", targetId: "-100333", enabled: true },
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const result = await gateway.sendDepartmentTelegramMessage({
      sessionKey: "telegram:global",
      departmentId: "qa",
      text: "hello fallback",
    });

    expect(result).toEqual({ routed: "global", departmentId: "qa", fallbackReason: "department_bot_missing" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendDepartmentTelegramMessage falls back to the global bot when a department bot send fails", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "global", name: "Global", targetId: "-100333", enabled: true, token: "tg-session-token" }],
          departmentBots: {
            qa: { token: "tg-qa-token", targetId: "-100333", enabled: true },
          },
        },
      },
    });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("bottg-qa-token")) {
        return new Response(JSON.stringify({ ok: false, description: "bot blocked" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const result = await gateway.sendDepartmentTelegramMessage({
      sessionKey: "telegram:global",
      departmentId: "qa",
      text: "hello fallback",
    });

    expect(result).toEqual({ routed: "global", departmentId: "qa", fallbackReason: "bot_blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-qa-token/sendMessage");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendDepartmentTelegramMessage can load department bot routes from environment", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "global", name: "Global", targetId: "-100333", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
      TELEGRAM_DEPARTMENT_BOT_ROUTING: "1",
      TELEGRAM_GLOBAL_GROUP_CHAT_ID: "-100999",
      TELEGRAM_BOT_TOKEN_DEV: "tg-env-dev-token",
      TELEGRAM_CHAT_ID_DEV: "-100111",
    });

    const result = await gateway.sendDepartmentTelegramMessage({
      sessionKey: "telegram:global",
      departmentId: "development",
      text: "hello env",
    });

    expect(result).toEqual({ routed: "department_bot", departmentId: "dev" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-env-dev-token/sendMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as { chat_id?: string };
    expect(body.chat_id).toBe("-100999");
  });

  it("sendMessengerMessage sends through WhatsApp Cloud API", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        whatsapp: {
          token: "wa-db-token|1234509876",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "whatsapp",
      targetId: "+821099988877",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v22.0/1234509876/messages");
  });

  it("sendMessengerMessage sends through Google Chat webhook URL", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        googlechat: {
          token: "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=test-key&token=test-token",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "googlechat",
      targetId: "spaces/AAAA",
      text: "hello googlechat",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=test-key&token=test-token",
    );
  });

  it("sendMessengerMessage sends through Signal RPC", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        signal: {
          token: "http://127.0.0.1:8080|account=+821055566677",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { timestamp: 123 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "signal",
      targetId: "+821012345678",
      text: "hello signal",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8080/api/v1/rpc");
  });

  it("sendMessengerTyping sends Telegram typing action", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "telegram",
      targetId: "-100777",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-token/sendChatAction");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      chat_id?: string;
      action?: string;
    };
    expect(body.chat_id).toBe("-100777");
    expect(body.action).toBe("typing");
  });

  it("sendMessengerTyping prefers the matched session token", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100999", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "telegram",
      targetId: "-100999",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendChatAction");
  });

  it("sendMessengerSessionTyping sends typing through the global session key", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100999", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerSessionTyping("telegram:global");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendChatAction");
  });

  it("sendMessengerTyping no-ops for non-typing channels", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        whatsapp: {
          token: "wa-token",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "whatsapp",
      targetId: "wa-chat",
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("sendMessengerTyping calls Signal sendTyping RPC", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        signal: {
          token: "http://127.0.0.1:8080|account=+821011122233",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "signal",
      targetId: "+821012300000",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8080/api/v1/rpc");
  });

  it("gatewayHttpInvoke reports removed integration", async () => {
    const dbPath = createTestDb();
    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await expect(gateway.gatewayHttpInvoke({ tool: "message" })).rejects.toThrow(
      "openclaw gateway integration has been removed",
    );
  });
});
