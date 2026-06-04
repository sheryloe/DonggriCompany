import type { Agent, Department, SubAgent, Task } from "../../types";

export type RpgCommandMapMode = "overview" | "pipeline" | "build" | "review" | "ops" | "memory";

export type RpgMapNodeKind =
  | "castle"
  | "guild"
  | "forge"
  | "atelier"
  | "keep"
  | "academy"
  | "tower"
  | "territory"
  | "archive"
  | "route";

export interface RpgMapNode {
  id: string;
  kind: RpgMapNodeKind;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: number;
  status: "idle" | "active" | "watch";
  departmentIds?: string[];
  projectKey?: string;
  agents: Agent[];
  taskCount: number;
}

export interface RpgCameraTarget {
  key: RpgCommandMapMode;
  x: number;
  y: number;
  zoom: number;
  focusNodeIds: string[];
}

export interface RpgHudPanel {
  eyebrow: string;
  title: string;
  body: string;
  primary: string;
  secondary?: string;
  stats: Array<{ label: string; value: string; tone: "cyan" | "green" | "amber" | "rose" }>;
}

export interface RpgCommandAction {
  mode: RpgCommandMapMode;
  label: string;
  shortLabel: string;
}

export interface RpgCommandMapLayout {
  mode: RpgCommandMapMode;
  world: { width: number; height: number };
  commands: RpgCommandAction[];
  nodes: RpgMapNode[];
  departmentNodes: RpgMapNode[];
  routeNodes: RpgMapNode[];
  projectNodes: RpgMapNode[];
  castleNode: RpgMapNode;
  opsNode: RpgMapNode;
  memoryNode: RpgMapNode;
  camera: RpgCameraTarget;
  hud: RpgHudPanel;
  metrics: {
    activeTasks: number;
    approvalQueue: number;
    qualityScore: number;
    memoryMode: string;
    projectScopes: number;
    agentsReady: number;
  };
}

export const RPG_COMMAND_ACTIONS: RpgCommandAction[] = [
  { mode: "overview", label: "요약", shortLabel: "MAP" },
  { mode: "pipeline", label: "업무 흐름", shortLabel: "ROAD" },
  { mode: "build", label: "구현", shortLabel: "FORGE" },
  { mode: "review", label: "검토", shortLabel: "GATE" },
  { mode: "ops", label: "운영", shortLabel: "OPS" },
  { mode: "memory", label: "기억", shortLabel: "MEM" },
];

const MASTER_DEPARTMENTS = [
  {
    key: "planning",
    aliases: ["planning", "plan"],
    kind: "guild" as const,
    label: "기획 길드",
    subtitle: "요구사항",
    x: 92,
    y: 168,
    w: 116,
    h: 82,
    accent: 0x38bdf8,
  },
  {
    key: "development",
    aliases: ["development", "dev"],
    kind: "forge" as const,
    label: "개발 대장간",
    subtitle: "구현",
    x: 302,
    y: 370,
    w: 126,
    h: 88,
    accent: 0x22c55e,
  },
  {
    key: "design",
    aliases: ["design"],
    kind: "atelier" as const,
    label: "디자인 공방",
    subtitle: "화면 품질",
    x: 96,
    y: 360,
    w: 126,
    h: 86,
    accent: 0xf472b6,
  },
  {
    key: "quality",
    aliases: ["quality", "qa"],
    kind: "keep" as const,
    label: "품질 성채",
    subtitle: "검토 게이트",
    x: 498,
    y: 360,
    w: 126,
    h: 86,
    accent: 0xf59e0b,
  },
  {
    key: "instructor",
    aliases: ["instructor", "external-instructor", "trainer"],
    kind: "academy" as const,
    label: "외부강사 아카데미",
    subtitle: "스킬",
    x: 520,
    y: 168,
    w: 132,
    h: 82,
    accent: 0xa78bfa,
  },
];

const PROJECT_TERRITORIES = [
  { key: "BloggerGent", label: "BloggerGent", subtitle: "발행 영지", x: 582, y: 268, accent: 0x14b8a6 },
  { key: "DonggriCompany", label: "DonggriCompany", subtitle: "운영 본성", x: 548, y: 306, accent: 0x38bdf8 },
  { key: "JasoSul", label: "JasoSul", subtitle: "작성 영지", x: 594, y: 444, accent: 0xf97316 },
];

const ROUTE_STEPS = [
  { id: "route-control", label: "승인", x: 292, y: 176, accent: 0x38bdf8 },
  { id: "route-spec", label: "스펙", x: 386, y: 160, accent: 0x60a5fa },
  { id: "route-explore", label: "탐색", x: 262, y: 276, accent: 0x38bdf8 },
  { id: "route-implement", label: "구현", x: 348, y: 304, accent: 0x22c55e },
  { id: "route-review", label: "검토", x: 454, y: 304, accent: 0xf59e0b },
  { id: "route-ops", label: "운영", x: 512, y: 240, accent: 0x14b8a6 },
];

function taskIsActive(task: Task): boolean {
  return ["in_progress", "running", "active", "review"].includes(task.status);
}

function taskNeedsReview(task: Task): boolean {
  return ["review", "blocked", "pending_approval"].includes(task.status);
}

export function normalizeRpgDepartmentId(id: string): string {
  const normalized = id.trim().toLowerCase();
  for (const def of MASTER_DEPARTMENTS) {
    if (def.aliases.includes(normalized)) return def.key;
  }
  if (normalized === "operations" || normalized === "ops") return "operations";
  return normalized;
}

function statusFor(taskCount: number, watchCount: number): RpgMapNode["status"] {
  if (watchCount > 0) return "watch";
  if (taskCount > 0) return "active";
  return "idle";
}

function compactCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

export function buildRpgCommandMapLayout({
  departments,
  agents,
  tasks,
  subAgents,
  mode,
}: {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  mode: RpgCommandMapMode;
}): RpgCommandMapLayout {
  const activeTasks = tasks.filter(taskIsActive).length;
  const approvalQueue = tasks.filter(taskNeedsReview).length;
  const agentsReady = agents.filter((agent) => agent.status !== "offline").length;
  const qualityScore = tasks.length ? Math.max(72, Math.round(((tasks.length - approvalQueue) / tasks.length) * 100)) : 100;

  const departmentNodes = MASTER_DEPARTMENTS.map((def): RpgMapNode => {
    const scopedDepartments = departments.filter((department) => normalizeRpgDepartmentId(department.id) === def.key);
    const departmentIds = scopedDepartments
      .map((department) => department.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const scopedAgents = agents.filter(
      (agent) => typeof agent.department_id === "string" && departmentIds.includes(agent.department_id),
    );
    const scopedTasks = tasks.filter(
      (task) => typeof task.department_id === "string" && departmentIds.includes(task.department_id),
    );
    const watchCount = scopedTasks.filter(taskNeedsReview).length;
    return {
      id: def.key,
      kind: def.kind,
      label: def.label,
      subtitle: def.subtitle,
      x: def.x,
      y: def.y,
      w: def.w,
      h: def.h,
      accent: def.accent,
      status: statusFor(scopedTasks.filter(taskIsActive).length, watchCount),
      departmentIds,
      agents: scopedAgents,
      taskCount: scopedTasks.length,
    };
  });

  const operationsDepartments = departments.filter((department) => normalizeRpgDepartmentId(department.id) === "operations");
  const operationsDepartmentIds = operationsDepartments
    .map((department) => department.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const opsAgents = agents.filter(
    (agent) => typeof agent.department_id === "string" && operationsDepartmentIds.includes(agent.department_id),
  );

  const castleNode: RpgMapNode = {
    id: "castle",
    kind: "castle",
    label: "Root Control Castle",
    subtitle: "SDD 본성",
    x: 306,
    y: 214,
    w: 116,
    h: 96,
    accent: 0x22d3ee,
    status: activeTasks > 0 ? "active" : "idle",
    agents: [],
    taskCount: tasks.length,
  };

  const opsNode: RpgMapNode = {
    id: "ops",
    kind: "tower",
    label: "OPS Signal Tower",
    subtitle: "프로젝트 관제",
    x: 566,
    y: 48,
    w: 104,
    h: 118,
    accent: 0x14b8a6,
    status: activeTasks > 0 ? "active" : "idle",
    departmentIds: operationsDepartmentIds,
    agents: opsAgents,
    taskCount: activeTasks,
  };

  const memoryNode: RpgMapNode = {
    id: "memory",
    kind: "archive",
    label: "AgentMemory Archive",
    subtitle: "요약 기반 기억",
    x: 300,
    y: 54,
    w: 128,
    h: 82,
    accent: 0x818cf8,
    status: "idle",
    agents: [],
    taskCount: subAgents.length,
  };

  const routeNodes: RpgMapNode[] = ROUTE_STEPS.map((step) => ({
    id: step.id,
    kind: "route",
    label: step.label,
    subtitle: step.id === "route-control" || step.id === "route-review" ? "게이트" : "작전",
    x: step.x,
    y: step.y,
    w: 52,
    h: 34,
    accent: step.accent,
    status:
      step.id === "route-review" && approvalQueue > 0
        ? "watch"
        : step.id === "route-implement" && activeTasks > 0
          ? "active"
          : "idle",
    agents: [],
    taskCount: 0,
  }));

  const projectNodes: RpgMapNode[] = PROJECT_TERRITORIES.map((project) => ({
    id: `project-${project.key}`,
    kind: "territory",
    label: project.label,
    subtitle: project.subtitle,
    x: project.x,
    y: project.y,
    w: 104,
    h: 48,
    accent: project.accent,
    status: "idle",
    projectKey: project.key,
    agents: [],
    taskCount: 0,
  }));

  const cameraTargets: Record<RpgCommandMapMode, RpgCameraTarget> = {
    overview: {
      key: "overview",
      x: 360,
      y: 280,
      zoom: 1,
      focusNodeIds: ["castle", "ops", "memory", "planning", "development", "quality"],
    },
    pipeline: {
      key: "pipeline",
      x: 380,
      y: 248,
      zoom: 1.14,
      focusNodeIds: ["castle", "route-control", "route-spec", "route-explore", "route-implement", "route-review", "route-ops"],
    },
    build: {
      key: "build",
      x: 360,
      y: 385,
      zoom: 1.24,
      focusNodeIds: ["development", "route-implement"],
    },
    review: {
      key: "review",
      x: 502,
      y: 360,
      zoom: 1.22,
      focusNodeIds: ["quality", "route-review"],
    },
    ops: {
      key: "ops",
      x: 580,
      y: 230,
      zoom: 1.14,
      focusNodeIds: ["ops", "project-BloggerGent", "project-DonggriCompany", "project-JasoSul", "route-ops"],
    },
    memory: {
      key: "memory",
      x: 360,
      y: 120,
      zoom: 1.26,
      focusNodeIds: ["memory", "castle"],
    },
  };

  const hudPanels: Record<RpgCommandMapMode, RpgHudPanel> = {
    overview: {
      eyebrow: "왕국 현황",
      title: "Dongri-grigri 작전 지도",
      body: "성, 길드, 작전로, 관제탑, 영지가 한 화면에서 움직이는 운영 게임 화면입니다.",
      primary: "Control Plane 열기",
      stats: [
        { label: "진행", value: compactCount(activeTasks), tone: "cyan" },
        { label: "승인", value: compactCount(approvalQueue), tone: approvalQueue ? "amber" : "green" },
        { label: "요원", value: compactCount(agentsReady), tone: "green" },
      ],
    },
    pipeline: {
      eyebrow: "SDD 작전로",
      title: "승인에서 handoff까지",
      body: "CONTROL부터 OPS까지 이어지는 길을 따라 현재 업무 흐름과 증거 게이트를 확인합니다.",
      primary: "작업판 열기",
      secondary: "Control Plane 열기",
      stats: [
        { label: "단계", value: "6", tone: "cyan" },
        { label: "검토", value: compactCount(approvalQueue), tone: approvalQueue ? "amber" : "green" },
      ],
    },
    build: {
      eyebrow: "개발 대장간",
      title: "구현 작전 집중",
      body: "개발 길드와 구현 작전로를 확대합니다. 승인된 task와 repo-map 안에서만 작업이 진행됩니다.",
      primary: "작업판 열기",
      stats: [
        { label: "구현", value: compactCount(departmentNodes.find((node) => node.id === "development")?.taskCount ?? 0), tone: "green" },
        { label: "진행", value: compactCount(activeTasks), tone: "cyan" },
      ],
    },
    review: {
      eyebrow: "품질 성채",
      title: "리뷰 게이트 확인",
      body: "품질 성채와 검토 게이트를 확대해 승인 대기, 품질 경고, evidence 상태를 확인합니다.",
      primary: "Control Plane 열기",
      stats: [
        { label: "품질", value: `${qualityScore}%`, tone: qualityScore >= 90 ? "green" : "amber" },
        { label: "대기", value: compactCount(approvalQueue), tone: approvalQueue ? "amber" : "green" },
      ],
    },
    ops: {
      eyebrow: "OPS 관제탑",
      title: "작은 탑과 프로젝트 영지",
      body: "OPS는 큰 층이 아니라 신호탑입니다. 주변 영지 깃발로 프로젝트 scope를 감시합니다.",
      primary: "프로젝트 scope 열기",
      secondary: "Control Plane 열기",
      stats: [
        { label: "영지", value: "3", tone: "cyan" },
        { label: "운영", value: compactCount(activeTasks), tone: "green" },
      ],
    },
    memory: {
      eyebrow: "기억 보관소",
      title: "승인 기반 기억",
      body: "raw 기록이 아니라 scope, 요약, evidence가 붙은 기억만 안전하게 연결하는 구역입니다.",
      primary: "메모리 패널 열기",
      stats: [
        { label: "모드", value: "안전", tone: "green" },
        { label: "요약", value: "승인", tone: "cyan" },
      ],
    },
  };

  return {
    mode,
    world: { width: 720, height: 560 },
    commands: RPG_COMMAND_ACTIONS,
    nodes: [castleNode, memoryNode, opsNode, ...routeNodes, ...departmentNodes, ...projectNodes],
    departmentNodes,
    routeNodes,
    projectNodes,
    castleNode,
    opsNode,
    memoryNode,
    camera: cameraTargets[mode],
    hud: hudPanels[mode],
    metrics: {
      activeTasks,
      approvalQueue,
      qualityScore,
      memoryMode: "안전",
      projectScopes: projectNodes.length,
      agentsReady,
    },
  };
}
