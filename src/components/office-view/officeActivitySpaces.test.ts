import { describe, expect, it } from "vitest";
import type { Agent, MeetingPresence, Task } from "../../types";
import { countOfficeActivitySignals, deriveOfficeAgentActivityPlacements } from "./officeActivitySpaces";
import { getRoleSpaceWorkplaceDensity } from "./officeWorkplaceDensity";

function agent(id: string, departmentId: string, status: Agent["status"], currentTaskId: string | null = null): Agent {
  return {
    id,
    name: id,
    name_ko: id,
    department_id: departmentId,
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "AG",
    personality: null,
    status,
    current_task_id: currentTaskId,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 0,
  };
}

function task(id: string, assignedAgentId: string | null, status: Task["status"]): Task {
  return {
    id,
    title: id,
    description: null,
    department_id: "development",
    assigned_agent_id: assignedAgentId,
    status,
    priority: 2,
    task_type: "development",
    project_path: null,
    result: null,
    started_at: null,
    completed_at: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe("office role activity spaces", () => {
  it("derives visual activity modes from existing API state without persistent DB fields", () => {
    const now = Date.now();
    const agents = [
      agent("meeting-agent", "planning", "working"),
      agent("work-agent", "development", "working", "task-work"),
      agent("ops-agent", "operations", "idle"),
      agent("study-agent", "instructor", "idle"),
      agent("break-agent", "design", "break"),
      agent("offline-agent", "quality", "offline"),
    ];
    const tasks = [task("task-work", "work-agent", "in_progress")];
    const meetingPresence: MeetingPresence[] = [
      {
        agent_id: "meeting-agent",
        seat_index: 0,
        phase: "review",
        task_id: "task-work",
        until: now + 30_000,
      },
    ];

    const placements = deriveOfficeAgentActivityPlacements({ agents, tasks, meetingPresence, now });
    expect(placements.map((placement) => [placement.agent.id, placement.mode, placement.spaceId])).toEqual([
      ["meeting-agent", "meeting", "meeting-room"],
      ["work-agent", "work", "work-bay"],
      ["ops-agent", "ops", "ops-corner"],
      ["study-agent", "study", "study-room"],
      ["break-agent", "break", "break-room"],
      ["offline-agent", "offline", null],
    ]);

    const signals = countOfficeActivitySignals({
      placements,
      subAgents: [{ id: "sub-1", parentAgentId: "work-agent", task: "helper", status: "working" }],
    });
    expect(signals).toMatchObject({ work: 1, meeting: 1, ops: 1, study: 1, break: 1, offline: 1, activeSubAgents: 1 });
    expect(getRoleSpaceWorkplaceDensity("work-bay").density).toBe("dense");
    expect(getRoleSpaceWorkplaceDensity("ops-corner").density).toBe("control");
  });
});
