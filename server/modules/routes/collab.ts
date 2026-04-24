import type { RuntimeContext, RouteCollabExports } from "../../types/runtime-context.ts";
import type { Lang } from "../../types/lang.ts";
import { createHash, randomUUID } from "node:crypto";
import {
  listMessengerSessions,
  sendMessengerMessage,
  sendMessengerSessionMessage,
  type MessengerChannel,
} from "../../gateway/client.ts";
import { isMessengerChannel } from "../../messenger/channels.ts";
import { decryptMessengerTokenForRuntime } from "../../messenger/token-crypto.ts";

import { createAnnouncementReplyScheduler } from "./collab/announcement-response.ts";
import { createChatReplyGenerator } from "./collab/chat-response.ts";
import { initializeCollabCoordination } from "./collab/coordination.ts";
import { createDirectChatHandlers, type AgentRow } from "./collab/direct-chat.ts";
import { initializeCollabLanguagePolicy } from "./collab/language-policy.ts";
import { initializeProjectResolution, type DelegationOptions } from "./collab/project-resolution.ts";
import { initializeSubtaskDelegation } from "./collab/subtask-delegation.ts";
import { createTaskDelegationHandler } from "./collab/task-delegation.ts";
import { deriveFamilyFromDepartment, getCanonicalStageRank, resolveCanonicalIdentity } from "../company/canonical-identity.ts";
import { pickCanonicalMeetingChair } from "../company/canonical-authority.ts";
import { getDepartmentForPack, readActiveOfficeWorkflowPackKey } from "../workflow/packs/department-scope.ts";
import { getDepartmentResponsibilityText, mapLegacyDepartmentId } from "../bootstrap/schema/organization-manifest.ts";

export function buildMessengerRelayPayloadHash(text: string): string {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex").slice(0, 24);
}

export function hasDuplicateMessengerRelayLog(
  messages: string[],
  input: {
    messageType: string;
    routeKind: string;
    departmentId: string;
    payloadHash: string;
  },
): boolean {
  return messages.some((message) => {
    const source = String(message ?? "");
    if (!source.includes("messenger_relay_success")) return false;
    if (!source.includes(`message_type=${input.messageType}`)) return false;
    if (!source.includes(`route_kind=${input.routeKind}`)) return false;
    if (!source.includes(`department_id=${input.departmentId}`)) return false;
    if (source.includes(`payload_hash=${input.payloadHash}`)) return true;
    return input.messageType === "report" && !source.includes("payload_hash=");
  });
}

export function registerRoutesPartB(ctx: RuntimeContext): RouteCollabExports {
  const __ctx: RuntimeContext = ctx;
  const appendTaskLog = __ctx.appendTaskLog;
  const activeProcesses = __ctx.activeProcesses;
  const broadcast = __ctx.broadcast;
  const buildCliFailureMessage = __ctx.buildCliFailureMessage;
  const buildDirectReplyPrompt = __ctx.buildDirectReplyPrompt;
  const executeApiProviderAgent = __ctx.executeApiProviderAgent;
  const executeCopilotAgent = __ctx.executeCopilotAgent;
  const executeAntigravityAgent = __ctx.executeAntigravityAgent;
  const buildTaskExecutionPrompt = __ctx.buildTaskExecutionPrompt;
  const chooseSafeReply = __ctx.chooseSafeReply;
  const createWorktree = __ctx.createWorktree;
  const db = __ctx.db;
  const delegatedTaskToSubtask = __ctx.delegatedTaskToSubtask;
  const ensureClaudeMd = __ctx.ensureClaudeMd;
  const ensureTaskExecutionSession = __ctx.ensureTaskExecutionSession;
  const finishReview = __ctx.finishReview;
  const getAgentDisplayName = __ctx.getAgentDisplayName;
  const getProviderModelConfig = __ctx.getProviderModelConfig;
  const getRecentConversationContext = __ctx.getRecentConversationContext;
  const handleTaskRunComplete = __ctx.handleTaskRunComplete;
  const hasExplicitWarningFixRequest = __ctx.hasExplicitWarningFixRequest;
  const getNextHttpAgentPid = __ctx.getNextHttpAgentPid;
  const isTaskWorkflowInterrupted = __ctx.isTaskWorkflowInterrupted;
  const launchApiProviderAgent = __ctx.launchApiProviderAgent;
  const launchHttpAgent = __ctx.launchHttpAgent;
  const logsDir = __ctx.logsDir;
  const notifyCeo = __ctx.notifyCeo;
  const nowMs = __ctx.nowMs;
  const randomDelay = __ctx.randomDelay;
  const recordTaskCreationAudit = __ctx.recordTaskCreationAudit;
  const runAgentOneShot = __ctx.runAgentOneShot;
  const seedApprovedPlanSubtasks = __ctx.seedApprovedPlanSubtasks;
  const spawnCliAgent = __ctx.spawnCliAgent;
  const startPlannedApprovalMeeting = __ctx.startPlannedApprovalMeeting;
  const startProgressTimer = __ctx.startProgressTimer;
  const startTaskExecutionForAgent = __ctx.startTaskExecutionForAgent;
  const stopRequestModeByTask = __ctx.stopRequestModeByTask;
  const stopRequestedTasks = __ctx.stopRequestedTasks;
  const subtaskDelegationCallbacks = __ctx.subtaskDelegationCallbacks;
  const subtaskDelegationCompletionNoticeSent = __ctx.subtaskDelegationCompletionNoticeSent;
  const subtaskDelegationDispatchInFlight = __ctx.subtaskDelegationDispatchInFlight;
  const resolveProjectPathBase = (...args: any[]) => __ctx.resolveProjectPath(...args);

  // ---------------------------------------------------------------------------
  // Agent auto-reply & task delegation logic
  // ---------------------------------------------------------------------------
  const TASK_MESSENGER_ROUTE_PREFIX = "[messenger-route]";
  const TASK_MESSENGER_SESSION_ROUTE_PREFIX = "[messenger-session-route]";
  const TASK_MESSENGER_ROUTE_CACHE_MAX = 1024;
  const TASK_MESSENGER_ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const TASK_MESSENGER_RELAY_MESSAGE_TYPES = new Set(["report", "chat", "status_update"]);
  const taskMessengerRouteByTaskId = new Map<
    string,
    { channel: MessengerChannel; targetId: string; sessionKey?: string; updatedAt: number }
  >();

  function parseTaskMessengerRouteLine(line: string): { channel: MessengerChannel; targetId: string } | null {
    if (!line.startsWith(`${TASK_MESSENGER_ROUTE_PREFIX} `)) return null;
    const payload = line.slice(TASK_MESSENGER_ROUTE_PREFIX.length).trim();
    const separator = payload.indexOf(":");
    if (separator <= 0) return null;
    const channelRaw = payload.slice(0, separator).trim().toLowerCase();
    const targetId = payload.slice(separator + 1).trim();
    if (!isMessengerChannel(channelRaw) || !targetId) return null;
    return { channel: channelRaw, targetId };
  }

  function parseTaskMessengerSessionRouteLine(line: string): string | null {
    if (!line.startsWith(`${TASK_MESSENGER_SESSION_ROUTE_PREFIX} `)) return null;
    const payload = line.slice(TASK_MESSENGER_SESSION_ROUTE_PREFIX.length).trim();
    if (!payload) return null;
    const [channelRaw, ...rest] = payload.split(":");
    const channel = channelRaw.trim().toLowerCase();
    const sessionId = rest.join(":").trim();
    if (!isMessengerChannel(channel) || !sessionId) return null;
    return `${channel}:${sessionId}`;
  }

  function pruneTaskMessengerRouteCache(now: number): void {
    for (const [taskId, route] of taskMessengerRouteByTaskId.entries()) {
      if (now - route.updatedAt > TASK_MESSENGER_ROUTE_CACHE_TTL_MS) {
        taskMessengerRouteByTaskId.delete(taskId);
      }
    }
    while (taskMessengerRouteByTaskId.size > TASK_MESSENGER_ROUTE_CACHE_MAX) {
      const oldest = taskMessengerRouteByTaskId.keys().next().value;
      if (!oldest) break;
      taskMessengerRouteByTaskId.delete(oldest);
    }
  }

  function registerTaskMessengerRoute(taskId: string, options: DelegationOptions = {}): void {
    const now = nowMs();
    pruneTaskMessengerRouteCache(now);

    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return;
    const targetId = (options.messengerTargetId || "").trim();
    const sessionKey = (options.messengerSessionKey || "").trim() || undefined;
    if (!isMessengerChannel(options.messengerChannel) || !targetId) return;

    const nextRoute = { channel: options.messengerChannel, targetId, sessionKey };
    const current = taskMessengerRouteByTaskId.get(normalizedTaskId);
    if (
      current &&
      current.channel === nextRoute.channel &&
      current.targetId === nextRoute.targetId &&
      current.sessionKey === nextRoute.sessionKey
    ) {
      current.updatedAt = now;
      taskMessengerRouteByTaskId.set(normalizedTaskId, current);
      return;
    }

    taskMessengerRouteByTaskId.set(normalizedTaskId, { ...nextRoute, updatedAt: now });
    appendTaskLog(
      normalizedTaskId,
      "system",
      `${TASK_MESSENGER_ROUTE_PREFIX} ${nextRoute.channel}:${nextRoute.targetId}`,
    );
    if (nextRoute.sessionKey) {
      appendTaskLog(normalizedTaskId, "system", `${TASK_MESSENGER_SESSION_ROUTE_PREFIX} ${nextRoute.sessionKey}`);
    }
  }

  function resolveTaskMessengerRoute(
    taskId: string,
  ): { channel: MessengerChannel; targetId: string; sessionKey?: string } | null {
    const now = nowMs();
    pruneTaskMessengerRouteCache(now);

    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return null;

    const cached = taskMessengerRouteByTaskId.get(normalizedTaskId);
    if (cached) return { channel: cached.channel, targetId: cached.targetId, sessionKey: cached.sessionKey };

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
      .get(normalizedTaskId, `${TASK_MESSENGER_ROUTE_PREFIX} %`) as { message?: string } | undefined;
    const parsed = typeof row?.message === "string" ? parseTaskMessengerRouteLine(row.message) : null;
    if (parsed) {
      const sessionRow = db
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
        .get(normalizedTaskId, `${TASK_MESSENGER_SESSION_ROUTE_PREFIX} %`) as { message?: string } | undefined;
      const sessionKey =
        typeof sessionRow?.message === "string" ? parseTaskMessengerSessionRouteLine(sessionRow.message) : null;
      taskMessengerRouteByTaskId.set(normalizedTaskId, {
        ...parsed,
        sessionKey: sessionKey || undefined,
        updatedAt: now,
      });
      pruneTaskMessengerRouteCache(now);
      return { ...parsed, ...(sessionKey ? { sessionKey } : {}) };
    }
    return null;
  }

  function normalizeMessengerDepartmentId(value: unknown): string {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    return mapLegacyDepartmentId(raw) ?? raw;
  }

  function readSingleGroupTelegramRouteFromSettings(): {
    channel: "telegram";
    targetId: string;
    sessionKey: string;
    token: string;
  } | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'messengerChannels' LIMIT 1").get() as
      | { value?: unknown }
      | undefined;
    const raw = typeof row?.value === "string" ? row.value.trim() : "";
    if (!raw) return null;

    try {
      const root = JSON.parse(raw) as {
        telegram?: {
          token?: string;
          sessions?: Array<{
            id?: string;
            targetId?: string;
            enabled?: boolean;
            token?: string;
            agentId?: string;
            workflowPackKey?: string;
            departmentId?: string;
            department_id?: string;
          }>;
        };
      };
      const telegram = root.telegram;
      if (!telegram || typeof telegram !== "object") return null;
      const sessions = Array.isArray(telegram.sessions) ? telegram.sessions : [];
      const preferred =
        sessions.find((session) => String(session.id ?? "").trim().toLowerCase() === "global") ??
        sessions.find(
          (session) =>
            session.enabled !== false &&
            !String(session.agentId ?? "").trim() &&
            !String(session.workflowPackKey ?? "").trim() &&
            !String(session.departmentId ?? session.department_id ?? "").trim(),
        ) ??
        sessions.find((session) => session.enabled !== false) ??
        sessions[0] ??
        null;
      const targetId = String(preferred?.targetId ?? "").trim();
      if (!targetId) return null;
      const rawToken = String(preferred?.token ?? telegram.token ?? "").trim();
      const token = rawToken ? decryptMessengerTokenForRuntime("telegram", rawToken) : "";
      if (!token) return null;
      return {
        channel: "telegram",
        targetId,
        sessionKey: "telegram:global",
        token,
      };
    } catch {
      return null;
    }
  }

  async function sendTelegramMessageWithToken(token: string, chatId: string, text: string): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || `telegram send failed (${response.status})`);
    }
  }

  function resolveSingleGroupTaskMessengerRoute(
    taskId: string,
    fallbackRoute: { channel: MessengerChannel; targetId: string; sessionKey?: string } | null,
    speakerDepartmentId?: string | null,
  ): {
    channel: MessengerChannel;
    targetId: string;
    sessionKey?: string;
    token?: string;
    routeKind: "single_group_department_tag";
    routingReason: "global_group";
    departmentId: string;
    taskStatus: string;
  } | null {
    const taskRow = db
      .prepare("SELECT department_id, status FROM tasks WHERE id = ?")
      .get(taskId) as { department_id?: string | null; status?: string | null } | undefined;

    const departmentId =
      normalizeMessengerDepartmentId(speakerDepartmentId) || normalizeMessengerDepartmentId(taskRow?.department_id) || "unknown";
    const taskStatus =
      typeof taskRow?.status === "string" && taskRow.status.trim().length > 0 ? taskRow.status.trim() : "unknown";

    const sessions = listMessengerSessions();
    const telegramSession =
      sessions.find(
        (session) =>
          session.enabled &&
          session.channel === "telegram" &&
          String(session.sessionKey ?? "").trim().toLowerCase() === "telegram:global" &&
          String(session.targetId ?? "").trim().length > 0,
      ) ??
      sessions.find((session) => {
        const sessionKey = String(session.sessionKey ?? "").trim().toLowerCase();
        const departmentId = String((session as Record<string, unknown>).departmentId ?? "")
          .trim()
          .toLowerCase();
        return (
          session.enabled &&
          session.channel === "telegram" &&
          (sessionKey.includes("global") || departmentId === "all") &&
          String(session.targetId ?? "").trim().length > 0
        );
      }) ??
      sessions.find(
        (session) =>
          session.enabled &&
          session.channel === "telegram" &&
          String((session as Record<string, unknown>).agentId ?? "").trim().length <= 0 &&
          String(session.targetId ?? "").trim().length > 0,
      ) ??
      sessions.find(
        (session) =>
          session.enabled && session.channel === "telegram" && String(session.targetId ?? "").trim().length > 0,
      ) ??
      null;
    const settingsRoute = telegramSession ? null : readSingleGroupTelegramRouteFromSettings();

    const candidateRoute = telegramSession
      ? {
          channel: telegramSession.channel,
          targetId: String(telegramSession.targetId ?? "").trim(),
          sessionKey: String(telegramSession.sessionKey ?? "").trim() || undefined,
        }
      : settingsRoute
        ? settingsRoute
      : fallbackRoute && fallbackRoute.channel === "telegram" && fallbackRoute.targetId
        ? fallbackRoute
        : null;

    if (!candidateRoute) return null;

    return {
      ...candidateRoute,
      routeKind: "single_group_department_tag",
      routingReason: "global_group",
      departmentId,
      taskStatus,
    };
  }

  function buildSingleGroupRelayHeader(taskId: string, departmentId: string, taskStatus: string): string {
    const departmentLabel = departmentId !== "unknown" ? getDeptName(departmentId) : departmentId;
    const normalizedDepartment = normalizeMessengerTextLine(departmentLabel || departmentId || "unknown");
    const normalizedStatus = normalizeMessengerTextLine(taskStatus || "unknown");
    return `[${normalizedDepartment}][${taskId}][${normalizedStatus}]`;
  }

  function getMessengerChunkLimit(channel: MessengerChannel): number {
    if (channel === "discord") return 1900;
    if (channel === "telegram") return 3800;
    if (channel === "slack") return 3900;
    if (channel === "whatsapp") return 3900;
    if (channel === "googlechat") return 3900;
    if (channel === "signal") return 3900;
    if (channel === "imessage") return 3900;
    return 35000;
  }

  function splitMessageByLimit(text: string, limit: number): string[] {
    const source = text.trim();
    if (!source) return [];
    if (source.length <= limit) return [source];

    const chunks: string[] = [];
    let remaining = source;
    while (remaining.length > limit) {
      let cut = remaining.lastIndexOf("\n", limit);
      if (cut < Math.floor(limit * 0.4)) {
        cut = remaining.lastIndexOf(" ", limit);
      }
      if (cut < Math.floor(limit * 0.4)) {
        cut = limit;
      }
      const chunk = remaining.slice(0, cut).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  function normalizeMessengerTextLine(raw: string): string {
    return raw
      .replace(/[`*_~>#]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateMessengerText(value: string, max = 160): string {
    const normalized = value.trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
  }

  function extractTaskTitleFromReportText(content: string, requestLine: string): string {
    const source = requestLine || content;
    const quoted = source.match(/['"]([^'"]{2,220})['"]/) ?? source.match(/\[([^\]]{2,220})\]/);
    const picked = quoted?.[1] ?? "";
    return truncateMessengerText(normalizeMessengerTextLine(picked), 90);
  }

  function buildMessengerReportIdentityIntro(agent: AgentRow, content: string, requestLine: string): string {
    const hasKorean = /[가-힣]/.test(content);
    const hasJapanese = /[\u3040-\u30ff]/.test(content);
    const hasChinese = /[\u4e00-\u9fff]/.test(content) && !hasJapanese;
    const displayName = normalizeMessengerTextLine(agent.name_ko || agent.name || "Agent");
    const avatar = normalizeMessengerTextLine(agent.avatar_emoji || "BOT");
    const taskTitle = extractTaskTitleFromReportText(content, requestLine);

    if (hasKorean) {
      return taskTitle
        ? `${avatar} ${displayName} 보고: '${taskTitle}' 완료 결과를 전달합니다.`
        : `${avatar} ${displayName} 보고: 완료 결과를 전달합니다.`;
    }
    if (hasJapanese) {
      return taskTitle
        ? `${avatar} ${displayName} report: sharing completion result for '${taskTitle}'.`
        : `${avatar} ${displayName} report: sharing completion result.`;
    }
    if (hasChinese) {
      return taskTitle
        ? `${avatar} ${displayName} report: sharing completion result for '${taskTitle}'.`
        : `${avatar} ${displayName} report: sharing completion result.`;
    }
    return taskTitle
      ? `${avatar} ${displayName} report: sharing completion result for '${taskTitle}'.`
      : `${avatar} ${displayName} report: sharing completion result.`;
  }

  function buildMessengerReportSummary(agent: AgentRow, content: string): string {
    const shouldSummarize =
      /\|\s*#\s*\|/i.test(content) ||
      /\|\s*1\s*\|/.test(content) ||
      /(결과|result)\s*:/i.test(content) ||
      content.length >= 900;
    if (!shouldSummarize) return content;

    const rawLines = content.split(/\r?\n/);
    const plainLines = rawLines.map((line) => normalizeMessengerTextLine(line));

    const requestLine =
      plainLines.find((line) =>
        /(업무 완료 보고|reporting completion|completion result)/i.test(line),
      ) ?? "";
    const identityIntro = buildMessengerReportIdentityIntro(agent, content, requestLine);
    const progressLine =
      plainLines.find((line) =>
        /(?:전체|total)\s*:\s*\d+\s*\/\s*\d+|(?:완료|completion|progress|진행)\s*[:：]?\s*(?:\d+\s*%|\d+\s*\/\s*\d+)/i.test(
          line,
        ),
      ) ?? "";

    const tableItems: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      const cells = trimmed
        .split("|")
        .map((cell) => normalizeMessengerTextLine(cell))
        .filter(Boolean);
      if (cells.length < 3) continue;
      const index = Number.parseInt(cells[0] ?? "", 10);
      if (!Number.isFinite(index)) continue;
      const issue = cells[1] || "-";
      const severity = cells[2] || "";
      tableItems.push(`${index}. ${severity ? `[${severity}] ` : ""}${truncateMessengerText(issue, 120)}`);
      if (tableItems.length >= 3) break;
    }

    const resultItems: string[] = [];
    let inResultSection = false;
    for (let i = 0; i < rawLines.length; i += 1) {
      const rawLine = rawLines[i] ?? "";
      const plain = plainLines[i] ?? "";
      if (!inResultSection) {
        if (/(결과|result)\s*:?/i.test(rawLine) || /^(결과|result)\s*:?$/i.test(plain)) {
          inResultSection = true;
        }
        continue;
      }
      if (!plain || plain === "...") continue;
      if (/^[#\-*]/u.test(rawLine.trim())) break;
      if (/(보완\/협업 진행 요약|Remediation\/Collaboration Progress|Changes)/i.test(plain)) break;
      if (rawLine.trim().startsWith("|")) continue;
      const cleaned = plain.replace(/^[-•*\s]+/, "").trim();
      if (!cleaned) continue;
      resultItems.push(truncateMessengerText(cleaned, 150));
      if (resultItems.length >= 3) break;
    }

    const keyItems = tableItems.length > 0 ? tableItems : resultItems.map((line, idx) => `${idx + 1}. ${line}`);
    if (keyItems.length <= 0) return content;

    const hasKorean = /[가-힣]/.test(content);
    const title = hasKorean ? "업무 완료 요약" : "Task Completion Summary";
    const keyLabel = hasKorean ? "핵심 결과" : "Key Results";
    const progressLabel = hasKorean ? "진행 요약" : "Progress";
    const detailHint = hasKorean
      ? "상세 내용은 Claw-Empire 채팅창에서 확인하세요."
      : "See Claw-Empire chat for full details.";

    const out: string[] = [title, identityIntro];
    out.push(`${keyLabel}:`);
    out.push(...keyItems);
    if (progressLine) out.push(`${progressLabel}: ${truncateMessengerText(progressLine, 160)}`);
    out.push(detailHint);
    return out.join("\n");
  }

  function formatMessengerBroadcastContent(agent: AgentRow, messageType: string, rawContent: string): string {
    const content = rawContent.trim();
    if (!content) return "";
    if (messageType === "report") {
      return buildMessengerReportSummary(agent, content);
    }
    return content;
  }

  async function relayTaskBroadcastToAssignedMessengerSessions(
    taskId: string,
    agent: AgentRow,
    messageType: string,
    rawContent: string,
  ): Promise<void> {
    const content = formatMessengerBroadcastContent(agent, messageType, rawContent);
    if (!content) return;

    const route = resolveTaskMessengerRoute(taskId);
    const relayRoute = resolveSingleGroupTaskMessengerRoute(taskId, route, agent.department_id);
    if (!relayRoute) {
      appendTaskLog(
        taskId,
        "system",
        `messenger_relay_failed channel=unknown targetId=none task_id=${taskId} message_type=${messageType} error_code=route_missing`,
      );
      return;
    }
    const taggedContent = `${buildSingleGroupRelayHeader(taskId, relayRoute.departmentId, relayRoute.taskStatus)}\n${content}`;
    const payloadHash = buildMessengerRelayPayloadHash(taggedContent);
    const routeRef = relayRoute.sessionKey ? `sessionKey=${relayRoute.sessionKey}` : `targetId=${relayRoute.targetId}`;
    const reasonSuffix = ` routing_reason=${relayRoute.routingReason} department_id=${relayRoute.departmentId}`;
    const hashSuffix = ` payload_hash=${payloadHash}`;

    const recentRelayMessages = (
      db
        .prepare(
          `
      SELECT message
      FROM task_logs
      WHERE task_id = ?
        AND kind = 'system'
        AND message LIKE '%messenger_relay_%'
      ORDER BY created_at DESC
      LIMIT 100
    `,
        )
        .all(taskId) as Array<{ message?: string | null }>
    ).map((row) => String(row.message ?? ""));
    if (
      hasDuplicateMessengerRelayLog(recentRelayMessages, {
        messageType,
        routeKind: relayRoute.routeKind,
        departmentId: relayRoute.departmentId,
        payloadHash,
      })
    ) {
      appendTaskLog(
        taskId,
        "system",
        `messenger_relay_skipped duplicate_report channel=${relayRoute.channel} ${routeRef} task_id=${taskId} message_type=${messageType} route_kind=${relayRoute.routeKind}${reasonSuffix}${hashSuffix}`,
      );
      return;
    }

    appendTaskLog(
      taskId,
      "system",
      `messenger_relay_attempt channel=${relayRoute.channel} ${routeRef} task_id=${taskId} message_type=${messageType} route_kind=${relayRoute.routeKind}${reasonSuffix}${hashSuffix}`,
    );

    try {
      const chunks = splitMessageByLimit(taggedContent, getMessengerChunkLimit(relayRoute.channel));
      for (const chunk of chunks) {
        if (relayRoute.channel === "telegram" && relayRoute.token) {
          await sendTelegramMessageWithToken(relayRoute.token, relayRoute.targetId, chunk);
        } else if (relayRoute.sessionKey) {
          await sendMessengerSessionMessage(relayRoute.sessionKey, chunk);
        } else {
          await sendMessengerMessage({
            channel: relayRoute.channel,
            targetId: relayRoute.targetId,
            text: chunk,
          });
        }
      }
      appendTaskLog(
        taskId,
        "system",
        `messenger_relay_success channel=${relayRoute.channel} ${routeRef} task_id=${taskId} message_type=${messageType} route_kind=${relayRoute.routeKind}${reasonSuffix}${hashSuffix}`,
      );
    } catch (err: unknown) {
      const errorCode = err instanceof Error ? err.message.replace(/\s+/g, "_").slice(0, 120) : "send_failed";
      appendTaskLog(
        taskId,
        "system",
        `messenger_relay_failed channel=${relayRoute.channel} ${routeRef} task_id=${taskId} message_type=${messageType} route_kind=${relayRoute.routeKind}${reasonSuffix}${hashSuffix} error_code=${errorCode || "send_failed"}`,
      );
      throw err;
    }
  }

  function shouldRelayTaskBroadcastToMessenger(
    messageType: string,
    receiverType: string,
    taskId: string | null,
  ): taskId is string {
    if (!taskId) return false;
    if (receiverType !== "all") return false;
    return TASK_MESSENGER_RELAY_MESSAGE_TYPES.has(messageType);
  }

  function sendAgentMessage(
    agent: AgentRow,
    content: string,
    messageType: string = "chat",
    receiverType: string = "agent",
    receiverId: string | null = null,
    taskId: string | null = null,
  ): void {
    const id = randomUUID();
    const t = nowMs();
    const taskExists = (idValue: string): boolean => {
      try {
        const row = db.prepare("SELECT 1 AS ok FROM tasks WHERE id = ?").get(idValue) as { ok?: number } | undefined;
        return row?.ok === 1;
      } catch {
        return false;
      }
    };
    const isForeignKeyError = (err: unknown): boolean => {
      const msg = err instanceof Error ? err.message : String(err);
      return /foreign key constraint failed/i.test(msg);
    };
    let persistedTaskId = taskId && taskExists(taskId) ? taskId : null;
    let persistedProjectId: string | null = null;
    if (persistedTaskId) {
      const taskRow = db
        .prepare("SELECT project_id FROM tasks WHERE id = ?")
        .get(persistedTaskId) as { project_id?: string | null } | undefined;
      persistedProjectId = taskRow?.project_id ?? null;
    }

    try {
      db.prepare(
        `
      INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, project_id, created_at)
      VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(id, agent.id, receiverType, receiverId, content, messageType, persistedTaskId, persistedProjectId, t);
    } catch (err) {
      if (persistedTaskId && isForeignKeyError(err)) {
        // Task row can disappear between async timers and insert time; fall back to task-less message.
        try {
          persistedTaskId = null;
          persistedProjectId = null;
          db.prepare(
            `
          INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, project_id, created_at)
          VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          ).run(id, agent.id, receiverType, receiverId, content, messageType, null, null, t);
        } catch (fallbackErr) {
          console.warn(`[sendAgentMessage] drop message after FK fallback failure: ${String(fallbackErr)}`);
          return;
        }
      } else {
        console.warn(`[sendAgentMessage] drop message due to insert failure: ${String(err)}`);
        return;
      }
    }

    broadcast("new_message", {
      id,
      sender_type: "agent",
      sender_id: agent.id,
      receiver_type: receiverType,
      receiver_id: receiverId,
      content,
      message_type: messageType,
      task_id: persistedTaskId,
      project_id: persistedProjectId,
      created_at: t,
      sender_name: agent.name,
      sender_avatar: agent.avatar_emoji ?? "BOT",
    });

    if (shouldRelayTaskBroadcastToMessenger(messageType, receiverType, persistedTaskId)) {
      void relayTaskBroadcastToAssignedMessengerSessions(persistedTaskId, agent, messageType, content).catch((err) => {
        console.warn(
          `[messenger-relay] failed to relay task broadcast (task=${persistedTaskId}, type=${messageType}): ${String(err)}`,
        );
      });
    }
  }

  const {
    DEPT_KEYWORDS,
    pickRandom,
    getPreferredLanguage,
    resolveLang,
    detectLang,
    l,
    pickL,
    getFlairs,
    getRoleLabel,
    classifyIntent,
    analyzeDirectivePolicy,
    shouldExecuteDirectiveDelegation,
    detectTargetDepartments,
  } = initializeCollabLanguagePolicy({ db });

  const { generateChatReply } = createChatReplyGenerator({
    db,
    resolveLang,
    getDeptName,
    getRoleLabel,
    pickRandom,
    getFlairs,
    classifyIntent,
    l,
    pickL,
  });

  const { generateAnnouncementReply, scheduleAnnouncementReplies } = createAnnouncementReplyScheduler({
    db,
    resolveLang,
    getDeptName,
    getRoleLabel,
    l,
    pickL,
    sendAgentMessage,
  });

  Object.assign(__ctx, { generateChatReply, generateAnnouncementReply });

  const { normalizeTextField, resolveProjectFromOptions, buildRoundGoal } = initializeProjectResolution({ db });

  /** Detect @mentions in messages and return department IDs and agent IDs. */
  function detectMentions(message: string): { deptIds: string[]; agentIds: string[] } {
    const deptIds: string[] = [];
    const agentIds: string[] = [];

    // Match @department display-name patterns.
    const depts = db.prepare("SELECT id, name, name_ko FROM departments").all() as {
      id: string;
      name: string;
      name_ko: string;
    }[];
    for (const dept of depts) {
      const nameKo = dept.name_ko.replace(/팀$/u, "").trim();
      if (
        message.includes(`@${dept.name_ko}`) ||
        message.includes(`@${nameKo}`) ||
        message.includes(`@${dept.name}`) ||
        message.includes(`@${dept.id}`)
      ) {
        deptIds.push(dept.id);
      }
    }

    // Match @agent display-name patterns.
    const agents = db.prepare("SELECT id, name, name_ko FROM agents").all() as {
      id: string;
      name: string;
      name_ko: string | null;
    }[];
    for (const agent of agents) {
      if ((agent.name_ko && message.includes(`@${agent.name_ko}`)) || message.includes(`@${agent.name}`)) {
        agentIds.push(agent.id);
      }
    }

    return { deptIds, agentIds };
  }

  /** Handle mention-based delegation: create task in mentioned department */
  function handleMentionDelegation(originLeader: AgentRow, targetDeptId: string, ceoMessage: string, lang: Lang): void {
    const crossLeader = findCanonicalTeamLeader(targetDeptId);
    if (!crossLeader) return;
    const crossDeptName = getDeptName(targetDeptId);
    const crossLeaderName = lang === "ko" ? crossLeader.name_ko || crossLeader.name : crossLeader.name;
    const taskTitle = ceoMessage.length > 60 ? ceoMessage.slice(0, 57) + "..." : ceoMessage;

    // Origin team leader sends mention request to target team leader
    const mentionReq = pickL(
      l(
        [
          `${crossLeaderName} 팀에서 '${taskTitle}' 업무를 맡아 주세요. 대상 부서는 ${crossDeptName}입니다.`,
          `${crossLeaderName}, '${taskTitle}' 건을 ${crossDeptName} 부서 기준으로 진행해 주세요.`,
        ],
        [
          `${crossLeaderName}, CEO directive for ${crossDeptName}: "${taskTitle}". Please handle this.`,
          `${crossLeaderName}, CEO requested this for your team: "${taskTitle}"`,
        ],
        [`${crossLeaderName}, CEO requested this for your team: "${taskTitle}"`],
        [`${crossLeaderName}, CEO requested this for your team: "${taskTitle}"`],
      ),
      lang,
    );
    sendAgentMessage(originLeader, mentionReq, "task_assign", "agent", crossLeader.id, null);

    // Broadcast delivery animation event for UI
    broadcast("cross_dept_delivery", {
      from_agent_id: originLeader.id,
      to_agent_id: crossLeader.id,
      task_title: taskTitle,
    });

    // Target team leader acknowledges and delegates
    const ackDelay = 1500 + Math.random() * 1000;
    setTimeout(() => {
      // Use the full delegation flow for the target department
      handleTaskDelegation(crossLeader, ceoMessage, "");
    }, ackDelay);
  }

  function findBestSubordinate(
    deptId: string,
    excludeId: string,
    candidateAgentIds?: string[] | null,
  ): AgentRow | null {
    return findCanonicalBestSubordinate(deptId, excludeId, candidateAgentIds);
  }

  function findTeamLeader(deptId: string | null, candidateAgentIds?: string[] | null): AgentRow | null {
    return findCanonicalTeamLeader(deptId, candidateAgentIds);
  }

  function findCanonicalBestSubordinate(
    deptId: string,
    excludeId: string,
    candidateAgentIds?: string[] | null,
  ): AgentRow | null {
    const scopedIds = Array.isArray(candidateAgentIds)
      ? [...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    if (Array.isArray(scopedIds) && scopedIds.length === 0) return null;

    const targetFamily = deriveFamilyFromDepartment(deptId);
    const placeholders = Array.isArray(scopedIds) ? scopedIds.map(() => "?").join(", ") : "";
    const scopedClause = Array.isArray(scopedIds) ? `AND id IN (${placeholders})` : "";
    const agents = db
      .prepare(
        `
        SELECT *
        FROM agents
        WHERE id != ?
          AND role != 'team_leader'
          AND status != 'offline'
          ${scopedClause}
      `,
      )
      .all(excludeId, ...(scopedIds ?? [])) as unknown as AgentRow[];

    const statusRank = (status: string | null | undefined): number => {
      if (status === "idle") return 0;
      if (status === "break") return 1;
      if (status === "working") return 2;
      return 3;
    };

    return (
      agents
        .map((agent) => ({
          agent,
          canonical: resolveCanonicalIdentity(agent),
          sameDept: (agent.department_id ?? null) === deptId,
        }))
        .sort((left, right) => {
          const leftFamily = left.canonical.family === targetFamily ? 0 : 1;
          const rightFamily = right.canonical.family === targetFamily ? 0 : 1;
          if (leftFamily !== rightFamily) return leftFamily - rightFamily;

          const leftStatus = statusRank(left.agent.status);
          const rightStatus = statusRank(right.agent.status);
          if (leftStatus !== rightStatus) return leftStatus - rightStatus;

          if (left.sameDept !== right.sameDept) return left.sameDept ? -1 : 1;

          const leftStage = getCanonicalStageRank(left.canonical.career_stage);
          const rightStage = getCanonicalStageRank(right.canonical.career_stage);
          if (leftStage !== rightStage) return rightStage - leftStage;

          if (left.canonical.authority_level !== right.canonical.authority_level) {
            return right.canonical.authority_level - left.canonical.authority_level;
          }

          return String(left.agent.name ?? "").localeCompare(String(right.agent.name ?? ""));
        })[0]?.agent ?? null
    );
  }

  function findCanonicalTeamLeader(deptId: string | null, candidateAgentIds?: string[] | null): AgentRow | null {
    const scopedIds = Array.isArray(candidateAgentIds)
      ? [...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    if (Array.isArray(scopedIds) && scopedIds.length === 0) return null;

    const placeholders = Array.isArray(scopedIds) ? scopedIds.map(() => "?").join(", ") : "";
    const scopedClause = Array.isArray(scopedIds) ? `AND id IN (${placeholders})` : "";
    const leaders = db
      .prepare(
        `
        SELECT *
        FROM agents
        WHERE role = 'team_leader'
          AND status != 'offline'
          ${scopedClause}
      `,
      )
      .all(...(scopedIds ?? [])) as unknown as AgentRow[];
    if (leaders.length <= 0) return null;

    const normalizedDeptId = String(deptId ?? "").trim().toLowerCase();
    if (!normalizedDeptId || normalizedDeptId === "planning") {
      return pickCanonicalMeetingChair(leaders);
    }

    const targetFamily = deriveFamilyFromDepartment(normalizedDeptId);

    const statusRank = (status: string | null | undefined): number => {
      if (status === "idle") return 0;
      if (status === "break") return 1;
      if (status === "working") return 2;
      return 3;
    };

    return (
      leaders
        .map((leader) => ({
          leader,
          canonical: resolveCanonicalIdentity(leader),
          sameDept: (leader.department_id ?? null) === normalizedDeptId,
        }))
        .sort((left, right) => {
          const leftFamily = left.canonical.family === targetFamily ? 0 : 1;
          const rightFamily = right.canonical.family === targetFamily ? 0 : 1;
          if (leftFamily !== rightFamily) return leftFamily - rightFamily;

          if (left.canonical.authority_level !== right.canonical.authority_level) {
            return right.canonical.authority_level - left.canonical.authority_level;
          }

          const leftStage = getCanonicalStageRank(left.canonical.career_stage);
          const rightStage = getCanonicalStageRank(right.canonical.career_stage);
          if (leftStage !== rightStage) return rightStage - leftStage;

          if (left.sameDept !== right.sameDept) return left.sameDept ? -1 : 1;

          const leftStatus = statusRank(left.leader.status);
          const rightStatus = statusRank(right.leader.status);
          if (leftStatus !== rightStatus) return leftStatus - rightStatus;

          return Number(left.leader.created_at ?? 0) - Number(right.leader.created_at ?? 0);
        })[0]?.leader ?? null
    );
  }

  function getDeptName(deptId: string, workflowPackKey?: string | null): string {
    const lang = getPreferredLanguage();
    const scoped = getDepartmentForPack(
      db as any,
      workflowPackKey ?? readActiveOfficeWorkflowPackKey(db as any),
      deptId,
    );
    if (!scoped) return deptId;
    if (lang === "ko") return scoped.name_ko || scoped.name || deptId;
    if (lang === "ja") return scoped.name_ja || scoped.name || scoped.name_ko || deptId;
    if (lang === "zh") return scoped.name_zh || scoped.name || scoped.name_ko || deptId;
    return scoped.name || scoped.name_ko || deptId;
  }

  // Role enforcement: restrict agents to their department's domain
  function getDeptRoleConstraint(deptId: string, deptName: string): string {
    const constraints: Record<string, string> = {
      planning: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (Planning). Focus ONLY on planning, strategy, market analysis, requirements, and documentation. Do NOT write production code, create design assets, or run tests. If coding/design is needed, describe requirements and specifications instead.`,
      dev: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (Development). Focus ONLY on coding, debugging, code review, and technical implementation. Do NOT create design mockups, write business strategy documents, or perform QA testing.`,
      design: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (Design). Focus ONLY on UI/UX design, visual assets, design specs, and prototyping. Do NOT write production backend code, run tests, or make infrastructure changes.`,
      qa: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (QA/QC). Focus ONLY on testing, quality assurance, test automation, and bug reporting. Do NOT write production code or create design assets.`,
      devsecops: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (DevSecOps). Focus ONLY on infrastructure, security audits, CI/CD pipelines, container orchestration, and deployment. Do NOT write business logic or create design assets.`,
      operations: `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName} (Operations). Focus ONLY on operations, automation, monitoring, maintenance, and process optimization. Do NOT write production code or create design assets.`,
    };
    return (
      constraints[deptId] ||
      `IMPORTANT ROLE CONSTRAINT: You belong to ${deptName}. Focus on tasks within your department's expertise.`
    );
  }

  const {
    formatTaskSubtaskProgressSummary,
    hasOpenForeignSubtasks,
    processSubtaskDelegations,
    maybeNotifyAllSubtasksComplete,
  } = initializeSubtaskDelegation({
    db,
    l,
    pickL,
    resolveLang,
    getPreferredLanguage,
    getDeptName,
    getDeptRoleConstraint,
    getRecentConversationContext,
    getAgentDisplayName,
    buildTaskExecutionPrompt,
    hasExplicitWarningFixRequest,
    delegatedTaskToSubtask,
    subtaskDelegationCallbacks,
    subtaskDelegationDispatchInFlight,
    subtaskDelegationCompletionNoticeSent,
    notifyCeo,
    sendAgentMessage,
    appendTaskLog,
    finishReview,
    findTeamLeader: findCanonicalTeamLeader,
    findBestSubordinate: findCanonicalBestSubordinate,
    nowMs,
    broadcast,
    handleTaskRunComplete,
    stopRequestedTasks,
    stopRequestModeByTask,
    recordTaskCreationAudit,
    resolveProjectPath: resolveProjectPathBase,
    createWorktree,
    logsDir,
    ensureTaskExecutionSession,
    ensureClaudeMd,
    getProviderModelConfig,
    spawnCliAgent,
    getNextHttpAgentPid,
    launchApiProviderAgent,
    launchHttpAgent,
    startProgressTimer,
    startTaskExecutionForAgent,
    activeProcesses,
  });

  const collabCoordination = initializeCollabCoordination({
    ...__ctx,
    resolveLang,
    l,
    pickL,
    sendAgentMessage,
    findBestSubordinate: findCanonicalBestSubordinate,
    findTeamLeader: findCanonicalTeamLeader,
    getDeptName,
    getDeptRoleConstraint,
    maybeNotifyAllSubtasksComplete,
  });
  const {
    reconcileCrossDeptSubtasks,
    recoverCrossDeptQueueAfterMissingCallback,
    startCrossDeptCooperation,
    detectProjectPath,
    resolveProjectPath,
    getLatestKnownProjectPath,
    getDefaultProjectRoot,
    resolveDirectiveProjectPath,
    stripReportRequestPrefix,
    detectReportOutputFormat,
    pickPlanningReportAssignee,
    handleReportRequest,
  } = collabCoordination;

  const handleTaskDelegation = createTaskDelegationHandler({
    db,
    nowMs,
    resolveLang,
    getDeptName,
    getRoleLabel,
    detectTargetDepartments,
    findBestSubordinate: findCanonicalBestSubordinate,
    normalizeTextField,
    resolveProjectFromOptions,
    buildRoundGoal,
    resolveDirectiveProjectPath,
    recordTaskCreationAudit,
    appendTaskLog,
    broadcast,
    l,
    pickL,
    notifyCeo,
    isTaskWorkflowInterrupted,
    hasOpenForeignSubtasks,
    processSubtaskDelegations,
    startCrossDeptCooperation,
    seedApprovedPlanSubtasks,
    startPlannedApprovalMeeting,
    sendAgentMessage,
    registerTaskMessengerRoute,
    startTaskExecutionForAgent,
  });

  const { scheduleAgentReply, resetDirectChatState } = createDirectChatHandlers({
    db,
    logsDir,
    nowMs,
    randomDelay,
    broadcast,
    appendTaskLog,
    recordTaskCreationAudit,
    resolveLang,
    resolveProjectPath,
    detectProjectPath,
    normalizeTextField,
    resolveProjectFromOptions,
    buildRoundGoal,
    getDeptName,
    l,
    pickL,
    sendAgentMessage,
    registerTaskMessengerRoute,
    chooseSafeReply,
    buildCliFailureMessage,
    buildDirectReplyPrompt,
    runAgentOneShot,
    executeApiProviderAgent,
    executeCopilotAgent,
    executeAntigravityAgent,
    isTaskWorkflowInterrupted,
    startTaskExecutionForAgent,
    handleTaskDelegation,
  });

  return {
    DEPT_KEYWORDS,
    sendAgentMessage,
    getPreferredLanguage,
    resolveLang,
    detectLang,
    l,
    pickL,
    getRoleLabel,
    scheduleAnnouncementReplies,
    normalizeTextField,
    analyzeDirectivePolicy,
    shouldExecuteDirectiveDelegation,
    detectTargetDepartments,
    detectMentions,
    handleMentionDelegation,
    findTeamLeader: findCanonicalTeamLeader,
    getDeptName,
    getDeptRoleConstraint,
    formatTaskSubtaskProgressSummary,
    processSubtaskDelegations,
    reconcileCrossDeptSubtasks,
    recoverCrossDeptQueueAfterMissingCallback,
    resolveProjectPath,
    handleReportRequest,
    handleTaskDelegation,
    scheduleAgentReply,
    resetDirectChatState,
  };
}

