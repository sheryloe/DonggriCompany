import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export type NativeMemoryRow = {
  id: string;
  agent_id: string | null;
  project_id: string | null;
  memory_type: string;
  scope_type: string;
  title: string;
  body: string;
  display_summary_ko: string | null;
  tags_json: string;
  confidence: number;
  strength: number;
  source_type: string;
  source_id: string | null;
  external_ref: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
};

export type SkillUsageSummaryRow = {
  skill_id: string;
  use_count: number;
  success_count: number;
  latest_at: number;
  proficiency: number;
};

export type AgentGrowthEventRow = {
  id: string;
  agent_id: string;
  project_id: string | null;
  task_id: string | null;
  event_type: string;
  title: string;
  body: string;
  xp_delta: number;
  created_at: number;
};

export type MemoryCreateInput = {
  agentId?: string | null;
  projectId?: string | null;
  memoryType: string;
  scopeType: "agent" | "project" | "cross_project";
  title: string;
  body: string;
  displaySummaryKo?: string | null;
  tags?: string[] | null;
  confidence?: number | null;
  strength?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  externalRef?: string | null;
  status?: string | null;
  now?: number | null;
};

export type TaskMemoryExtractionInput = {
  task: {
    id: string;
    title: string;
    description?: string | null;
    assigned_agent_id?: string | null;
    department_id?: string | null;
    project_id?: string | null;
    project_path?: string | null;
    task_type?: string | null;
    workflow_pack_key?: string | null;
    workflow_meta_json?: string | null;
  };
  result?: string | null;
  provider?: string | null;
  now?: number | null;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function encodeTags(tags: string[] | null | undefined): string {
  const normalized = Array.isArray(tags)
    ? [...new Set(tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  return JSON.stringify(normalized);
}

function parseWorkflowMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function summarizeResult(result: string | null | undefined): string {
  const normalized = normalizeText(result);
  if (!normalized) return "No runtime result summary was captured.";
  const compact = normalized.replace(/\s+/g, " ");
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

function getExistingMemoryId(
  db: DatabaseSync,
  tableName: "agent_memories" | "project_memories",
  sourceType: string,
  sourceId: string | null | undefined,
  memoryType: string,
  externalRef?: string | null,
): string | null {
  if (!sourceId && !externalRef) return null;
  const row = db
    .prepare(
      `
      SELECT id
      FROM ${tableName}
      WHERE source_type = ?
        AND memory_type = ?
        AND COALESCE(source_id, '') = COALESCE(?, '')
        AND COALESCE(external_ref, '') = COALESCE(?, '')
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    )
    .get(sourceType, memoryType, sourceId ?? null, externalRef ?? null) as { id?: string } | undefined;
  return row?.id ?? null;
}

function upsertProjectMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const id =
    getExistingMemoryId(
      db,
      "project_memories",
      input.sourceType ?? "manual",
      input.sourceId,
      input.memoryType,
      input.externalRef,
    ) ?? randomUUID();
  const params: SQLInputValue[] = [
    id,
    input.projectId ?? null,
    input.agentId ?? null,
    normalizeText(input.memoryType) || "lesson",
    input.scopeType,
    normalizeText(input.title) || "Untitled memory",
    normalizeText(input.body) || "No memory body.",
    normalizeText(input.displaySummaryKo) || null,
    encodeTags(input.tags),
    clampNumber(input.confidence, 0.7, 0, 1),
    clampNumber(input.strength, 0.5, 0, 1),
    normalizeText(input.sourceType) || "manual",
    normalizeText(input.sourceId) || null,
    normalizeText(input.externalRef) || null,
    normalizeText(input.status) || "active",
    now,
    now,
  ];
  db.prepare(
    `
    INSERT INTO project_memories (
      id, project_id, agent_id, memory_type, scope_type, title, body, display_summary_ko,
      tags_json, confidence, strength, source_type, source_id, external_ref, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      agent_id = excluded.agent_id,
      title = excluded.title,
      body = excluded.body,
      display_summary_ko = excluded.display_summary_ko,
      tags_json = excluded.tags_json,
      confidence = excluded.confidence,
      strength = excluded.strength,
      status = excluded.status,
      updated_at = excluded.updated_at
  `,
  ).run(...params);
  return db.prepare("SELECT * FROM project_memories WHERE id = ?").get(id) as NativeMemoryRow;
}

function upsertAgentMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const id =
    getExistingMemoryId(
      db,
      "agent_memories",
      input.sourceType ?? "manual",
      input.sourceId,
      input.memoryType,
      input.externalRef,
    ) ?? randomUUID();
  const params: SQLInputValue[] = [
    id,
    input.agentId ?? null,
    input.projectId ?? null,
    normalizeText(input.memoryType) || "lesson",
    input.scopeType,
    normalizeText(input.title) || "Untitled memory",
    normalizeText(input.body) || "No memory body.",
    normalizeText(input.displaySummaryKo) || null,
    encodeTags(input.tags),
    clampNumber(input.confidence, 0.7, 0, 1),
    clampNumber(input.strength, 0.5, 0, 1),
    normalizeText(input.sourceType) || "manual",
    normalizeText(input.sourceId) || null,
    normalizeText(input.externalRef) || null,
    normalizeText(input.status) || "active",
    now,
    now,
  ];
  db.prepare(
    `
    INSERT INTO agent_memories (
      id, agent_id, project_id, memory_type, scope_type, title, body, display_summary_ko,
      tags_json, confidence, strength, source_type, source_id, external_ref, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      agent_id = excluded.agent_id,
      project_id = excluded.project_id,
      title = excluded.title,
      body = excluded.body,
      display_summary_ko = excluded.display_summary_ko,
      tags_json = excluded.tags_json,
      confidence = excluded.confidence,
      strength = excluded.strength,
      status = excluded.status,
      updated_at = excluded.updated_at
  `,
  ).run(...params);
  return db.prepare("SELECT * FROM agent_memories WHERE id = ?").get(id) as NativeMemoryRow;
}

export function createAgentMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  if (!input.agentId) throw new Error("agent_id_required");
  return upsertAgentMemory(db, { ...input, scopeType: input.scopeType || "agent" });
}

export function createProjectMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  if (!input.projectId) throw new Error("project_id_required");
  return upsertProjectMemory(db, { ...input, scopeType: input.scopeType || "project" });
}

export function listAgentMemories(db: DatabaseSync, agentId: string, limit = 80): NativeMemoryRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM agent_memories
      WHERE agent_id = ?
        AND status = 'active'
      ORDER BY strength DESC, updated_at DESC
      LIMIT ?
    `,
    )
    .all(agentId, Math.max(1, Math.min(200, Math.trunc(limit)))) as NativeMemoryRow[];
}

export function listProjectMemories(db: DatabaseSync, projectId: string, limit = 120): NativeMemoryRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM project_memories
      WHERE project_id = ?
        AND status = 'active'
      ORDER BY strength DESC, updated_at DESC
      LIMIT ?
    `,
    )
    .all(projectId, Math.max(1, Math.min(300, Math.trunc(limit)))) as NativeMemoryRow[];
}

export function listAgentGrowthEvents(db: DatabaseSync, agentId: string, limit = 30): AgentGrowthEventRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM agent_growth_events
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(agentId, Math.max(1, Math.min(100, Math.trunc(limit)))) as AgentGrowthEventRow[];
}

export function listSkillUsageSummary(
  db: DatabaseSync,
  filters: { agentId?: string | null; projectId?: string | null },
) {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.projectId) {
    clauses.push("project_id = ?");
    params.push(filters.projectId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `
      SELECT
        skill_id,
        COUNT(*) AS use_count,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count,
        MAX(created_at) AS latest_at,
        MIN(1.0, 0.2 + COUNT(*) * 0.08 + SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) * 0.04) AS proficiency
      FROM skill_usage_events
      ${where}
      GROUP BY skill_id
      ORDER BY proficiency DESC, use_count DESC, latest_at DESC
      LIMIT 100
    `,
    )
    .all(...params) as SkillUsageSummaryRow[];
}

export function recordSkillUsageEvent(
  db: DatabaseSync,
  input: {
    agentId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
    skillId: string;
    provider?: string | null;
    outcome?: string | null;
    confidence?: number | null;
    notes?: string | null;
    now?: number | null;
  },
): void {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    INSERT INTO skill_usage_events (
      id, agent_id, project_id, task_id, skill_id, provider, outcome, confidence, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    input.agentId ?? null,
    input.projectId ?? null,
    input.taskId ?? null,
    normalizeText(input.skillId) || "general",
    normalizeText(input.provider) || null,
    normalizeText(input.outcome) || "observed",
    clampNumber(input.confidence, 0.7, 0, 1),
    normalizeText(input.notes) || null,
    now,
  );
}

export function recordAgentGrowthEvent(
  db: DatabaseSync,
  input: {
    agentId: string;
    projectId?: string | null;
    taskId?: string | null;
    eventType: string;
    title: string;
    body: string;
    xpDelta?: number | null;
    now?: number | null;
  },
): void {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    INSERT INTO agent_growth_events (
      id, agent_id, project_id, task_id, event_type, title, body, xp_delta, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    input.agentId,
    input.projectId ?? null,
    input.taskId ?? null,
    normalizeText(input.eventType) || "task_completed",
    normalizeText(input.title) || "Growth event",
    normalizeText(input.body) || "No event body.",
    Math.trunc(Number(input.xpDelta ?? 0)) || 0,
    now,
  );
}

export function extractAndStoreTaskMemory(db: DatabaseSync, input: TaskMemoryExtractionInput): void {
  const task = input.task;
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const meta = parseWorkflowMeta(task.workflow_meta_json);
  const goalCommand = normalizeText(meta.goal_command);
  const workflowPack = normalizeText(task.workflow_pack_key) || "development";
  const taskType = normalizeText(task.task_type) || "general";
  const body = [
    `Task ID: ${task.id}`,
    `Task title: ${task.title}`,
    `Workflow pack: ${workflowPack}`,
    `Task type: ${taskType}`,
    goalCommand ? `Goal command: ${goalCommand}` : "",
    `Result summary: ${summarizeResult(input.result)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const tags = [...new Set([workflowPack, taskType, goalCommand].filter(Boolean))];

  if (task.project_id) {
    createProjectMemory(db, {
      projectId: task.project_id,
      agentId: task.assigned_agent_id,
      memoryType: "task_lesson",
      scopeType: "project",
      title: `Completed task: ${task.title}`,
      body,
      displaySummaryKo: `완료 경험: ${task.title}`,
      tags,
      confidence: 0.78,
      strength: 0.65,
      sourceType: "task_run",
      sourceId: task.id,
      now,
    });
  }

  if (task.assigned_agent_id) {
    createAgentMemory(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      memoryType: "project_experience",
      scopeType: "agent",
      title: `Project experience: ${task.title}`,
      body,
      displaySummaryKo: `작업 경험: ${task.title}`,
      tags,
      confidence: 0.78,
      strength: 0.6,
      sourceType: "task_run",
      sourceId: task.id,
      now,
    });
    recordAgentGrowthEvent(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      taskId: task.id,
      eventType: "task_completed",
      title: `Completed ${task.title}`,
      body: `The agent completed a ${taskType} task in workflow pack ${workflowPack}.`,
      xpDelta: 10,
      now,
    });
  }

  for (const skillId of tags.length > 0 ? tags : ["general"]) {
    recordSkillUsageEvent(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      taskId: task.id,
      skillId,
      provider: input.provider,
      outcome: "success",
      confidence: 0.75,
      notes: `Observed from completed task ${task.id}.`,
      now,
    });
  }
}

export function buildMemoryContextBlock(
  db: DatabaseSync,
  input: { agentId?: string | null; projectId?: string | null; limit?: number | null },
): string {
  const limit = Math.max(1, Math.min(20, Math.trunc(Number(input.limit ?? 8))));
  const parts: string[] = ["[Memory Context]", "source=donggri_native_memory"];
  if (input.projectId) {
    const memories = listProjectMemories(db, input.projectId, limit);
    if (memories.length > 0) {
      parts.push("Project memories:");
      for (const memory of memories.slice(0, limit)) {
        parts.push(`- (${memory.memory_type}) ${memory.title}: ${memory.body.slice(0, 240)}`);
      }
    }
  }
  if (input.agentId) {
    const memories = listAgentMemories(db, input.agentId, limit);
    if (memories.length > 0) {
      parts.push("Agent memories:");
      for (const memory of memories.slice(0, limit)) {
        parts.push(`- (${memory.memory_type}) ${memory.title}: ${memory.body.slice(0, 240)}`);
      }
    }
    const skills = listSkillUsageSummary(db, { agentId: input.agentId }).slice(0, 8);
    if (skills.length > 0) {
      parts.push("Recommended skills from usage history:");
      for (const skill of skills) {
        parts.push(`- ${skill.skill_id}: use_count=${skill.use_count}, proficiency=${skill.proficiency.toFixed(2)}`);
      }
    }
  }
  return parts.length > 2 ? parts.join("\n") : "";
}

export function buildAgentGuideMemorySnapshot(
  db: DatabaseSync,
  agentId: string,
): {
  memorySnapshot: string[];
  skillGrowthSnapshot: string[];
  recentLessons: string[];
  projectExperience: string[];
} {
  const memories = listAgentMemories(db, agentId, 12);
  const skills = listSkillUsageSummary(db, { agentId }).slice(0, 12);
  return {
    memorySnapshot: memories.slice(0, 6).map((memory) => `${memory.memory_type}: ${memory.title}`),
    skillGrowthSnapshot: skills.map(
      (skill) =>
        `${skill.skill_id}: use_count=${skill.use_count}, success=${skill.success_count}, proficiency=${skill.proficiency.toFixed(2)}`,
    ),
    recentLessons: memories
      .filter((memory) => memory.memory_type.includes("lesson"))
      .slice(0, 6)
      .map((memory) => `${memory.title}: ${memory.body.slice(0, 180)}`),
    projectExperience: memories
      .filter((memory) => memory.memory_type.includes("experience"))
      .slice(0, 6)
      .map((memory) => `${memory.title}: ${memory.body.slice(0, 180)}`),
  };
}
