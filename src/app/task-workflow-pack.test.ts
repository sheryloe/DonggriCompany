import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { applyOfficePackToTaskInput, filterTasksByOfficePack } from "./task-workflow-pack";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: null,
    department_id: null,
    assigned_agent_id: null,
    status: "inbox",
    priority: 3,
    task_type: "general",
    project_path: null,
    result: null,
    started_at: null,
    completed_at: null,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe("task workflow pack routing", () => {
  it("filters tasks by the active office workflow pack", () => {
    const tasks = [
      makeTask({ id: "dev-default" }),
      makeTask({ id: "dev-explicit", workflow_pack_key: "development" }),
      makeTask({ id: "report", workflow_pack_key: "report" }),
    ];

    expect(filterTasksByOfficePack(tasks, "development").map((task) => task.id)).toEqual([
      "dev-default",
      "dev-explicit",
    ]);
    expect(filterTasksByOfficePack(tasks, "report").map((task) => task.id)).toEqual(["report"]);
  });

  it("does not override an explicitly selected goal command workflow pack", () => {
    const input = {
      title: "Research task",
      description: "desc",
      workflow_pack_key: "web_research_report" as const,
      workflow_meta_json: { goal_command: "research" },
      project_id: "project-1",
    };

    expect(applyOfficePackToTaskInput(input, "development")).toEqual({
      title: "Research task",
      description: "desc",
      workflow_pack_key: "web_research_report",
      workflow_meta_json: { goal_command: "research" },
      project_id: "project-1",
    });
  });

  it("uses the active office pack when the task has no explicit workflow pack", () => {
    const input = {
      title: "Pack task",
      description: "desc",
      project_id: "project-1",
    };

    expect(applyOfficePackToTaskInput(input, "video_preprod")).toEqual({
      title: "Pack task",
      description: "desc",
      workflow_pack_key: "video_preprod",
      project_id: "project-1",
    });
  });
});
