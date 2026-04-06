// ─── Agent & Employee ───────────────────────────────────────────────
export type AgentStatus = "idle" | "working" | "break" | "meeting";

export type Agent = {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  status: AgentStatus;
  spriteNumber: number | null;
  avatarEmoji: string | null;
  statsXp: number;
  statsTasksDone: number;
  createdAt: string;
  updatedAt: string;
};

export type Department = {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskStatus = "inbox" | "planned" | "in_progress" | "review" | "done";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  departmentId: string | null;
  assignedAgentId: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type CompanyStats = {
  agents: { total: number; working: number; idle: number };
  tasks: {
    total: number;
    done: number;
    in_progress: number;
    planned: number;
    review: number;
    completion_rate: number;
  };
  topAgents: Array<{ id: string; name: string; statsXp: number; statsTasksDone: number }>;
  tasksByDepartment: Array<{
    id: string;
    name: string;
    icon: string;
    totalTasks: number;
    doneTasks: number;
  }>;
};

export type WsMessage =
  | { type: "agents_updated"; agents: Agent[] }
  | { type: "tasks_updated"; tasks: Task[] }
  | { type: "stats_updated"; stats: CompanyStats }
  | { type: "agent_status"; agentId: string; status: AgentStatus }
  | { type: "ping" }
  | { type: "pong" };

export type AgentsListResponse = { ok: true; agents: Agent[] };
export type DepartmentsListResponse = { ok: true; departments: Department[] };
export type TasksListResponse = { ok: true; tasks: Task[] };
export type StatsResponse = { ok: true; stats: CompanyStats };
