import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Agent, Task } from "../types";
import LiveOperationsRail from "./LiveOperationsRail";

const agent: Agent = {
  id: "agent-1",
  name: "Builder",
  name_ko: "개발 리드",
  department_id: "dev",
  role: "senior",
  cli_provider: "codex",
  avatar_emoji: "A",
  sprite_number: 3,
  personality: null,
  status: "working",
  current_task_id: "task-1",
  stats_tasks_done: 3,
  stats_xp: 450,
  created_at: 1,
};

const task: Task = {
  id: "task-123456",
  title: "앱 셸 리디자인",
  description: null,
  department_id: "dev",
  assigned_agent_id: "agent-1",
  status: "in_progress",
  priority: 2,
  task_type: "development",
  project_path: null,
  result: null,
  started_at: null,
  completed_at: null,
  created_at: Date.now() - 120_000,
  updated_at: Date.now() - 60_000,
};

describe("LiveOperationsRail", () => {
  it("실시간 업무, 직원 상태, 시스템 로그를 한국어로 표시한다", () => {
    render(<LiveOperationsRail agents={[agent]} tasks={[task]} connected />);

    expect(screen.getByRole("complementary", { name: "실시간 업무 현황" })).toBeInTheDocument();
    expect(screen.getByText("라이브")).toBeInTheDocument();
    expect(screen.getByText("근무 직원")).toBeInTheDocument();
    expect(screen.getAllByText("앱 셸 리디자인")).toHaveLength(2);
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("최근 시스템 로그")).toBeInTheDocument();
    expect(screen.getByText("Task #task-1")).toBeInTheDocument();
  });
});
