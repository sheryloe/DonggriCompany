import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CALENDAR_INTAKE_CALENDAR_ID,
  CALENDAR_INTAKE_DEFAULT_PROJECT_PATH,
  CALENDAR_INTAKE_ENABLED,
  CALENDAR_INTAKE_LOOKAHEAD_DAYS,
  CALENDAR_INTAKE_LOOKBACK_DAYS,
  CALENDAR_INTAKE_MATCH_TOKENS,
  CALENDAR_INTAKE_POLL_INTERVAL_MS,
  CALENDAR_INTAKE_TELEGRAM_SESSION_KEY,
  INBOX_WEBHOOK_SECRET,
  OAUTH_BASE_HOST,
  PORT,
} from "../config/runtime.ts";
import { sendMessengerSessionMessage } from "../gateway/client.ts";
import { decryptSecret, encryptSecret } from "../oauth/helpers.ts";

const GOOGLE_OAUTH_SETTING_KEYS = ["googleIntakeOAuth", "gmailIntakeOAuth"];
const CALENDAR_EVENTS_SCAN_LIMIT = 100;
const TOKEN_REFRESH_SKEW_MS = 60_000;

type DbLike = Pick<DatabaseSync, "prepare">;

type ReceiverHandle = {
  stop: () => void;
  getStatus: () => CalendarIntakeReceiverStatus;
};

export type CalendarIntakeReceiverStatus = {
  running: boolean;
  configured: boolean;
  enabled: boolean;
  authorized: boolean;
  calendarId: string;
  matchTokenCount: number;
  pollIntervalMs: number;
  lastPollAt: number | null;
  lastForwardAt: number | null;
  lastEventId: string | null;
  lastIntakeId: string | null;
  pendingCount: number;
  processedCount: number;
  lastError: string | null;
};

type GoogleOAuthSettings = {
  settingKey: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  raw: Record<string, unknown>;
};

type CalendarEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type CalendarEvent = {
  id?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  updated?: string;
  start?: CalendarEventDate;
  end?: CalendarEventDate;
};

type CalendarEventsResponse = {
  items?: CalendarEvent[];
  nextPageToken?: string;
};

type CalendarIntakeConfig = {
  enabled: boolean;
  calendarId: string;
  matchTokens: string[];
  pollIntervalMs: number;
  lookbackDays: number;
  lookaheadDays: number;
  telegramSessionKey: string;
  defaultProjectPath: string;
};

export type CalendarIntakeRow = {
  id: string;
  google_event_id: string;
  calendar_id: string;
  html_link: string | null;
  summary: string;
  description: string;
  location: string;
  start_at: string | null;
  end_at: string | null;
  google_updated_at: string | null;
  event_hash: string;
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

export type CalendarIntakeCommandResult = {
  handled: boolean;
  text: string;
};

const initialStatus = (): CalendarIntakeReceiverStatus => ({
  running: false,
  configured: false,
  enabled: false,
  authorized: false,
  calendarId: CALENDAR_INTAKE_CALENDAR_ID,
  matchTokenCount: CALENDAR_INTAKE_MATCH_TOKENS.length,
  pollIntervalMs: CALENDAR_INTAKE_POLL_INTERVAL_MS,
  lastPollAt: null,
  lastForwardAt: null,
  lastEventId: null,
  lastIntakeId: null,
  pendingCount: 0,
  processedCount: 0,
  lastError: null,
});

let receiverHandle: ReceiverHandle | null = null;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs(): number {
  return Date.now();
}

function cloneStatus(status: CalendarIntakeReceiverStatus): CalendarIntakeReceiverStatus {
  return { ...status };
}

function resolveConfig(): CalendarIntakeConfig {
  return {
    enabled: CALENDAR_INTAKE_ENABLED,
    calendarId: CALENDAR_INTAKE_CALENDAR_ID || "primary",
    matchTokens: CALENDAR_INTAKE_MATCH_TOKENS,
    pollIntervalMs: Math.max(10_000, CALENDAR_INTAKE_POLL_INTERVAL_MS),
    lookbackDays: Math.max(0, CALENDAR_INTAKE_LOOKBACK_DAYS),
    lookaheadDays: Math.max(1, CALENDAR_INTAKE_LOOKAHEAD_DAYS),
    telegramSessionKey: CALENDAR_INTAKE_TELEGRAM_SESSION_KEY || "telegram:global",
    defaultProjectPath: CALENDAR_INTAKE_DEFAULT_PROJECT_PATH,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function readOAuthSettings(db: DbLike): GoogleOAuthSettings | null {
  for (const settingKey of GOOGLE_OAUTH_SETTING_KEYS) {
    const rawSetting = readSetting(db, settingKey);
    if (!rawSetting) continue;
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
    if (!clientId || !clientSecret || !accessToken || !refreshToken) continue;
    return {
      settingKey,
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      raw: parsed,
    };
  }
  return null;
}

async function resolveAccessToken(db: DbLike, fetchImpl: typeof fetch): Promise<string> {
  const oauth = readOAuthSettings(db);
  if (!oauth) {
    throw new Error("google intake oauth missing");
  }
  if (oauth.accessToken && oauth.expiresAt > nowMs() + TOKEN_REFRESH_SKEW_MS) {
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
    throw new Error(`google token refresh failed (${res.status})${detail ? `: ${detail}` : ""}`);
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
  writeSetting(db, oauth.settingKey, JSON.stringify(next));
  return payload.access_token;
}

async function googleJson<T>(url: URL, accessToken: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok || !payload) {
    const detail =
      payload && typeof payload === "object" && "error" in payload ? normalizeText(payload.error?.message) : "";
    throw new Error(`google calendar api failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return payload as T;
}

function eventDateValue(value: CalendarEventDate | undefined): string | null {
  return normalizeText(value?.dateTime) || normalizeText(value?.date) || null;
}

export function isCalendarIntakeEvent(summary: string, tokens = CALENDAR_INTAKE_MATCH_TOKENS): boolean {
  const title = summary.trim().toLowerCase();
  if (!title) return false;
  return tokens.some((token) => {
    const normalized = token.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith("[") && normalized.endsWith("]")) return title.startsWith(normalized);
    return title.includes(normalized);
  });
}

async function listCandidateEvents(
  config: CalendarIntakeConfig,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken = "";
  const now = nowMs();
  const timeMin = new Date(now - config.lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now + config.lookaheadDays * 24 * 60 * 60 * 1000).toISOString();

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(Math.min(50, CALENDAR_EVENTS_SCAN_LIMIT - events.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await googleJson<CalendarEventsResponse>(url, accessToken, fetchImpl);
    if (Array.isArray(result.items)) events.push(...result.items);
    pageToken = normalizeText(result.nextPageToken);
  } while (pageToken && events.length < CALENDAR_EVENTS_SCAN_LIMIT);

  return events.filter((event) => normalizeText(event.status) !== "cancelled");
}

function nextIntakeId(db: DbLike, stamp = new Date()): string {
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(
    2,
    "0",
  )}`;
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM calendar_intake_events WHERE id LIKE ?").get(`CAL-${ymd}-%`) as
    | { cnt?: number }
    | undefined;
  const seq = Number(row?.cnt ?? 0) + 1;
  return `CAL-${ymd}-${String(seq).padStart(3, "0")}`;
}

function hasProcessedEvent(db: DbLike, googleEventId: string): boolean {
  const row = db.prepare("SELECT 1 FROM calendar_intake_events WHERE google_event_id = ? LIMIT 1").get(googleEventId);
  return Boolean(row);
}

function buildPrnMarkdown(params: {
  id: string;
  config: CalendarIntakeConfig;
  event: CalendarEvent;
  startAt: string | null;
  endAt: string | null;
  eventHash: string;
}): string {
  const summary = normalizeText(params.event.summary);
  const description = normalizeText(params.event.description) || "(일정 설명 없음)";
  const location = normalizeText(params.event.location) || "(장소 미지정)";
  return `# Calendar Intake PRN: ${summary}

intake_id: ${params.id}
source: google_calendar
calendar_id: ${params.config.calendarId}
event_id: ${normalizeText(params.event.id)}
event_hash: ${params.eventHash}

## background

Google Calendar 일정에서 DonggriCompany 작업 후보를 감지했다. 일정은 실행 채널이 아니라 요구사항 접수 채널이며, 승인 전에는 기존 PMO 실행 흐름으로 제출하지 않는다.

## schedule

- start: ${params.startAt ?? "(미지정)"}
- end: ${params.endAt ?? "(미지정)"}
- location: ${location}
- link: ${normalizeText(params.event.htmlLink) || "(없음)"}

## goal

일정에 등록된 해커톤/프로젝트 준비 작업을 DonggriCompany PMO 흐름으로 계획하고 수행한다.

## requirements

${description}

## acceptance_criteria

1. 일정 제목/설명 기반 요구사항이 작업 계획에 반영된다.
2. 필요한 산출물, 일정, 검증 항목이 태스크로 정리된다.
3. 실행 결과와 테스트 증거가 기존 태스크/보고 흐름에 연결된다.

## risks

1. 일정 설명이 모호하면 PMO가 추가 질문을 해야 한다.
2. 승인 전에는 코드 변경이나 외부 실행을 하지 않는다.

## directive_text

Google Calendar로 접수된 위 PRN 명세를 검토하고 승인된 범위 안에서 수행한다.
`;
}

function buildApprovalMessage(row: CalendarIntakeRow): string {
  return `[Calendar Intake][승인 대기] ${row.id}
제목: ${row.summary}
일시: ${row.start_at ?? "(미지정)"}
장소: ${row.location || "(미지정)"}
해시: ${row.event_hash.slice(0, 12)}

승인: 승인 ${row.id}
거절: 거절 ${row.id} 사유`;
}

async function notifyTelegram(sessionKey: string, text: string): Promise<string | null> {
  try {
    await sendMessengerSessionMessage(sessionKey, text);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function insertCalendarIntakeRow(
  db: DbLike,
  params: {
    id: string;
    config: CalendarIntakeConfig;
    event: CalendarEvent;
    startAt: string | null;
    endAt: string | null;
    eventHash: string;
    prnMarkdown: string;
  },
): CalendarIntakeRow {
  const t = nowMs();
  db.prepare(
    `
      INSERT INTO calendar_intake_events (
        id, google_event_id, calendar_id, html_link, summary, description,
        location, start_at, end_at, google_updated_at, event_hash, prn_markdown,
        status, project_path, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approval_pending', ?, ?, ?)
    `,
  ).run(
    params.id,
    normalizeText(params.event.id),
    params.config.calendarId,
    normalizeText(params.event.htmlLink) || null,
    normalizeText(params.event.summary),
    normalizeText(params.event.description),
    normalizeText(params.event.location),
    params.startAt,
    params.endAt,
    normalizeText(params.event.updated) || null,
    params.eventHash,
    params.prnMarkdown,
    params.config.defaultProjectPath,
    t,
    t,
  );
  const row = getCalendarIntakeRow(db, params.id);
  if (!row) throw new Error("calendar_intake_missing_after_insert");
  return row;
}

async function processEvent(params: {
  db: DbLike;
  config: CalendarIntakeConfig;
  event: CalendarEvent;
}): Promise<{ processed: boolean; intakeId: string | null; eventId: string | null }> {
  const { db, config, event } = params;
  const eventId = normalizeText(event.id);
  const summary = normalizeText(event.summary);
  if (!eventId || hasProcessedEvent(db, eventId) || !isCalendarIntakeEvent(summary, config.matchTokens)) {
    return { processed: false, intakeId: null, eventId: eventId || null };
  }

  const startAt = eventDateValue(event.start);
  const endAt = eventDateValue(event.end);
  const eventHash = sha256(
    JSON.stringify({
      eventId,
      summary,
      description: normalizeText(event.description),
      location: normalizeText(event.location),
      startAt,
      endAt,
      updated: normalizeText(event.updated),
    }),
  );
  const id = nextIntakeId(db);
  const prnMarkdown = buildPrnMarkdown({ id, config, event, startAt, endAt, eventHash });
  const row = insertCalendarIntakeRow(db, { id, config, event, startAt, endAt, eventHash, prnMarkdown });
  const notifyError = await notifyTelegram(config.telegramSessionKey, buildApprovalMessage(row));
  if (notifyError) {
    db.prepare("UPDATE calendar_intake_events SET error = ?, updated_at = ? WHERE id = ?").run(
      `telegram_notify_failed:${notifyError}`,
      nowMs(),
      id,
    );
  }
  return { processed: true, intakeId: id, eventId };
}

function readCounts(db: DbLike): { pending: number; processed: number } {
  const pending = db
    .prepare("SELECT COUNT(*) AS cnt FROM calendar_intake_events WHERE status = 'approval_pending'")
    .get() as { cnt?: number } | undefined;
  const processed = db.prepare("SELECT COUNT(*) AS cnt FROM calendar_intake_events").get() as
    | { cnt?: number }
    | undefined;
  return {
    pending: Number(pending?.cnt ?? 0),
    processed: Number(processed?.cnt ?? 0),
  };
}

export async function pollCalendarIntakeReceiverOnce(options: {
  db: DatabaseSync;
  status: CalendarIntakeReceiverStatus;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { db, status } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = resolveConfig();
  status.lastPollAt = nowMs();
  status.enabled = config.enabled;
  status.configured = config.enabled && Boolean(config.calendarId) && config.matchTokens.length > 0;
  status.calendarId = config.calendarId;
  status.matchTokenCount = config.matchTokens.length;
  status.pollIntervalMs = config.pollIntervalMs;
  const counts = readCounts(db);
  status.pendingCount = counts.pending;
  status.processedCount = counts.processed;

  if (!config.enabled) {
    status.lastError = null;
    return;
  }
  if (!config.calendarId) {
    status.lastError = "calendar intake calendar id missing";
    return;
  }
  if (config.matchTokens.length === 0) {
    status.lastError = "calendar intake match tokens missing";
    return;
  }

  const accessToken = await resolveAccessToken(db, fetchImpl);
  status.authorized = true;
  const events = await listCandidateEvents(config, accessToken, fetchImpl);
  let processedAny = false;
  for (const event of events) {
    const result = await processEvent({ db, config, event });
    if (!result.processed) continue;
    processedAny = true;
    status.lastEventId = result.eventId;
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

export function startCalendarIntakeReceiver(options: { db: DatabaseSync; fetchImpl?: typeof fetch }): ReceiverHandle {
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
      await pollCalendarIntakeReceiverOnce({ db, status, fetchImpl });
    } catch (err) {
      status.authorized = false;
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Claw-Empire] calendar intake receiver error: ${status.lastError}`);
    } finally {
      busy = false;
      schedule(resolveConfig().pollIntervalMs);
    }
  };

  schedule(2_500);
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

export function getCalendarIntakeReceiverStatus(): CalendarIntakeReceiverStatus {
  if (!receiverHandle) return initialStatus();
  return receiverHandle.getStatus();
}

export function listCalendarIntakeItems(db: DbLike, limit = 50): CalendarIntakeRow[] {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return db
    .prepare(
      `
        SELECT *
        FROM calendar_intake_events
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(normalizedLimit) as CalendarIntakeRow[];
}

function getCalendarIntakeRow(db: DbLike, id: string): CalendarIntakeRow | null {
  return (
    (db.prepare("SELECT * FROM calendar_intake_events WHERE id = ? LIMIT 1").get(id) as
      | CalendarIntakeRow
      | undefined) ?? null
  );
}

export async function approveCalendarIntake(params: {
  db: DbLike;
  id: string;
  fetchImpl?: typeof fetch;
}): Promise<CalendarIntakeRow> {
  const { db, id } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const row = getCalendarIntakeRow(db, id);
  if (!row) throw new Error("calendar_intake_not_found");
  if (row.status !== "approval_pending") {
    throw new Error(`calendar_intake_not_approval_pending:${row.status}`);
  }
  if (!INBOX_WEBHOOK_SECRET) {
    throw new Error("INBOX_WEBHOOK_SECRET missing");
  }
  const payload: Record<string, unknown> = {
    source: "calendar",
    message_id: `calendar:${row.google_event_id}:approved`,
    chat: CALENDAR_INTAKE_TELEGRAM_SESSION_KEY,
    text: `$${row.prn_markdown}`,
    project_path: row.project_path || CALENDAR_INTAKE_DEFAULT_PROJECT_PATH,
  };
  if (row.project_id) payload.project_id = row.project_id;

  const res = await fetchImpl(`http://${OAUTH_BASE_HOST}:${PORT}/api/inbox`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-inbox-secret": INBOX_WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = `calendar intake inbox submit failed (${res.status})${detail ? `: ${detail}` : ""}`;
    db.prepare("UPDATE calendar_intake_events SET error = ?, updated_at = ? WHERE id = ?").run(error, nowMs(), row.id);
    throw new Error(error);
  }

  const t = nowMs();
  db.prepare(
    `
      UPDATE calendar_intake_events
      SET status = 'submitted',
          approved_at = COALESCE(approved_at, ?),
          submitted_at = ?,
          error = NULL,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(t, t, t, row.id);
  const next = getCalendarIntakeRow(db, row.id);
  if (!next) throw new Error("calendar_intake_missing_after_approve");
  return next;
}

export function rejectCalendarIntake(db: DbLike, id: string, reason: string): CalendarIntakeRow {
  const row = getCalendarIntakeRow(db, id);
  if (!row) throw new Error("calendar_intake_not_found");
  if (row.status !== "approval_pending") {
    throw new Error(`calendar_intake_not_approval_pending:${row.status}`);
  }
  const t = nowMs();
  db.prepare(
    `
      UPDATE calendar_intake_events
      SET status = 'rejected',
          rejected_at = ?,
          error = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(t, normalizeText(reason) || "rejected", t, id);
  const next = getCalendarIntakeRow(db, id);
  if (!next) throw new Error("calendar_intake_missing_after_reject");
  return next;
}

export function parseCalendarIntakeTelegramCommand(
  text: string,
): { action: "approve"; id: string } | { action: "reject"; id: string; reason: string } | null {
  const approve = text.trim().match(/^(?:승인|캘린더승인|일정승인)\s+(CAL-\d{8}-\d{3})$/i);
  if (approve) return { action: "approve", id: approve[1].toUpperCase() };
  const reject = text.trim().match(/^(?:거절|캘린더거절|일정거절)\s+(CAL-\d{8}-\d{3})(?:\s+(.+))?$/i);
  if (reject) return { action: "reject", id: reject[1].toUpperCase(), reason: normalizeText(reject[2]) };
  return null;
}

export async function handleCalendarIntakeTelegramCommand(params: {
  db: DbLike;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<CalendarIntakeCommandResult | null> {
  const command = parseCalendarIntakeTelegramCommand(params.text);
  if (!command) return null;
  try {
    if (command.action === "approve") {
      const row = await approveCalendarIntake({ db: params.db, id: command.id, fetchImpl: params.fetchImpl });
      return {
        handled: true,
        text: `[Calendar Intake][제출 완료] ${row.id}\n기존 PMO 업무 흐름으로 전달했습니다.`,
      };
    }
    const row = rejectCalendarIntake(params.db, command.id, command.reason);
    return {
      handled: true,
      text: `[Calendar Intake][거절 완료] ${row.id}\n사유: ${row.error ?? "rejected"}`,
    };
  } catch (err) {
    return {
      handled: true,
      text: `[Calendar Intake][처리 실패]\n${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
