import type { Agent, MeetingPresence, SubAgent, Task } from "../../types";
import type { SharedFacilityLayout } from "./officeFloorPlan";

export type OfficeActivityMode = "work" | "meeting" | "ops" | "study" | "break" | "idle" | "offline";

export type OfficeRoleSpaceId =
  | "work-bay"
  | "meeting-room"
  | "ops-corner"
  | "study-room"
  | "memory-archive"
  | "break-room";

export interface OfficeRoleSpaceLayout {
  id: OfficeRoleSpaceId;
  label: string;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: number;
}

export interface OfficeAgentActivityPlacement {
  agent: Agent;
  mode: OfficeActivityMode;
  spaceId: OfficeRoleSpaceId | null;
  taskCount: number;
  meetingPhase?: MeetingPresence["phase"];
}

export interface OfficeActivitySignals {
  work: number;
  meeting: number;
  ops: number;
  study: number;
  break: number;
  offline: number;
  activeSubAgents: number;
}

export const OFFICE_ROLE_SPACE_LABELS: Record<OfficeRoleSpaceId, { label: string; caption: string; accent: number }> = {
  "work-bay": { label: "업무 좌석", caption: "진행 업무와 구현 대기열", accent: 0x38bdf8 },
  "meeting-room": { label: "회의실", caption: "안건, 리뷰, 승인 대화", accent: 0xf59e0b },
  "ops-corner": { label: "운영 코너", caption: "작은 관제 데스크와 프로젝트 보드", accent: 0x22c55e },
  "study-room": { label: "학습실", caption: "자료 학습과 외부강사 세션", accent: 0xa78bfa },
  "memory-archive": { label: "기억 서고", caption: "승인 기반 기억 준비", accent: 0x60a5fa },
  "break-room": { label: "휴게 구역", caption: "잠깐 멈추고 회복", accent: 0xf97316 },
};

const WORK_STATUSES = new Set<Task["status"]>(["collaborating", "in_progress"]);
const WAITING_STATUSES = new Set<Task["status"]>(["inbox", "pending", "planned"]);

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

function countAgentTasks(agent: Agent, tasks: Task[]): number {
  return tasks.filter((task) => task.assigned_agent_id === agent.id || task.id === agent.current_task_id).length;
}

function hasActiveWork(agent: Agent, tasks: Task[]): boolean {
  return tasks.some(
    (task) =>
      (task.assigned_agent_id === agent.id || task.id === agent.current_task_id) &&
      (WORK_STATUSES.has(task.status) || WAITING_STATUSES.has(task.status)),
  );
}

export function deriveOfficeAgentActivityPlacements(params: {
  agents: Agent[];
  tasks: Task[];
  meetingPresence?: MeetingPresence[];
  now?: number;
}): OfficeAgentActivityPlacement[] {
  const { agents, tasks, meetingPresence = [], now = Date.now() } = params;
  const liveMeetingByAgent = new Map(
    meetingPresence.filter((row) => isLiveMeeting(row, now)).map((row) => [row.agent_id, row]),
  );

  return agents.map((agent) => {
    const meeting = liveMeetingByAgent.get(agent.id);
    const taskCount = countAgentTasks(agent, tasks);
    if (agent.status === "offline") return { agent, mode: "offline", spaceId: null, taskCount };
    if (agent.status === "break") return { agent, mode: "break", spaceId: "break-room", taskCount };
    if (meeting) {
      return {
        agent,
        mode: "meeting",
        spaceId: "meeting-room",
        taskCount,
        meetingPhase: meeting.phase,
      };
    }
    if (isOpsDepartment(agent.department_id)) return { agent, mode: "ops", spaceId: "ops-corner", taskCount };
    if (agent.status === "working" || hasActiveWork(agent, tasks)) {
      return { agent, mode: "work", spaceId: "work-bay", taskCount };
    }
    if (isStudyDepartment(agent.department_id) || agent.status === "idle") {
      return { agent, mode: "study", spaceId: "study-room", taskCount };
    }
    return { agent, mode: "idle", spaceId: "work-bay", taskCount };
  });
}

export function countOfficeActivitySignals(params: {
  placements: OfficeAgentActivityPlacement[];
  subAgents: SubAgent[];
}): OfficeActivitySignals {
  const { placements, subAgents } = params;
  return {
    work: placements.filter((placement) => placement.mode === "work").length,
    meeting: placements.filter((placement) => placement.mode === "meeting").length,
    ops: placements.filter((placement) => placement.mode === "ops").length,
    study: placements.filter((placement) => placement.mode === "study").length,
    break: placements.filter((placement) => placement.mode === "break").length,
    offline: placements.filter((placement) => placement.mode === "offline").length,
    activeSubAgents: subAgents.filter((subAgent) => subAgent.status === "working").length,
  };
}

export function resolveFacilityRoleSpace(facility: SharedFacilityLayout): OfficeRoleSpaceId | null {
  if (facility.id === "memory") return "memory-archive";
  if (facility.id === "break") return "break-room";
  return null;
}
