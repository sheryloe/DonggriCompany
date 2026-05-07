import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Agent, Department, Task } from "../types";
import { useAppDomainState } from "./useAppDomainState";

const initialRoomThemes = {
  themes: {
    design: {
      floor1: 0x101820,
      floor2: 0x182230,
      wall: 0x253344,
      accent: 0x58c4dd,
    },
  },
};

describe("useAppDomainState", () => {
  it("keeps app domain collections and refs behind one hook boundary", () => {
    const { result } = renderHook(() => useAppDomainState({ initialRoomThemes }));

    expect(result.current.view).toBe("manual");
    expect(result.current.loading).toBe(true);
    expect(result.current.departments).toEqual([]);
    expect(result.current.customRoomThemes.design.accent).toBe(0x58c4dd);
    expect(result.current.viewRef.current).toBe("manual");

    const department: Department = {
      id: "design",
      name: "Design",
      name_ko: "디자인",
      description: "Design department",
      prompt: null,
      icon: "design",
      color: "#58c4dd",
      sort_order: 4,
      created_at: 1,
      agent_count: 1,
    };
    const agent: Agent = {
      id: "agent-design",
      name: "Design Lead",
      name_ko: "디자인 리드",
      avatar_emoji: "D",
      role: "team_leader",
      department_id: "design",
      cli_provider: "codex",
      status: "idle",
      current_task_id: null,
      personality: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 1,
    };
    const task: Task = {
      id: "task-design",
      title: "Design review",
      description: "Review responsive design",
      status: "in_progress",
      priority: 1,
      task_type: "design",
      assigned_agent_id: "agent-design",
      department_id: "design",
      project_path: null,
      result: null,
      started_at: null,
      completed_at: null,
      created_at: 1,
      updated_at: 1,
    };

    act(() => {
      result.current.setView("departmentComponents");
      result.current.setDepartments([department]);
      result.current.setAgents([agent]);
      result.current.setTasks([task]);
      result.current.setLoading(false);
    });

    expect(result.current.viewRef.current).toBe("departmentComponents");
    expect(result.current.agentsRef.current).toEqual([agent]);
    expect(result.current.tasksRef.current).toEqual([task]);
    expect(result.current.departments[0]?.id).toBe("design");
    expect(result.current.loading).toBe(false);
  });
});
