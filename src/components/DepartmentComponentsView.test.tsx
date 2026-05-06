import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import type { Agent, Department, Project, ProjectComponentEvent, ProjectModuleManifest, Task } from "../types";
import DepartmentComponentsView from "./DepartmentComponentsView";

vi.mock("../api", () => ({
  getProjects: vi.fn(),
  getModules: vi.fn(),
  getProjectComponentEvents: vi.fn(),
  createProjectComponentEvent: vi.fn(),
}));

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
];

const agents: Agent[] = [
  {
    id: "design-lead",
    name: "Design Lead",
    name_ko: "디자인 팀장",
    department_id: "design",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "D",
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 1,
  },
];

const tasks: Task[] = [
  {
    id: "task-design",
    title: "Design review",
    description: null,
    department_id: "design",
    assigned_agent_id: null,
    project_id: "project-1",
    status: "in_progress",
    priority: 2,
    task_type: "design",
    project_path: "G:\\project",
    result: null,
    started_at: null,
    completed_at: null,
    created_at: 1,
    updated_at: 1,
  },
];

const projects: Project[] = [
  {
    id: "project-1",
    name: "Open Design Portal",
    project_path: "G:\\project",
    core_goal: "Build design portal",
    assignment_mode: "auto",
    last_used_at: 1,
    created_at: 1,
    updated_at: 1,
  },
];

const designModule: ProjectModuleManifest = {
  module_key: "design-workspace",
  module_type: "department_component",
  category_key: "project-template",
  version: "1.0.0",
  name: "Project Design Workspace",
  summary: "Design version history and exports",
  capabilities: [],
  required_secrets: [],
  required_runtime: [],
  artifact_contract: {},
  license_policy: {},
  risk_level: "medium",
  department_id: "design",
  component_kind: "design_workspace",
  entry_points: ["global_department_tab", "office_room", "project_detail"],
  project_scoped: true,
};

const createdEvent: ProjectComponentEvent = {
  id: "event-1",
  project_id: "project-1",
  department_id: "design",
  component_key: "design-workspace",
  component_kind: "design_workspace",
  event_type: "task_created",
  title: "디자인 태스크 생성",
  summary: "Updated responsive concept",
  payload: { project_id: "project-1" },
  related_task_id: null,
  created_by: "department_components_ui",
  created_at: 1_700_000_000_000,
};

function setup(activeDepartmentId = "pmo") {
  return render(
    <DepartmentComponentsView
      departments={departments}
      agents={agents}
      tasks={tasks}
      activeDepartmentId={activeDepartmentId}
      onActiveDepartmentChange={vi.fn()}
      onCreateTask={vi.fn()}
      onOpenDepartmentChat={vi.fn()}
    />,
  );
}

describe("DepartmentComponentsView", () => {
  beforeEach(() => {
    vi.mocked(api.getProjects).mockResolvedValue({
      projects,
      page: 1,
      page_size: 50,
      total: 1,
      total_pages: 1,
    });
    vi.mocked(api.getModules).mockImplementation(async (filters) => {
      if (typeof filters === "object" && filters?.departmentId === "design") return [designModule];
      return [];
    });
    vi.mocked(api.getProjectComponentEvents).mockResolvedValue([]);
    vi.mocked(api.createProjectComponentEvent).mockResolvedValue(createdEvent);
  });

  it("부서 탭, 프로젝트 선택, 컴포넌트 카드를 렌더링한다", async () => {
    setup("design");

    expect(await screen.findByText("부서별 컴포넌트")).toBeInTheDocument();
    expect(await screen.findByText("Open Design Portal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "디자인" })).toBeInTheDocument();
    expect(screen.getAllByText("Project Design Workspace").length).toBeGreaterThan(0);
    expect(await screen.findByText("Design version history and exports")).toBeInTheDocument();
  });

  it("디자인 작업실 태스크 생성 payload에 department_id와 project_id를 포함한다", async () => {
    const user = userEvent.setup();
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    render(
      <DepartmentComponentsView
        departments={departments}
        agents={agents}
        tasks={tasks}
        activeDepartmentId="design"
        onActiveDepartmentChange={vi.fn()}
        onCreateTask={onCreateTask}
        onOpenDepartmentChat={vi.fn()}
      />,
    );

    const brief = await screen.findByLabelText("디자인 브리프");
    await user.clear(brief);
    await user.type(brief, "Updated responsive concept");
    await user.click(screen.getByRole("button", { name: /디자인 태스크 생성/ }));

    await waitFor(() => {
      expect(onCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          department_id: "design",
          project_id: "project-1",
          project_path: "G:\\project",
          task_type: "design",
        }),
      );
    });
    expect(api.createProjectComponentEvent).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        department_id: "design",
        component_key: "design-workspace",
        component_kind: "design_workspace",
        event_type: "task_created",
      }),
    );
  });
});
