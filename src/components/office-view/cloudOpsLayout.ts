import type { Agent, Department, SubAgent, Task } from "../../types";

export type CloudOpsPanelMode = "overview" | "pipeline" | "build" | "review" | "ops" | "memory";
export type CloudOpsFilter = CloudOpsPanelMode;

export type CloudOpsDepartmentKey = "planning" | "development" | "design" | "quality" | "instructor";

export interface CloudOpsMapAction {
  mode: CloudOpsPanelMode;
  label: string;
  mapFocus: "core" | "pipeline" | "development" | "quality" | "ops" | "memory";
}

export interface CloudOpsServiceZone {
  key: CloudOpsDepartmentKey;
  labelKo: string;
  labelEn: string;
  aliases: string[];
  accent: string;
  departments: Department[];
  agents: Agent[];
  taskCount: number;
  activeTaskCount: number;
  reviewTaskCount: number;
  status: "ready" | "active" | "watch";
}

export interface CloudOpsControlTower {
  id: "operations";
  label: "OPS Control Tower";
  labelKo: string;
  footprint: "compact";
  accent: string;
  departments: Department[];
  agents: Agent[];
  activeTaskCount: number;
  approvalQueue: number;
  runtimeStatus: "online" | "watch" | "standby";
}

export interface CloudOpsScopeSatellite {
  key: string;
  label: string;
  owner: "OPS";
  status: "online" | "watch" | "standby";
  activeTaskCount: number;
  evidenceHint: string;
}

export interface CloudOpsPipelineNode {
  key: "CONTROL" | "SPEC" | "EXPLORE" | "IMPLEMENT" | "REVIEW" | "OPS";
  labelKo: string;
  status: "ready" | "active" | "gate";
  evidenceRequired: boolean;
}

export interface CloudOpsMetrics {
  executionActive: number;
  approvalQueue: number;
  qualityScore: number;
  memoryMode: "safe";
  projectScopeCount: number;
}

export interface CloudOpsLayout {
  serviceZones: CloudOpsServiceZone[];
  controlTower: CloudOpsControlTower;
  satellites: CloudOpsScopeSatellite[];
  pipelineNodes: CloudOpsPipelineNode[];
  metrics: CloudOpsMetrics;
}

interface BuildCloudOpsLayoutParams {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
}

const ACTIVE_TASK_STATUSES = new Set(["planned", "collaborating", "in_progress", "review"]);

const SERVICE_ZONE_DEFINITIONS: Array<
  Omit<CloudOpsServiceZone, "departments" | "agents" | "taskCount" | "activeTaskCount" | "reviewTaskCount" | "status">
> = [
  {
    key: "planning",
    labelKo: "기획",
    labelEn: "Planning",
    aliases: ["planning", "pmo", "strategy"],
    accent: "#38bdf8",
  },
  {
    key: "development",
    labelKo: "개발",
    labelEn: "Build",
    aliases: ["development", "dev", "engineering"],
    accent: "#22c55e",
  },
  {
    key: "design",
    labelKo: "디자인",
    labelEn: "Design",
    aliases: ["design", "ux", "ui"],
    accent: "#f472b6",
  },
  {
    key: "quality",
    labelKo: "품질",
    labelEn: "Quality",
    aliases: ["quality", "qa", "devsecops", "security"],
    accent: "#f59e0b",
  },
  {
    key: "instructor",
    labelKo: "외부강사",
    labelEn: "Instructor",
    aliases: ["instructor", "external_instructor", "external-instructor", "external"],
    accent: "#a78bfa",
  },
];

const OPS_ALIASES = new Set(["operations", "ops", "operation"]);

const PROJECT_SCOPES: Array<Pick<CloudOpsScopeSatellite, "key" | "label" | "evidenceHint">> = [
  { key: "BloggerGent", label: "BloggerGent", evidenceHint: "발행 / 품질" },
  { key: "DonggriCompany", label: "DonggriCompany", evidenceHint: "운영 맵 / Control Plane" },
  { key: "JasoSul", label: "JasoSul", evidenceHint: "작성 scope" },
];

export const CLOUDOPS_ACTIONS: CloudOpsMapAction[] = [
  { mode: "overview", label: "요약", mapFocus: "core" },
  { mode: "pipeline", label: "업무 흐름", mapFocus: "pipeline" },
  { mode: "build", label: "구현", mapFocus: "development" },
  { mode: "review", label: "검토", mapFocus: "quality" },
  { mode: "ops", label: "운영", mapFocus: "ops" },
  { mode: "memory", label: "기억", mapFocus: "memory" },
];

export function normalizeCloudOpsDepartmentId(id: string | null | undefined): CloudOpsDepartmentKey | "operations" | null {
  const normalized = String(id ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!normalized) return null;
  if (OPS_ALIASES.has(normalized)) return "operations";
  const zone = SERVICE_ZONE_DEFINITIONS.find((definition) => definition.aliases.includes(normalized));
  return zone?.key ?? null;
}

function isActiveTask(task: Task): boolean {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

function taskBelongsToProject(task: Task, projectKey: string): boolean {
  const needle = projectKey.toLowerCase();
  return [task.project_id, task.project_path, task.workflow_meta_json, task.title]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function resolveTaskDepartmentKey(task: Task, agents: Agent[]): CloudOpsDepartmentKey | "operations" | null {
  const direct = normalizeCloudOpsDepartmentId(task.department_id);
  if (direct) return direct;
  const assignedAgent = agents.find((agent) => agent.id === task.assigned_agent_id);
  return normalizeCloudOpsDepartmentId(assignedAgent?.department_id);
}

function zoneStatus(activeTaskCount: number, reviewTaskCount: number): CloudOpsServiceZone["status"] {
  if (reviewTaskCount > 0) return "watch";
  if (activeTaskCount > 0) return "active";
  return "ready";
}

function towerStatus(activeTaskCount: number, approvalQueue: number): CloudOpsControlTower["runtimeStatus"] {
  if (approvalQueue > 0) return "watch";
  if (activeTaskCount > 0) return "online";
  return "standby";
}

export function buildCloudOpsLayout({
  departments,
  agents,
  tasks,
  subAgents,
}: BuildCloudOpsLayoutParams): CloudOpsLayout {
  const tasksByDepartmentKey = new Map<CloudOpsDepartmentKey | "operations", Task[]>();
  for (const task of tasks) {
    const key = resolveTaskDepartmentKey(task, agents);
    if (!key) continue;
    tasksByDepartmentKey.set(key, [...(tasksByDepartmentKey.get(key) ?? []), task]);
  }

  const serviceZones: CloudOpsServiceZone[] = SERVICE_ZONE_DEFINITIONS.map((definition) => {
    const departmentsForZone = departments.filter(
      (department) => normalizeCloudOpsDepartmentId(department.id) === definition.key,
    );
    const agentsForZone = agents.filter((agent) => normalizeCloudOpsDepartmentId(agent.department_id) === definition.key);
    const zoneTasks = tasksByDepartmentKey.get(definition.key) ?? [];
    const activeTaskCount = zoneTasks.filter(isActiveTask).length;
    const reviewTaskCount = zoneTasks.filter((task) => task.status === "review").length;
    return {
      ...definition,
      departments: departmentsForZone,
      agents: agentsForZone,
      taskCount: zoneTasks.length,
      activeTaskCount,
      reviewTaskCount,
      status: zoneStatus(activeTaskCount, reviewTaskCount),
    };
  });

  const opsDepartments = departments.filter((department) => normalizeCloudOpsDepartmentId(department.id) === "operations");
  const opsAgents = agents.filter((agent) => normalizeCloudOpsDepartmentId(agent.department_id) === "operations");
  const opsTasks = tasksByDepartmentKey.get("operations") ?? [];
  const opsActiveTasks = opsTasks.filter(isActiveTask).length;
  const approvalQueue = tasks.filter((task) => task.status === "review").length;

  const satellites: CloudOpsScopeSatellite[] = PROJECT_SCOPES.map((project) => {
    const projectTasks = tasks.filter((task) => taskBelongsToProject(task, project.key));
    const activeTaskCount = projectTasks.filter(isActiveTask).length;
    return {
      ...project,
      owner: "OPS",
      activeTaskCount,
      status: activeTaskCount > 0 ? "online" : project.key === "DonggriCompany" ? "online" : "standby",
    };
  });

  const pipelineNodes: CloudOpsPipelineNode[] = [
    { key: "CONTROL", labelKo: "승인", status: approvalQueue > 0 ? "gate" : "ready", evidenceRequired: true },
    { key: "SPEC", labelKo: "스펙", status: "active", evidenceRequired: true },
    { key: "EXPLORE", labelKo: "탐색", status: "ready", evidenceRequired: false },
    {
      key: "IMPLEMENT",
      labelKo: "구현",
      status: tasks.some((task) => task.status === "in_progress") || subAgents.some((agent) => agent.status === "working")
        ? "active"
        : "ready",
      evidenceRequired: true,
    },
    { key: "REVIEW", labelKo: "검토", status: approvalQueue > 0 ? "gate" : "ready", evidenceRequired: true },
    { key: "OPS", labelKo: "운영", status: opsActiveTasks > 0 ? "active" : "ready", evidenceRequired: true },
  ];

  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const qualityScore = tasks.length === 0 ? 100 : Math.round((completedTasks / tasks.length) * 100);

  return {
    serviceZones,
    controlTower: {
      id: "operations",
      label: "OPS Control Tower",
      labelKo: "운영 관제탑",
      footprint: "compact",
      accent: "#2dd4bf",
      departments: opsDepartments,
      agents: opsAgents,
      activeTaskCount: opsActiveTasks,
      approvalQueue,
      runtimeStatus: towerStatus(opsActiveTasks, approvalQueue),
    },
    satellites,
    pipelineNodes,
    metrics: {
      executionActive: tasks.filter(isActiveTask).length,
      approvalQueue,
      qualityScore,
      memoryMode: "safe",
      projectScopeCount: satellites.length,
    },
  };
}
