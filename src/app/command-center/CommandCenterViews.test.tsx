import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneDashboardState } from "../../api/control-plane-dashboard";
import type { Task } from "../../types";
import CommandCenterViews from "./CommandCenterViews";

vi.mock("../../api/continuity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/continuity")>();
  return {
    ...actual,
    getTaskContinuityCheckpoints: vi.fn().mockResolvedValue([]),
    getCliAccountPools: vi.fn().mockResolvedValue([]),
  };
});

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
      id: "other-spec",
      phase: "wrong-phase",
      status: "active",
      related_repo: "G:\\Donggri_DevDrive\\repos\\howperson",
      related_repos: ["G:\\Donggri_DevDrive\\repos\\howperson"],
      next_recommended_action: "wrong action",
    },
    {
      id: "spec-v1",
      phase: "applying",
      status: "active",
      related_repo: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
      related_repos: ["G:\\Donggri_DevDrive\\repos\\DonggriCompany"],
      next_recommended_action: "verify",
    },
  ],
  projects: [
    {
      key: "DonggriCompany",
      path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
      summary: "runtime",
      lifecycle_status: "active",
      enabled: true,
      exists: true,
      git: { status: "clean", branch: "main", ahead: 15, behind: 0, dirty_count: 0 },
    },
  ],
  counts: { projects: 1, clean: 1, dirty: 0, missing: 0, active_specs: 1 },
};
const task = {
  id: "task-1",
  title: "공개 후보 검토",
  description: "근거 확인",
  department_id: null,
  assigned_agent_id: null,
  status: "review",
  priority: 1,
  task_type: "general",
  project_path: null,
  result: null,
  started_at: null,
  completed_at: null,
  created_at: 1,
  updated_at: 2,
} as Task;

function renderView(view: "today" | "projects" | "tasks" | "agents" | "system", selectedId: string | null = null) {
  render(
    <CommandCenterViews
      connected
      connectionState="connected"
      view={view}
      selectedId={selectedId}
      tasks={[task]}
      agents={[]}
      stats={null}
      dashboard={dashboard}
      loading={false}
      error={null}
      decisionInboxCount={1}
      decisionInboxLoading={false}
      onOpenDecisionInbox={vi.fn()}
      onCreateCommand={vi.fn().mockResolvedValue("task-created")}
      onRunTask={vi.fn().mockResolvedValue(undefined)}
      onStopTask={vi.fn().mockResolvedValue(undefined)}
      onResumeTask={vi.fn().mockResolvedValue(undefined)}
      onOpenTerminal={vi.fn()}
      onNavigate={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
}

describe("CommandCenterViews", () => {
  afterEach(cleanup);
  it.each([
    ["projects", "프로젝트"],
    ["tasks", "업무"],
    ["agents", "에이전트·Skill"],
    ["system", "시스템"],
  ] as const)("renders the native %s view", (view, heading) => {
    renderView(view);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
  it("renders project and task detail without leaving the shell", async () => {
    renderView("projects", "DonggriCompany");
    expect(screen.getByRole("complementary", { name: "DonggriCompany 상세" })).toBeInTheDocument();
    cleanup();
    renderView("tasks", "task-1");
    expect(screen.getByRole("complementary", { name: "공개 후보 검토 상세" })).toBeInTheDocument();
    expect(await screen.findByText("프로젝트 경로를 확인하세요.")).toBeInTheDocument();
  });
  it("selects the DonggriCompany active spec instead of the first global spec", () => {
    renderView("today");
    expect(screen.getByText("applying")).toBeInTheDocument();
    expect(screen.queryByText("wrong-phase")).not.toBeInTheDocument();
  });
});
