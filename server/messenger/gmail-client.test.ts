import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  GMAIL_SEND_SCOPE,
  GmailSendBlockedError,
  buildGmailRawMessage,
  getGmailSendStatus,
  sendGmailMessage,
} from "./gmail-client.ts";

function createDb(oauth: Record<string, unknown> | null): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  if (oauth) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('gmailIntakeOAuth', ?)").run(JSON.stringify(oauth));
  }
  return db;
}

describe("gmail client", () => {
  it("builds an RFC822 Gmail raw message with UTF-8 subject", () => {
    const raw = buildGmailRawMessage({
      to: ["ops@example.com"],
      cc: ["audit@example.com"],
      subject: "전략보수 테스트",
      text: "본문",
    });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: ops@example.com");
    expect(decoded).toContain("Cc: audit@example.com");
    expect(decoded).toContain("Subject: =?UTF-8?B?");
    expect(decoded).toContain("본문");
  });

  it("blocks send when Gmail OAuth lacks gmail.send scope", async () => {
    const db = createDb({
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3600_000,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });
    try {
      const status = getGmailSendStatus(db);
      expect(status.sendScopeGranted).toBe(false);
      await expect(
        sendGmailMessage({
          db,
          to: ["ops@example.com"],
          subject: "subject",
          text: "text",
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject(new GmailSendBlockedError("gmail_send_scope_missing"));
    } finally {
      db.close();
    }
  });

  it("sends through Gmail API when OAuth has gmail.send scope", async () => {
    const db = createDb({
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3600_000,
      scope: GMAIL_SEND_SCOPE,
      email: "sender@example.com",
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}")) as { raw?: string };
      expect(body.raw).toBeTruthy();
      return new Response(JSON.stringify({ id: "gmail-message-id", threadId: "thread-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    try {
      const result = await sendGmailMessage({
        db,
        to: ["ops@example.com"],
        subject: "전략보수",
        text: "본문",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      expect(result.id).toBe("gmail-message-id");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
});
