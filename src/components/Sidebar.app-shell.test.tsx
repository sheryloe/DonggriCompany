import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Department } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { I18nProvider } from "../i18n";
import Sidebar from "./Sidebar";

const departments: Department[] = [
  {
    id: "operations",
    name: "Ops",
    name_ko: "운영",
    icon: "OP",
    color: "#14b8a6",
    description: null,
    prompt: null,
    sort_order: 1,
    created_at: 1,
  },
];

function buildAgent(id: string, departmentId: string, status: Agent["status"], spriteNumber: number): Agent {
  return {
    id,
    name: id,
    name_ko: `${departmentId} 에이전트`,
    department_id: departmentId,
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "A",
    sprite_number: spriteNumber,
    personality: null,
    status,
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 1,
  };
}

describe("Sidebar app shell", () => {
  it("shows Dongri-grigri office navigation without rejected art-direction labels", () => {
    const { container } = render(
      <I18nProvider language="ko">
        <Sidebar
          currentView="office"
          onChangeView={vi.fn()}
          departments={departments}
          agents={[buildAgent("agent-ops", "operations", "working", 3)]}
          settings={DEFAULT_SETTINGS}
          connected
        />
      </I18nProvider>,
    );

    for (const label of ["사무실", "프로젝트", "마스터 에이전트", "업무", "이미지 작업", "Skill", "Memory", "설정"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    expect(screen.getByText("Dongri-grigri")).toBeInTheDocument();
    expect(screen.getByText("8bit Office")).toBeInTheDocument();
    expect(screen.getByText("연결됨")).toBeInTheDocument();
    expect(screen.getByText("6개")).toBeInTheDocument();
    for (const label of ["기획", "개발", "디자인", "품질", "운영", "외부강사"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    expect(screen.getByTitle("사무실")).toBeInTheDocument();
    expect(screen.queryByText("타이쿤")).not.toBeInTheDocument();
    expect(screen.queryByText("CloudOps")).not.toBeInTheDocument();
    expect(screen.queryByText("8bit RPG Command Map")).not.toBeInTheDocument();
    expect(screen.queryByText("Control Hub")).not.toBeInTheDocument();
    expect(container.querySelectorAll("nav .sidebar-nav-icon")).toHaveLength(8);
    expect(container.querySelectorAll("nav .sidebar-nav-icon img")).toHaveLength(0);
  });
});
