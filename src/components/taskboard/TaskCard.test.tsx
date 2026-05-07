import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, CeoOfficeCall, CrossDeptDelivery, Department, MeetingPresence, Task } from "../../types";
import TaskCard from "./TaskCard";

const department: Department = {
  id: "design",
  name: "Design",
  name_ko: "Design",
  icon: "D",
  color: "#38bdf8",
  description: null,
  prompt: null,
  sort_order: 1,
  created_at: 1,
};

const agents: Agent[] = [
  {
    id: "agent-design",
    name: "Design Lead",
    name_ko: "Design Lead",
    department_id: "design",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "D",
    sprite_number: 1,
    personality: null,
    status: "working",
    current_task_id: "task-design",
    stats_tasks_done: 3,
    stats_xp: 120,
    created_at: 1,
  },
  {
    id: "agent-dev",
    name: "Dev Senior",
    name_ko: "Dev Senior",
    department_id: "dev",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "V",
    sprite_number: 2,
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 4,
    stats_xp: 140,
    created_at: 1,
  },
];

const task: Task = {
  id: "task-design",
  title: "Design workbench validation",
  description: "Check component operating flow.",
  department_id: "design",
  assigned_agent_id: "agent-design",
  status: "in_progress",
  priority: 4,
  task_type: "design",
  workflow_pack_key: "donggri",
  workflow_meta_json: JSON.stringify({
    goal_command: "design",
    team_preset: "design_delivery",
    workflow_pack_key: "donggri",
    slash_command: "/dg-design",
    required_departments: ["pmo", "design", "dev"],
    verification_gates: ["visual_spec", "accessibility_notes"],
  }),
  required_artifacts_json: JSON.stringify(["docs/QUALITY_LOG.md"]),
  approval_gate_state_json: JSON.stringify({
    gates: ["visual_spec"],
    blockedBy: ["visual_spec"],
  }),
  project_path: null,
  result: null,
  started_at: null,
  completed_at: null,
  created_at: 10,
  updated_at: 20,
  recent_logs: [
    {
      id: 1,
      task_id: "task-design",
      kind: "agent",
      message: "latest task log",
      created_at: 20,
    },
  ],
};

const meetingPresence: MeetingPresence[] = [
  {
    agent_id: "agent-design",
    seat_index: 0,
    phase: "review",
    task_id: "task-design",
    decision: "approved",
    until: 30,
  },
];

const ceoOfficeCalls: CeoOfficeCall[] = [
  {
    id: "call-1",
    fromAgentId: "agent-design",
    seatIndex: 0,
    phase: "review",
    action: "speak",
    line: "review call",
    taskId: "task-design",
  },
];

const crossDeptDeliveries: CrossDeptDelivery[] = [
  {
    id: "delivery-1",
    fromAgentId: "agent-design",
    toAgentId: "agent-dev",
  },
];

describe("TaskCard", () => {
  it("renders compact operations metadata for goal command, gates, timeline, and logs", () => {
    render(
      <TaskCard
        task={task}
        agents={agents}
        departments={[department]}
        taskSubtasks={[]}
        meetingPresence={meetingPresence}
        ceoOfficeCalls={ceoOfficeCalls}
        crossDeptDeliveries={crossDeptDeliveries}
        onUpdateTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onAssignTask={vi.fn()}
        onRunTask={vi.fn()}
        onStopTask={vi.fn()}
      />,
    );

    expect(screen.getByText("/dg-design")).toBeInTheDocument();
    expect(screen.getByText("pmo, design, dev")).toBeInTheDocument();
    expect(screen.getByText("visual spec")).toBeInTheDocument();
    expect(screen.getByText("accessibility notes")).toBeInTheDocument();
    expect(screen.getByText("docs/QUALITY_LOG.md")).toBeInTheDocument();
    expect(screen.getByText("latest task log")).toBeInTheDocument();
    expect(screen.getByText("review call")).toBeInTheDocument();
    expect(screen.getByText("Design Lead -> Dev Senior")).toBeInTheDocument();
  });
});
