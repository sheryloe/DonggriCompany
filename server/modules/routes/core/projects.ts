import type { Express } from "express";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAssignedAgentIdsByProjectIds } from "../shared/project-assignments.ts";
import { serializeProjectStaffingPolicy } from "../shared/project-staffing-policy.ts";
import { createProjectRouteHelpers } from "./projects/helpers.ts";
import { DEFAULT_WORKFLOW_PACK_KEY, isWorkflowPackKey } from "../../workflow/packs/definitions.ts";
import { getCanonicalSnapshot } from "../../company/canonical-policy.ts";
import {
  applyProjectArtifactPatch,
  ensureProjectArtifacts,
  inspectProjectArtifacts,
  syncProjectArtifactProjection,
} from "../../company/project-artifacts.ts";
import { isValidGitHubRepoFullName, normalizeGitHubRepoFullName } from "./github-validation.ts";

type FirstQueryValue = (value: unknown) => string | undefined;
type NormalizeTextField = (value: unknown) => string | null;
type RunInTransaction = (fn: () => void) => void;

interface RegisterProjectRoutesOptions {
  app: Express;
  db: DatabaseSync;
  firstQueryValue: FirstQueryValue;
  normalizeTextField: NormalizeTextField;
  runInTransaction: RunInTransaction;
  nowMs: () => number;
  activeProcesses?: Map<string, unknown>;
}

export function registerProjectRoutes({
  app,
  db,
  firstQueryValue,
  normalizeTextField,
  runInTransaction,
  nowMs,
  activeProcesses,
}: RegisterProjectRoutesOptions): void {
  const {
    PROJECT_PATH_ALLOWED_ROOTS,
    normalizeProjectPathInput,
    pathInsideRoot,
    isPathInsideAllowedRoots,
    getContainingAllowedRoot,
    findConflictingProjectByPath,
    inspectDirectoryPath,
    ensureDirectoryPathExists,
    collectProjectPathSuggestions,
    resolveInitialBrowsePath,
    pickNativeDirectoryPath,
    validateProjectAgentIds,
  } = createProjectRouteHelpers({ db, normalizeTextField });

  const tableExists = (tableName: string): boolean =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
  const runIfTableExists = (tableName: string, sql: string, ...params: SQLInputValue[]): void => {
    if (!tableExists(tableName)) return;
    db.prepare(sql).run(...params);
  };

  type ProjectHealthTaskRow = {
    id: string;
    title: string;
    status: string;
    task_type: string | null;
    priority: number | null;
    department_id: string | null;
    department_name: string | null;
    department_name_ko: string | null;
    assigned_agent_id: string | null;
    assigned_agent_name: string | null;
    assigned_agent_name_ko: string | null;
    source_task_id: string | null;
    result: string | null;
    latest_log: string | null;
    created_at: number | null;
    updated_at: number | null;
  };

  const trimExcerpt = (value: unknown, max = 240): string | null => {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
  };

  const serializeHealthTask = (
    row: ProjectHealthTaskRow,
    evidenceReason: string,
  ): Record<string, unknown> => ({
    id: row.id,
    title: row.title,
    status: row.status,
    task_type: row.task_type ?? "general",
    priority: Number(row.priority ?? 0),
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? "",
    department_name_ko: row.department_name_ko ?? "",
    assigned_agent_id: row.assigned_agent_id ?? null,
    assigned_agent_name: row.assigned_agent_name ?? "",
    assigned_agent_name_ko: row.assigned_agent_name_ko ?? "",
    source_task_id: row.source_task_id ?? null,
    latest_log: trimExcerpt(row.latest_log),
    result_excerpt: trimExcerpt(row.result),
    evidence_reason: evidenceReason,
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? row.created_at ?? 0),
  });

  const isActiveTaskProcess = (taskId: string): boolean => Boolean(activeProcesses?.has(taskId));

  const getProjectHealthTaskRows = (projectId: string): ProjectHealthTaskRow[] =>
    db
      .prepare(
        `
    SELECT
      t.id,
      t.title,
      t.status,
      t.task_type,
      t.priority,
      t.department_id,
      COALESCE(d.name, '') AS department_name,
      COALESCE(d.name_ko, '') AS department_name_ko,
      t.assigned_agent_id,
      COALESCE(a.name, '') AS assigned_agent_name,
      COALESCE(a.name_ko, '') AS assigned_agent_name_ko,
      t.source_task_id,
      t.result,
      (
        SELECT tl.message
        FROM task_logs tl
        WHERE tl.task_id = t.id
        ORDER BY tl.created_at DESC, tl.id DESC
        LIMIT 1
      ) AS latest_log,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    WHERE t.project_id = ?
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.created_at DESC
    LIMIT 500
  `,
      )
      .all(projectId) as ProjectHealthTaskRow[];

  const hasQaHoldEvidenceGap = (row: ProjectHealthTaskRow): boolean => {
    const haystack = `${row.title}\n${row.result ?? ""}\n${row.latest_log ?? ""}`;
    return /qa\s*hold|go\/no-go\s*hold|hold\b|보류|empty state|error state|430px|screenshot missing|evidence missing|증거 부족/i.test(
      haystack,
    );
  };

  const isOrphanCandidate = (row: ProjectHealthTaskRow): boolean => {
    const hasSourceTask = typeof row.source_task_id === "string" && row.source_task_id.trim().length > 0;
    if (row.status === "in_progress" && !isActiveTaskProcess(row.id)) return true;
    if (row.status === "inbox" && hasSourceTask && row.assigned_agent_id) return true;
    return false;
  };

  const getBlockerReason = (row: ProjectHealthTaskRow): string | null => {
    if (isOrphanCandidate(row)) return "orphan_candidate";
    if (hasQaHoldEvidenceGap(row)) return "qa_hold_evidence";
    if (row.status === "review") return "review_waiting";
    if (row.status === "pending") return "paused_or_pending";
    if (row.status === "blocked") return "blocked";
    return null;
  };

  app.get("/api/projects", (req, res) => {
    const page = Math.max(Number(firstQueryValue(req.query.page)) || 1, 1);
    const pageSizeRaw = Number(firstQueryValue(req.query.page_size)) || 10;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 50);
    const search = normalizeTextField(firstQueryValue(req.query.search));

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (search) {
      conditions.push("(p.name LIKE ? OR p.project_path LIKE ? OR p.core_goal LIKE ?)");
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const totalRow = db
      .prepare(
        `
    SELECT COUNT(*) AS cnt
    FROM projects p
    ${where}
  `,
      )
      .get(...(params as SQLInputValue[])) as { cnt: number };
    const total = Number(totalRow?.cnt ?? 0) || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    const offset = (page - 1) * pageSize;

    const rows = db
      .prepare(
        `
    SELECT p.*,
           (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
    FROM projects p
    ${where}
    ORDER BY COALESCE(p.last_used_at, p.updated_at) DESC, p.updated_at DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `,
      )
      .all(...([...(params as SQLInputValue[]), pageSize, offset] as SQLInputValue[]));

    const projectRows = rows as Array<Record<string, unknown> & { id: string }>;
    const assignedByProject = getAssignedAgentIdsByProjectIds(
      db,
      projectRows.map((row) => row.id),
    );
    const projects = projectRows.map((row) => ({
      ...row,
      assigned_agent_ids: assignedByProject.get(row.id) ?? [],
    }));

    res.json({
      projects,
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    });
  });

  app.get("/api/projects/path-check", (req, res) => {
    const raw = firstQueryValue(req.query.path);
    const normalized = normalizeProjectPathInput(raw);
    if (!normalized) return res.status(400).json({ error: "project_path_required" });
    if (!isPathInsideAllowedRoots(normalized)) {
      return res.status(403).json({
        error: "project_path_outside_allowed_roots",
        allowed_roots: PROJECT_PATH_ALLOWED_ROOTS,
      });
    }

    const inspected = inspectDirectoryPath(normalized);
    res.json({
      ok: true,
      normalized_path: normalized,
      exists: inspected.exists,
      is_directory: inspected.isDirectory,
      can_create: inspected.canCreate,
      nearest_existing_parent: inspected.nearestExistingParent,
    });
  });

  app.get("/api/projects/path-suggestions", (req, res) => {
    const q = normalizeTextField(firstQueryValue(req.query.q)) ?? "";
    const parsedLimit = Number(firstQueryValue(req.query.limit) ?? "30");
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(50, Math.trunc(parsedLimit))) : 30;
    const paths = collectProjectPathSuggestions(q, limit);
    res.json({ ok: true, paths });
  });

  app.post("/api/projects/path-native-picker", async (_req, res) => {
    try {
      const picked = await pickNativeDirectoryPath();
      if (picked.cancelled) return res.json({ ok: false, cancelled: true });
      if (!picked.path) return res.status(400).json({ error: "native_picker_unavailable" });

      const normalized = normalizeProjectPathInput(picked.path);
      if (!normalized) return res.status(400).json({ error: "project_path_required" });
      if (!isPathInsideAllowedRoots(normalized)) {
        return res.status(403).json({
          error: "project_path_outside_allowed_roots",
          allowed_roots: PROJECT_PATH_ALLOWED_ROOTS,
        });
      }
      try {
        if (!fs.statSync(normalized).isDirectory()) {
          return res.status(400).json({ error: "project_path_not_directory" });
        }
      } catch {
        return res.status(400).json({ error: "project_path_not_found" });
      }

      return res.json({ ok: true, path: normalized, source: picked.source });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "native_picker_failed", reason: message });
    }
  });

  app.get("/api/projects/path-browse", (req, res) => {
    const raw = firstQueryValue(req.query.path);
    const currentPath = resolveInitialBrowsePath(raw ?? null);
    if (!isPathInsideAllowedRoots(currentPath)) {
      return res.status(403).json({
        error: "project_path_outside_allowed_roots",
        allowed_roots: PROJECT_PATH_ALLOWED_ROOTS,
      });
    }

    let entries: Array<{ name: string; path: string }> = [];
    try {
      const dirents = fs.readdirSync(currentPath, { withFileTypes: true });
      entries = dirents
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          name: entry.name,
          path: path.join(currentPath, entry.name),
        }));
    } catch {
      entries = [];
    }

    const MAX_ENTRIES = 300;
    const truncated = entries.length > MAX_ENTRIES;
    const containingRoot = getContainingAllowedRoot(currentPath);
    const candidateParent = path.dirname(currentPath);
    const parent =
      candidateParent !== currentPath && (!containingRoot || pathInsideRoot(candidateParent, containingRoot))
        ? candidateParent
        : null;
    res.json({
      ok: true,
      current_path: currentPath,
      parent_path: parent !== currentPath ? parent : null,
      entries: entries.slice(0, MAX_ENTRIES),
      truncated,
    });
  });

  app.post("/api/projects", (req, res) => {
    const body = req.body ?? {};
    const name = normalizeTextField(body.name);
    const projectPath = normalizeProjectPathInput(body.project_path);
    const coreGoal = normalizeTextField(body.core_goal);
    const createPathIfMissing = body.create_path_if_missing !== false;
    if (!name) return res.status(400).json({ error: "name_required" });
    if (!projectPath) return res.status(400).json({ error: "project_path_required" });
    if (!coreGoal) return res.status(400).json({ error: "core_goal_required" });
    if (!isPathInsideAllowedRoots(projectPath)) {
      return res.status(403).json({
        error: "project_path_outside_allowed_roots",
        allowed_roots: PROJECT_PATH_ALLOWED_ROOTS,
      });
    }
    const conflictingProject = findConflictingProjectByPath(projectPath);
    if (conflictingProject) {
      return res.status(409).json({
        error: "project_path_conflict",
        existing_project_id: conflictingProject.id,
        existing_project_name: conflictingProject.name,
        existing_project_path: conflictingProject.project_path,
      });
    }
    const inspected = inspectDirectoryPath(projectPath);
    if (inspected.exists && !inspected.isDirectory) {
      return res.status(400).json({ error: "project_path_not_directory" });
    }
    if (!inspected.exists) {
      if (!createPathIfMissing) {
        return res.status(409).json({
          error: "project_path_not_found",
          normalized_path: projectPath,
          can_create: inspected.canCreate,
          nearest_existing_parent: inspected.nearestExistingParent,
        });
      }
      const ensureDir = ensureDirectoryPathExists(projectPath);
      if (!ensureDir.ok) {
        return res.status(400).json({ error: "project_path_unavailable", reason: ensureDir.reason });
      }
    }

    const githubRepo = normalizeGitHubRepoFullName(body.github_repo);
    if (githubRepo && !isValidGitHubRepoFullName(githubRepo)) {
      return res.status(400).json({ error: "invalid_github_repo" });
    }
    const assignmentMode = body.assignment_mode === "manual" ? "manual" : "auto";
    const staffingPolicyJson = serializeProjectStaffingPolicy((body as Record<string, unknown>).staffing_policy_json);
    const requestedDefaultPackKey = normalizeTextField(body.default_pack_key);
    if (requestedDefaultPackKey && !isWorkflowPackKey(requestedDefaultPackKey)) {
      return res.status(400).json({ error: "invalid_default_pack_key" });
    }
    const defaultPackKey = requestedDefaultPackKey ?? DEFAULT_WORKFLOW_PACK_KEY;
    const validatedAgentIds = validateProjectAgentIds((body as Record<string, unknown>).agent_ids);
    if ("error" in validatedAgentIds) {
      return res.status(400).json({
        error: validatedAgentIds.error.code,
        invalid_ids: validatedAgentIds.error.invalidIds ?? [],
      });
    }
    const agentIds = validatedAgentIds.agentIds;
    let artifactState;
    try {
      artifactState = ensureProjectArtifacts({
        projectPath,
        projectName: name,
        coreGoal,
        packProfile: defaultPackKey,
        snapshotHash: getCanonicalSnapshot().policy.hash,
        policyVersion: getCanonicalSnapshot().policy.version,
      });
    } catch (error) {
      return res.status(500).json({
        error: "project_artifact_bootstrap_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const id = randomUUID();
    const t = nowMs();
    runInTransaction(() => {
      db.prepare(
        `
      INSERT INTO projects (
        id, name, project_path, core_goal, default_pack_key, assignment_mode, staffing_policy_json, last_used_at, created_at, updated_at, github_repo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(id, name, projectPath, coreGoal, defaultPackKey, assignmentMode, staffingPolicyJson, t, t, t, githubRepo);

      if (assignmentMode === "manual" && agentIds.length > 0) {
        const insertPA = db.prepare("INSERT INTO project_agents (project_id, agent_id, created_at) VALUES (?, ?, ?)");
        for (const agentId of agentIds) {
          insertPA.run(id, agentId, t);
        }
      }
    });

    if (artifactState) {
      syncProjectArtifactProjection(db, { ...artifactState, projectId: id }, id);
    }

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    const assignedAgentIds = (
      db.prepare("SELECT agent_id FROM project_agents WHERE project_id = ?").all(id) as Array<{ agent_id: string }>
    ).map((row) => row.agent_id);
    res.json({ ok: true, project: { ...project, assigned_agent_ids: assignedAgentIds } });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
      | {
          id: string;
          name: string;
          project_path: string;
          core_goal: string;
          default_pack_key?: string | null;
        }
      | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const body = req.body ?? {};
    const updates: string[] = ["updated_at = ?"];
    const params: unknown[] = [nowMs()];
    const createPathIfMissing = body.create_path_if_missing !== false;

    if ("name" in body) {
      const value = normalizeTextField(body.name);
      if (!value) return res.status(400).json({ error: "name_required" });
      updates.push("name = ?");
      params.push(value);
    }
    if ("project_path" in body) {
      const value = normalizeProjectPathInput(body.project_path);
      if (!value) return res.status(400).json({ error: "project_path_required" });
      if (!isPathInsideAllowedRoots(value)) {
        return res.status(403).json({
          error: "project_path_outside_allowed_roots",
          allowed_roots: PROJECT_PATH_ALLOWED_ROOTS,
        });
      }
      const conflictingProject = findConflictingProjectByPath(value, id);
      if (conflictingProject) {
        return res.status(409).json({
          error: "project_path_conflict",
          existing_project_id: conflictingProject.id,
          existing_project_name: conflictingProject.name,
          existing_project_path: conflictingProject.project_path,
        });
      }
      const inspected = inspectDirectoryPath(value);
      if (inspected.exists && !inspected.isDirectory) {
        return res.status(400).json({ error: "project_path_not_directory" });
      }
      if (!inspected.exists) {
        if (!createPathIfMissing) {
          return res.status(409).json({
            error: "project_path_not_found",
            normalized_path: value,
            can_create: inspected.canCreate,
            nearest_existing_parent: inspected.nearestExistingParent,
          });
        }
        const ensureDir = ensureDirectoryPathExists(value);
        if (!ensureDir.ok) {
          return res.status(400).json({ error: "project_path_unavailable", reason: ensureDir.reason });
        }
      }
      updates.push("project_path = ?");
      params.push(value);
    }
    if ("core_goal" in body) {
      const value = normalizeTextField(body.core_goal);
      if (!value) return res.status(400).json({ error: "core_goal_required" });
      updates.push("core_goal = ?");
      params.push(value);
    }
    if ("github_repo" in body) {
      const value = normalizeGitHubRepoFullName(body.github_repo);
      if (value && !isValidGitHubRepoFullName(value)) {
        return res.status(400).json({ error: "invalid_github_repo" });
      }
      updates.push("github_repo = ?");
      params.push(value);
    }
    if ("assignment_mode" in body) {
      const value = body.assignment_mode === "manual" ? "manual" : "auto";
      updates.push("assignment_mode = ?");
      params.push(value);
    }
    if ("staffing_policy_json" in body) {
      updates.push("staffing_policy_json = ?");
      params.push(serializeProjectStaffingPolicy((body as Record<string, unknown>).staffing_policy_json));
    }
    if ("default_pack_key" in body) {
      const value = normalizeTextField(body.default_pack_key);
      if (!value || !isWorkflowPackKey(value)) {
        return res.status(400).json({ error: "invalid_default_pack_key" });
      }
      updates.push("default_pack_key = ?");
      params.push(value);
    }

    const hasAgentIdsUpdate = "agent_ids" in body;
    let agentIds: string[] = [];
    if (hasAgentIdsUpdate) {
      const validatedAgentIds = validateProjectAgentIds((body as Record<string, unknown>).agent_ids);
      if ("error" in validatedAgentIds) {
        return res.status(400).json({
          error: validatedAgentIds.error.code,
          invalid_ids: validatedAgentIds.error.invalidIds ?? [],
        });
      }
      agentIds = validatedAgentIds.agentIds;
    }

    if (updates.length <= 1 && !hasAgentIdsUpdate) {
      return res.status(400).json({ error: "no_fields" });
    }

    if (updates.length > 1) {
      const nextProjectName = ("name" in body ? normalizeTextField(body.name) : existing.name) ?? existing.name;
      const nextProjectPath =
        ("project_path" in body ? normalizeProjectPathInput(body.project_path) : existing.project_path) ??
        existing.project_path;
      const nextCoreGoal =
        ("core_goal" in body ? normalizeTextField(body.core_goal) : existing.core_goal) ?? existing.core_goal;
      const nextPackKey =
        ("default_pack_key" in body
          ? normalizeTextField(body.default_pack_key)
          : normalizeTextField(existing.default_pack_key)) ?? DEFAULT_WORKFLOW_PACK_KEY;
      try {
        const artifactState = ensureProjectArtifacts({
          projectPath: nextProjectPath,
          projectName: nextProjectName,
          coreGoal: nextCoreGoal,
          packProfile: nextPackKey,
          snapshotHash: getCanonicalSnapshot().policy.hash,
          policyVersion: getCanonicalSnapshot().policy.version,
        });
        syncProjectArtifactProjection(db, { ...artifactState, projectId: id }, id);
      } catch (error) {
        return res.status(500).json({
          error: "project_artifact_bootstrap_failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    runInTransaction(() => {
      if (updates.length > 1) {
        params.push(id);
        db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
      }
      if (hasAgentIdsUpdate) {
        db.prepare("DELETE FROM project_agents WHERE project_id = ?").run(id);
        if (agentIds.length > 0) {
          const insertPA = db.prepare("INSERT INTO project_agents (project_id, agent_id, created_at) VALUES (?, ?, ?)");
          const t = nowMs();
          for (const agentId of agentIds) {
            insertPA.run(id, agentId, t);
          }
        }
      }
    });

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    const assignedAgentIds = (
      db.prepare("SELECT agent_id FROM project_agents WHERE project_id = ?").all(id) as Array<{ agent_id: string }>
    ).map((row) => row.agent_id);
    res.json({ ok: true, project: { ...project, assigned_agent_ids: assignedAgentIds } });
  });

  app.delete("/api/projects/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    runInTransaction(() => {
      runIfTableExists("project_component_events", "DELETE FROM project_component_events WHERE project_id = ?", id);
      runIfTableExists("project_module_apply_runs", "DELETE FROM project_module_apply_runs WHERE project_id = ?", id);
      runIfTableExists("project_module_bindings", "DELETE FROM project_module_bindings WHERE project_id = ?", id);
      runIfTableExists("asset_jobs", "UPDATE asset_jobs SET project_id = NULL WHERE project_id = ?", id);
      runIfTableExists(
        "project_review_decision_events",
        "DELETE FROM project_review_decision_events WHERE project_id = ?",
        id,
      );
      runIfTableExists(
        "project_review_decision_states",
        "DELETE FROM project_review_decision_states WHERE project_id = ?",
        id,
      );
      runIfTableExists("project_agents", "DELETE FROM project_agents WHERE project_id = ?", id);
      runIfTableExists("project_memories", "DELETE FROM project_memories WHERE project_id = ?", id);
      runIfTableExists("memory_entity_relations", "DELETE FROM memory_entity_relations WHERE project_id = ?", id);
      runIfTableExists("memory_entities", "DELETE FROM memory_entities WHERE project_id = ?", id);
      runIfTableExists("memory_outbox", "DELETE FROM memory_outbox WHERE project_id = ?", id);
      runIfTableExists(
        "memory_quality_events",
        "UPDATE memory_quality_events SET project_id = NULL WHERE project_id = ?",
        id,
      );
      runIfTableExists("agent_memories", "UPDATE agent_memories SET project_id = NULL WHERE project_id = ?", id);
      runIfTableExists(
        "skill_usage_events",
        "UPDATE skill_usage_events SET project_id = NULL WHERE project_id = ?",
        id,
      );
      runIfTableExists(
        "agent_growth_events",
        "UPDATE agent_growth_events SET project_id = NULL WHERE project_id = ?",
        id,
      );
      runIfTableExists("messages", "UPDATE messages SET project_id = NULL WHERE project_id = ?", id);
      runIfTableExists(
        "conversation_project_contexts",
        "UPDATE conversation_project_contexts SET project_id = NULL WHERE project_id = ?",
        id,
      );
      runIfTableExists(
        "gmail_intake_messages",
        "UPDATE gmail_intake_messages SET project_id = NULL WHERE project_id = ?",
        id,
      );
      runIfTableExists(
        "calendar_intake_events",
        "UPDATE calendar_intake_events SET project_id = NULL WHERE project_id = ?",
        id,
      );
      db.prepare("UPDATE tasks SET project_id = NULL WHERE project_id = ?").run(id);
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    });
    res.json({ ok: true });
  });

  app.get("/api/projects/:id", (req, res) => {
    const id = String(req.params.id);
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ error: "not_found" });

    const tasks = db
      .prepare(
        `
    SELECT t.id, t.title, t.status, t.task_type, t.priority, t.created_at, t.updated_at, t.completed_at,
           t.source_task_id,
           t.assigned_agent_id,
           COALESCE(a.name, '') AS assigned_agent_name,
           COALESCE(a.name_ko, '') AS assigned_agent_name_ko
    FROM tasks t
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
    LIMIT 300
  `,
      )
      .all(id);

    const reports = db
      .prepare(
        `
    SELECT t.id, t.title, t.completed_at, t.created_at, t.assigned_agent_id,
           COALESCE(a.name, '') AS agent_name,
           COALESCE(a.name_ko, '') AS agent_name_ko,
           COALESCE(d.name, '') AS dept_name,
           COALESCE(d.name_ko, '') AS dept_name_ko
    FROM tasks t
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.project_id = ?
      AND t.status = 'done'
      AND (t.source_task_id IS NULL OR TRIM(t.source_task_id) = '')
    ORDER BY t.completed_at DESC, t.created_at DESC
    LIMIT 200
  `,
      )
      .all(id);

    const decisionEvents = db
      .prepare(
        `
    SELECT
      id,
      snapshot_hash,
      event_type,
      summary,
      selected_options_json,
      note,
      task_id,
      meeting_id,
      created_at
    FROM project_review_decision_events
    WHERE project_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 300
  `,
      )
      .all(id);

    const assignedAgents = db
      .prepare(
        `
    SELECT a.* FROM agents a
    INNER JOIN project_agents pa ON pa.agent_id = a.id
    WHERE pa.project_id = ?
    ORDER BY a.department_id, a.role, a.name
  `,
      )
      .all(id);
    const assignedAgentIds = assignedAgents.map((agent: any) => agent.id);

    res.json({
      project: { ...project, assigned_agent_ids: assignedAgentIds },
      assigned_agents: assignedAgents,
      tasks,
      reports,
      decision_events: decisionEvents,
    });
  });

  app.get("/api/projects/:id/health", (req, res) => {
    const id = String(req.params.id);
    const project = db
      .prepare("SELECT id, name, project_path, core_goal FROM projects WHERE id = ?")
      .get(id) as
      | {
          id: string;
          name: string;
          project_path: string;
          core_goal: string;
        }
      | undefined;
    if (!project) return res.status(404).json({ error: "not_found" });

    const rows = getProjectHealthTaskRows(id);
    const statusCounts: Record<string, number> = {};
    const departmentCounts: Record<string, number> = {};
    let doneTasks = 0;
    let cancelledTasks = 0;
    let openTasks = 0;
    let reviewWaiting = 0;
    let activeRunning = 0;
    let qaHoldItems = 0;

    const orphanRows: ProjectHealthTaskRow[] = [];
    const blockerRows: Array<{ row: ProjectHealthTaskRow; reason: string }> = [];

    for (const row of rows) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      const departmentKey = row.department_id?.trim() || "unassigned";
      departmentCounts[departmentKey] = (departmentCounts[departmentKey] ?? 0) + 1;
      if (row.status === "done") doneTasks += 1;
      if (row.status === "cancelled") cancelledTasks += 1;
      if (row.status !== "done" && row.status !== "cancelled") openTasks += 1;
      if (row.status === "review") reviewWaiting += 1;
      if (isActiveTaskProcess(row.id)) activeRunning += 1;
      if (hasQaHoldEvidenceGap(row)) qaHoldItems += 1;
      if (isOrphanCandidate(row)) orphanRows.push(row);
      const reason = getBlockerReason(row);
      if (reason) blockerRows.push({ row, reason });
    }

    const health =
      rows.length === 0
        ? "empty"
        : orphanRows.length > 0 || qaHoldItems > 0
          ? "critical"
          : openTasks > 0
            ? "warning"
            : "good";

    res.json({
      ok: true,
      project,
      health,
      summary: {
        total_tasks: rows.length,
        open_tasks: openTasks,
        done_tasks: doneTasks,
        cancelled_tasks: cancelledTasks,
        orphan_candidates: orphanRows.length,
        qa_hold_items: qaHoldItems,
        review_waiting: reviewWaiting,
        active_running: activeRunning,
      },
      status_counts: statusCounts,
      department_counts: departmentCounts,
      blockers: blockerRows.slice(0, 30).map((item) => serializeHealthTask(item.row, item.reason)),
      orphan_candidates: orphanRows.slice(0, 30).map((row) => serializeHealthTask(row, "orphan_candidate")),
      generated_at: nowMs(),
    });
  });

  app.post("/api/projects/:id/orphan-tasks/:taskId/recover", (req, res) => {
    const projectId = String(req.params.id);
    const taskId = String(req.params.taskId);
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const row = db
      .prepare(
        `
    SELECT
      t.id,
      t.title,
      t.status,
      t.task_type,
      t.priority,
      t.department_id,
      COALESCE(d.name, '') AS department_name,
      COALESCE(d.name_ko, '') AS department_name_ko,
      t.assigned_agent_id,
      COALESCE(a.name, '') AS assigned_agent_name,
      COALESCE(a.name_ko, '') AS assigned_agent_name_ko,
      t.source_task_id,
      t.result,
      (
        SELECT tl.message
        FROM task_logs tl
        WHERE tl.task_id = t.id
        ORDER BY tl.created_at DESC, tl.id DESC
        LIMIT 1
      ) AS latest_log,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    WHERE t.project_id = ? AND t.id = ?
  `,
      )
      .get(projectId, taskId) as ProjectHealthTaskRow | undefined;
    if (!row) return res.status(404).json({ error: "task_not_found" });
    if (isActiveTaskProcess(taskId)) {
      return res.status(409).json({ error: "task_process_active", message: "Task process is still active." });
    }
    if (row.status === "done" || row.status === "review") {
      return res.status(400).json({ error: "invalid_status", status: row.status });
    }

    const previousStatus = row.status;
    const targetStatus = row.assigned_agent_id ? "planned" : "inbox";
    const t = nowMs();
    runInTransaction(() => {
      db.prepare("UPDATE tasks SET status = ?, started_at = NULL, updated_at = ? WHERE id = ?").run(
        targetStatus,
        t,
        taskId,
      );
      if (row.assigned_agent_id) {
        db.prepare(
          "UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?",
        ).run(row.assigned_agent_id, taskId);
      }
      db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
        taskId,
        `ORPHAN_RECOVERY queued by project health panel (${previousStatus} -> ${targetStatus})`,
        t,
      );
    });

    const updated = getProjectHealthTaskRows(projectId).find((item) => item.id === taskId) ?? {
      ...row,
      status: targetStatus,
      updated_at: t,
      latest_log: `ORPHAN_RECOVERY queued by project health panel (${previousStatus} -> ${targetStatus})`,
    };

    res.json({
      ok: true,
      task: serializeHealthTask(updated, "orphan_recovered"),
      previous_status: previousStatus,
      status: targetStatus,
    });
  });

  app.get("/api/projects/:id/artifact-state", (req, res) => {
    const id = String(req.params.id);
    const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(id) as
      | { id: string; project_path: string }
      | undefined;
    if (!project) return res.status(404).json({ error: "not_found" });

    return res.json({
      state: inspectProjectArtifacts({
        projectId: project.id,
        projectPath: project.project_path,
      }),
    });
  });

  app.post("/api/projects/:id/artifact-bootstrap", (req, res) => {
    const id = String(req.params.id);
    const project = db
      .prepare("SELECT id, name, project_path, core_goal, default_pack_key FROM projects WHERE id = ?")
      .get(id) as
      | { id: string; name: string; project_path: string; core_goal: string; default_pack_key?: string | null }
      | undefined;
    if (!project) return res.status(404).json({ error: "not_found" });

    try {
      const state = ensureProjectArtifacts({
        projectPath: project.project_path,
        projectName: project.name,
        coreGoal: project.core_goal,
        packProfile: normalizeTextField(project.default_pack_key) ?? DEFAULT_WORKFLOW_PACK_KEY,
        snapshotHash: getCanonicalSnapshot().policy.hash,
        policyVersion: getCanonicalSnapshot().policy.version,
      });
      syncProjectArtifactProjection(db, { ...state, projectId: project.id }, project.id);
      return res.json({ ok: true, state });
    } catch (error) {
      return res.status(500).json({
        error: "project_artifact_bootstrap_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/projects/:id/artifact-apply", (req, res) => {
    const id = String(req.params.id);
    const project = db
      .prepare("SELECT id, name, project_path, core_goal, default_pack_key FROM projects WHERE id = ?")
      .get(id) as
      | { id: string; name: string; project_path: string; core_goal: string; default_pack_key?: string | null }
      | undefined;
    if (!project) return res.status(404).json({ error: "not_found" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const taskPatch = body.task && typeof body.task === "object" ? (body.task as Record<string, unknown>) : null;
    try {
      const state = applyProjectArtifactPatch({
        projectId: project.id,
        projectPath: project.project_path,
        actor: (typeof body.actor === "string" && body.actor.trim()) || "api.project.artifact-apply",
        note: typeof body.note === "string" ? body.note : null,
        packProfile:
          (typeof body.packProfile === "string" && body.packProfile.trim()) ||
          normalizeTextField(project.default_pack_key) ||
          DEFAULT_WORKFLOW_PACK_KEY,
        policyVersion:
          (typeof body.policyVersion === "string" && body.policyVersion.trim()) ||
          getCanonicalSnapshot().policy.version,
        task: taskPatch
          ? {
              id: typeof taskPatch.id === "string" ? taskPatch.id : null,
              title: typeof taskPatch.title === "string" ? taskPatch.title : null,
              status: typeof taskPatch.status === "string" ? taskPatch.status : null,
              priority: Number.isFinite(Number(taskPatch.priority)) ? Number(taskPatch.priority) : null,
              taskType: typeof taskPatch.taskType === "string" ? taskPatch.taskType : null,
            }
          : null,
      });
      syncProjectArtifactProjection(db, state, project.id);
      return res.json({ ok: true, state });
    } catch (error) {
      return res.status(500).json({
        error: "project_artifact_patch_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
