import type { Agent, MeetingPresence, SubAgent, Task } from "../../types";

export type OfficeOperationalState =
  | "assigned"
  | "meeting"
  | "reviewing"
  | "operating"
  | "learning"
  | "break"
  | "offline"
  | "available";

export type OfficeOpsTone = "green" | "cyan" | "amber" | "rose" | "violet" | "slate";

export interface OfficeAgentOpsState {
  agentId: string;
  state: OfficeOperationalState;
  label: string;
  shortLabel: string;
  tone: OfficeOpsTone;
  taskCount: number;
  primaryTaskTitle?: string;
}

export interface OfficeOpsLiveRow {
  id: string;
  label: string;
  detail: string;
  tone: OfficeOpsTone;
}

export interface OfficeOpsDashboardSnapshot {
  counts: {
    waiting: number;
    active: number;
    review: number;
    done: number;
    assignedAgents: number;
    meetingAgents: number;
    opsAgents: number;
    learningAgents: number;
    breakAgents: number;
    offlineAgents: number;
    activeSubAgents: number;
  };
  agentStates: Record<string, OfficeAgentOpsState>;
  liveRows: OfficeOpsLiveRow[];
}

const TASK_STATUS_LABELS: Record<Task["status"], string> = {
  inbox: "접수",
  pending: "승인 대기",
  planned: "계획",
  collaborating: "협업 중",
  in_progress: "진행 중",
  review: "검토 대기",
  done: "완료",
  cancelled: "취소",
};

const WAITING_STATUSES = new Set<Task["status"]>(["inbox", "pending", "planned"]);
const ACTIVE_STATUSES = new Set<Task["status"]>(["collaborating", "in_progress"]);

function normalizeDepartmentId(id: string | null | undefined): string {
  if (!id) return "";
  if (id === "development") return "dev";
  if (id === "quality") return "qa";
  if (id === "ops") return "operations";
  if (id === "instructor") return "strategic_maintenance";
  return id;
}

function isOpsDepartment(departmentId: string | null | undefined): boolean {
  const normalized = normalizeDepartmentId(departmentId);
  return normalized === "operations" || normalized === "devsecops";
}

function isStudyDepartment(departmentId: string | null | undefined): boolean {
  return normalizeDepartmentId(departmentId) === "strategic_maintenance";
}

function isLiveMeeting(row: MeetingPresence | undefined, now: number): row is MeetingPresence {
  return Boolean(row && row.until > now);
}

function agentName(agent: Agent): string {
  return agent.name_ko || agent.name || agent.id;
}

function tasksForAgent(agent: Agent, tasks: Task[]): Task[] {
  return tasks.filter((task) => task.assigned_agent_id === agent.id || task.id === agent.current_task_id);
}

function pickPrimaryTask(agentTasks: Task[]): Task | undefined {
  return (
    agentTasks.find((task) => task.status === "review") ??
    agentTasks.find((task) => ACTIVE_STATUSES.has(task.status)) ??
    agentTasks.find((task) => WAITING_STATUSES.has(task.status)) ??
    agentTasks[0]
  );
}

function deriveAgentState(params: {
  agent: Agent;
  agentTasks: Task[];
  meeting?: MeetingPresence;
}): OfficeAgentOpsState {
  const { agent, agentTasks, meeting } = params;
  const primaryTask = pickPrimaryTask(agentTasks);
  if (agent.status === "offline") {
    return {
      agentId: agent.id,
      state: "offline",
      label: "오프라인",
      shortLabel: "자리 비움",
      tone: "slate",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask?.title,
    };
  }
  if (agent.status === "break") {
    return {
      agentId: agent.id,
      state: "break",
      label: "휴식 중",
      shortLabel: "휴식",
      tone: "amber",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask?.title,
    };
  }
  if (meeting) {
    return {
      agentId: agent.id,
      state: "meeting",
      label: meeting.phase === "review" ? "리뷰 회의 중" : "착수 회의 중",
      shortLabel: "회의",
      tone: "amber",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask?.title,
    };
  }
  if (primaryTask?.status === "review") {
    return {
      agentId: agent.id,
      state: "reviewing",
      label: "검토 대기",
      shortLabel: "검토",
      tone: "rose",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask.title,
    };
  }
  if (isOpsDepartment(agent.department_id)) {
    return {
      agentId: agent.id,
      state: "operating",
      label: "운영 감시",
      shortLabel: "운영",
      tone: "green",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask?.title,
    };
  }
  if (agent.status === "working" || primaryTask) {
    return {
      agentId: agent.id,
      state: "assigned",
      label: primaryTask ? `${TASK_STATUS_LABELS[primaryTask.status]} 업무` : "작업 배정",
      shortLabel: "작업",
      tone: "cyan",
      taskCount: agentTasks.length,
      primaryTaskTitle: primaryTask?.title,
    };
  }
  if (isStudyDepartment(agent.department_id) || agent.status === "idle") {
    return {
      agentId: agent.id,
      state: "learning",
      label: "학습 준비",
      shortLabel: "학습",
      tone: "violet",
      taskCount: agentTasks.length,
    };
  }
  return {
    agentId: agent.id,
    state: "available",
    label: "대기 중",
    shortLabel: "대기",
    tone: "slate",
    taskCount: agentTasks.length,
  };
}

function rowForTask(task: Task): OfficeOpsLiveRow {
  const isReview = task.status === "review";
  const isActive = ACTIVE_STATUSES.has(task.status);
  return {
    id: `task-${task.id}`,
    label: TASK_STATUS_LABELS[task.status],
    detail: task.title,
    tone: isReview ? "rose" : isActive ? "green" : WAITING_STATUSES.has(task.status) ? "amber" : "slate",
  };
}

export function deriveOfficeOpsDashboardSnapshot(params: {
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  meetingPresence?: MeetingPresence[];
  now?: number;
}): OfficeOpsDashboardSnapshot {
  const { agents, tasks, subAgents, meetingPresence = [], now = Date.now() } = params;
  const liveMeetingByAgent = new Map(
    meetingPresence.filter((row) => isLiveMeeting(row, now)).map((row) => [row.agent_id, row]),
  );
  const agentStates: Record<string, OfficeAgentOpsState> = {};

  for (const agent of agents) {
    agentStates[agent.id] = deriveAgentState({
      agent,
      agentTasks: tasksForAgent(agent, tasks),
      meeting: liveMeetingByAgent.get(agent.id),
    });
  }

  const priorityTasks = [
    ...tasks.filter((task) => task.status === "review"),
    ...tasks.filter((task) => ACTIVE_STATUSES.has(task.status)),
    ...tasks.filter((task) => WAITING_STATUSES.has(task.status)),
  ];
  const liveRows = priorityTasks.slice(0, 4).map(rowForTask);

  for (const meeting of meetingPresence.filter((row) => isLiveMeeting(row, now)).slice(0, 2)) {
    const agent = agents.find((candidate) => candidate.id === meeting.agent_id);
    liveRows.push({
      id: `meeting-${meeting.agent_id}-${meeting.task_id ?? "none"}`,
      label: meeting.phase === "review" ? "리뷰 회의" : "착수 회의",
      detail: agent ? `${agentName(agent)} 참석 중` : "회의 참석자 확인 중",
      tone: "amber",
    });
  }

  if (subAgents.some((subAgent) => subAgent.status === "working")) {
    liveRows.push({
      id: "subagents-working",
      label: "분신 작업",
      detail: `${subAgents.filter((subAgent) => subAgent.status === "working").length}개 보조 흐름 실행 중`,
      tone: "cyan",
    });
  }

  return {
    counts: {
      waiting: tasks.filter((task) => WAITING_STATUSES.has(task.status)).length,
      active: tasks.filter((task) => ACTIVE_STATUSES.has(task.status)).length,
      review: tasks.filter((task) => task.status === "review").length,
      done: tasks.filter((task) => task.status === "done").length,
      assignedAgents: Object.values(agentStates).filter((state) => state.state === "assigned").length,
      meetingAgents: Object.values(agentStates).filter((state) => state.state === "meeting").length,
      opsAgents: Object.values(agentStates).filter((state) => state.state === "operating").length,
      learningAgents: Object.values(agentStates).filter((state) => state.state === "learning").length,
      breakAgents: Object.values(agentStates).filter((state) => state.state === "break").length,
      offlineAgents: Object.values(agentStates).filter((state) => state.state === "offline").length,
      activeSubAgents: subAgents.filter((subAgent) => subAgent.status === "working").length,
    },
    agentStates,
    liveRows: liveRows.slice(0, 6),
  };
}

export function officeOpsToneColor(tone: OfficeOpsTone): number {
  if (tone === "green") return 0x22c55e;
  if (tone === "cyan") return 0x38bdf8;
  if (tone === "amber") return 0xf59e0b;
  if (tone === "rose") return 0xfb7185;
  if (tone === "violet") return 0xa78bfa;
  return 0x94a3b8;
}
