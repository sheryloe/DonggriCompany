import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function encryptSecret(plaintext: string, secret: string): string {
  const key = createHash("sha256").update(secret, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

function createTestDb(options?: { oauth?: boolean; messenger?: boolean; row?: boolean }): {
  dbPath: string;
  db: DatabaseSync;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-calendar-intake-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE calendar_intake_events (
      id TEXT PRIMARY KEY,
      google_event_id TEXT NOT NULL UNIQUE,
      calendar_id TEXT NOT NULL,
      html_link TEXT,
      summary TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      start_at TEXT,
      end_at TEXT,
      google_updated_at TEXT,
      event_hash TEXT NOT NULL,
      prn_markdown TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received',
      project_id TEXT,
      project_path TEXT,
      created_task_id TEXT,
      error TEXT,
      approved_at INTEGER,
      rejected_at INTEGER,
      submitted_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()*1000),
      updated_at INTEGER DEFAULT (unixepoch()*1000)
    );
  `);
  if (options?.oauth) {
    const secret = "test-oauth-secret";
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "gmailIntakeOAuth",
      JSON.stringify({
        clientId: "google-client",
        clientSecretEnc: encryptSecret("google-client-secret", secret),
        accessTokenEnc: encryptSecret("google-access", secret),
        refreshTokenEnc: encryptSecret("google-refresh", secret),
        expiresAt: Date.now() + 60 * 60 * 1000,
      }),
    );
  }
  if (options?.messenger) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "messengerChannels",
      JSON.stringify({
        telegram: {
          token: "tg-token",
          sessions: [{ id: "global", name: "Global", targetId: "1001", enabled: true }],
        },
      }),
    );
  }
  if (options?.row) {
    db.prepare(
      `
        INSERT INTO calendar_intake_events (
          id, google_event_id, calendar_id, html_link, summary, description,
          location, start_at, end_at, google_updated_at, event_hash, prn_markdown,
          status, project_path, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "CAL-20260429-001",
      "event-approval",
      "primary",
      "https://calendar.google.com/event",
      "[해커톤] 승인 테스트",
      "프로젝트 준비",
      "Online",
      "2026-04-29T09:00:00+09:00",
      "2026-04-29T18:00:00+09:00",
      "2026-04-28T12:00:00Z",
      "hash",
      "# PRN\n\n## requirements\n\n프로젝트 준비",
      "approval_pending",
      "C:\\path\\to\\DonggriCompany",
      Date.now(),
      Date.now(),
    );
  }
  return { dbPath, db };
}

async function importReceiver(dbPath: string) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DB_PATH: dbPath,
    OAUTH_ENCRYPTION_SECRET: "test-oauth-secret",
    INBOX_WEBHOOK_SECRET: "inbox-secret",
    CALENDAR_INTAKE_ENABLED: "1",
    CALENDAR_INTAKE_CALENDAR_ID: "primary",
    CALENDAR_INTAKE_MATCH_TOKENS: "[DonggriCompany],[Hackathon],[해커톤],해커톤,hackathon",
    CALENDAR_INTAKE_POLL_INTERVAL_MS: "60000",
    CALENDAR_INTAKE_LOOKBACK_DAYS: "1",
    CALENDAR_INTAKE_LOOKAHEAD_DAYS: "60",
    CALENDAR_INTAKE_TELEGRAM_SESSION_KEY: "telegram:global",
    CALENDAR_INTAKE_DEFAULT_PROJECT_PATH: "C:\\path\\to\\DonggriCompany",
  };
  return import("./calendar-intake-receiver.ts");
}

describe("calendar intake receiver", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("matches configured calendar intake tokens and keywords", async () => {
    const { dbPath, db } = createTestDb();
    try {
      const receiver = await importReceiver(dbPath);
      expect(receiver.isCalendarIntakeEvent("[DonggriCompany] 프로젝트")).toBe(true);
      expect(receiver.isCalendarIntakeEvent("[해커톤] 본선")).toBe(true);
      expect(receiver.isCalendarIntakeEvent("AI hackathon 준비")).toBe(true);
      expect(receiver.isCalendarIntakeEvent("개인 일정")).toBe(false);
    } finally {
      db.close();
    }
  });

  it("creates an approval-pending PRN from a matching calendar event", async () => {
    const { dbPath, db } = createTestDb({ oauth: true, messenger: true });
    try {
      const receiver = await importReceiver(dbPath);
      const status: import("./calendar-intake-receiver.ts").CalendarIntakeReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        authorized: false,
        calendarId: "",
        matchTokenCount: 0,
        pollIntervalMs: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastEventId: null,
        lastIntakeId: null,
        pendingCount: 0,
        processedCount: 0,
        lastError: null,
      };
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("calendar/v3/calendars/primary/events")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "event-1",
                  htmlLink: "https://calendar.google.com/event",
                  summary: "[해커톤] 신규 프로젝트",
                  description: "해커톤 요구사항 정리",
                  location: "Online",
                  updated: "2026-04-28T12:00:00Z",
                  start: { dateTime: "2026-04-29T09:00:00+09:00" },
                  end: { dateTime: "2026-04-29T18:00:00+09:00" },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("api.telegram.org")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
          expect(body.text).toContain("[Calendar Intake][승인 대기]");
          expect(body.text).toContain("CAL-");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      await receiver.pollCalendarIntakeReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(status.enabled).toBe(true);
      expect(status.authorized).toBe(true);
      expect(status.pendingCount).toBe(1);
      const row = db.prepare("SELECT * FROM calendar_intake_events WHERE google_event_id = ?").get("event-1") as
        | { status: string; prn_markdown: string }
        | undefined;
      expect(row?.status).toBe("approval_pending");
      expect(row?.prn_markdown).toContain("해커톤 요구사항 정리");
    } finally {
      db.close();
    }
  });

  it("approves a pending calendar intake item into /api/inbox", async () => {
    const { dbPath, db } = createTestDb({ row: true });
    try {
      const receiver = await importReceiver(dbPath);
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/inbox")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          expect(body.source).toBe("calendar");
          expect(body.message_id).toBe("calendar:event-approval:approved");
          expect(body.chat).toBe("telegram:global");
          expect(String(body.text)).toContain("$# PRN");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      });

      const result = await receiver.handleCalendarIntakeTelegramCommand({
        db,
        text: "승인 CAL-20260429-001",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result?.handled).toBe(true);
      expect(result?.text).toContain("제출 완료");
      const row = db
        .prepare("SELECT status, submitted_at FROM calendar_intake_events WHERE id = ?")
        .get("CAL-20260429-001") as { status: string; submitted_at: number | null };
      expect(row.status).toBe("submitted");
      expect(typeof row.submitted_at).toBe("number");
    } finally {
      db.close();
    }
  });
});
