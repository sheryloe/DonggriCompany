import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Department } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { I18nProvider } from "../i18n";
import Sidebar from "./Sidebar";

const departments: Department[] = [
  {
    id: "pmo",
    name: "PMO",
    name_ko: "PMO",
    icon: "PMO",
    color: "#38bdf8",
    description: null,
    prompt: null,
    sort_order: 1,
    created_at: 1,
  },
  {
    id: "planning",
    name: "Planning",
    name_ko: "기획",
    icon: "PL",
    color: "#0ea5e9",
    description: null,
    prompt: null,
    sort_order: 2,
    created_at: 1,
  },
  {
    id: "dev",
    name: "Development",
    name_ko: "개발",
    icon: "DV",
    color: "#22c55e",
    description: null,
    prompt: null,
    sort_order: 3,
    created_at: 1,
  },
  {
    id: "design",
    name: "Design",
    name_ko: "디자인",
    icon: "DS",
    color: "#f59e0b",
    description: null,
    prompt: null,
    sort_order: 4,
    created_at: 1,
  },
  {
    id: "qa",
    name: "QA",
    name_ko: "QA",
    icon: "QA",
    color: "#a78bfa",
    description: null,
    prompt: null,
    sort_order: 5,
    created_at: 1,
  },
  {
    id: "devsecops",
    name: "DevSecOps",
    name_ko: "DevSecOps",
    icon: "DSO",
    color: "#fb7185",
    description: null,
    prompt: null,
    sort_order: 6,
    created_at: 1,
  },
  {
    id: "operations",
    name: "Operations",
    name_ko: "운영",
    icon: "OP",
    color: "#14b8a6",
    description: null,
    prompt: null,
    sort_order: 7,
    created_at: 1,
  },
];

function buildAgent(id: string, departmentId: string, status: Agent["status"], spriteNumber: number): Agent {
  return {
    id,
    name: id,
    name_ko: `${departmentId} 에이전트`,
    department_id: departmentId,
    role: "junior",
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
  it("한국어 내비게이션과 7부서 상태를 표시한다", () => {
    const { container } = render(
      <I18nProvider language="ko">
        <Sidebar
          currentView="manual"
          onChangeView={vi.fn()}
          departments={departments}
          agents={[buildAgent("agent-dev", "dev", "working", 3), buildAgent("agent-qa", "qa", "idle", 4)]}
          settings={DEFAULT_SETTINGS}
          connected
        />
      </I18nProvider>,
    );

    for (const label of ["오피스", "직원 관리", "Skill 문서고", "모듈", "메뉴얼", "대시보드", "업무 관리", "설정"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText("부서 현황")).toBeInTheDocument();
    expect(screen.getByText("7부서")).toBeInTheDocument();
    for (const label of ["PMO", "기획", "개발", "디자인", "QA", "DevSecOps", "운영"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("연결됨")).toBeInTheDocument();
    expect(screen.getByText("직원 1/2 근무 중")).toBeInTheDocument();
    expect(container.querySelectorAll("nav .sidebar-nav-icon")).toHaveLength(8);
    expect(container.querySelectorAll("nav .sidebar-nav-icon img")).toHaveLength(0);
  });
});
