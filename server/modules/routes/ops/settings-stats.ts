import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  decryptMessengerChannelsForClient,
  encryptMessengerChannelsForStorage,
} from "../../../messenger/token-crypto.ts";

const MESSENGER_SETTINGS_KEY = "messengerChannels";
const OFFICE_PACK_PROFILES_KEY = "officePackProfiles";
const OFFICE_PACK_HYDRATED_PACKS_KEY = "officePackHydratedPacks";
const PROVIDER_MODEL_CONFIG_KEY = "providerModelConfig";
const MESSENGER_ROUTING_WARNING = "messenger_single_group_enforced";
const MESSENGER_CHANNEL_KEYS = [
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

function normalizePackKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^["']|["']$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeMessengerChannelsForSingleGroup(raw: unknown): { value: unknown; warnings: string[] } {
  const root = asRecord(raw);
  if (!root) return { value: raw, warnings: [] };

  const telegramRaw = asRecord(root.telegram) ?? {};
  const telegramToken = typeof telegramRaw.token === "string" ? telegramRaw.token.trim() : "";
  const telegramSessionsRaw = Array.isArray(telegramRaw.sessions) ? telegramRaw.sessions : [];

  const normalizedTelegramSessions = telegramSessionsRaw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry, index) => {
      const targetId = typeof entry.targetId === "string" ? entry.targetId.trim() : "";
      if (!targetId) return null;
      const idRaw = typeof entry.id === "string" ? entry.id.trim() : "";
      const nameRaw = typeof entry.name === "string" ? entry.name.trim() : "";
      const tokenRaw = typeof entry.token === "string" ? entry.token.trim() : "";
      const enabled = entry.enabled !== false;
      const agentId = typeof entry.agentId === "string" ? entry.agentId.trim() : "";
      const workflowPackKey = typeof entry.workflowPackKey === "string" ? entry.workflowPackKey.trim() : "";
      const departmentIdRaw =
        typeof entry.departmentId === "string"
          ? entry.departmentId.trim()
          : typeof entry.department_id === "string"
            ? entry.department_id.trim()
            : "";
      return {
        id: idRaw || `telegram-${index + 1}`,
        name: nameRaw || `Telegram ${index + 1}`,
        targetId,
        enabled,
        token: tokenRaw,
        agentId,
        workflowPackKey,
        departmentId: departmentIdRaw,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const preferredSession =
    normalizedTelegramSessions.find((entry) => entry.id.toLowerCase() === "global") ??
    normalizedTelegramSessions.find((entry) => entry.enabled) ??
    normalizedTelegramSessions[0] ??
    null;

  const nonTelegramConfigured = MESSENGER_CHANNEL_KEYS.some((channel) => {
    if (channel === "telegram") return false;
    const config = asRecord(root[channel]);
    if (!config) return false;
    const token = typeof config.token === "string" ? config.token.trim() : "";
    const sessions = Array.isArray(config.sessions)
      ? config.sessions.filter((entry) => {
          const record = asRecord(entry);
          const targetId = record && typeof record.targetId === "string" ? record.targetId.trim() : "";
          return targetId.length > 0;
        })
      : [];
    return token.length > 0 || sessions.length > 0;
  });

  const hasScopedLegacyFields =
    normalizedTelegramSessions.length > 1 ||
    normalizedTelegramSessions.some(
      (entry) => entry.agentId.length > 0 || entry.workflowPackKey.length > 0 || entry.departmentId.length > 0,
    );

  const nextChannels: Record<string, unknown> = {};
  for (const channel of MESSENGER_CHANNEL_KEYS) {
    if (channel === "telegram") {
      const telegramSession = preferredSession
        ? {
            id: "global",
            name: "Global Telegram Group",
            targetId: preferredSession.targetId,
            enabled: preferredSession.enabled,
            ...(preferredSession.token ? { token: preferredSession.token } : {}),
          }
        : null;
      nextChannels.telegram = {
        token: telegramToken,
        sessions: telegramSession ? [telegramSession] : [],
        receiveEnabled: true,
      };
      continue;
    }
    nextChannels[channel] = {
      token: "",
      sessions: [],
      receiveEnabled: false,
    };
  }

  const warnings: string[] = [];
  if (nonTelegramConfigured || hasScopedLegacyFields) {
    warnings.push(MESSENGER_ROUTING_WARNING);
  }

  return { value: nextChannels, warnings };
}

export function registerOpsSettingsStatsRoutes(ctx: RuntimeContext): void {
  const { app, db } = ctx;

  app.get("/api/settings", (_req, res) => {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        settings[row.key] = row.key === MESSENGER_SETTINGS_KEY ? decryptMessengerChannelsForClient(parsed) : parsed;
      } catch {
        settings[row.key] = row.value;
      }
    }
    res.json({ settings });
  });

  app.put("/api/settings", (req, res) => {
    const body = req.body ?? {};
    const warnings: string[] = [];
    const readOnlyKeys = [OFFICE_PACK_PROFILES_KEY, OFFICE_PACK_HYDRATED_PACKS_KEY, PROVIDER_MODEL_CONFIG_KEY].filter(
      (key) =>
      Object.prototype.hasOwnProperty.call(body, key),
    );
    if (readOnlyKeys.length > 0) {
      return res.status(409).json({
        ok: false,
        error: "canonical_projection_read_only",
        blocked_keys: readOnlyKeys,
      });
    }

    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );

    try {
      for (const [key, value] of Object.entries(body)) {
        if (key === MESSENGER_SETTINGS_KEY) {
          const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
          const normalized = normalizeMessengerChannelsForSingleGroup(parsedValue);
          if (normalized.warnings.length > 0) {
            for (const warning of normalized.warnings) {
              if (!warnings.includes(warning)) warnings.push(warning);
            }
          }
          const encrypted = encryptMessengerChannelsForStorage(normalized.value);
          upsert.run(key, typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted));
          continue;
        }

        upsert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    } catch (err: any) {
      const detail = err?.message || String(err);
      return res.status(500).json({ ok: false, error: "settings_write_failed", detail });
    }

    res.json({ ok: true, warnings });
  });

  app.get("/api/stats", (_req, res) => {
    const totalTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number }).cnt;
    const doneTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'done'").get() as { cnt: number })
      .cnt;
    const inProgressTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'in_progress'").get() as { cnt: number }
    ).cnt;
    const inboxTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'inbox'").get() as { cnt: number })
      .cnt;
    const plannedTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'planned'").get() as {
        cnt: number;
      }
    ).cnt;
    const reviewTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'review'").get() as {
        cnt: number;
      }
    ).cnt;
    const cancelledTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'cancelled'").get() as {
        cnt: number;
      }
    ).cnt;
    const collaboratingTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'collaborating'").get() as {
        cnt: number;
      }
    ).cnt;

    const totalAgents = (db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number }).cnt;
    const workingAgents = (
      db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'working'").get() as {
        cnt: number;
      }
    ).cnt;
    const idleAgents = (
      db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'idle'").get() as {
        cnt: number;
      }
    ).cnt;

    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const topAgents = db
      .prepare("SELECT id, name, avatar_emoji, stats_tasks_done, stats_xp FROM agents ORDER BY stats_xp DESC LIMIT 5")
      .all();

    const activePackRow = db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack' LIMIT 1").get() as
      | { value?: unknown }
      | undefined;
    const activePack = normalizePackKey(activePackRow?.value) ?? "development";

    let tasksByDept: unknown[];
    if (activePack !== "development") {
      try {
        tasksByDept = db
          .prepare(
            `
        SELECT
          opd.department_id AS id,
          opd.name,
          opd.icon,
          opd.color,
          COUNT(t.id) AS total_tasks,
          SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
        FROM office_pack_departments opd
        LEFT JOIN tasks t
          ON t.department_id = opd.department_id
         AND COALESCE(t.workflow_pack_key, 'development') = ?
        WHERE opd.workflow_pack_key = ?
        GROUP BY opd.department_id
        ORDER BY opd.sort_order ASC, opd.department_id ASC
      `,
          )
          .all(activePack, activePack);
      } catch {
        tasksByDept = [];
      }
    } else {
      tasksByDept = [];
    }

    if (!Array.isArray(tasksByDept) || tasksByDept.length <= 0) {
      tasksByDept = db
        .prepare(
          `
      SELECT d.id, d.name, d.icon, d.color,
        COUNT(t.id) AS total_tasks,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
      FROM departments d
      LEFT JOIN tasks t
        ON t.department_id = d.id
       AND COALESCE(t.workflow_pack_key, 'development') = 'development'
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.id ASC
    `,
        )
        .all();
    }

    const recentActivity = db
      .prepare(
        `
    SELECT tl.*, t.title AS task_title
    FROM task_logs tl
    LEFT JOIN tasks t ON tl.task_id = t.id
    ORDER BY tl.created_at DESC
    LIMIT 20
  `,
      )
      .all();

    res.json({
      stats: {
        tasks: {
          total: totalTasks,
          done: doneTasks,
          in_progress: inProgressTasks,
          inbox: inboxTasks,
          planned: plannedTasks,
          collaborating: collaboratingTasks,
          review: reviewTasks,
          cancelled: cancelledTasks,
          completion_rate: completionRate,
        },
        agents: {
          total: totalAgents,
          working: workingAgents,
          idle: idleAgents,
        },
        top_agents: topAgents,
        tasks_by_department: tasksByDept,
        recent_activity: recentActivity,
      },
    });
  });
}
