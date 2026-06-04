import { describe, expect, it } from "vitest";
import type { Agent, MeetingPresence, Task } from "../../types";
import { deriveOfficeOpsDashboardSnapshot } from "./officeOperationalRealism";

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

function task(id: string, assignedAgentId: string | null, status: Task["status"], title = id): Task {
  return {
    id,
    title,
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

describe("office operational realism snapshot", () => {
  it("derives concrete operating states from existing office data", () => {
    const now = Date.now();
    const agents = [
      agent("meeting-agent", "planning", "working"),
      agent("work-agent", "development", "working", "task-active"),
      agent("review-agent", "quality", "working", "task-review"),
      agent("ops-agent", "operations", "idle"),
      agent("study-agent", "instructor", "idle"),
      agent("offline-agent", "design", "offline"),
    ];
    const tasks = [
      task("task-active", "work-agent", "in_progress", "사무실 화면 리얼리즘"),
      task("task-review", "review-agent", "review", "품질 검토"),
      task("task-wait", null, "pending", "승인 대기 항목"),
    ];
    const meetingPresence: MeetingPresence[] = [
      {
        agent_id: "meeting-agent",
        seat_index: 0,
        phase: "review",
        task_id: "task-review",
        until: now + 30_000,
      },
    ];

    const snapshot = deriveOfficeOpsDashboardSnapshot({
      agents,
      tasks,
      subAgents: [{ id: "sub-1", parentAgentId: "work-agent", task: "helper", status: "working" }],
      meetingPresence,
      now,
    });

    expect(snapshot.counts).toMatchObject({
      waiting: 1,
      active: 1,
      review: 1,
      assignedAgents: 1,
      meetingAgents: 1,
      opsAgents: 1,
      learningAgents: 1,
      offlineAgents: 1,
      activeSubAgents: 1,
    });
    expect(snapshot.agentStates["meeting-agent"].label).toBe("리뷰 회의 중");
    expect(snapshot.agentStates["review-agent"].shortLabel).toBe("검토");
    expect(snapshot.liveRows.map((row) => row.label)).toContain("검토 대기");
    expect(snapshot.liveRows.map((row) => row.label)).toContain("분신 작업");
  });
});
