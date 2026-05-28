import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Department, Task } from "../types";
import OfficeView from "./OfficeView";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("pixi.js", () => ({
  Application: class {},
  Container: class {
    destroyed = false;
    parent: { removeChild: () => void } | null = null;
    position = { x: 0, y: 0, set: vi.fn() };
    addChild() {}
    destroy() {}
  },
  Graphics: class {
    destroyed = false;
    parent: { removeChild: () => void } | null = null;
    position = { x: 0, y: 0, set: vi.fn() };
    addChild() {}
    circle() {
      return this;
    }
    destroy() {}
    fill() {
      return this;
    }
    rect() {
      return this;
    }
    roundRect() {
      return this;
    }
    stroke() {
      return this;
    }
  },
  Sprite: class {},
  Text: class {
    anchor = { set: vi.fn() };
    position = { x: 0, y: 0, set: vi.fn() };
  },
  TextStyle: class {},
  Texture: class {},
}));

vi.mock("./office-view/useOfficePixiRuntime", () => ({
  useOfficePixiRuntime: vi.fn(),
}));

vi.mock("./office-view/buildScene", () => ({
  buildOfficeScene: vi.fn(),
}));

vi.mock("./office-view/useCliUsage", () => ({
  useCliUsage: () => ({
    cliStatus: null,
    cliUsage: null,
    cliPoolUsage: [],
    cliSessionUsage: [],
    cliUsageRef: { current: null },
    refreshing: false,
    handleRefreshUsage: vi.fn(),
  }),
}));

vi.mock("./office-view/useOfficeDeliveryEffects", () => ({
  useMeetingPresenceSync: vi.fn(),
  useCrossDeptDeliveryAnimations: vi.fn(),
  useCeoOfficeCallAnimations: vi.fn(),
}));

const departments: Department[] = [
  ["planning", "기획"],
  ["development", "개발"],
  ["design", "디자인"],
  ["quality", "품질"],
  ["operations", "운영"],
  ["instructor", "외부강사"],
].map(([id, name], index) => ({
  id,
  name,
  name_ko: name,
  icon: id.slice(0, 2).toUpperCase(),
  color: "#0ea5e9",
  description: null,
  prompt: null,
  sort_order: index + 1,
  created_at: 0,
}));

const agents: Agent[] = departments.map((department, index) => ({
  id: `agent-${department.id}`,
  name: `agent-${department.id}`,
  name_ko: `${department.name_ko} 에이전트`,
  department_id: department.id,
  role: "senior",
  cli_provider: "codex",
  avatar_emoji: "AG",
  personality: null,
  status: index < 3 ? "working" : "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: 0,
}));

const tasks: Task[] = [
  {
    id: "task-1",
    title: "사무실 화면 복구",
    description: null,
    department_id: "development",
    assigned_agent_id: "agent-development",
    status: "in_progress",
    priority: 2,
    task_type: "development",
    project_path: "G:/Donggri_DevDrive/repos/DonggriCompany",
    result: null,
    started_at: null,
    completed_at: null,
    created_at: 0,
    updated_at: 0,
  },
  {
    id: "task-2",
    title: "사무실 화면 검토",
    description: null,
    department_id: "quality",
    assigned_agent_id: "agent-quality",
    status: "review",
    priority: 2,
    task_type: "analysis",
    project_path: null,
    result: null,
    started_at: null,
    completed_at: null,
    created_at: 0,
    updated_at: 0,
  },
];

describe("OfficeView 8bit office restoration", () => {
  it("renders a Pixi-backed office screen instead of tycoon or block-map copy", () => {
    render(
      <OfficeView
        departments={departments}
        agents={agents}
        tasks={tasks}
        subAgents={[{ id: "sub-1", parentAgentId: "agent-development", task: "test", status: "working" }]}
        onSelectAgent={vi.fn()}
        onSelectDepartment={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Dongri-grigri 8bit 사무실" })).toBeInTheDocument();
    expect(screen.getByTestId("pixel-office-map")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dongri-grigri 사무실" })).toBeInTheDocument();

    const commandGroup = screen.getByLabelText("사무실 렌즈");
    for (const command of ["요약", "업무 흐름", "구현", "검토", "운영", "기억"]) {
      expect(within(commandGroup).getAllByRole("button", { name: new RegExp(command) }).length).toBeGreaterThan(0);
    }
    for (const project of ["BloggerGent", "DonggriCompany", "JasoSul"]) {
      expect(screen.getByRole("button", { name: new RegExp(project) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "승인 기반 기억 상태 보기" })).toBeInTheDocument();

    for (const removedLabel of ["타이쿤", "왕국", "CloudOps", "Pixel map", "Live Ops", "Department rooms", "RPG COMMAND MAP"]) {
      expect(screen.queryByText(removedLabel)).not.toBeInTheDocument();
    }
  });

  it("changes focus and opens project and memory panels through real actions", () => {
    const onOpenProjects = vi.fn();
    const onOpenMemory = vi.fn();
    const { container } = render(
      <OfficeView
        departments={departments}
        agents={agents}
        tasks={tasks}
        subAgents={[]}
        onSelectAgent={vi.fn()}
        onSelectDepartment={vi.fn()}
        onOpenProjects={onOpenProjects}
        onOpenMemory={onOpenMemory}
      />,
    );

    const commandGroup = screen.getByLabelText("사무실 렌즈");
    fireEvent.click(within(commandGroup).getByRole("button", { name: /^운영/ }));
    const shell = container.querySelector(".pixel-office-shell");
    expect(shell).toHaveAttribute("data-focus", "ops");
    expect(shell).toHaveAttribute("data-camera", "quality");
    expect(screen.getByRole("heading", { name: "OPS 관제 코너와 프로젝트 보드" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /DonggriCompany/ }));
    expect(onOpenProjects).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "승인 기반 기억 상태 보기" }));
    expect(onOpenMemory).toHaveBeenCalledTimes(1);
  });
});
