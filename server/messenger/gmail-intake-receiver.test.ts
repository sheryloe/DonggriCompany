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

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createTestDb(options?: { oauth?: boolean; messenger?: boolean; row?: boolean }): {
  dbPath: string;
  db: DatabaseSync;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-gmail-intake-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE gmail_intake_messages (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT NOT NULL UNIQUE,
      gmail_thread_id TEXT,
      subject TEXT NOT NULL,
      sender TEXT NOT NULL,
      received_at INTEGER,
      source_text TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL,
      attachment_manifest_json TEXT NOT NULL DEFAULT '[]',
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
        clientId: "gmail-client",
        clientSecretEnc: encryptSecret("gmail-client-secret", secret),
        accessTokenEnc: encryptSecret("gmail-access", secret),
        refreshTokenEnc: encryptSecret("gmail-refresh", secret),
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
        INSERT INTO gmail_intake_messages (
          id, gmail_message_id, gmail_thread_id, subject, sender, received_at,
          source_text, content_hash, attachment_manifest_json, prn_markdown,
          status, project_path, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "GMAIL-20260429-001",
      "msg-approval",
      "thread-1",
      "[DonggriCompany] 승인 테스트",
      "sender@example.com",
      Date.now(),
      "source text",
      "hash",
      "[]",
      "# PRN\n\n## requirements\n\n승인 테스트",
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
    GMAIL_INTAKE_ENABLED: "1",
    GMAIL_INTAKE_SUBJECT_TOKEN: "[DonggriCompany]",
    GMAIL_INTAKE_ALLOWED_SENDERS: "sender@example.com",
    GMAIL_INTAKE_POLL_INTERVAL_MS: "60000",
    GMAIL_INTAKE_LOOKBACK_DAYS: "14",
    GMAIL_INTAKE_MAX_ATTACHMENT_MB: "10",
    GMAIL_INTAKE_TELEGRAM_SESSION_KEY: "telegram:global",
    GMAIL_INTAKE_DEFAULT_PROJECT_PATH: "C:\\path\\to\\DonggriCompany",
  };
  return import("./gmail-intake-receiver.ts");
}

describe("gmail intake receiver", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("filters the exact [DonggriCompany] subject token after reply prefixes", async () => {
    const { dbPath, db } = createTestDb();
    try {
      const receiver = await importReceiver(dbPath);
      expect(receiver.isGmailIntakeSubject("[DonggriCompany] 명세")).toBe(true);
      expect(receiver.isGmailIntakeSubject("Re: [DonggriCompany] 명세")).toBe(true);
      expect(receiver.isGmailIntakeSubject("Fwd: [DonggriCompany] 명세")).toBe(true);
      expect(receiver.isGmailIntakeSubject("[Other] 명세")).toBe(false);
      expect(receiver.extractEmailAddress("Donggri <sender@example.com>")).toBe("sender@example.com");
      expect(receiver.decodeBase64UrlUtf8(b64url("본문"))).toBe("본문");
    } finally {
      db.close();
    }
  });

  it("parses an allowed Gmail message into an approval-pending PRN and sends Telegram approval request", async () => {
    const { dbPath, db } = createTestDb({ oauth: true, messenger: true });
    try {
      const receiver = await importReceiver(dbPath);
      const status: import("./gmail-intake-receiver.ts").GmailIntakeReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        authorized: false,
        allowedSenderCount: 0,
        pollIntervalMs: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastMessageId: null,
        lastIntakeId: null,
        pendingCount: 0,
        processedCount: 0,
        lastError: null,
      };
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("gmail/v1/users/me/messages?")) {
          return new Response(JSON.stringify({ messages: [{ id: "msg-1", threadId: "thread-1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("gmail/v1/users/me/messages/msg-1?")) {
          return new Response(
            JSON.stringify({
              id: "msg-1",
              threadId: "thread-1",
              internalDate: String(Date.now()),
              payload: {
                mimeType: "multipart/mixed",
                headers: [
                  { name: "Subject", value: "[DonggriCompany] 신규 명세" },
                  { name: "From", value: "Donggri <sender@example.com>" },
                ],
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: b64url("메일 본문 명세") },
                  },
                  {
                    mimeType: "text/plain",
                    filename: "spec.md",
                    body: { attachmentId: "att-1", size: 18 },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/attachments/att-1")) {
          return new Response(JSON.stringify({ data: b64url("첨부 명세"), size: 13 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("api.telegram.org")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
          expect(body.text).toContain("[Gmail Intake][승인 대기]");
          expect(body.text).toContain("GMAIL-");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      await receiver.pollGmailIntakeReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(status.enabled).toBe(true);
      expect(status.authorized).toBe(true);
      expect(status.pendingCount).toBe(1);
      expect(status.lastMessageId).toBe("msg-1");
      const row = db.prepare("SELECT * FROM gmail_intake_messages WHERE gmail_message_id = ?").get("msg-1") as
        | { status: string; prn_markdown: string; attachment_manifest_json: string }
        | undefined;
      expect(row?.status).toBe("approval_pending");
      expect(row?.prn_markdown).toContain("메일 본문 명세");
      expect(row?.prn_markdown).toContain("첨부 명세");
      expect(JSON.parse(row?.attachment_manifest_json ?? "[]")[0].filename).toBe("spec.md");
    } finally {
      db.close();
    }
  });

  it("ignores Gmail search false positives when the subject does not start with the intake token", async () => {
    const { dbPath, db } = createTestDb({ oauth: true, messenger: true });
    try {
      const receiver = await importReceiver(dbPath);
      const status: import("./gmail-intake-receiver.ts").GmailIntakeReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        authorized: false,
        allowedSenderCount: 0,
        pollIntervalMs: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastMessageId: null,
        lastIntakeId: null,
        pendingCount: 0,
        processedCount: 0,
        lastError: null,
      };
      const fetchMock = vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("gmail/v1/users/me/messages?")) {
          return new Response(JSON.stringify({ messages: [{ id: "msg-false-positive", threadId: "thread-1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("gmail/v1/users/me/messages/msg-false-positive?")) {
          return new Response(
            JSON.stringify({
              id: "msg-false-positive",
              threadId: "thread-1",
              internalDate: String(Date.now()),
              payload: {
                mimeType: "text/plain",
                headers: [
                  { name: "Subject", value: "[sheryloe/DonggriCompany] Run failed" },
                  { name: "From", value: "GitHub <notifications@github.com>" },
                ],
                body: { data: b64url("not an intake request") },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      await receiver.pollGmailIntakeReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const count = db.prepare("SELECT COUNT(*) AS cnt FROM gmail_intake_messages").get() as { cnt: number };
      expect(count.cnt).toBe(0);
      expect(status.pendingCount).toBe(0);
      expect(status.processedCount).toBe(0);
    } finally {
      db.close();
    }
  });

  it("approves a pending Gmail intake item into /api/inbox and supports Telegram approve commands", async () => {
    const { dbPath, db } = createTestDb({ row: true });
    try {
      const receiver = await importReceiver(dbPath);
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/inbox")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          expect(body.source).toBe("gmail");
          expect(body.message_id).toBe("gmail:msg-approval:approved");
          expect(body.chat).toBe("telegram:global");
          expect(String(body.text)).toContain("$# PRN");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      });

      const result = await receiver.handleGmailIntakeTelegramCommand({
        db,
        text: "승인 GMAIL-20260429-001",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result?.handled).toBe(true);
      expect(result?.text).toContain("제출 완료");
      const row = db
        .prepare("SELECT status, submitted_at FROM gmail_intake_messages WHERE id = ?")
        .get("GMAIL-20260429-001") as { status: string; submitted_at: number | null };
      expect(row.status).toBe("submitted");
      expect(typeof row.submitted_at).toBe("number");
    } finally {
      db.close();
    }
  });
});
