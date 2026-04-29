import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../../workflow/packs/definitions.ts";
import { resolveProjectRoutingConstraint } from "../../shared/project-staffing-policy.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

type ProjectAssignmentModeRow = {
  assignment_mode?: string | null;
};

type ProjectAgentRow = {
  agent_id: string;
};

export type AutoAssignableAgent = {
  id: string;
  name: string;
  department_id: string | null;
  role: string;
  cli_provider: string | null;
  oauth_account_id: string | null;
  status: string;
  current_task_id: string | null;
  stats_tasks_done: number;
  created_at: number;
};

type CandidateTaskShape = {
  workflow_pack_key?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  task_type?: string | null;
};

export type AutoAssignSelectionResult = {
  packKey: WorkflowPackKey;
  agent: AutoAssignableAgent;
};

const PACK_DEPARTMENT_PRIORITIES: Record<WorkflowPackKey, string[]> = {
  development: [
    "development",
    "dev",
    "qa",
    "security-approval",
    "cicd-repo",
    "devsecops",
    "planning-architecture",
    "planning",
    "ui-ux",
    "design",
    "management",
    "operations",
  ],
  donggri: ["planning-architecture", "planning", "development", "dev", "ui-ux", "design", "qa", "management"],
  report: ["knowledge-docs", "planning-architecture", "planning", "qa", "development", "dev", "pmo", "management"],
  web_research_report: [
    "api-research",
    "development",
    "dev",
    "planning-architecture",
    "planning",
    "qa",
    "knowledge-docs",
  ],
  video_preprod: ["ui-ux", "design", "planning-architecture", "planning", "development", "dev", "qa", "management"],
  novel: ["bloggent", "ui-ux", "design", "planning-architecture", "planning", "knowledge-docs", "development", "dev"],
  roleplay: [
    "bloggent",
    "ui-ux",
    "design",
    "planning-architecture",
    "planning",
    "knowledge-docs",
    "development",
    "dev",
  ],
};

function normalizePackKey(raw: string | null | undefined): WorkflowPackKey {
  if (isWorkflowPackKey(raw)) return raw;
  return DEFAULT_WORKFLOW_PACK_KEY;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function loadManualProjectAgentScope(db: DbLike, projectId: string | null | undefined): string[] | null {
  if (!projectId) return null;
  const project = db.prepare("SELECT assignment_mode FROM projects WHERE id = ?").get(projectId) as
    | ProjectAssignmentModeRow
    | undefined;
  if (project?.assignment_mode !== "manual") return null;
  const rows = db
    .prepare("SELECT agent_id FROM project_agents WHERE project_id = ?")
    .all(projectId) as ProjectAgentRow[];
  return rows.map((row) => row.agent_id).filter((id) => typeof id === "string" && id.length > 0);
}

function combineAgentScopes(primary: string[] | null, secondary: string[] | null): string[] | null {
  if (Array.isArray(primary) && Array.isArray(secondary)) {
    const secondarySet = new Set(secondary);
    return primary.filter((id) => secondarySet.has(id));
  }
  if (Array.isArray(primary)) return primary;
  if (Array.isArray(secondary)) return secondary;
  return null;
}

function loadActiveOAuthAccountIdsByProvider(db: DbLike): Map<string, Set<string>> | null {
  try {
    const rows = db.prepare("SELECT id, provider FROM oauth_accounts WHERE status = 'active'").all() as Array<{
      id?: unknown;
      provider?: unknown;
    }>;
    const out = new Map<string, Set<string>>();
    for (const row of rows) {
      const id = normalizeText(row?.id);
      const provider = normalizeText(row?.provider).toLowerCase();
      if (!id || !provider) continue;
      const current = out.get(provider) ?? new Set<string>();
      current.add(id);
      out.set(provider, current);
    }
    return out;
  } catch {
    return null;
  }
}

function isOAuthBackedProviderReady(
  agent: AutoAssignableAgent,
  activeOAuthByProvider: Map<string, Set<string>> | null,
): boolean {
  const provider = normalizeText(agent.cli_provider).toLowerCase();
  const requiredOAuthProvider =
    provider === "copilot" ? "github" : provider === "antigravity" ? "google_antigravity" : null;
  if (!requiredOAuthProvider || !activeOAuthByProvider) return true;
  const activeAccounts = activeOAuthByProvider.get(requiredOAuthProvider);
  if (!activeAccounts || activeAccounts.size <= 0) return false;
  const preferredAccountId = normalizeText(agent.oauth_account_id);
  if (preferredAccountId && !activeAccounts.has(preferredAccountId)) return false;
  return true;
}

function buildPreferredDepartmentOrder(
  packKey: WorkflowPackKey,
  taskDepartmentId: string | null | undefined,
  projectPreferredDepartments: string[],
): string[] {
  const preferred = PACK_DEPARTMENT_PRIORITIES[packKey] ?? PACK_DEPARTMENT_PRIORITIES[DEFAULT_WORKFLOW_PACK_KEY];
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    const normalized = normalizeText(value);
    if (!normalized || out.includes(normalized)) return;
    out.push(normalized);
  };
  add(taskDepartmentId);
  for (const departmentId of projectPreferredDepartments) add(departmentId);
  for (const departmentId of preferred) add(departmentId);
  return out;
}

function selectCandidate(
  db: DbLike,
  preferredDeptIds: string[],
  constrainedAgentIds: string[] | null,
  allowedDepartmentIds: string[],
): AutoAssignableAgent | null {
  if (Array.isArray(constrainedAgentIds) && constrainedAgentIds.length === 0) {
    return null;
  }

  const conditions: string[] = [
    "cli_provider IS NOT NULL",
    "status IN ('idle', 'break')",
    "(current_task_id IS NULL OR current_task_id = '')",
  ];
  const params: SQLInputValue[] = [];

  const effectiveAllowedDepartmentIds = allowedDepartmentIds.length > 0 ? allowedDepartmentIds : preferredDeptIds;
  if (effectiveAllowedDepartmentIds.length > 0) {
    conditions.push(`department_id IN (${effectiveAllowedDepartmentIds.map(() => "?").join(", ")})`);
    params.push(...effectiveAllowedDepartmentIds);
  }

  if (Array.isArray(constrainedAgentIds)) {
    conditions.push(`id IN (${constrainedAgentIds.map(() => "?").join(", ")})`);
    params.push(...constrainedAgentIds);
  }

  const rows = db
    .prepare(
      `
      SELECT id, name, department_id, role, cli_provider, oauth_account_id, status, current_task_id, stats_tasks_done, created_at
      FROM agents
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at ASC
    `,
    )
    .all(...params) as AutoAssignableAgent[];
  if (rows.length === 0) return null;

  const activeOAuthByProvider = loadActiveOAuthAccountIdsByProvider(db);
  const runnableRows = rows.filter((row) => isOAuthBackedProviderReady(row, activeOAuthByProvider));
  if (runnableRows.length === 0) return null;

  const deptRank = (deptId: string | null): number => {
    if (!deptId) return preferredDeptIds.length + 1;
    const index = preferredDeptIds.indexOf(deptId);
    return index >= 0 ? index : preferredDeptIds.length;
  };
  const statusRank = (status: string): number => (status === "idle" ? 0 : status === "break" ? 1 : 2);
  runnableRows.sort((a, b) => {
    const byDept = deptRank(a.department_id) - deptRank(b.department_id);
    if (byDept !== 0) return byDept;
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    const byTasksDone = (a.stats_tasks_done ?? 0) - (b.stats_tasks_done ?? 0);
    if (byTasksDone !== 0) return byTasksDone;
    return (a.created_at ?? 0) - (b.created_at ?? 0);
  });

  return runnableRows[0] ?? null;
}

export function resolveConstrainedAgentScopeForTask(db: DbLike, task: CandidateTaskShape): string[] | null {
  const manualScope = loadManualProjectAgentScope(db, task.project_id);
  const projectConstraint = resolveProjectRoutingConstraint(db, task.project_id ?? null, task.task_type ?? null);
  return combineAgentScopes(projectConstraint?.candidateAgentIds ?? null, manualScope);
}

export function selectAutoAssignableAgentForTask(
  db: DbLike,
  task: CandidateTaskShape,
): AutoAssignSelectionResult | null {
  const packKey = normalizePackKey(task.workflow_pack_key);
  const projectConstraint = resolveProjectRoutingConstraint(db, task.project_id ?? null, task.task_type ?? null);
  const preferredDeptIds = buildPreferredDepartmentOrder(
    packKey,
    task.department_id,
    projectConstraint?.preferredDepartmentIds ?? [],
  );
  const constrainedAgentIds = resolveConstrainedAgentScopeForTask(db, task);
  const allowedDepartmentIds = projectConstraint?.allowedDepartmentIds ?? [];

  const preferredCandidate = selectCandidate(db, preferredDeptIds, constrainedAgentIds, allowedDepartmentIds);
  if (preferredCandidate) return { packKey, agent: preferredCandidate };

  const fallbackCandidate = selectCandidate(db, [], constrainedAgentIds, allowedDepartmentIds);
  if (!fallbackCandidate) return null;
  return { packKey, agent: fallbackCandidate };
}
