import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  buildMemoryContextBlock,
  createAgentMemory,
  createProjectMemory,
  extractAndStoreTaskMemory,
  listAgentGrowthEvents,
  listAgentMemories,
  listProjectMemories,
  listSkillUsageSummary,
} from "../../memory/store.ts";
import { createBeadsIssue, getBeadsStatus, importBeadsProjectMemory } from "../../memory/beads-bridge.ts";

function readBooleanSetting(db: RuntimeContext["db"], key: string, fallback: boolean): boolean {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
    if (!row?.value) return fallback;
    const value = row.value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeBodyText(ctx: Pick<RuntimeContext, "normalizeTextField">, value: unknown): string | null {
  return ctx.normalizeTextField(value);
}

function ensureProjectExists(db: RuntimeContext["db"], projectId: string): boolean {
  return !!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
}

function ensureAgentExists(db: RuntimeContext["db"], agentId: string): boolean {
  return !!db.prepare("SELECT id FROM agents WHERE id = ?").get(agentId);
}

export function registerMemoryRoutes(ctx: Pick<RuntimeContext, "app" | "db" | "normalizeTextField" | "nowMs">): void {
  const { app, db, nowMs } = ctx;

  app.get("/api/agents/:id/memory", (req, res) => {
    const agentId = String(req.params.id ?? "").trim();
    if (!agentId || !ensureAgentExists(db, agentId)) return res.status(404).json({ error: "agent_not_found" });
    return res.json({
      ok: true,
      memories: listAgentMemories(db, agentId),
      skill_usage: listSkillUsageSummary(db, { agentId }),
      growth_events: listAgentGrowthEvents(db, agentId),
    });
  });

  app.post("/api/agents/:id/memory", (req, res) => {
    const agentId = String(req.params.id ?? "").trim();
    if (!agentId || !ensureAgentExists(db, agentId)) return res.status(404).json({ error: "agent_not_found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = normalizeBodyText(ctx, body.title);
    const memoryBody = normalizeBodyText(ctx, body.body);
    if (!title) return res.status(400).json({ error: "title_required" });
    if (!memoryBody) return res.status(400).json({ error: "body_required" });
    const memory = createAgentMemory(db, {
      agentId,
      projectId: normalizeBodyText(ctx, body.project_id),
      memoryType: normalizeBodyText(ctx, body.memory_type) ?? "manual_note",
      scopeType: "agent",
      title,
      body: memoryBody,
      displaySummaryKo: normalizeBodyText(ctx, body.display_summary_ko),
      tags: parseTags(body.tags ?? body.tags_json),
      confidence: Number(body.confidence ?? 0.7),
      strength: Number(body.strength ?? 0.5),
      sourceType: "manual",
      now: nowMs(),
    });
    return res.status(201).json({ ok: true, memory });
  });

  app.get("/api/projects/:id/memory", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!projectId || !ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const bridgeEnabled = readBooleanSetting(db, "beadsBridgeEnabled", true);
    return res.json({
      ok: true,
      memories: listProjectMemories(db, projectId),
      skill_usage: listSkillUsageSummary(db, { projectId }),
      beads_status: bridgeEnabled ? getBeadsStatus(db, projectId) : null,
      memory_context_preview: buildMemoryContextBlock(db, { projectId, limit: 6 }),
    });
  });

  app.post("/api/projects/:id/memory/reconcile", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!projectId || !ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const now = nowMs();
    const tasks = db
      .prepare(
        `
        SELECT id, title, description, assigned_agent_id, department_id, project_id, project_path, task_type,
               workflow_pack_key, workflow_meta_json, result
        FROM tasks
        WHERE project_id = ?
          AND status = 'done'
        ORDER BY COALESCE(completed_at, updated_at, created_at) DESC
        LIMIT 30
      `,
      )
      .all(projectId) as Array<Record<string, unknown> & { id: string; title: string }>;
    for (const task of tasks) {
      extractAndStoreTaskMemory(db, {
        task: {
          id: String(task.id),
          title: String(task.title),
          description: task.description as string | null,
          assigned_agent_id: task.assigned_agent_id as string | null,
          department_id: task.department_id as string | null,
          project_id: task.project_id as string | null,
          project_path: task.project_path as string | null,
          task_type: task.task_type as string | null,
          workflow_pack_key: task.workflow_pack_key as string | null,
          workflow_meta_json: task.workflow_meta_json as string | null,
        },
        result: task.result as string | null,
        now,
      });
    }
    const beads =
      readBooleanSetting(db, "beadsBridgeEnabled", true) && req.body?.include_beads !== false
        ? importBeadsProjectMemory(db, { projectId, now })
        : null;
    return res.json({
      ok: true,
      reconciled_tasks: tasks.length,
      beads_import: beads,
      memories: listProjectMemories(db, projectId),
    });
  });

  app.get("/api/memory/beads/status", (req, res) => {
    const projectId = typeof req.query.project_id === "string" ? req.query.project_id.trim() : "";
    if (!projectId) return res.status(400).json({ error: "project_id_required" });
    if (!ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    return res.json({ ok: true, status: getBeadsStatus(db, projectId) });
  });

  app.get("/api/skills/usage-summary", (_req, res) => {
    return res.json({ ok: true, skill_usage: listSkillUsageSummary(db, {}) });
  });

  app.post("/api/memory/beads/import", (req, res) => {
    const projectId = normalizeBodyText(ctx, req.body?.project_id);
    if (!projectId) return res.status(400).json({ error: "project_id_required" });
    if (!ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    if (!readBooleanSetting(db, "beadsBridgeEnabled", true)) {
      return res.status(403).json({ error: "beads_bridge_disabled" });
    }
    return res.json({ ok: true, ...importBeadsProjectMemory(db, { projectId, now: nowMs() }) });
  });

  app.post("/api/memory/beads/export", (req, res) => {
    const projectId = normalizeBodyText(ctx, req.body?.project_id);
    const title = normalizeBodyText(ctx, req.body?.title);
    const body = normalizeBodyText(ctx, req.body?.body);
    if (!projectId) return res.status(400).json({ error: "project_id_required" });
    if (!title) return res.status(400).json({ error: "title_required" });
    if (!ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    if (!readBooleanSetting(db, "beadsWriteEnabled", false)) {
      return res.status(403).json({ error: "beads_write_disabled" });
    }
    const result = createBeadsIssue(db, { projectId, title, body });
    if (!result.ok) return res.status(409).json(result);
    return res.json({ ok: true, output: result.output });
  });

  app.post("/api/projects/:id/memory", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!projectId || !ensureProjectExists(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = normalizeBodyText(ctx, body.title);
    const memoryBody = normalizeBodyText(ctx, body.body);
    if (!title) return res.status(400).json({ error: "title_required" });
    if (!memoryBody) return res.status(400).json({ error: "body_required" });
    const memory = createProjectMemory(db, {
      projectId,
      agentId: normalizeBodyText(ctx, body.agent_id),
      memoryType: normalizeBodyText(ctx, body.memory_type) ?? "manual_note",
      scopeType: "project",
      title,
      body: memoryBody,
      displaySummaryKo: normalizeBodyText(ctx, body.display_summary_ko),
      tags: parseTags(body.tags ?? body.tags_json),
      confidence: Number(body.confidence ?? 0.7),
      strength: Number(body.strength ?? 0.5),
      sourceType: "manual",
      now: nowMs(),
    });
    return res.status(201).json({ ok: true, memory });
  });
}
