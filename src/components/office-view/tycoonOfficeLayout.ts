import type { Agent, Department, SubAgent, Task } from "../../types";

export type TycoonMapMode = "overview" | "pipeline" | "build" | "review" | "ops" | "memory";

export type TycoonBuildingId =
  | "intake"
  | "planning"
  | "design"
  | "development"
  | "quality"
  | "operations"
  | "instructor"
  | "memory";

export type TycoonBuildingKind = "gate" | "guild" | "studio" | "forge" | "keep" | "tower" | "academy" | "archive";

export type TycoonWorkStatus = "waiting" | "working" | "approval" | "review" | "done" | "blocked";

export interface TycoonBuilding {
  id: TycoonBuildingId;
  kind: TycoonBuildingKind;
  label: string;
  shortLabel: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: number;
  status: "idle" | "active" | "watch";
  departmentIds: string[];
  agents: Agent[];
  tasks: Task[];
}

export interface TycoonProjectDock {
  id: string;
  projectKey: string;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: number;
  status: "idle" | "active" | "watch";
}

export interface TycoonWorkToken {
  id: string;
  label: string;
  status: TycoonWorkStatus;
  taskTitle: string;
  x: number;
  y: number;
  laneIndex: number;
  accent: number;
  buildingId: TycoonBuildingId;
}

export interface TycoonCameraTarget {
  key: TycoonMapMode;
  x: number;
  y: number;
  zoom: number;
  focusIds: string[];
}

export interface TycoonHudPanel {
  eyebrow: string;
  title: string;
  body: string;
  primary: string;
  secondary?: string;
  stats: Array<{ label: string; value: string; tone: "cyan" | "green" | "amber" | "rose" }>;
}

export interface TycoonCommand {
  mode: TycoonMapMode;
  label: string;
  shortLabel: string;
}

export interface TycoonOfficeLayout {
  mode: TycoonMapMode;
  world: { width: number; height: number };
  commands: TycoonCommand[];
  buildings: TycoonBuilding[];
  departmentBuildings: TycoonBuilding[];
  projectDocks: TycoonProjectDock[];
  workTokens: TycoonWorkToken[];
  camera: TycoonCameraTarget;
  hud: TycoonHudPanel;
  metrics: {
    activeTasks: number;
    waitingTasks: number;
    reviewTasks: number;
    completedTasks: number;
    qualityScore: number;
    memoryMode: string;
    projectScopes: number;
    agentsReady: number;
  };
}

export const TYCOON_COMMANDS: TycoonCommand[] = [
  { mode: "overview", label: "요약", shortLabel: "전체" },
  { mode: "pipeline", label: "업무 흐름", shortLabel: "라인" },
  { mode: "build", label: "구현", shortLabel: "제작" },
  { mode: "review", label: "검토", shortLabel: "품질" },
  { mode: "ops", label: "운영", shortLabel: "관제" },
  { mode: "memory", label: "기억", shortLabel: "보관" },
];

const BUILDING_DEFS: Array<
  Omit<TycoonBuilding, "status" | "departmentIds" | "agents" | "tasks"> & { aliases: string[] }
> = [
  {
    id: "intake",
    aliases: [],
    kind: "gate",
    label: "업무 접수구",
    shortLabel: "접수",
    subtitle: "새 요청과 승인 대기",
    x: 58,
    y: 250,
    w: 108,
    h: 88,
    accent: 0x67e8f9,
  },
  {
    id: "planning",
    aliases: ["planning", "plan", "strategy"],
    kind: "guild",
    label: "기획 길드",
    shortLabel: "기획",
    subtitle: "요구사항과 범위 정리",
    x: 206,
    y: 104,
    w: 128,
    h: 96,
    accent: 0x38bdf8,
  },
  {
    id: "design",
    aliases: ["design"],
    kind: "studio",
    label: "디자인 공방",
    shortLabel: "디자인",
    subtitle: "화면 감각과 사용성",
    x: 210,
    y: 382,
    w: 132,
    h: 94,
    accent: 0xf472b6,
  },
  {
    id: "development",
    aliases: ["development", "dev", "engineering"],
    kind: "forge",
    label: "개발 대장간",
    shortLabel: "개발",
    subtitle: "승인된 구현 제작",
    x: 396,
    y: 356,
    w: 150,
    h: 110,
    accent: 0x22c55e,
  },
  {
    id: "quality",
    aliases: ["quality", "qa", "review"],
    kind: "keep",
    label: "품질 성채",
    shortLabel: "품질",
    subtitle: "검토와 게이트",
    x: 572,
    y: 236,
    w: 132,
    h: 100,
    accent: 0xf59e0b,
  },
  {
    id: "operations",
    aliases: ["operations", "ops"],
    kind: "tower",
    label: "OPS 관제탑",
    shortLabel: "OPS",
    subtitle: "프로젝트 scope 관찰",
    x: 596,
    y: 86,
    w: 96,
    h: 118,
    accent: 0x14b8a6,
  },
  {
    id: "instructor",
    aliases: ["instructor", "external-instructor", "trainer"],
    kind: "academy",
    label: "외부강사 아카데미",
    shortLabel: "강사",
    subtitle: "스킬과 운영 가이드",
    x: 384,
    y: 88,
    w: 136,
    h: 96,
    accent: 0xa78bfa,
  },
  {
    id: "memory",
    aliases: [],
    kind: "archive",
    label: "Memory 서고",
    shortLabel: "기억",
    subtitle: "요약과 evidence 보관",
    x: 70,
    y: 392,
    w: 112,
    h: 92,
    accent: 0x818cf8,
  },
];

const PROJECT_DOCKS = [
  { projectKey: "BloggerGent", label: "BloggerGent", subtitle: "발행 운영", x: 704, y: 94, accent: 0x14b8a6 },
  { projectKey: "DonggriCompany", label: "DonggriCompany", subtitle: "운영실 본체", x: 704, y: 174, accent: 0x38bdf8 },
  { projectKey: "JasoSul", label: "JasoSul", subtitle: "작성 도구", x: 704, y: 254, accent: 0xf97316 },
];

export function normalizeTycoonDepartmentId(id: string | null | undefined): string {
  const normalized = String(id ?? "").trim().toLowerCase();
  if (!normalized) return "intake";
  for (const def of BUILDING_DEFS) {
    if (def.aliases.includes(normalized)) return def.id;
  }
  return normalized;
}

function statusForTask(task: Task): TycoonWorkStatus {
  if (task.status === "done") return "done";
  if (task.status === "review") return "review";
  if (task.status === "pending") return "approval";
  if (task.status === "cancelled") return "blocked";
  if (task.status === "in_progress" || task.status === "collaborating") return "working";
  return "waiting";
}

function isActive(status: TycoonWorkStatus): boolean {
  return status === "working" || status === "approval" || status === "review";
}

function isWatch(status: TycoonWorkStatus): boolean {
  return status === "approval" || status === "review" || status === "blocked";
}

function compactCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

function buildingStatus(tasks: Task[]): TycoonBuilding["status"] {
  const statuses = tasks.map(statusForTask);
  if (statuses.some(isWatch)) return "watch";
  if (statuses.some(isActive)) return "active";
  return "idle";
}

function scoreFromTasks(tasks: Task[]): number {
  if (tasks.length === 0) return 100;
  const penalties = tasks.reduce((score, task) => {
    const status = statusForTask(task);
    if (status === "blocked") return score + 16;
    if (status === "approval" || status === "review") return score + 8;
    if (status === "waiting") return score + 3;
    return score;
  }, 0);
  return Math.max(64, Math.min(100, 100 - penalties));
}

function taskBuildingId(task: Task): TycoonBuildingId {
  const normalized = normalizeTycoonDepartmentId(task.department_id);
  if (normalized === "planning") return "planning";
  if (normalized === "design") return "design";
  if (normalized === "development") return "development";
  if (normalized === "quality") return "quality";
  if (normalized === "operations") return "operations";
  if (normalized === "instructor") return "instructor";
  return "intake";
}

function makeWorkTokens(tasks: Task[], buildings: TycoonBuilding[]): TycoonWorkToken[] {
  const byBuilding = new Map(buildings.map((building) => [building.id, building]));
  return tasks.slice(0, 18).map((task, index) => {
    const status = statusForTask(task);
    const buildingId = status === "done" ? "memory" : taskBuildingId(task);
    const building = byBuilding.get(buildingId) ?? byBuilding.get("intake");
    const laneIndex = index % 5;
    const stack = Math.floor(index / 5);
    const x = (building?.x ?? 80) + 16 + laneIndex * 17;
    const y = (building?.y ?? 250) + (buildingId === "memory" ? 20 : (building?.h ?? 80) + 14 + stack * 12);
    return {
      id: task.id,
      label: status === "review" ? "검" : status === "approval" ? "승" : status === "done" ? "완" : status === "blocked" ? "막" : "일",
      status,
      taskTitle: task.title,
      x,
      y,
      laneIndex,
      accent: building?.accent ?? 0x67e8f9,
      buildingId,
    };
  });
}

export function buildTycoonOfficeLayout({
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
  mode: TycoonMapMode;
}): TycoonOfficeLayout {
  const buildings = BUILDING_DEFS.map((def): TycoonBuilding => {
    const departmentIds = departments
      .filter((department) => normalizeTycoonDepartmentId(department.id) === def.id)
      .map((department) => department.id);
    const stationTasks =
      def.id === "intake"
        ? tasks.filter((task) => taskBuildingId(task) === "intake" && statusForTask(task) !== "done")
        : def.id === "memory"
          ? tasks.filter((task) => statusForTask(task) === "done")
          : tasks.filter((task) => taskBuildingId(task) === def.id && statusForTask(task) !== "done");
    const stationAgents = agents.filter(
      (agent) => typeof agent.department_id === "string" && departmentIds.includes(agent.department_id),
    );
    return {
      ...def,
      departmentIds,
      agents: stationAgents,
      tasks: stationTasks,
      status: def.id === "memory" && subAgents.length > 0 ? "active" : buildingStatus(stationTasks),
    };
  });

  const workTokens = makeWorkTokens(tasks, buildings);
  const activeTasks = workTokens.filter((token) => token.status === "working").length;
  const waitingTasks = workTokens.filter((token) => token.status === "waiting" || token.status === "approval").length;
  const reviewTasks = workTokens.filter((token) => token.status === "review" || token.status === "blocked").length;
  const completedTasks = tasks.filter((task) => statusForTask(task) === "done").length;
  const agentsReady = agents.filter((agent) => agent.status !== "offline").length;
  const qualityScore = scoreFromTasks(tasks);

  const projectDocks: TycoonProjectDock[] = PROJECT_DOCKS.map((dock) => ({
    id: `project-${dock.projectKey}`,
    projectKey: dock.projectKey,
    label: dock.label,
    subtitle: dock.subtitle,
    x: dock.x,
    y: dock.y,
    w: 126,
    h: 52,
    accent: dock.accent,
    status: dock.projectKey === "DonggriCompany" && activeTasks > 0 ? "active" : "idle",
  }));

  const cameraTargets: Record<TycoonMapMode, TycoonCameraTarget> = {
    overview: {
      key: "overview",
      x: 440,
      y: 280,
      zoom: 1,
      focusIds: ["planning", "development", "quality", "operations", "memory"],
    },
    pipeline: {
      key: "pipeline",
      x: 378,
      y: 282,
      zoom: 1.12,
      focusIds: ["intake", "planning", "development", "quality", "operations", "memory"],
    },
    build: {
      key: "build",
      x: 462,
      y: 392,
      zoom: 1.28,
      focusIds: ["development"],
    },
    review: {
      key: "review",
      x: 628,
      y: 282,
      zoom: 1.28,
      focusIds: ["quality"],
    },
    ops: {
      key: "ops",
      x: 672,
      y: 182,
      zoom: 1.14,
      focusIds: ["operations", "project-BloggerGent", "project-DonggriCompany", "project-JasoSul"],
    },
    memory: {
      key: "memory",
      x: 132,
      y: 426,
      zoom: 1.3,
      focusIds: ["memory"],
    },
  };

  const hudPanels: Record<TycoonMapMode, TycoonHudPanel> = {
    overview: {
      eyebrow: "오피스 타이쿤",
      title: "작업장이 실제로 굴러가는 화면",
      body: "부서, 에이전트, 업무 티켓, 프로젝트 scope가 한 판에서 움직입니다. 숫자는 보조이고, 병목은 대기열과 상태등으로 먼저 보이게 합니다.",
      primary: "Control Plane 열기",
      stats: [
        { label: "진행", value: compactCount(activeTasks), tone: "cyan" },
        { label: "대기", value: compactCount(waitingTasks), tone: waitingTasks ? "amber" : "green" },
        { label: "요원", value: compactCount(agentsReady), tone: "green" },
      ],
    },
    pipeline: {
      eyebrow: "업무 라인",
      title: "접수에서 기억 보관까지",
      body: "업무 토큰이 접수구, 기획, 구현, 검토, 운영, 기억 서고로 흘러갑니다. 막히는 지점은 노란 게이트와 쌓인 토큰으로 표시합니다.",
      primary: "작업판 열기",
      secondary: "Control Plane 열기",
      stats: [
        { label: "흐름", value: "6", tone: "cyan" },
        { label: "검토", value: compactCount(reviewTasks), tone: reviewTasks ? "amber" : "green" },
        { label: "완료", value: compactCount(completedTasks), tone: "green" },
      ],
    },
    build: {
      eyebrow: "개발 대장간",
      title: "구현 대기열과 제작 상태",
      body: "개발 구역은 승인된 구현만 받습니다. 작업 토큰과 캐릭터 위치로 지금 무엇이 만들어지는지 바로 보이게 합니다.",
      primary: "작업판 열기",
      stats: [
        { label: "구현", value: compactCount(buildings.find((building) => building.id === "development")?.tasks.length ?? 0), tone: "green" },
        { label: "진행", value: compactCount(activeTasks), tone: "cyan" },
        { label: "품질", value: `${qualityScore}%`, tone: qualityScore >= 90 ? "green" : "amber" },
      ],
    },
    review: {
      eyebrow: "품질 성채",
      title: "리뷰와 승인 게이트",
      body: "품질 구역은 막힘, 검토 필요, 승인 대기를 따로 보여줍니다. 통과 전에는 운영이나 기억으로 넘어가지 않은 상태로 남습니다.",
      primary: "Control Plane 열기",
      stats: [
        { label: "검토", value: compactCount(reviewTasks), tone: reviewTasks ? "amber" : "green" },
        { label: "품질", value: `${qualityScore}%`, tone: qualityScore >= 90 ? "green" : "amber" },
        { label: "완료", value: compactCount(completedTasks), tone: "green" },
      ],
    },
    ops: {
      eyebrow: "OPS 관제탑",
      title: "작은 탑과 프로젝트 부두",
      body: "OPS는 큰 층을 차지하지 않습니다. 작은 관제탑이 프로젝트 scope 부두를 감시하고, 실제 구현은 승인된 작업으로 흘려보냅니다.",
      primary: "프로젝트 scope 열기",
      secondary: "Control Plane 열기",
      stats: [
        { label: "scope", value: String(projectDocks.length), tone: "cyan" },
        { label: "운영", value: compactCount(activeTasks), tone: "green" },
        { label: "대기", value: compactCount(waitingTasks), tone: waitingTasks ? "amber" : "green" },
      ],
    },
    memory: {
      eyebrow: "기억 서고",
      title: "승인 기반 기억 보관",
      body: "원문 로그가 아니라 scope, 요약, evidence가 붙은 기억만 안전하게 보관합니다. 완료된 토큰은 서고로 들어옵니다.",
      primary: "메모리 패널 열기",
      stats: [
        { label: "모드", value: "안전", tone: "green" },
        { label: "보관", value: compactCount(completedTasks), tone: "cyan" },
        { label: "요약", value: compactCount(subAgents.length), tone: "green" },
      ],
    },
  };

  const departmentBuildings = buildings.filter((building) =>
    ["planning", "design", "development", "quality", "operations", "instructor"].includes(building.id),
  );

  return {
    mode,
    world: { width: 860, height: 560 },
    commands: TYCOON_COMMANDS,
    buildings,
    departmentBuildings,
    projectDocks,
    workTokens,
    camera: cameraTargets[mode],
    hud: hudPanels[mode],
    metrics: {
      activeTasks,
      waitingTasks,
      reviewTasks,
      completedTasks,
      qualityScore,
      memoryMode: "안전",
      projectScopes: projectDocks.length,
      agentsReady,
    },
  };
}
