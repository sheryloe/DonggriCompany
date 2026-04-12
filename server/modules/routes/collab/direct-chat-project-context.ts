import type { DatabaseSync } from "node:sqlite";

import type { DelegationOptions } from "./project-resolution.ts";
import type { ActiveProjectContext } from "./direct-chat-types.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

type ContextRow = {
  conversation_key: string;
  agent_id: string;
  project_id: string | null;
  project_path: string | null;
  project_context: string | null;
  updated_at: number;
};

type ProjectRow = {
  id: string;
  project_path: string | null;
  core_goal: string | null;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildDirectChatConversationKey(
  agentId: string,
  options: Pick<DelegationOptions, "messengerChannel" | "messengerSessionKey"> = {},
): string {
  const normalizedAgentId = normalizeText(agentId) ?? "";
  const sessionKey = normalizeText(options.messengerSessionKey);
  if (sessionKey && normalizedAgentId) {
    const [channelPart, ...sessionParts] = sessionKey.split(":");
    const sessionId = normalizeText(sessionParts.join(":"));
    const channel = normalizeText(options.messengerChannel) ?? normalizeText(channelPart);
    if (channel && sessionId) {
      return `${channel}:session:${sessionId}:agent:${normalizedAgentId}`;
    }
  }
  return `desktop:agent:${normalizedAgentId}`;
}

export function isPersistentDirectChatConversationKey(conversationKey: string): boolean {
  return !conversationKey.startsWith("desktop:");
}

function mapContextRow(row: ContextRow | undefined): ActiveProjectContext | null {
  if (!row) return null;
  return {
    conversationKey: row.conversation_key,
    agentId: row.agent_id,
    projectId: normalizeText(row.project_id),
    projectPath: normalizeText(row.project_path),
    projectContext: normalizeText(row.project_context),
    updatedAt: Number(row.updated_at) || 0,
  };
}

function hasProjectsTable(db: DbLike): boolean {
  try {
    const row = db
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'projects'
          LIMIT 1
        `,
      )
      .get() as { one?: number } | undefined;
    return Boolean(row);
  } catch {
    return false;
  }
}

function lookupProjectRow(db: DbLike, projectId: string): ProjectRow | null {
  try {
    const row = db
      .prepare(
        `
          SELECT id, project_path, core_goal
          FROM projects
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(projectId) as ProjectRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

function deleteContextRow(db: DbLike, conversationKey: string, agentId: string): void {
  db.prepare(
    `
      DELETE FROM conversation_project_contexts
      WHERE conversation_key = ?
        AND agent_id = ?
    `,
  ).run(conversationKey, agentId);
}

export function loadDirectChatProjectContext(
  db: DbLike,
  conversationKey: string,
  agentId: string,
): ActiveProjectContext | null {
  const normalizedConversationKey = normalizeText(conversationKey);
  const normalizedAgentId = normalizeText(agentId);
  if (!normalizedConversationKey || !normalizedAgentId) return null;
  const row = db
    .prepare(
      `
        SELECT conversation_key, agent_id, project_id, project_path, project_context, updated_at
        FROM conversation_project_contexts
        WHERE conversation_key = ?
          AND agent_id = ?
        LIMIT 1
      `,
    )
    .get(normalizedConversationKey, normalizedAgentId) as ContextRow | undefined;
  if (!row) return null;

  if (hasProjectsTable(db)) {
    const normalizedProjectId = normalizeText(row.project_id);
    const normalizedProjectPath = normalizeText(row.project_path);
    const normalizedProjectContext = normalizeText(row.project_context);
    if (!normalizedProjectId && (normalizedProjectPath || normalizedProjectContext)) {
      deleteContextRow(db, normalizedConversationKey, normalizedAgentId);
      return null;
    }
    if (normalizedProjectId) {
      const projectRow = lookupProjectRow(db, normalizedProjectId);
      if (!projectRow) {
        deleteContextRow(db, normalizedConversationKey, normalizedAgentId);
        return null;
      }
      return {
        conversationKey: row.conversation_key,
        agentId: row.agent_id,
        projectId: normalizedProjectId,
        projectPath: normalizeText(projectRow.project_path),
        projectContext: normalizeText(projectRow.core_goal),
        updatedAt: Number(row.updated_at) || 0,
      };
    }
  }

  return mapContextRow(row);
}

export function saveDirectChatProjectContext(db: DbLike, context: ActiveProjectContext): void {
  const conversationKey = normalizeText(context.conversationKey);
  const agentId = normalizeText(context.agentId);
  if (!conversationKey || !agentId) return;
  db.prepare(
    `
      INSERT INTO conversation_project_contexts (
        conversation_key,
        agent_id,
        project_id,
        project_path,
        project_context,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_key, agent_id) DO UPDATE SET
        project_id = excluded.project_id,
        project_path = excluded.project_path,
        project_context = excluded.project_context,
        updated_at = excluded.updated_at
    `,
  ).run(
    conversationKey,
    agentId,
    normalizeText(context.projectId),
    normalizeText(context.projectPath),
    normalizeText(context.projectContext),
    context.updatedAt,
  );
}

export function clearDirectChatProjectContext(db: DbLike, conversationKey: string, agentId: string): boolean {
  const normalizedConversationKey = normalizeText(conversationKey);
  const normalizedAgentId = normalizeText(agentId);
  if (!normalizedConversationKey || !normalizedAgentId) return false;
  const result = db
    .prepare(
      `
        DELETE FROM conversation_project_contexts
        WHERE conversation_key = ?
          AND agent_id = ?
      `,
    )
    .run(normalizedConversationKey, normalizedAgentId);
  return result.changes > 0;
}

export function clearAllDirectChatProjectContextsForAgent(db: DbLike, agentId: string): number {
  const normalizedAgentId = normalizeText(agentId);
  if (!normalizedAgentId) return 0;
  const result = db
    .prepare(
      `
        DELETE FROM conversation_project_contexts
        WHERE agent_id = ?
      `,
    )
    .run(normalizedAgentId);
  return Number(result.changes);
}
