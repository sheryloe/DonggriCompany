import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../../workflow/packs/definitions.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import { selectAutoAssignableAgentForTask, type AutoAssignableAgent } from "./execution-run-auto-assign.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

export const TASK_AUTO_ROUTING_VERSION = "donggri_task_auto_routing_v1";

type ProjectRouteSource =
  | "explicit_project_id"
  | "explicit_project_path"
  | "project_hint_match"
  | "project_text_match"
  | "pmo_triage";

type AgentRouteSource = "auto_agent_selector" | "no_runnable_agent";

export interface TaskAutoRoutingInput {
  title: unknown;
  description?: unknown;
  projectHint?: unknown;
  projectId?: string | null;
  projectPath?: string | null;
  workflowPackKey?: string | null;
  departmentId?: string | null;
  taskType?: string | null;
  workflowMetaJson?: unknown;
}

export interface TaskAutoRoutingResolution {
  projectId: string | null;
  projectPath: string | null;
  workflowPackKey: WorkflowPackKey;
  departmentId: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  statusHint: "planned" | "pending" | null;
  requiresPmoTriage: boolean;
  projectRouting: {
    source: ProjectRouteSource;
    confidence: number;
    reason: string;
    evidence: string[];
  };
  agentRouting: {
    source: AgentRouteSource;
    confidence: number;
    reason: string;
    evidence: string[];
  };
}

type ProjectRow = {
  id: string;
  name: string;
  project_path: string | null;
  core_goal: string | null;
  default_pack_key?: string | null;
  last_used_at?: number | null;
  updated_at?: number | null;
  created_at?: number | null;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchText(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function normalizePackKey(value: unknown): WorkflowPackKey | null {
  const text = normalizeText(value);
  return isWorkflowPackKey(text) ? text : null;
}

function safeJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  return [...new Set(matches)].slice(0, 40);
}

function loadProjectById(db: DbLike, projectId: string | null): ProjectRow | null {
  if (!projectId) return null;
  try {
    return (
      (db
        .prepare(
          "SELECT id, name, project_path, core_goal, default_pack_key, last_used_at, updated_at, created_at FROM projects WHERE id = ? LIMIT 1",
        )
        .get(projectId) as ProjectRow | undefined) ?? null
    );
  } catch {
    return null;
  }
}

function loadProjectByPath(db: DbLike, projectPath: string | null): ProjectRow | null {
  if (!projectPath) return null;
  try {
    return (
      (db
        .prepare(
          "SELECT id, name, project_path, core_goal, default_pack_key, last_used_at, updated_at, created_at FROM projects WHERE project_path = ? ORDER BY COALESCE(last_used_at, updated_at, created_at) DESC LIMIT 1",
        )
        .get(projectPath) as ProjectRow | undefined) ?? null
    );
  } catch {
    return null;
  }
}

function loadRecentProjects(db: DbLike): ProjectRow[] {
  try {
    return db
      .prepare(
        "SELECT id, name, project_path, core_goal, default_pack_key, last_used_at, updated_at, created_at FROM projects ORDER BY COALESCE(last_used_at, updated_at, created_at) DESC LIMIT 200",
      )
      .all() as ProjectRow[];
  } catch {
    return [];
  }
}

function basenameOf(projectPath: string | null): string {
  if (!projectPath) return "";
  try {
    return path.basename(projectPath).toLowerCase();
  } catch {
    return "";
  }
}

function scoreProject(project: ProjectRow, text: string, hint: string): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  const name = normalizeSearchText(project.name);
  const projectPath = normalizeSearchText(project.project_path);
  const baseName = basenameOf(project.project_path);
  const coreGoal = normalizeSearchText(project.core_goal);
  const haystack = `${hint}\n${text}`.trim();

  let score = 0;
  if (hint && name && hint === name) {
    score = Math.max(score, 0.95);
    evidence.push("exact_project_name_hint");
  }
  if (hint && projectPath && hint === projectPath) {
    score = Math.max(score, 0.96);
    evidence.push("exact_project_path_hint");
  }
  if (hint && name && name.includes(hint)) {
    score = Math.max(score, 0.82);
    evidence.push("partial_project_name_hint");
  }
  if (name && haystack.includes(name)) {
    score = Math.max(score, 0.86);
    evidence.push("project_name_in_task_text");
  }
  if (baseName && haystack.includes(baseName)) {
    score = Math.max(score, 0.8);
    evidence.push("project_folder_in_task_text");
  }

  const goalTokens = tokenize(coreGoal).filter((token) => token.length >= 3);
  if (goalTokens.length > 0) {
    const matched = goalTokens.filter((token) => haystack.includes(token));
    if (matched.length > 0) {
      const ratio = matched.length / Math.min(goalTokens.length, 12);
      score = Math.max(score, Math.min(0.78, 0.45 + ratio * 0.35));
      evidence.push(`core_goal_overlap:${matched.slice(0, 5).join(",")}`);
    }
  }

  return { score, evidence };
}

function resolveProjectRoute(
  db: DbLike,
  input: TaskAutoRoutingInput,
): {
  project: ProjectRow | null;
  source: ProjectRouteSource;
  confidence: number;
  reason: string;
  evidence: string[];
  requiresPmoTriage: boolean;
} {
  const explicitProject = loadProjectById(db, normalizeText(input.projectId) || null);
  if (explicitProject) {
    return {
      project: explicitProject,
      source: "explicit_project_id",
      confidence: 1,
      reason: "explicit_project_id",
      evidence: [explicitProject.id],
      requiresPmoTriage: false,
    };
  }

  const pathProject = loadProjectByPath(db, normalizeText(input.projectPath) || null);
  if (pathProject) {
    return {
      project: pathProject,
      source: "explicit_project_path",
      confidence: 0.96,
      reason: "explicit_project_path",
      evidence: [pathProject.id],
      requiresPmoTriage: false,
    };
  }

  const routeText = `${normalizeText(input.title)}\n${normalizeText(input.description)}`.toLowerCase();
  const hint = normalizeSearchText(input.projectHint);
  const scored = loadRecentProjects(db)
    .map((project) => ({ project, ...scoreProject(project, routeText, hint) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) return byScore;
      return (
        Number(b.project.last_used_at ?? b.project.updated_at ?? b.project.created_at ?? 0) -
        Number(a.project.last_used_at ?? a.project.updated_at ?? a.project.created_at ?? 0)
      );
    });

  const top = scored[0];
  if (top && top.score >= 0.7) {
    return {
      project: top.project,
      source: hint ? "project_hint_match" : "project_text_match",
      confidence: top.score,
      reason: hint ? "project_hint_match" : "project_text_match",
      evidence: top.evidence,
      requiresPmoTriage: false,
    };
  }

  return {
    project: null,
    source: "pmo_triage",
    confidence: top?.score ?? 0,
    reason: "project_confidence_below_threshold",
    evidence: top ? [`best_candidate:${top.project.id}`, ...top.evidence] : [],
    requiresPmoTriage: true,
  };
}

function safeSelectAgent(
  db: DbLike,
  task: {
    workflow_pack_key: string | null;
    department_id: string | null;
    project_id: string | null;
    task_type: string | null;
  },
): AutoAssignableAgent | null {
  try {
    return selectAutoAssignableAgentForTask(db as any, task)?.agent ?? null;
  } catch {
    return null;
  }
}

export function resolveTaskAutoRouting(db: DbLike, input: TaskAutoRoutingInput): TaskAutoRoutingResolution {
  const projectRoute = resolveProjectRoute(db, input);
  const projectId = projectRoute.project?.id ?? null;
  const projectPath = projectRoute.project?.project_path ?? (normalizeText(input.projectPath) || null);
  const workflowPackKey = resolveWorkflowPackKeyForTask({
    db: db as any,
    explicitPackKey: normalizePackKey(input.workflowPackKey),
    projectId,
    fallbackPackKey: DEFAULT_WORKFLOW_PACK_KEY,
  });
  const departmentId = projectRoute.requiresPmoTriage ? "pmo" : normalizeText(input.departmentId) || null;
  const taskType = normalizeText(input.taskType) || null;
  const agent = safeSelectAgent(db, {
    workflow_pack_key: workflowPackKey,
    department_id: departmentId,
    project_id: projectId,
    task_type: taskType,
  });

  return {
    projectId,
    projectPath,
    workflowPackKey,
    departmentId: agent?.department_id ?? departmentId,
    assignedAgentId: agent?.id ?? null,
    assignedAgentName: agent?.name ?? null,
    statusHint: projectRoute.requiresPmoTriage ? "pending" : agent ? "planned" : null,
    requiresPmoTriage: projectRoute.requiresPmoTriage,
    projectRouting: {
      source: projectRoute.source,
      confidence: Number(projectRoute.confidence.toFixed(3)),
      reason: projectRoute.reason,
      evidence: projectRoute.evidence,
    },
    agentRouting: agent
      ? {
          source: "auto_agent_selector",
          confidence: projectRoute.requiresPmoTriage ? 0.6 : 0.9,
          reason: projectRoute.requiresPmoTriage ? "pmo_triage_owner_selected" : "workflow_pack_agent_selected",
          evidence: [agent.id, agent.department_id ?? ""].filter(Boolean),
        }
      : {
          source: "no_runnable_agent",
          confidence: 0,
          reason: "no_idle_or_oauth_ready_agent",
          evidence: [],
        },
  };
}

export function mergeTaskAutoRoutingWorkflowMeta(rawWorkflowMeta: unknown, routing: TaskAutoRoutingResolution): string {
  const current = safeJsonObject(rawWorkflowMeta);
  return JSON.stringify({
    ...current,
    auto_routing_version: TASK_AUTO_ROUTING_VERSION,
    project_routing_source: routing.projectRouting.source,
    project_routing_confidence: routing.projectRouting.confidence,
    project_routing_reason: routing.projectRouting.reason,
    agent_routing_source: routing.agentRouting.source,
    agent_routing_confidence: routing.agentRouting.confidence,
    agent_routing_reason: routing.agentRouting.reason,
    routing_evidence: {
      project: routing.projectRouting.evidence,
      agent: routing.agentRouting.evidence,
    },
    requires_pmo_triage: routing.requiresPmoTriage,
  });
}
