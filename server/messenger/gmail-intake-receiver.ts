import { createHash } from "node:crypto";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import {
  GMAIL_INTAKE_ALLOWED_SENDERS,
  GMAIL_INTAKE_DEFAULT_PROJECT_PATH,
  GMAIL_INTAKE_ENABLED,
  GMAIL_INTAKE_LOOKBACK_DAYS,
  GMAIL_INTAKE_MAX_ATTACHMENT_MB,
  GMAIL_INTAKE_POLL_INTERVAL_MS,
  GMAIL_INTAKE_SUBJECT_TOKEN,
  GMAIL_INTAKE_TELEGRAM_SESSION_KEY,
  INBOX_WEBHOOK_SECRET,
  OAUTH_BASE_HOST,
  PORT,
} from "../config/runtime.ts";
import { decryptSecret, encryptSecret } from "../oauth/helpers.ts";
import { sendMessengerSessionMessage } from "../gateway/client.ts";

const GMAIL_OAUTH_SETTING_KEY = "gmailIntakeOAuth";
const GMAIL_LIST_PAGE_SIZE = 10;
const GMAIL_LIST_SCAN_LIMIT = 50;
const GMAIL_TOKEN_REFRESH_SKEW_MS = 60_000;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([".md", ".txt", ".json", ".pdf", ".docx"]);

type DbLike = Pick<DatabaseSync, "prepare">;

type ReceiverHandle = {
  stop: () => void;
  getStatus: () => GmailIntakeReceiverStatus;
};

export type GmailIntakeReceiverStatus = {
  running: boolean;
  configured: boolean;
  enabled: boolean;
  authorized: boolean;
  allowedSenderCount: number;
  pollIntervalMs: number;
  lastPollAt: number | null;
  lastForwardAt: number | null;
  lastMessageId: string | null;
  lastIntakeId: string | null;
  pendingCount: number;
  processedCount: number;
  lastError: string | null;
};

type GmailMessageRef = {
  id?: string;
  threadId?: string;
};

type GmailListResponse = {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
};

type GmailPartBody = {
  data?: string;
  attachmentId?: string;
  size?: number;
};

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: GmailPartBody;
  parts?: GmailPart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPart;
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
};

type GmailOAuthSettings = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  raw: Record<string, unknown>;
};

type AttachmentExtraction = {
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  extractedChars: number;
  status: "parsed";
};

type ParsedGmailMessage = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string;
  sender: string;
  receivedAt: number | null;
  sourceText: string;
  contentHash: string;
  attachmentManifest: AttachmentExtraction[];
  prnMarkdown: string;
};

export type GmailIntakeRow = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  subject: string;
  sender: string;
  received_at: number | null;
  source_text: string;
  content_hash: string;
  attachment_manifest_json: string;
  prn_markdown: string;
  status: string;
  project_id: string | null;
  project_path: string | null;
  created_task_id: string | null;
  error: string | null;
  approved_at: number | null;
  rejected_at: number | null;
  submitted_at: number | null;
  created_at: number | null;
  updated_at: number | null;
};

type GmailIntakeConfig = {
  enabled: boolean;
  subjectToken: string;
  allowedSenders: Set<string>;
  pollIntervalMs: number;
  lookbackDays: number;
  maxAttachmentBytes: number;
  telegramSessionKey: string;
  defaultProjectPath: string;
};

export type GmailIntakeCommandResult = {
  handled: boolean;
  text: string;
};

const initialStatus = (): GmailIntakeReceiverStatus => ({
  running: false,
  configured: false,
  enabled: false,
  authorized: false,
  allowedSenderCount: 0,
  pollIntervalMs: GMAIL_INTAKE_POLL_INTERVAL_MS,
  lastPollAt: null,
  lastForwardAt: null,
  lastMessageId: null,
  lastIntakeId: null,
  pendingCount: 0,
  processedCount: 0,
  lastError: null,
});

let receiverHandle: ReceiverHandle | null = null;
const ignoredSubjectMismatchMessageIds = new Set<string>();

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs(): number {
  return Date.now();
}

function cloneStatus(status: GmailIntakeReceiverStatus): GmailIntakeReceiverStatus {
  return { ...status };
}

function resolveConfig(): GmailIntakeConfig {
  return {
    enabled: GMAIL_INTAKE_ENABLED,
    subjectToken: GMAIL_INTAKE_SUBJECT_TOKEN || "[DonggriCompany]",
    allowedSenders: new Set(GMAIL_INTAKE_ALLOWED_SENDERS),
    pollIntervalMs: Math.max(10_000, GMAIL_INTAKE_POLL_INTERVAL_MS),
    lookbackDays: Math.max(1, GMAIL_INTAKE_LOOKBACK_DAYS),
    maxAttachmentBytes: Math.max(1, GMAIL_INTAKE_MAX_ATTACHMENT_MB) * 1024 * 1024,
    telegramSessionKey: GMAIL_INTAKE_TELEGRAM_SESSION_KEY || "telegram:global",
    defaultProjectPath: GMAIL_INTAKE_DEFAULT_PROJECT_PATH,
  };
}

export function stripGmailSubjectPrefixes(subject: string): string {
  let next = subject.trim();
  for (let i = 0; i < 8; i++) {
    const replaced = next.replace(/^(?:re|fw|fwd)\s*:\s*/i, "").trim();
    if (replaced === next) break;
    next = replaced;
  }
  return next;
}

export function isGmailIntakeSubject(subject: string, token = GMAIL_INTAKE_SUBJECT_TOKEN): boolean {
  const normalizedToken = token.trim();
  if (!normalizedToken) return false;
  return stripGmailSubjectPrefixes(subject).startsWith(normalizedToken);
}

export function extractEmailAddress(rawFrom: string): string {
  const decoded = decodeMimeHeader(rawFrom);
  const angle = decoded.match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const loose = decoded.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return (loose?.[1] ?? decoded).trim().toLowerCase();
}

export function decodeBase64UrlUtf8(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeBase64UrlBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_full, charsetRaw, encodingRaw, payloadRaw) => {
    const charset = String(charsetRaw).toLowerCase();
    const encoding = String(encodingRaw).toLowerCase();
    const payload = String(payloadRaw);
    try {
      const bytes =
        encoding === "b"
          ? Buffer.from(payload, "base64")
          : Buffer.from(
              payload.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
              }),
              "binary",
            );
      if (charset === "utf-8" || charset === "utf8" || charset === "ks_c_5601-1987") {
        return bytes.toString("utf8");
      }
      return bytes.toString("utf8");
    } catch {
      return payload;
    }
  });
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getHeader(part: GmailPart | undefined, name: string): string {
  const lower = name.toLowerCase();
  const found = part?.headers?.find((header) => normalizeText(header.name).toLowerCase() === lower);
  return decodeMimeHeader(normalizeText(found?.value));
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

function readOAuthSettings(db: DbLike): GmailOAuthSettings | null {
  const rawSetting = readSetting(db, GMAIL_OAUTH_SETTING_KEY);
  if (!rawSetting) return null;
  const parsed = JSON.parse(rawSetting) as Record<string, unknown>;
  const clientId = normalizeText(parsed.clientId ?? parsed.client_id);
  const clientSecretEnc = normalizeText(parsed.clientSecretEnc ?? parsed.client_secret_enc);
  const accessTokenEnc = normalizeText(parsed.accessTokenEnc ?? parsed.access_token_enc);
  const refreshTokenEnc = normalizeText(parsed.refreshTokenEnc ?? parsed.refresh_token_enc);
  const accessTokenRaw = normalizeText(parsed.accessToken ?? parsed.access_token);
  const refreshTokenRaw = normalizeText(parsed.refreshToken ?? parsed.refresh_token);
  const clientSecretRaw = normalizeText(parsed.clientSecret ?? parsed.client_secret);
  const expiresAt = Number(parsed.expiresAt ?? parsed.expires_at ?? 0);
  const clientSecret = clientSecretEnc ? decryptSecret(clientSecretEnc) : clientSecretRaw;
  const accessToken = accessTokenEnc ? decryptSecret(accessTokenEnc) : accessTokenRaw;
  const refreshToken = refreshTokenEnc ? decryptSecret(refreshTokenEnc) : refreshTokenRaw;
  if (!clientId || !clientSecret || !accessToken || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    raw: parsed,
  };
}

async function resolveAccessToken(db: DbLike, fetchImpl: typeof fetch): Promise<string> {
  const oauth = readOAuthSettings(db);
  if (!oauth) {
    throw new Error("gmail intake oauth missing");
  }
  if (oauth.accessToken && oauth.expiresAt > nowMs() + GMAIL_TOKEN_REFRESH_SKEW_MS) {
    return oauth.accessToken;
  }

  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: oauth.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
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
    throw new Error(`gmail token refresh failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const refreshToken = "refresh_token" in payload && payload.refresh_token ? payload.refresh_token : oauth.refreshToken;
  const next: Record<string, unknown> = {
    ...oauth.raw,
    clientId: oauth.clientId,
    clientSecretEnc: encryptSecret(oauth.clientSecret),
    accessTokenEnc: encryptSecret(payload.access_token),
    refreshTokenEnc: encryptSecret(refreshToken),
    expiresAt: nowMs() + Math.max(1, Number(payload.expires_in ?? 3600)) * 1000,
    scope: "scope" in payload ? payload.scope : oauth.raw.scope,
    updatedAt: nowMs(),
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

async function gmailJson<T>(url: URL, accessToken: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok || !payload) {
    const detail =
      payload && typeof payload === "object" && "error" in payload ? normalizeText(payload.error?.message) : "";
    throw new Error(`gmail api failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return payload as T;
}

async function listCandidateMessages(config: GmailIntakeConfig, accessToken: string, fetchImpl: typeof fetch) {
  const refs: GmailMessageRef[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", `subject:"${config.subjectToken.replace(/"/g, "")}" newer_than:${config.lookbackDays}d`);
    url.searchParams.set("maxResults", String(Math.min(GMAIL_LIST_PAGE_SIZE, GMAIL_LIST_SCAN_LIMIT - refs.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gmailJson<GmailListResponse>(url, accessToken, fetchImpl);
    if (Array.isArray(result.messages)) refs.push(...result.messages);
    pageToken = normalizeText(result.nextPageToken);
  } while (pageToken && refs.length < GMAIL_LIST_SCAN_LIMIT);
  return refs;
}

async function getGmailMessage(id: string, accessToken: string, fetchImpl: typeof fetch): Promise<GmailMessage> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "full");
  return gmailJson<GmailMessage>(url, accessToken, fetchImpl);
}

async function getGmailAttachment(
  messageId: string,
  attachmentId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<GmailAttachmentResponse> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(
      attachmentId,
    )}`,
  );
  return gmailJson<GmailAttachmentResponse>(url, accessToken, fetchImpl);
}

function walkParts(part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!part) return out;
  out.push(part);
  for (const child of part.parts ?? []) {
    walkParts(child, out);
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBodyText(message: GmailMessage): string {
  const parts = walkParts(message.payload);
  const plain = parts
    .filter(
      (part) =>
        !normalizeText(part.filename) &&
        normalizeText(part.mimeType).toLowerCase() === "text/plain" &&
        normalizeText(part.body?.data),
    )
    .map((part) => decodeBase64UrlUtf8(normalizeText(part.body?.data)))
    .join("\n\n")
    .trim();
  if (plain) return plain;
  return parts
    .filter(
      (part) =>
        !normalizeText(part.filename) &&
        normalizeText(part.mimeType).toLowerCase() === "text/html" &&
        normalizeText(part.body?.data),
    )
    .map((part) => stripHtml(decodeBase64UrlUtf8(normalizeText(part.body?.data))))
    .join("\n\n")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxText(bytes: Buffer): string {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) {
    if (bytes.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("docx_zip_directory_not_found");
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  let cursor = centralOffset;
  const end = centralOffset + centralSize;
  while (cursor < end) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const fileNameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const fileName = bytes.slice(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    cursor += 46 + fileNameLength + extraLength + commentLength;
    if (fileName !== "word/document.xml") continue;

    if (bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("docx_local_header_not_found");
    const localFileNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    const xml =
      method === 0 ? compressed.toString("utf8") : method === 8 ? inflateRawSync(compressed).toString("utf8") : "";
    const text = decodeXmlEntities(
      xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n"),
    ).trim();
    if (!text) throw new Error("docx_text_empty");
    return text;
  }
  throw new Error("docx_document_xml_not_found");
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfTextFromString(value: string): string {
  const chunks: string[] = [];
  for (const match of value.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    chunks.push(decodePdfLiteral(match[1]));
  }
  for (const match of value.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
    for (const inner of match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      chunks.push(decodePdfLiteral(inner[0].slice(1, -1)));
    }
  }
  return chunks
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const chunks = [extractPdfTextFromString(raw)];
  for (const streamMatch of raw.matchAll(
    /<<(?:.|\n|\r)*?\/FlateDecode(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g,
  )) {
    try {
      const inflated = inflateSync(Buffer.from(streamMatch[1], "latin1")).toString("latin1");
      const text = extractPdfTextFromString(inflated);
      if (text) chunks.push(text);
    } catch {
      // keep scanning other streams
    }
  }
  const text = chunks.filter(Boolean).join("\n\n").trim();
  if (!text) throw new Error("pdf_text_empty_or_unsupported");
  return text;
}

function extractAttachmentText(filename: string, bytes: Buffer): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".md" || ext === ".txt" || ext === ".json") {
    return bytes.toString("utf8").trim();
  }
  if (ext === ".docx") return extractDocxText(bytes);
  if (ext === ".pdf") return extractPdfText(bytes);
  throw new Error(`attachment_extension_not_allowed:${ext || "none"}`);
}

async function extractAttachments(params: {
  message: GmailMessage;
  accessToken: string;
  fetchImpl: typeof fetch;
  maxAttachmentBytes: number;
}): Promise<{ textBlocks: string[]; manifest: AttachmentExtraction[] }> {
  const { message, accessToken, fetchImpl, maxAttachmentBytes } = params;
  const textBlocks: string[] = [];
  const manifest: AttachmentExtraction[] = [];
  for (const part of walkParts(message.payload)) {
    const filename = normalizeText(part.filename);
    if (!filename) continue;
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
      throw new Error(`attachment_extension_not_allowed:${filename}`);
    }
    const declaredSize = Number(part.body?.size ?? 0);
    if (declaredSize > maxAttachmentBytes) {
      throw new Error(`attachment_too_large:${filename}`);
    }
    const attachmentId = normalizeText(part.body?.attachmentId);
    const data = attachmentId
      ? (await getGmailAttachment(normalizeText(message.id), attachmentId, accessToken, fetchImpl)).data
      : part.body?.data;
    if (!data) throw new Error(`attachment_data_missing:${filename}`);
    const bytes = decodeBase64UrlBuffer(data);
    if (bytes.byteLength > maxAttachmentBytes) {
      throw new Error(`attachment_too_large:${filename}`);
    }
    const text = extractAttachmentText(filename, bytes);
    if (!text) throw new Error(`attachment_text_empty:${filename}`);
    textBlocks.push(`## Attachment: ${filename}\n\n${text}`);
    manifest.push({
      filename,
      mimeType: normalizeText(part.mimeType) || "application/octet-stream",
      size: bytes.byteLength,
      sha256: sha256(bytes),
      extractedChars: text.length,
      status: "parsed",
    });
  }
  return { textBlocks, manifest };
}

function buildPrnMarkdown(params: {
  id: string;
  subject: string;
  sender: string;
  bodyText: string;
  attachmentText: string;
  manifest: AttachmentExtraction[];
}): string {
  const source = [params.bodyText, params.attachmentText].filter(Boolean).join("\n\n").trim();
  const attachmentSummary = params.manifest.length
    ? params.manifest
        .map((item) => `- ${item.filename} (${item.size} bytes, sha256=${item.sha256.slice(0, 12)})`)
        .join("\n")
    : "- 없음";
  return `# Gmail Intake PRN: ${params.subject}

intake_id: ${params.id}
source: gmail
sender: ${params.sender}

## background

사용자가 Gmail 제목 토큰 \`${GMAIL_INTAKE_SUBJECT_TOKEN}\`으로 DonggriCompany 명세를 접수했다. 이 메일은 자동 실행 대상이 아니라 승인 대기 PRN 초안이다.

## goal

메일 본문과 허용 첨부에서 추출한 명세를 기준으로 DonggriCompany 작업을 수행한다.

## non_goal

승인 없이 작업을 실행하지 않는다. 메일 첨부 안의 스크립트나 실행 파일은 실행하지 않는다.

## requirements

${source || "(메일 본문/첨부에서 추출된 명세가 비어 있음)"}

## acceptance_criteria

1. 메일 원문 요구가 PRN에 반영된다.
2. 실행 전 텔레그램 또는 대시보드 승인이 남는다.
3. 작업 결과와 검증 증거가 태스크 로그에 남는다.

## risks

1. 메일 본문이 모호하면 PMO가 추가 질문을 해야 한다.
2. PDF/DOCX 추출은 문서 구조에 따라 실패할 수 있다.
3. 승인 전에는 어떠한 코드 변경도 수행하지 않는다.

## open_questions

1. 프로젝트 경로가 메일에 명시되지 않은 경우 기본 프로젝트 경로를 사용한다.

## attachments

${attachmentSummary}

## directive_text

Gmail로 접수된 위 PRN 명세를 검토하고 승인된 범위 안에서 수행한다.
`;
}

function buildApprovalMessage(row: ParsedGmailMessage & { id: string }): string {
  const attachments = row.attachmentManifest.length
    ? row.attachmentManifest.map((item) => item.filename).join(", ")
    : "없음";
  return `[Gmail Intake][승인 대기] ${row.id}
제목: ${row.subject}
발신자: ${row.sender}
첨부: ${attachments}
해시: ${row.contentHash.slice(0, 12)}

승인: 승인 ${row.id}
거절: 거절 ${row.id} 사유`;
}

function buildFailureMessage(id: string, subject: string, sender: string, error: string): string {
  return `[Gmail Intake][실패] ${id}
제목: ${subject || "(제목 없음)"}
발신자: ${sender || "(알 수 없음)"}
사유: ${error}`;
}

async function notifyTelegram(sessionKey: string, text: string): Promise<string | null> {
  try {
    await sendMessengerSessionMessage(sessionKey, text);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function nextIntakeId(db: DbLike, stamp = new Date()): string {
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(
    2,
    "0",
  )}`;
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM gmail_intake_messages WHERE id LIKE ?").get(`GMAIL-${ymd}-%`) as
    | { cnt?: number }
    | undefined;
  const seq = Number(row?.cnt ?? 0) + 1;
  return `GMAIL-${ymd}-${String(seq).padStart(3, "0")}`;
}

function hasProcessedMessage(db: DbLike, gmailMessageId: string): boolean {
  const row = db.prepare("SELECT 1 FROM gmail_intake_messages WHERE gmail_message_id = ? LIMIT 1").get(gmailMessageId);
  return Boolean(row);
}

function rememberIgnoredSubjectMismatch(gmailMessageId: string): void {
  ignoredSubjectMismatchMessageIds.add(gmailMessageId);
  if (ignoredSubjectMismatchMessageIds.size <= 500) return;
  const first = ignoredSubjectMismatchMessageIds.values().next().value;
  if (first) ignoredSubjectMismatchMessageIds.delete(first);
}

function insertIntakeRow(
  db: DbLike,
  row: ParsedGmailMessage & {
    id: string;
    status: "approval_pending" | "failed";
    error?: string | null;
    projectPath: string;
  },
): void {
  const t = nowMs();
  db.prepare(
    `
      INSERT INTO gmail_intake_messages (
        id, gmail_message_id, gmail_thread_id, subject, sender, received_at,
        source_text, content_hash, attachment_manifest_json, prn_markdown,
        status, project_path, error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    row.id,
    row.gmailMessageId,
    row.gmailThreadId,
    row.subject,
    row.sender,
    row.receivedAt,
    row.sourceText,
    row.contentHash,
    JSON.stringify(row.attachmentManifest),
    row.prnMarkdown,
    row.status,
    row.projectPath,
    row.error ?? null,
    t,
    t,
  );
}

function updateIntakeError(db: DbLike, id: string, error: string): void {
  db.prepare("UPDATE gmail_intake_messages SET error = ?, updated_at = ? WHERE id = ?").run(error, nowMs(), id);
}

async function parseGmailMessage(params: {
  message: GmailMessage;
  config: GmailIntakeConfig;
  accessToken: string;
  fetchImpl: typeof fetch;
  id: string;
}): Promise<ParsedGmailMessage> {
  const { message, config, accessToken, fetchImpl, id } = params;
  const gmailMessageId = normalizeText(message.id);
  if (!gmailMessageId) throw new Error("gmail_message_id_missing");
  const subject = getHeader(message.payload, "subject");
  if (!isGmailIntakeSubject(subject, config.subjectToken)) {
    throw new Error("subject_token_missing");
  }
  const sender = extractEmailAddress(getHeader(message.payload, "from"));
  if (!sender || !config.allowedSenders.has(sender)) {
    throw new Error(`sender_not_allowed:${sender || "unknown"}`);
  }
  const bodyText = extractBodyText(message);
  const { textBlocks, manifest } = await extractAttachments({
    message,
    accessToken,
    fetchImpl,
    maxAttachmentBytes: config.maxAttachmentBytes,
  });
  const attachmentText = textBlocks.join("\n\n").trim();
  const sourceText = [bodyText, attachmentText].filter(Boolean).join("\n\n").trim();
  if (!sourceText) throw new Error("gmail_source_text_empty");
  const receivedAt = Number(message.internalDate);
  const contentHash = sha256(`${subject}\n${sender}\n${sourceText}\n${manifest.map((item) => item.sha256).join("\n")}`);
  const prnMarkdown = buildPrnMarkdown({
    id,
    subject,
    sender,
    bodyText,
    attachmentText,
    manifest,
  });
  return {
    gmailMessageId,
    gmailThreadId: normalizeText(message.threadId) || null,
    subject,
    sender,
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : null,
    sourceText,
    contentHash,
    attachmentManifest: manifest,
    prnMarkdown,
  };
}

async function processMessage(params: {
  db: DbLike;
  config: GmailIntakeConfig;
  ref: GmailMessageRef;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<{ processed: boolean; intakeId: string | null; gmailMessageId: string | null }> {
  const { db, config, ref, accessToken, fetchImpl } = params;
  const gmailMessageId = normalizeText(ref.id);
  if (
    !gmailMessageId ||
    ignoredSubjectMismatchMessageIds.has(gmailMessageId) ||
    hasProcessedMessage(db, gmailMessageId)
  ) {
    return { processed: false, intakeId: null, gmailMessageId: gmailMessageId || null };
  }

  const id = nextIntakeId(db);
  let subject = "";
  let sender = "";
  try {
    const message = await getGmailMessage(gmailMessageId, accessToken, fetchImpl);
    subject = getHeader(message.payload, "subject");
    sender = extractEmailAddress(getHeader(message.payload, "from"));
    const parsed = await parseGmailMessage({ message, config, accessToken, fetchImpl, id });
    insertIntakeRow(db, {
      ...parsed,
      id,
      status: "approval_pending",
      projectPath: config.defaultProjectPath,
    });
    const notifyError = await notifyTelegram(config.telegramSessionKey, buildApprovalMessage({ ...parsed, id }));
    if (notifyError) {
      updateIntakeError(db, id, `telegram_notify_failed:${notifyError}`);
    }
    return { processed: true, intakeId: id, gmailMessageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (error === "subject_token_missing") {
      rememberIgnoredSubjectMismatch(gmailMessageId);
      return { processed: false, intakeId: null, gmailMessageId };
    }
    const fallback: ParsedGmailMessage = {
      gmailMessageId,
      gmailThreadId: normalizeText(ref.threadId) || null,
      subject,
      sender,
      receivedAt: null,
      sourceText: "",
      contentHash: sha256(`${gmailMessageId}\n${error}`),
      attachmentManifest: [],
      prnMarkdown: "",
    };
    insertIntakeRow(db, {
      ...fallback,
      id,
      status: "failed",
      error,
      projectPath: config.defaultProjectPath,
    });
    await notifyTelegram(config.telegramSessionKey, buildFailureMessage(id, subject, sender, error));
    return { processed: true, intakeId: id, gmailMessageId };
  }
}

function readCounts(db: DbLike): { pending: number; processed: number } {
  const pending = db
    .prepare("SELECT COUNT(*) AS cnt FROM gmail_intake_messages WHERE status = 'approval_pending'")
    .get() as { cnt?: number } | undefined;
  const processed = db.prepare("SELECT COUNT(*) AS cnt FROM gmail_intake_messages").get() as
    | { cnt?: number }
    | undefined;
  return {
    pending: Number(pending?.cnt ?? 0),
    processed: Number(processed?.cnt ?? 0),
  };
}

export async function pollGmailIntakeReceiverOnce(options: {
  db: DatabaseSync;
  status: GmailIntakeReceiverStatus;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { db, status } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = resolveConfig();
  status.lastPollAt = nowMs();
  status.enabled = config.enabled;
  status.configured = config.enabled && config.allowedSenders.size > 0 && Boolean(config.subjectToken);
  status.allowedSenderCount = config.allowedSenders.size;
  status.pollIntervalMs = config.pollIntervalMs;
  const counts = readCounts(db);
  status.pendingCount = counts.pending;
  status.processedCount = counts.processed;

  if (!config.enabled) {
    status.lastError = null;
    return;
  }
  if (!config.subjectToken) {
    status.lastError = "gmail intake subject token missing";
    return;
  }
  if (config.allowedSenders.size === 0) {
    status.lastError = "gmail intake allowed senders missing";
    return;
  }

  const accessToken = await resolveAccessToken(db, fetchImpl);
  status.authorized = true;
  const refs = await listCandidateMessages(config, accessToken, fetchImpl);
  let processedAny = false;
  for (const ref of [...refs].reverse()) {
    const result = await processMessage({ db, config, ref, accessToken, fetchImpl });
    if (!result.processed) continue;
    processedAny = true;
    status.lastMessageId = result.gmailMessageId;
    status.lastIntakeId = result.intakeId;
  }
  const nextCounts = readCounts(db);
  status.pendingCount = nextCounts.pending;
  status.processedCount = nextCounts.processed;
  if (processedAny) {
    status.lastForwardAt = nowMs();
  }
  status.lastError = null;
}

export function startGmailIntakeReceiver(options: { db: DatabaseSync; fetchImpl?: typeof fetch }): ReceiverHandle {
  if (receiverHandle) return receiverHandle;
  const { db } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const status = initialStatus();
  status.running = true;
  let stopped = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        void tick();
      },
      Math.max(1_000, delayMs),
    );
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await pollGmailIntakeReceiverOnce({ db, status, fetchImpl });
    } catch (err) {
      status.authorized = false;
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Claw-Empire] gmail intake receiver error: ${status.lastError}`);
    } finally {
      busy = false;
      schedule(resolveConfig().pollIntervalMs);
    }
  };

  schedule(1_500);
  receiverHandle = {
    stop() {
      stopped = true;
      status.running = false;
      status.enabled = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      receiverHandle = null;
    },
    getStatus() {
      return cloneStatus(status);
    },
  };
  return receiverHandle;
}

export function getGmailIntakeReceiverStatus(): GmailIntakeReceiverStatus {
  if (!receiverHandle) return initialStatus();
  return receiverHandle.getStatus();
}

export function listGmailIntakeItems(db: DbLike, limit = 50): GmailIntakeRow[] {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return db
    .prepare(
      `
        SELECT *
        FROM gmail_intake_messages
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(normalizedLimit) as GmailIntakeRow[];
}

function getGmailIntakeRow(db: DbLike, id: string): GmailIntakeRow | null {
  return (
    (db.prepare("SELECT * FROM gmail_intake_messages WHERE id = ? LIMIT 1").get(id) as GmailIntakeRow | undefined) ??
    null
  );
}

export async function approveGmailIntake(params: {
  db: DbLike;
  id: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailIntakeRow> {
  const { db, id } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const row = getGmailIntakeRow(db, id);
  if (!row) throw new Error("gmail_intake_not_found");
  if (row.status !== "approval_pending") {
    throw new Error(`gmail_intake_not_approval_pending:${row.status}`);
  }
  if (!INBOX_WEBHOOK_SECRET) {
    throw new Error("INBOX_WEBHOOK_SECRET missing");
  }
  const payload: Record<string, unknown> = {
    source: "gmail",
    message_id: `gmail:${row.gmail_message_id}:approved`,
    chat: GMAIL_INTAKE_TELEGRAM_SESSION_KEY,
    text: `$${row.prn_markdown}`,
    project_path: row.project_path || GMAIL_INTAKE_DEFAULT_PROJECT_PATH,
  };
  if (row.project_id) payload.project_id = row.project_id;

  const res = await fetchImpl(`http://${OAUTH_BASE_HOST}:${PORT}/api/inbox`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inbox-secret": INBOX_WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = `gmail intake inbox submit failed (${res.status})${detail ? `: ${detail}` : ""}`;
    updateIntakeError(db, row.id, error);
    throw new Error(error);
  }

  const t = nowMs();
  db.prepare(
    `
      UPDATE gmail_intake_messages
      SET status = 'submitted',
          approved_at = COALESCE(approved_at, ?),
          submitted_at = ?,
          error = NULL,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(t, t, t, row.id);
  const next = getGmailIntakeRow(db, row.id);
  if (!next) throw new Error("gmail_intake_missing_after_approve");
  return next;
}

export function rejectGmailIntake(db: DbLike, id: string, reason: string): GmailIntakeRow {
  const row = getGmailIntakeRow(db, id);
  if (!row) throw new Error("gmail_intake_not_found");
  if (row.status !== "approval_pending") {
    throw new Error(`gmail_intake_not_approval_pending:${row.status}`);
  }
  const t = nowMs();
  db.prepare(
    `
      UPDATE gmail_intake_messages
      SET status = 'rejected',
          rejected_at = ?,
          error = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(t, normalizeText(reason) || "rejected", t, id);
  const next = getGmailIntakeRow(db, id);
  if (!next) throw new Error("gmail_intake_missing_after_reject");
  return next;
}

export function parseGmailIntakeTelegramCommand(
  text: string,
): { action: "approve"; id: string } | { action: "reject"; id: string; reason: string } | null {
  const approve = text.trim().match(/^승인\s+(GMAIL-\d{8}-\d{3})$/i);
  if (approve) return { action: "approve", id: approve[1].toUpperCase() };
  const reject = text.trim().match(/^거절\s+(GMAIL-\d{8}-\d{3})(?:\s+(.+))?$/i);
  if (reject) return { action: "reject", id: reject[1].toUpperCase(), reason: normalizeText(reject[2]) };
  return null;
}

export async function handleGmailIntakeTelegramCommand(params: {
  db: DbLike;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailIntakeCommandResult | null> {
  const command = parseGmailIntakeTelegramCommand(params.text);
  if (!command) return null;
  try {
    if (command.action === "approve") {
      const row = await approveGmailIntake({ db: params.db, id: command.id, fetchImpl: params.fetchImpl });
      return {
        handled: true,
        text: `[Gmail Intake][제출 완료] ${row.id}\n기존 PMO 업무 흐름으로 전달했습니다.`,
      };
    }
    const row = rejectGmailIntake(params.db, command.id, command.reason);
    return {
      handled: true,
      text: `[Gmail Intake][거절 완료] ${row.id}\n사유: ${row.error ?? "rejected"}`,
    };
  } catch (err) {
    return {
      handled: true,
      text: `[Gmail Intake][처리 실패]\n${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
