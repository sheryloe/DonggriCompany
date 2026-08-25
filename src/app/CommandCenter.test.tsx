import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { getControlPlaneDashboardState, type ControlPlaneDashboardState } from "../api/control-plane-dashboard";
import type { Task } from "../types";
import CommandCenter from "./CommandCenter";

vi.mock("../api/control-plane-dashboard", async () => {
  const actual = await vi.importActual<typeof import("../api/control-plane-dashboard")>(
    "../api/control-plane-dashboard",
  );
  return { ...actual, getControlPlaneDashboardState: vi.fn() };
});

const task = {
  id: "task-1",
  title: "공개 후보 검토",
  description: null,
  department_id: null,
  assigned_agent_id: null,
  project_id: "DonggriCompany",
  status: "in_progress",
  priority: 2,
  task_type: "general",
  project_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
  result: null,
  started_at: 1,
  completed_at: null,
  created_at: 1,
  updated_at: 2,
} as Task;
const dashboard: ControlPlaneDashboardState = {
  ok: true,
  generated_at: "2026-08-14T00:00:00.000Z",
  source_epoch: `sha256:${"a".repeat(64)}`,
  projection_epoch: `sha256:${"b".repeat(64)}`,
  degraded: false,
  parse_error_count: 0,
  runtime: { data_mode: "isolated", refresh_interval_ms: 15_000 },
  active_specs: [
    {
      id: "spec-v1",
      phase: "applying",
      status: "active",
      related_repo: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
      related_repos: ["G:\\Donggri_DevDrive\\repos\\DonggriCompany"],
      next_recommended_action: "검증",
    },
  ],
  projects: [
    {
      key: "DonggriCompany",
      summary: "runtime",
      lifecycle_status: "active",
      enabled: true,
      exists: true,
      git: { status: "clean", branch: "main", ahead: 15, behind: 0, dirty_count: 0 },
    },
  ],
  counts: { projects: 1, clean: 1, dirty: 0, missing: 0, active_specs: 1 },
};

function renderCommandCenter(overrides: Partial<ComponentProps<typeof CommandCenter>> = {}) {
  const props: ComponentProps<typeof CommandCenter> = {
    connected: true,
    tasks: [task],
    agents: [],
    stats: null,
    decisionInboxCount: 2,
    decisionInboxLoading: false,
    theme: "light",
    toggleTheme: vi.fn(),
    onOpenDecisionInbox: vi.fn(),
    onCreateCommand: vi.fn().mockResolvedValue("task-created"),
    onRunTask: vi.fn().mockResolvedValue(undefined),
    onStopTask: vi.fn().mockResolvedValue(undefined),
    onResumeTask: vi.fn().mockResolvedValue(undefined),
    onOpenTerminal: vi.fn(),
    ...overrides,
  };
  render(<CommandCenter {...props} />);
  return props;
}

describe("CommandCenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.mocked(getControlPlaneDashboardState).mockResolvedValue(dashboard);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the real route map and keeps every primary view inside the shell", async () => {
    const user = userEvent.setup();
    renderCommandCenter();
    expect(screen.getByRole("heading", { name: "오늘의 운영 판단" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "현재 운영 상황" })).toBeInTheDocument();
    expect(await screen.findByText("DonggriCompany")).toBeInTheDocument();
    expect(screen.getByText("격리 테스트 데이터")).toBeInTheDocument();
    const projectLink = screen.getByRole("link", { name: /02 프로젝트/ });
    expect(projectLink).toHaveAttribute("href", "/?view=projects");
    await user.click(projectLink);
    expect(screen.getByRole("heading", { name: "프로젝트" })).toBeInTheDocument();
    expect(window.location.search).toBe("?view=projects");
    expect(screen.getByRole("link", { name: "old 화면" })).toHaveAttribute("href", "/old");
  });

  it("opens the real decision inbox", async () => {
    const user = userEvent.setup();
    const onOpenDecisionInbox = vi.fn();
    renderCommandCenter({ onOpenDecisionInbox });
    await user.click(screen.getByRole("button", { name: /판단함 열기/ }));
    expect(onOpenDecisionInbox).toHaveBeenCalledTimes(1);
  });

  it("registers a command with an explicit master role without auto-running it", async () => {
    const user = userEvent.setup();
    const onCreateCommand = vi.fn().mockResolvedValue("task-created");
    renderCommandCenter({ onCreateCommand });
    await user.type(screen.getByLabelText("Codex 업무 명령"), "현재 변경 검토");
    await user.selectOptions(screen.getByLabelText("담당 마스터 역할"), "quality");
    await user.click(screen.getByRole("button", { name: /업무 등록/ }));
    expect(onCreateCommand).toHaveBeenCalledWith({
      title: "현재 변경 검토",
      departmentId: "quality",
      runAfterCreate: false,
    });
    expect(window.location.search).toBe("?view=tasks&task=task-created");
  });

  it("reports command creation failure instead of showing success", async () => {
    const user = userEvent.setup();
    renderCommandCenter({ onCreateCommand: vi.fn().mockRejectedValue(new Error("create failed")) });
    await user.type(screen.getByLabelText("Codex 업무 명령"), "실패 확인");
    await user.click(screen.getByRole("button", { name: /^업무 등록$/ }));
    expect(await screen.findByText(/등록하지 못했습니다/)).toBeInTheDocument();
  });

  it("keeps task state available when the optional projection fails", async () => {
    vi.mocked(getControlPlaneDashboardState).mockRejectedValueOnce(new Error("projection unavailable"));
    renderCommandCenter();
    expect(await screen.findByRole("alert")).toHaveTextContent("Control Plane 요약을 불러오지 못했습니다.");
    expect(screen.getAllByText("공개 후보 검토")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeInTheDocument();
  });

  it("labels theme and mobile menu controls accessibly", async () => {
    renderCommandCenter();
    await screen.findByText("DonggriCompany");
    expect(screen.getByRole("button", { name: "어두운 테마로 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveAttribute("aria-expanded", "false");
  });
});
