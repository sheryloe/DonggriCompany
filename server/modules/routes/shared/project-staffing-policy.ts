import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { resolveCanonicalIdentity } from "../../company/canonical-identity.ts";
import { mapLegacyDepartmentId } from "../../bootstrap/schema/organization-manifest.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

export interface ProjectStaffingDepartmentOverride {
  enabled?: boolean;
  preferred_families?: string[];
  preferred_specializations?: string[];
  candidate_agent_ids?: string[];
  capacity_weight?: number;
}

export interface ProjectStaffingTaskTypeOverride {
  preferred_departments?: string[];
}

export interface ProjectStaffingApprovalProfile {
  require_qa?: boolean;
  require_security?: boolean;
  require_docs?: boolean;
  extra_blocking_families?: string[];
}

export interface ProjectStaffingPolicy {
  version: number;
  mode: "overlay";
  active_departments: string[];
  department_overrides: Record<string, ProjectStaffingDepartmentOverride>;
  task_type_overrides: Record<string, ProjectStaffingTaskTypeOverride>;
  approval_profile: ProjectStaffingApprovalProfile;
  updated_by?: string | null;
  updated_at?: number | null;
}

export interface ProjectRoutingConstraint {
  allowlistFamilies: string[];
  preferredDepartmentIds: string[];
  allowedDepartmentIds: string[];
  candidateAgentIds: string[] | null;
  preferredSpecializations: string[];
  source: "manual" | "overlay" | "manual+overlay" | "none";
}

const DEFAULT_PROJECT_STAFFING_POLICY: ProjectStaffingPolicy = {
  version: 1,
  mode: "overlay",
  active_departments: [],
  department_overrides: {},
  task_type_overrides: {},
  approval_profile: {},
  updated_by: null,
  updated_at: null,
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeText(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeDepartmentIds(values: unknown): string[] {
  return normalizeTextArray(values)
    .map((value) => mapLegacyDepartmentId(value))
    .filter((value): value is string => Boolean(value));
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeDepartmentOverrides(value: unknown): Record<string, ProjectStaffingDepartmentOverride> {
  const objectValue = asObject(value);
  if (!objectValue) return {};
  const out: Record<string, ProjectStaffingDepartmentOverride> = {};
  for (const [rawKey, rawOverride] of Object.entries(objectValue)) {
    const departmentId = mapLegacyDepartmentId(rawKey);
    if (!departmentId) continue;
    const overrideObject = asObject(rawOverride) ?? {};
    out[departmentId] = {
      enabled: typeof overrideObject.enabled === "boolean" ? overrideObject.enabled : undefined,
      preferred_families: normalizeTextArray(overrideObject.preferred_families),
      preferred_specializations: normalizeTextArray(overrideObject.preferred_specializations),
      candidate_agent_ids: normalizeTextArray(overrideObject.candidate_agent_ids),
      capacity_weight: Number.isFinite(Number(overrideObject.capacity_weight))
        ? Number(overrideObject.capacity_weight)
        : undefined,
    };
  }
  return out;
}

function normalizeTaskTypeOverrides(value: unknown): Record<string, ProjectStaffingTaskTypeOverride> {
  const objectValue = asObject(value);
  if (!objectValue) return {};
  const out: Record<string, ProjectStaffingTaskTypeOverride> = {};
  for (const [rawTaskType, rawOverride] of Object.entries(objectValue)) {
    const taskType = normalizeText(rawTaskType);
    if (!taskType) continue;
    const overrideObject = asObject(rawOverride) ?? {};
    out[taskType] = {
      preferred_departments: normalizeDepartmentIds(overrideObject.preferred_departments),
    };
  }
  return out;
}

export function parseProjectStaffingPolicy(raw: unknown): ProjectStaffingPolicy | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const objectValue = asObject(parsed);
  if (!objectValue) return null;
  const approvalProfile = asObject(objectValue.approval_profile);
  return {
    version: Number.isFinite(Number(objectValue.version)) ? Math.max(1, Math.trunc(Number(objectValue.version))) : 1,
    mode: "overlay",
    active_departments: normalizeDepartmentIds(objectValue.active_departments),
    department_overrides: normalizeDepartmentOverrides(objectValue.department_overrides),
    task_type_overrides: normalizeTaskTypeOverrides(objectValue.task_type_overrides),
    approval_profile: {
      require_qa: approvalProfile?.require_qa === true,
      require_security: approvalProfile?.require_security === true,
      require_docs: approvalProfile?.require_docs === true,
      extra_blocking_families: normalizeTextArray(approvalProfile?.extra_blocking_families),
    },
    updated_by: normalizeText(objectValue.updated_by) || null,
    updated_at: Number.isFinite(Number(objectValue.updated_at)) ? Number(objectValue.updated_at) : null,
  };
}

export function serializeProjectStaffingPolicy(raw: unknown): string | null {
  const normalized = parseProjectStaffingPolicy(raw);
  return normalized ? JSON.stringify(normalized) : null;
}

function loadManualProjectAgentIds(db: DbLike, projectId: string): string[] {
  const rows = db.prepare("SELECT agent_id FROM project_agents WHERE project_id = ?").all(projectId) as Array<{
    agent_id?: unknown;
  }>;
  return rows
    .map((row) => normalizeText(row.agent_id))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

function loadAgentFamiliesByIds(db: DbLike, agentIds: string[]): string[] {
  if (agentIds.length <= 0) return [];
  const placeholders = agentIds.map(() => "?").join(", ");
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = db
      .prepare(
        `
        SELECT department_id, family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile
        FROM agents
        WHERE id IN (${placeholders})
      `,
      )
      .all(...(agentIds as SQLInputValue[])) as Array<Record<string, unknown>>;
  } catch {
    try {
      rows = db
        .prepare(
          `
          SELECT department_id, role, workflow_profile
          FROM agents
          WHERE id IN (${placeholders})
        `,
        )
        .all(...(agentIds as SQLInputValue[])) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }
  const out = new Set<string>();
  for (const row of rows) out.add(resolveCanonicalIdentity(row).family);
  return [...out];
}

function loadAgentIdsByDepartments(db: DbLike, departmentIds: string[]): string[] {
  if (departmentIds.length <= 0) return [];
  const placeholders = departmentIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id FROM agents WHERE department_id IN (${placeholders})`)
    .all(...(departmentIds as SQLInputValue[])) as Array<{ id?: unknown }>;
  return rows
    .map((row) => normalizeText(row.id))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

export function loadProjectStaffingPolicy(
  db: DbLike,
  projectId: string | null | undefined,
): ProjectStaffingPolicy | null {
  const normalizedProjectId = normalizeText(projectId);
  if (!normalizedProjectId) return null;
  try {
    const row = db
      .prepare("SELECT staffing_policy_json FROM projects WHERE id = ? LIMIT 1")
      .get(normalizedProjectId) as { staffing_policy_json?: unknown } | undefined;
    return parseProjectStaffingPolicy(row?.staffing_policy_json) ?? null;
  } catch {
    return null;
  }
}

export function resolveProjectRoutingConstraint(
  db: DbLike,
  projectId: string | null | undefined,
  taskType?: string | null | undefined,
): ProjectRoutingConstraint | null {
  const normalizedProjectId = normalizeText(projectId);
  if (!normalizedProjectId) {
    return null;
  }

  const projectRow = db
    .prepare("SELECT assignment_mode FROM projects WHERE id = ? LIMIT 1")
    .get(normalizedProjectId) as { assignment_mode?: unknown } | undefined;
  const assignmentMode = normalizeText(projectRow?.assignment_mode);
  const manualAgentIds = assignmentMode === "manual" ? loadManualProjectAgentIds(db, normalizedProjectId) : [];
  const policy = loadProjectStaffingPolicy(db, normalizedProjectId) ?? DEFAULT_PROJECT_STAFFING_POLICY;

  const activeDepartmentIds = new Set<string>(policy.active_departments);
  const preferredDepartmentIds: string[] = [];
  const preferredFamilySet = new Set<string>();
  const preferredSpecializationSet = new Set<string>();
  const overlayCandidateIds = new Set<string>();

  for (const departmentId of policy.active_departments) {
    if (!preferredDepartmentIds.includes(departmentId)) preferredDepartmentIds.push(departmentId);
  }

  const taskTypeOverride = policy.task_type_overrides[normalizeText(taskType)];
  for (const departmentId of taskTypeOverride?.preferred_departments ?? []) {
    if (!preferredDepartmentIds.includes(departmentId)) preferredDepartmentIds.push(departmentId);
    activeDepartmentIds.add(departmentId);
  }

  for (const [departmentId, override] of Object.entries(policy.department_overrides)) {
    if (override.enabled === false) {
      activeDepartmentIds.delete(departmentId);
      continue;
    }
    activeDepartmentIds.add(departmentId);
    if (!preferredDepartmentIds.includes(departmentId)) preferredDepartmentIds.push(departmentId);
    for (const family of override.preferred_families ?? []) preferredFamilySet.add(family);
    for (const specialization of override.preferred_specializations ?? [])
      preferredSpecializationSet.add(specialization);
    for (const agentId of override.candidate_agent_ids ?? []) overlayCandidateIds.add(agentId);
  }

  const overlayDepartmentIds = [...activeDepartmentIds];
  if (overlayCandidateIds.size <= 0 && overlayDepartmentIds.length > 0) {
    for (const agentId of loadAgentIdsByDepartments(db, overlayDepartmentIds)) overlayCandidateIds.add(agentId);
  }

  const manualFamilySet = new Set<string>(loadAgentFamiliesByIds(db, manualAgentIds));
  for (const family of manualFamilySet) preferredFamilySet.add(family);
  if (manualFamilySet.size <= 0) {
    for (const family of loadAgentFamiliesByIds(db, [...overlayCandidateIds])) preferredFamilySet.add(family);
  }

  let candidateAgentIds: string[] | null = null;
  if (manualAgentIds.length > 0 && overlayCandidateIds.size > 0) {
    const overlaySet = new Set(overlayCandidateIds);
    candidateAgentIds = manualAgentIds.filter((agentId) => overlaySet.has(agentId));
  } else if (manualAgentIds.length > 0) {
    candidateAgentIds = manualAgentIds;
  } else if (overlayCandidateIds.size > 0) {
    candidateAgentIds = [...overlayCandidateIds];
  }

  const source =
    manualAgentIds.length > 0 && overlayCandidateIds.size > 0
      ? "manual+overlay"
      : manualAgentIds.length > 0
        ? "manual"
        : overlayCandidateIds.size > 0 || overlayDepartmentIds.length > 0
          ? "overlay"
          : "none";

  return {
    allowlistFamilies: [...preferredFamilySet],
    preferredDepartmentIds,
    allowedDepartmentIds: overlayDepartmentIds,
    candidateAgentIds,
    preferredSpecializations: [...preferredSpecializationSet],
    source,
  };
}
