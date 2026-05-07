import { createHash } from "node:crypto";
import { sendMessengerMessage, type MessengerChannel } from "../../../../../gateway/client.ts";
import { isMessengerChannel } from "../../../../../messenger/channels.ts";
import { resolveSourceChatRoute } from "../../../../../messenger/session-agent-routing.ts";
import type { RuntimeContext } from "../../../../../types/runtime-context.ts";
import { createDecisionNoticeFormatter } from "./messenger-notice-format.ts";
import type { DecisionInboxRouteItem } from "./types.ts";

export type DecisionReplyBridgeInput = {
  text: string;
  body?: Record<string, unknown>;
  source?: string | null;
  chat?: string | null;
  channel?: MessengerChannel;
  targetId?: string | null;
};

export type DecisionReplyBridgeResult = {
  handled: boolean;
  status: number;
  payload: Record<string, unknown>;
};

type DecisionRoute = { channel: MessengerChannel; targetId: string };

type DecisionApplyResult = {
  status: number;
  payload: Record<string, unknown>;
};

type DecisionBridgeDeps = {
  db: RuntimeContext["db"];
  nowMs: () => number;
  getPreferredLanguage: RuntimeContext["getPreferredLanguage"];
  normalizeTextField: RuntimeContext["normalizeTextField"];
  getDecisionInboxItems: () => DecisionInboxRouteItem[];
  applyDecisionReply: (decisionId: string, body: Record<string, unknown>) => DecisionApplyResult;
};

const TASK_MESSENGER_ROUTE_PREFIX = "[messenger-route]";
const DECISION_NOTICE_CACHE_MAX = 1024;
const DECISION_NOTICE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DECISION_NOTICE_SENT_KEY_PREFIX = "decision_notice_sent:";
const DECISION_REPLY_MARKER_RE = /\[(의사결정\s*회신|decision\s*reply|意思決定返信|决策回复)\]/i;
const DECISION_TOKEN_RE = /\[DECISION:([^\]\r\n]{1,256})\]/i;
const DECISION_APPROVE_WORD_RE =
  /^(승인|진행|go|ok|okay|yes|yep|approve|approved|확인|동의|承認|進行|はい|同意|通过|批准|好的|可以|行)$/i;
const DECISION_NOTE_RE = /(?:추가\s*(?:코멘트|의견|메모)|note|비고|备注)\s*[:：]\s*(.+)$/i;

const DECISION_REPLY_MARKER_SAFE_RE = /\[(?:의사결정\s*회신|decision\s*reply)\]/i;
const DECISION_APPROVE_WORD_SAFE_RE = /^(승인|진행|확인|동의|찬성|go|ok|okay|yes|yep|approve|approved)$/i;
const DECISION_REJECT_WORD_SAFE_RE = /^(반려|거절|거부|불가|reject|rejected|no)$/i;
const DECISION_DEFER_WORD_SAFE_RE = /^(보류|대기|나중|defer|hold|pending)$/i;
const DECISION_REWORK_WORD_SAFE_RE = /^(보완|수정|재작업|다시|rework|revise|fix)$/i;
const DECISION_LIST_COMMAND_RE =
  /^(?:의사결정|결정|미결|미결\s*의사결정|대기\s*결정|pending\s*decisions?|decision\s*inbox)$/i;
const DECISION_NOTE_SAFE_RE = /(?:추가\s*(?:코멘트|의견|메모)|note|비고)\s*[:：]\s*(.+)$/i;

export function createDecisionInboxMessengerBridge(deps: DecisionBridgeDeps) {
  const { db, nowMs, getPreferredLanguage, normalizeTextField, getDecisionInboxItems, applyDecisionReply } = deps;
  const { buildDecisionMessengerNotice } = createDecisionNoticeFormatter({
    getPreferredLanguage,
    normalizeTextField,
  });

  const sentDecisionNoticeSignatureById = new Map<string, { signature: string; sentAt: number }>();
  const decisionRouteByDecisionId = new Map<
    string,
    { channel: MessengerChannel; targetId: string; updatedAt: number }
  >();

  function pickDecisionL10n(ko: string, en: string, ja: string, zh: string): string {
    void en;
    void ja;
    void zh;
    void getPreferredLanguage;
    return ko;
  }

  function pruneDecisionCaches(now: number, activeDecisionIds?: Set<string>): void {
    for (const [decisionId, sent] of sentDecisionNoticeSignatureById.entries()) {
      if (now - sent.sentAt > DECISION_NOTICE_CACHE_TTL_MS) sentDecisionNoticeSignatureById.delete(decisionId);
    }
    for (const [decisionId, route] of decisionRouteByDecisionId.entries()) {
      if (now - route.updatedAt > DECISION_NOTICE_CACHE_TTL_MS) decisionRouteByDecisionId.delete(decisionId);
    }
    if (activeDecisionIds) {
      for (const decisionId of sentDecisionNoticeSignatureById.keys()) {
        if (!activeDecisionIds.has(decisionId)) sentDecisionNoticeSignatureById.delete(decisionId);
      }
      for (const decisionId of decisionRouteByDecisionId.keys()) {
        if (!activeDecisionIds.has(decisionId)) decisionRouteByDecisionId.delete(decisionId);
      }
    }
    while (sentDecisionNoticeSignatureById.size > DECISION_NOTICE_CACHE_MAX) {
      const oldest = sentDecisionNoticeSignatureById.keys().next().value;
      if (!oldest) break;
      sentDecisionNoticeSignatureById.delete(oldest);
    }
    while (decisionRouteByDecisionId.size > DECISION_NOTICE_CACHE_MAX) {
      const oldest = decisionRouteByDecisionId.keys().next().value;
      if (!oldest) break;
      decisionRouteByDecisionId.delete(oldest);
    }
  }

  function parseTaskMessengerRouteLine(line: string): DecisionRoute | null {
    if (!line.startsWith(`${TASK_MESSENGER_ROUTE_PREFIX} `)) return null;
    const payload = line.slice(TASK_MESSENGER_ROUTE_PREFIX.length).trim();
    const separator = payload.indexOf(":");
    if (separator <= 0) return null;
    const channelRaw = payload.slice(0, separator).trim().toLowerCase();
    const targetId = payload.slice(separator + 1).trim();
    if (!isMessengerChannel(channelRaw) || !targetId) return null;
    return { channel: channelRaw, targetId };
  }

  function buildDecisionNoticeSettingKey(decisionId: string, route: DecisionRoute): string {
    return `${DECISION_NOTICE_SENT_KEY_PREFIX}${decisionId}:${route.channel}:${route.targetId}`;
  }

  function buildDecisionNoticeSignature(item: DecisionInboxRouteItem): string {
    const normalizedSummary = String(item.summary || "")
      .replace(/\s+/g, " ")
      .trim();
    const optionBlock = item.options
      .map((option) => {
        const label = String(option.label || "")
          .replace(/\s+/g, " ")
          .trim();
        const analysis = option.analysis
          ? [
              option.analysis.rationale,
              option.analysis.expected_result,
              option.analysis.risk,
              option.analysis.follow_up,
              option.analysis.source,
            ]
              .map((value) =>
                String(value || "")
                  .replace(/\s+/g, " ")
                  .trim(),
              )
              .join(">")
          : "";
        return `${option.number}:${option.action}:${label}:${analysis}`;
      })
      .join("|");
    const raw = [
      item.id,
      item.kind,
      String(item.created_at ?? 0),
      normalizeTextField(item.project_id) ?? "",
      normalizeTextField(item.task_id) ?? "",
      normalizeTextField(item.meeting_id) ?? "",
      String(item.review_round ?? ""),
      normalizedSummary,
      optionBlock,
    ].join("||");
    return createHash("sha1").update(raw).digest("hex");
  }

  function reserveDecisionNoticeSend(
    item: DecisionInboxRouteItem,
    route: DecisionRoute,
  ): { key: string; token: string; signature: string } | "already_sent" | null {
    const key = buildDecisionNoticeSettingKey(item.id, route);
    const signature = buildDecisionNoticeSignature(item);
    const token = `sending:${signature}:${nowMs()}:${Math.random().toString(36).slice(2, 10)}`;
    try {
      const result = db
        .prepare(
          `
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO NOTHING
        `,
        )
        .run(key, token) as { changes?: number };
      if ((result?.changes ?? 0) > 0) return { key, token, signature };

      const existing = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
        | { value?: unknown }
        | undefined;
      const existingValue = normalizeTextField(existing?.value) ?? "";
      if (existingValue === signature) return "already_sent";
      if (existingValue.startsWith("sending:")) return null;

      const takeover = db
        .prepare("UPDATE settings SET value = ? WHERE key = ? AND value = ?")
        .run(token, key, existingValue) as { changes?: number };
      if ((takeover?.changes ?? 0) > 0) return { key, token, signature };

      const latest = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
        | { value?: unknown }
        | undefined;
      const latestValue = normalizeTextField(latest?.value) ?? "";
      if (latestValue === signature) return "already_sent";
      return null;
    } catch {
      return null;
    }
  }

  function markDecisionNoticeSent(reserved: { key: string; token: string; signature: string }): void {
    const updated = db
      .prepare("UPDATE settings SET value = ? WHERE key = ? AND value = ?")
      .run(reserved.signature, reserved.key, reserved.token) as { changes?: number } | undefined;
    if ((updated?.changes ?? 0) > 0) return;

    const existing = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(reserved.key) as
      | { value?: unknown }
      | undefined;
    const currentValue = normalizeTextField(existing?.value) ?? "";
    if (!currentValue || currentValue.startsWith("sending:")) {
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(reserved.signature, reserved.key);
    }
  }

  function releaseDecisionNoticeReservation(reserved: { key: string; token: string; signature: string }): void {
    void reserved.signature;
    db.prepare("DELETE FROM settings WHERE key = ? AND value = ?").run(reserved.key, reserved.token);
  }

  function resolveTaskDecisionRoute(taskId: string): DecisionRoute | null {
    const row = db
      .prepare(
        `
        SELECT message
        FROM task_logs
        WHERE task_id = ?
          AND kind = 'system'
          AND message LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      )
      .get(taskId, `${TASK_MESSENGER_ROUTE_PREFIX} %`) as { message?: string } | undefined;
    return typeof row?.message === "string" ? parseTaskMessengerRouteLine(row.message) : null;
  }

  function resolveProjectDecisionRoute(projectId: string): DecisionRoute | null {
    const row = db
      .prepare(
        `
        SELECT tl.message
        FROM task_logs tl
        JOIN tasks t ON t.id = tl.task_id
        WHERE t.project_id = ?
          AND tl.kind = 'system'
          AND tl.message LIKE ?
        ORDER BY tl.created_at DESC
        LIMIT 1
      `,
      )
      .get(projectId, `${TASK_MESSENGER_ROUTE_PREFIX} %`) as { message?: string } | undefined;
    return typeof row?.message === "string" ? parseTaskMessengerRouteLine(row.message) : null;
  }

  function resolveDecisionRoute(item: DecisionInboxRouteItem): DecisionRoute | null {
    const now = nowMs();
    const cached = decisionRouteByDecisionId.get(item.id);
    if (cached) return { channel: cached.channel, targetId: cached.targetId };

    const taskId = normalizeTextField(item.task_id);
    const projectId = normalizeTextField(item.project_id);
    const route =
      (taskId ? resolveTaskDecisionRoute(taskId) : null) ??
      (projectId ? resolveProjectDecisionRoute(projectId) : null) ??
      null;
    if (!route) return null;

    decisionRouteByDecisionId.set(item.id, { channel: route.channel, targetId: route.targetId, updatedAt: now });
    pruneDecisionCaches(now);
    return route;
  }

  function parseOptionNumbersFromText(text: string): number[] {
    const sanitized = text.replace(DECISION_TOKEN_RE, " ").replace(DECISION_REPLY_MARKER_RE, " ");
    const numbers: number[] = [];
    for (const match of sanitized.matchAll(/(?:^|[^\d])([1-9]\d?)(?:\s*(?:번|番|号|option))?(?=$|[^\d])/gi)) {
      const raw = match[1];
      if (!raw) continue;
      const num = Number.parseInt(raw, 10);
      if (!Number.isFinite(num)) continue;
      numbers.push(num);
    }
    return Array.from(new Set(numbers));
  }

  function isPlainDecisionChoiceText(text: string): boolean {
    const sanitized = text.replace(DECISION_TOKEN_RE, " ").replace(DECISION_REPLY_MARKER_RE, " ").trim();
    if (!sanitized) return false;
    if (DECISION_APPROVE_WORD_RE.test(sanitized)) return true;
    const tokens = sanitized
      .split(/[\s,，/|]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length <= 0) return false;
    return tokens.every((token) => /^[1-9]\d?(?:번|option|号|番)?$/i.test(token));
  }

  function extractDecisionNote(text: string, body: Record<string, unknown>): string | null {
    const bodyNote = normalizeTextField(body.note);
    if (bodyNote) return bodyNote;
    const matched = text.match(DECISION_NOTE_RE);
    if (!matched?.[1]) return null;
    const candidate = normalizeTextField(matched[1]);
    return candidate || null;
  }

  function parseOptionNumbersFromTextSafe(text: string): number[] {
    const sanitized = text.replace(DECISION_TOKEN_RE, " ").replace(DECISION_REPLY_MARKER_SAFE_RE, " ");
    const numbers: number[] = [];
    for (const match of sanitized.matchAll(/(?:^|[^\d])([1-9]\d?)(?:\s*(?:번|option))?(?=$|[^\d])/gi)) {
      const raw = match[1];
      if (!raw) continue;
      const num = Number.parseInt(raw, 10);
      if (!Number.isFinite(num)) continue;
      numbers.push(num);
    }
    return Array.from(new Set(numbers));
  }

  function isDecisionIntentWord(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    return (
      DECISION_APPROVE_WORD_SAFE_RE.test(trimmed) ||
      DECISION_REJECT_WORD_SAFE_RE.test(trimmed) ||
      DECISION_DEFER_WORD_SAFE_RE.test(trimmed) ||
      DECISION_REWORK_WORD_SAFE_RE.test(trimmed)
    );
  }

  function resolveIntentFromText(text: string): "approve" | "reject" | "defer" | "rework" | null {
    const sanitized = text.replace(DECISION_TOKEN_RE, " ").replace(DECISION_REPLY_MARKER_SAFE_RE, " ").trim();
    const normalized = sanitized
      .replace(/[.,，;|/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return null;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.some((token) => DECISION_REJECT_WORD_SAFE_RE.test(token))) return "reject";
    if (tokens.some((token) => DECISION_REWORK_WORD_SAFE_RE.test(token))) return "rework";
    if (tokens.some((token) => DECISION_DEFER_WORD_SAFE_RE.test(token))) return "defer";
    if (tokens.some((token) => DECISION_APPROVE_WORD_SAFE_RE.test(token))) return "approve";
    return null;
  }

  function isPlainDecisionChoiceTextSafe(text: string): boolean {
    const sanitized = text.replace(DECISION_TOKEN_RE, " ").replace(DECISION_REPLY_MARKER_SAFE_RE, " ").trim();
    if (!sanitized) return false;
    if (isDecisionIntentWord(sanitized)) return true;
    const numbers = parseOptionNumbersFromTextSafe(sanitized);
    if (numbers.length > 0) {
      const remainder = sanitized
        .replace(/(?:^|[^\d])([1-9]\d?)(?:\s*(?:번|option))?(?=$|[^\d])/gi, " ")
        .replace(/\b(?:선택|옵션|option|의사결정|회신)\b/gi, " ")
        .replace(/[,\s，;|/]+/g, "")
        .trim();
      return !remainder || isDecisionIntentWord(remainder);
    }
    const tokens = sanitized
      .split(/[\s,，;|/]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length <= 0) return false;
    return tokens.every((token) => /^[1-9]\d?(?:번|option)?$/i.test(token) || isDecisionIntentWord(token));
  }

  function extractDecisionNoteSafe(text: string, body: Record<string, unknown>): string | null {
    const bodyNote = normalizeTextField(body.note);
    if (bodyNote) return bodyNote;
    const matched = text.match(DECISION_NOTE_SAFE_RE);
    if (!matched?.[1]) return null;
    const candidate = normalizeTextField(matched[1]);
    return candidate || null;
  }

  function findLatestDecisionForRoute(
    route: DecisionRoute,
    explicitDecisionId?: string | null,
  ): DecisionInboxRouteItem | null {
    const items = getDecisionInboxItems();
    if (explicitDecisionId) {
      const item = items.find((candidate) => candidate.id === explicitDecisionId);
      if (item) return item;
    }
    for (const item of items) {
      const candidateRoute = resolveDecisionRoute(item);
      if (!candidateRoute) continue;
      if (candidateRoute.channel === route.channel && candidateRoute.targetId === route.targetId) {
        return item;
      }
    }
    return null;
  }

  function findPendingDecisionsForRoute(route: DecisionRoute): DecisionInboxRouteItem[] {
    return getDecisionInboxItems().filter((item) => {
      const candidateRoute = resolveDecisionRoute(item);
      return candidateRoute?.channel === route.channel && candidateRoute.targetId === route.targetId;
    });
  }

  function summarizeOptionLabel(option: { number: number; label: string; action: string }): string {
    return String(option.label || option.action || `option ${option.number}`)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
  }

  function buildPendingDecisionListMessage(items: DecisionInboxRouteItem[]): string {
    if (items.length <= 0) return "현재 이 채널에 대기 중인 의사결정이 없습니다.";
    const lines = [`미결 의사결정 ${items.length}건`, "숫자만 답장하면 최신 의사결정에 바로 반영됩니다."];
    for (const [index, item] of items.slice(0, 5).entries()) {
      const title = normalizeTextField(item.task_title) || normalizeTextField(item.project_name) || item.kind;
      const options = item.options
        .slice(0, 4)
        .map((option) => `${option.number}. ${summarizeOptionLabel(option)}`)
        .join(" / ");
      lines.push(`${index + 1}) ${title}`);
      lines.push(`   ID: [DECISION:${item.id}]`);
      if (options) lines.push(`   선택지: ${options}`);
    }
    lines.push("특정 건은 [DECISION:ID] 1 형식으로 답장하세요.");
    return lines.join("\n");
  }

  function buildPendingDecisionListMessageKoSafe(items: DecisionInboxRouteItem[]): string {
    if (items.length <= 0) return "현재 이 채널에 대기 중인 의사결정이 없습니다.";
    const lines = [`미결 의사결정 ${items.length}건. 숫자만 입력하면 최신 의사결정에 바로 반영됩니다.`];
    for (const [index, item] of items.slice(0, 5).entries()) {
      const title = normalizeTextField(item.task_title) || normalizeTextField(item.project_name) || item.kind;
      const options = item.options
        .slice(0, 4)
        .map((option) => `${option.number}. ${summarizeOptionLabel(option)}`)
        .join(" / ");
      lines.push(`${index + 1}) ${title}`);
      lines.push(`   ID: [DECISION:${item.id}]`);
      if (options) lines.push(`   선택지: ${options}`);
    }
    lines.push("특정 건은 [DECISION:ID] 1 형식으로 회신하세요.");
    return lines.join("\n");
  }

  function inferOptionNumberByIntent(
    item: DecisionInboxRouteItem,
    intent: "approve" | "reject" | "defer" | "rework" | null,
  ): number | undefined {
    if (!intent || item.options.length <= 0) return undefined;
    const candidates = item.options.map((option) => ({
      option,
      source: `${option.action} ${option.label}`.toLowerCase(),
    }));
    const patterns: RegExp[] =
      intent === "approve"
        ? [/approve|approved|apply|start|resume|ready|go|승인|진행|완료|재개/]
        : intent === "reject"
          ? [/reject|rejected|deny|cancel|반려|거절|거부|불가/]
          : intent === "defer"
            ? [/skip|next|defer|hold|pending|보류|다음|건너|대기/]
            : [/rework|revise|fix|supplement|followup|remediate|보완|수정|재작업|추가|재검토/];
    const matched = candidates.find(({ source }) => patterns.some((pattern) => pattern.test(source)));
    return matched?.option.number;
  }

  function buildDecisionReplyAck(
    item: DecisionInboxRouteItem,
    optionNumber: number,
    status: number,
    payload: Record<string, unknown>,
  ): string {
    if (status >= 400) {
      const reason = normalizeTextField(payload.error) || `status_${status}`;
      return pickDecisionL10n(
        `⚠️ 의사결정 회신 처리 실패 (${reason})`,
        `⚠️ Decision reply failed (${reason})`,
        `⚠️ 意思決定返信に失敗しました (${reason})`,
        `⚠️ 决策回复失败（${reason}）`,
      );
    }
    if (String(payload.action ?? "") === "start_project_review_blocked") {
      const blockedTasks = Array.isArray(payload.blocked_tasks) ? payload.blocked_tasks : [];
      const firstBlocked = blockedTasks[0] as { title?: unknown; reason?: unknown } | undefined;
      const blockedLabel = String(firstBlocked?.title ?? "").trim() || "task";
      const reasonLabel = String(firstBlocked?.reason ?? "").trim() || "review_gate_hold";
      return pickDecisionL10n(
        `⚠️ 팀장 회의 시작이 보류되었습니다. (${blockedLabel}, ${reasonLabel})`,
        `⚠️ Team-lead meeting start is on hold. (${blockedLabel}, ${reasonLabel})`,
        `⚠️ チームリーダー会議の開始は保留です。(${blockedLabel}, ${reasonLabel})`,
        `⚠️ 组长评审会议暂缓启动。(${blockedLabel}, ${reasonLabel})`,
      );
    }
    const optionLabel =
      item.options.find((option) => option.number === optionNumber)?.label || `option ${optionNumber}`;
    const resolved = payload.resolved === true;
    if (resolved) {
      return pickDecisionL10n(
        `✅ 의사결정 반영 완료: ${optionLabel}`,
        `✅ Decision applied: ${optionLabel}`,
        `✅ 意思決定を反映しました: ${optionLabel}`,
        `✅ 已应用决策：${optionLabel}`,
      );
    }
    return pickDecisionL10n(
      `☑️ 의사결정 기록 완료: ${optionLabel}`,
      `☑️ Decision recorded: ${optionLabel}`,
      `☑️ 意思決定を記録しました: ${optionLabel}`,
      `☑️ 已记录决策：${optionLabel}`,
    );
  }

  function buildDecisionReplyAckKo(
    item: DecisionInboxRouteItem,
    optionNumber: number,
    status: number,
    payload: Record<string, unknown>,
  ): string {
    if (status >= 400) {
      const reason = normalizeTextField(payload.error) || `status_${status}`;
      return `의사결정 회신 처리 실패: ${reason}`;
    }
    if (String(payload.action ?? "") === "start_project_review_blocked") {
      const blockedTasks = Array.isArray(payload.blocked_tasks) ? payload.blocked_tasks : [];
      const firstBlocked = blockedTasks[0] as { title?: unknown; reason?: unknown } | undefined;
      const blockedLabel = String(firstBlocked?.title ?? "").trim() || "task";
      const reasonLabel = String(firstBlocked?.reason ?? "").trim() || "review_gate_hold";
      return `팀장 회의 시작이 보류되었습니다. (${blockedLabel}, ${reasonLabel})`;
    }
    const optionLabel =
      item.options.find((option) => option.number === optionNumber)?.label || `option ${optionNumber}`;
    if (payload.resolved === true) {
      return `의사결정 반영 완료: ${optionNumber}. ${optionLabel}`;
    }
    return `의사결정 기록 완료: ${optionNumber}. ${optionLabel}`;
  }

  function buildDecisionReplyAckKoSafe(
    item: DecisionInboxRouteItem,
    optionNumber: number,
    status: number,
    payload: Record<string, unknown>,
  ): string {
    if (status >= 400) {
      const reason = normalizeTextField(payload.error) || `status_${status}`;
      return `의사결정 회신 처리 실패: ${reason}`;
    }
    if (String(payload.action ?? "") === "start_project_review_blocked") {
      const blockedTasks = Array.isArray(payload.blocked_tasks) ? payload.blocked_tasks : [];
      const firstBlocked = blockedTasks[0] as { title?: unknown; reason?: unknown } | undefined;
      const blockedLabel = String(firstBlocked?.title ?? "").trim() || "task";
      const reasonLabel = String(firstBlocked?.reason ?? "").trim() || "review_gate_hold";
      return `팀장 회의 시작이 보류되었습니다. (${blockedLabel}, ${reasonLabel})`;
    }
    const optionLabel =
      item.options.find((option) => option.number === optionNumber)?.label || `option ${optionNumber}`;
    if (payload.resolved === true) {
      return `의사결정 반영 완료: ${optionNumber}. ${optionLabel}`;
    }
    return `의사결정 기록 완료: ${optionNumber}. ${optionLabel}`;
  }

  async function flushDecisionInboxMessengerNotices(options: { force?: boolean } = {}): Promise<void> {
    const force = options.force === true;
    const items = getDecisionInboxItems();
    const activeIds = new Set(items.map((item) => item.id));
    const now = nowMs();
    pruneDecisionCaches(now, activeIds);
    if (force) sentDecisionNoticeSignatureById.clear();
    for (const item of items.slice().reverse()) {
      if (item.options.length <= 0) continue;
      const signature = buildDecisionNoticeSignature(item);
      const route = resolveDecisionRoute(item);
      if (!route) continue;
      if (!force) {
        const cached = sentDecisionNoticeSignatureById.get(item.id);
        if (cached?.signature === signature) continue;
      } else {
        try {
          const key = buildDecisionNoticeSettingKey(item.id, route);
          db.prepare("DELETE FROM settings WHERE key = ?").run(key);
        } catch {
          // ignore force-reset failures; regular reservation flow will handle concurrency.
        }
      }
      const reserved = reserveDecisionNoticeSend(item, route);
      if (reserved === "already_sent") {
        sentDecisionNoticeSignatureById.set(item.id, { signature, sentAt: nowMs() });
        continue;
      }
      if (!reserved) continue;
      const text = buildDecisionMessengerNotice(item);
      try {
        await sendMessengerMessage({
          channel: route.channel,
          targetId: route.targetId,
          text,
        });
        markDecisionNoticeSent(reserved);
        const t = nowMs();
        sentDecisionNoticeSignatureById.set(item.id, { signature: reserved.signature, sentAt: t });
        decisionRouteByDecisionId.set(item.id, { channel: route.channel, targetId: route.targetId, updatedAt: t });
        pruneDecisionCaches(t);
      } catch (err) {
        releaseDecisionNoticeReservation(reserved);
        console.warn(
          `[decision-messenger] failed to send decision notice (decision=${item.id}, channel=${route.channel}, target=${route.targetId}): ${String(err)}`,
        );
      }
    }
  }

  async function tryHandleInboxDecisionReply(input: DecisionReplyBridgeInput): Promise<DecisionReplyBridgeResult> {
    const text = String(input.text || "").trim();
    if (!text) return { handled: false, status: 200, payload: {} };

    const body = (input.body ?? {}) as Record<string, unknown>;
    const explicitRoute =
      isMessengerChannel(input.channel) && normalizeTextField(input.targetId)
        ? { channel: input.channel, targetId: normalizeTextField(input.targetId)! }
        : null;
    const fallbackRoute = resolveSourceChatRoute({
      source: normalizeTextField(input.source),
      chat: normalizeTextField(input.chat),
    });
    const route = explicitRoute ?? fallbackRoute;
    if (!route) return { handled: false, status: 200, payload: {} };

    if (DECISION_LIST_COMMAND_RE.test(text)) {
      const pendingItems = findPendingDecisionsForRoute(route);
      await sendMessengerMessage({
        channel: route.channel,
        targetId: route.targetId,
        text: buildPendingDecisionListMessageKoSafe(pendingItems),
      }).catch(() => {
        // no-op
      });
      return {
        handled: true,
        status: 200,
        payload: { ok: true, decision_count: pendingItems.length, action: "decision_list" },
      };
    }

    const explicitDecisionId = text.match(DECISION_TOKEN_RE)?.[1] ?? null;
    const hasExplicitMarker = DECISION_REPLY_MARKER_SAFE_RE.test(text) || Boolean(explicitDecisionId);
    const numbers = parseOptionNumbersFromTextSafe(text);
    const intent = resolveIntentFromText(text);
    const hasChoiceLikeText = isPlainDecisionChoiceTextSafe(text);
    const isApproveWord = DECISION_APPROVE_WORD_SAFE_RE.test(text.replace(DECISION_REPLY_MARKER_SAFE_RE, "").trim());
    const isSimpleChoice = hasChoiceLikeText || (numbers.length === 1 && !hasExplicitMarker) || Boolean(intent);
    if (!hasExplicitMarker && !isSimpleChoice) {
      return { handled: false, status: 200, payload: {} };
    }

    const pendingDecision = findLatestDecisionForRoute(route, explicitDecisionId);
    if (!pendingDecision) {
      if (!hasExplicitMarker) return { handled: false, status: 200, payload: {} };
      await sendMessengerMessage({
        channel: route.channel,
        targetId: route.targetId,
        text: "현재 이 채널에 대기 중인 의사결정이 없습니다.",
      }).catch(() => {
        // no-op
      });
      return { handled: true, status: 404, payload: { error: "decision_not_found_for_route" } };
    }

    const validOptionNumbers = numbers.filter((num) => pendingDecision.options.some((option) => option.number === num));
    let selectedOptionNumber: number | undefined = validOptionNumbers[0];
    if (!selectedOptionNumber && isApproveWord && pendingDecision.options.length > 0) {
      selectedOptionNumber = pendingDecision.options[0]?.number;
    }
    if (!selectedOptionNumber) {
      selectedOptionNumber = inferOptionNumberByIntent(pendingDecision, intent);
    }
    if (typeof selectedOptionNumber !== "number") {
      const optionsHint = pendingDecision.options.map((option) => option.number).join(", ");
      await sendMessengerMessage({
        channel: route.channel,
        targetId: route.targetId,
        text: `선택 번호가 필요합니다. 가능한 번호: ${optionsHint}`,
      }).catch(() => {
        // no-op
      });
      return { handled: true, status: 400, payload: { error: "option_number_required" } };
    }
    const finalOptionNumber = selectedOptionNumber;

    const note = extractDecisionNoteSafe(text, body);
    const replyBody: Record<string, unknown> = {
      ...body,
      option_number: finalOptionNumber,
    };
    if (pendingDecision.kind === "review_round_pick" && validOptionNumbers.length > 1) {
      replyBody.selected_option_numbers = validOptionNumbers;
      replyBody.selected_feedback_numbers = validOptionNumbers;
    }
    if (note) replyBody.note = note;

    const applied = applyDecisionReply(pendingDecision.id, replyBody);
    const ack = buildDecisionReplyAckKoSafe(pendingDecision, finalOptionNumber, applied.status, applied.payload);
    await sendMessengerMessage({ channel: route.channel, targetId: route.targetId, text: ack }).catch((err) => {
      console.warn(
        `[decision-messenger] failed to send decision reply ack (decision=${pendingDecision.id}, channel=${route.channel}, target=${route.targetId}): ${String(err)}`,
      );
    });

    return {
      handled: true,
      status: applied.status,
      payload: {
        ...applied.payload,
        decision_id: pendingDecision.id,
        option_number: finalOptionNumber,
      },
    };
  }

  function startBackgroundNoticeSync(): void {
    const decisionNoticeTimer = setInterval(() => {
      void flushDecisionInboxMessengerNotices().catch((err) => {
        console.warn(`[decision-messenger] background notice flush failed: ${String(err)}`);
      });
    }, 5000);
    (decisionNoticeTimer as NodeJS.Timeout).unref?.();
    setTimeout(() => {
      void flushDecisionInboxMessengerNotices().catch((err) => {
        console.warn(`[decision-messenger] initial notice flush failed: ${String(err)}`);
      });
    }, 1200);
  }

  return {
    tryHandleInboxDecisionReply,
    flushDecisionInboxMessengerNotices,
    startBackgroundNoticeSync,
  };
}
