import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Agent, Task } from "../types";
import LiveOperationsRail from "./LiveOperationsRail";
import { getTaskStatusKoLabel } from "./task-status-display";

const agent: Agent = {
  id: "agent-1",
  name: "Builder",
  name_ko: "개발 담당",
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
  title: "사무실 화면 복구",
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
  it("shows operating status, system status, and recent logs in Korean", () => {
    render(<LiveOperationsRail agents={[agent]} tasks={[task]} connected />);

    expect(screen.getByRole("complementary", { name: "운영 현황" })).toBeInTheDocument();
    expect(screen.getByText("온라인")).toBeInTheDocument();
    expect(screen.getByText("실시간 운영 신호")).toBeInTheDocument();
    expect(screen.getByText("실행 중")).toBeInTheDocument();
    expect(screen.getAllByText("사무실 화면 복구")).toHaveLength(2);
    expect(screen.getByText(getTaskStatusKoLabel(task.status))).toBeInTheDocument();
    expect(screen.getByText("시스템 상태")).toBeInTheDocument();
    expect(screen.getByText("서버 연결")).toBeInTheDocument();
    expect(screen.getByText("최근 실행 로그")).toBeInTheDocument();
    expect(screen.getByText("Task #task-1")).toBeInTheDocument();
    expect(screen.queryByText("Live Ops")).not.toBeInTheDocument();
    expect(screen.queryByText("Department rooms")).not.toBeInTheDocument();
  });
});
