import type { DatabaseSync } from "node:sqlite";
import { decryptSecret, encryptSecret } from "../oauth/helpers.ts";

export const GMAIL_OAUTH_SETTING_KEY = "gmailIntakeOAuth";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const GMAIL_TOKEN_REFRESH_SKEW_MS = 60_000;

type DbLike = Pick<DatabaseSync, "prepare">;

export type GmailSendStatus = {
  configured: boolean;
  authorized: boolean;
  sendScopeGranted: boolean;
  email: string | null;
  expiresAt: number | null;
  missingReason: string | null;
};

type GmailOAuthSettings = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  email: string | null;
  raw: Record<string, unknown>;
};

export type GmailSendResult = {
  ok: true;
  id: string | null;
  threadId: string | null;
};

export class GmailSendBlockedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "GmailSendBlockedError";
    this.code = code;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSetting(db: DbLike, key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: unknown } | undefined;
  return normalizeText(row?.value);
}

function writeSetting(db: DbLike, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function parseScopeSet(raw: unknown): Set<string> {
  return new Set(
    normalizeText(raw)
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

function safeParseOAuthRaw(db: DbLike): Record<string, unknown> | null {
  const rawSetting = readSetting(db, GMAIL_OAUTH_SETTING_KEY);
  if (!rawSetting) return null;
  try {
    const parsed = JSON.parse(rawSetting) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decryptMaybe(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  return decryptSecret(raw);
}

function readOAuthSettings(db: DbLike): GmailOAuthSettings | null {
  const parsed = safeParseOAuthRaw(db);
  if (!parsed) return null;
  const clientId = normalizeText(parsed.clientId ?? parsed.client_id);
  const clientSecretEnc = normalizeText(parsed.clientSecretEnc ?? parsed.client_secret_enc);
  const accessTokenEnc = normalizeText(parsed.accessTokenEnc ?? parsed.access_token_enc);
  const refreshTokenEnc = normalizeText(parsed.refreshTokenEnc ?? parsed.refresh_token_enc);
  const clientSecretRaw = normalizeText(parsed.clientSecret ?? parsed.client_secret);
  const accessTokenRaw = normalizeText(parsed.accessToken ?? parsed.access_token);
  const refreshTokenRaw = normalizeText(parsed.refreshToken ?? parsed.refresh_token);
  const clientSecret = clientSecretEnc ? decryptMaybe(clientSecretEnc) : clientSecretRaw;
  const accessToken = accessTokenEnc ? decryptMaybe(accessTokenEnc) : accessTokenRaw;
  const refreshToken = refreshTokenEnc ? decryptMaybe(refreshTokenEnc) : refreshTokenRaw;
  const expiresAt = Number(parsed.expiresAt ?? parsed.expires_at ?? 0);
  const scope = normalizeText(parsed.scope);
  if (!clientId || !clientSecret || !accessToken || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    scope,
    email: normalizeText(parsed.email) || null,
    raw: parsed,
  };
}

export function getGmailSendStatus(db: DbLike): GmailSendStatus {
  const parsed = safeParseOAuthRaw(db);
  if (!parsed) {
    return {
      configured: false,
      authorized: false,
      sendScopeGranted: false,
      email: null,
      expiresAt: null,
      missingReason: "gmail_oauth_missing",
    };
  }

  const hasClient = Boolean(normalizeText(parsed.clientId ?? parsed.client_id));
  const hasAccessToken = Boolean(normalizeText(parsed.accessTokenEnc ?? parsed.access_token_enc ?? parsed.accessToken));
  const hasRefreshToken = Boolean(
    normalizeText(parsed.refreshTokenEnc ?? parsed.refresh_token_enc ?? parsed.refreshToken),
  );
  const sendScopeGranted = parseScopeSet(parsed.scope).has(GMAIL_SEND_SCOPE);
  const configured = hasClient && hasAccessToken && hasRefreshToken;
  const missingReason = !configured ? "gmail_oauth_incomplete" : !sendScopeGranted ? "gmail_send_scope_missing" : null;
  const expiresAt = Number(parsed.expiresAt ?? parsed.expires_at ?? 0);

  return {
    configured,
    authorized: configured && sendScopeGranted,
    sendScopeGranted,
    email: normalizeText(parsed.email) || null,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
    missingReason,
  };
}

async function resolveAccessToken(db: DbLike, fetchImpl: typeof fetch): Promise<string> {
  const oauth = readOAuthSettings(db);
  if (!oauth) throw new GmailSendBlockedError("gmail_oauth_missing");
  if (!parseScopeSet(oauth.scope).has(GMAIL_SEND_SCOPE)) {
    throw new GmailSendBlockedError("gmail_send_scope_missing");
  }
  if (oauth.accessToken && oauth.expiresAt > Date.now() + GMAIL_TOKEN_REFRESH_SKEW_MS) {
    return oauth.accessToken;
  }

  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: oauth.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string }
    | { error?: string; error_description?: string }
    | null;
  if (!res.ok || !payload || !("access_token" in payload) || !payload.access_token) {
    const detail =
      payload && "error_description" in payload
        ? payload.error_description
        : payload && "error" in payload
          ? payload.error
          : "";
    throw new Error(`gmail_token_refresh_failed:${res.status}${detail ? `:${detail}` : ""}`);
  }

  const refreshToken = "refresh_token" in payload && payload.refresh_token ? payload.refresh_token : oauth.refreshToken;
  const next: Record<string, unknown> = {
    ...oauth.raw,
    clientId: oauth.clientId,
    clientSecretEnc: encryptSecret(oauth.clientSecret),
    accessTokenEnc: encryptSecret(payload.access_token),
    refreshTokenEnc: encryptSecret(refreshToken),
    expiresAt: Date.now() + Math.max(1, Number(payload.expires_in ?? 3600)) * 1000,
    scope: "scope" in payload && payload.scope ? payload.scope : oauth.scope,
    updatedAt: Date.now(),
  };
  delete next.clientSecret;
  delete next.client_secret;
  delete next.accessToken;
  delete next.access_token;
  delete next.refreshToken;
  delete next.refresh_token;
  writeSetting(db, GMAIL_OAUTH_SETTING_KEY, JSON.stringify(next));
  return payload.access_token;
}

export function normalizeEmailRecipients(input: unknown): string[] {
  const values = Array.isArray(input) ? input : normalizeText(input).split(/[,\n;]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const email = normalizeText(raw).toLowerCase();
    if (!email || seen.has(email)) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function buildGmailRawMessage(input: { to: string[]; cc?: string[]; subject: string; text: string }): string {
  const cc = input.cc ?? [];
  const headers = [
    `To: ${input.to.join(", ")}`,
    ...(cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.text}`, "utf8").toString("base64url");
}

export async function sendGmailMessage(options: {
  db: DbLike;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSendResult> {
  const to = normalizeEmailRecipients(options.to);
  const cc = normalizeEmailRecipients(options.cc ?? []);
  if (to.length === 0) throw new GmailSendBlockedError("gmail_recipients_missing");

  const fetchImpl = options.fetchImpl ?? fetch;
  const accessToken = await resolveAccessToken(options.db, fetchImpl);
  const raw = buildGmailRawMessage({
    to,
    cc,
    subject: options.subject,
    text: options.text,
  });
  const res = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const payload = (await res.json().catch(() => null)) as { id?: string; threadId?: string } | null;
  if (!res.ok) {
    throw new Error(`gmail_send_failed:${res.status}`);
  }
  return {
    ok: true,
    id: payload?.id ?? null,
    threadId: payload?.threadId ?? null,
  };
}
