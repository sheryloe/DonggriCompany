import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import {
  getContinuityRunEvents,
  getRecentContinuityProjections,
  getTaskContinuityProjection,
  type ContinuityTransitProjectionView,
} from "../api/continuity";
import { getControlPlaneDashboardState, type ControlPlaneDashboardState } from "../api/control-plane-dashboard";
import { getProjects } from "../api/organization-projects";
import type { Task } from "../types";
import CommandCenter from "./CommandCenter";

vi.mock("../api/control-plane-dashboard", async () => {
  const actual = await vi.importActual<typeof import("../api/control-plane-dashboard")>(
    "../api/control-plane-dashboard",
  );
  return { ...actual, getControlPlaneDashboardState: vi.fn() };
});

vi.mock("../api/organization-projects", () => ({ getProjects: vi.fn() }));

vi.mock("../api/continuity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/continuity")>();
  return {
    ...actual,
    getRecentContinuityProjections: vi.fn(),
    getTaskContinuityProjection: vi.fn(),
    getContinuityRunEvents: vi.fn(),
  };
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

function continuityProjection(
  overrides: Partial<ContinuityTransitProjectionView> = {},
): ContinuityTransitProjectionView {
  const now = new Date().toISOString();
  return {
    project_id: "DonggriCompany",
    task_id: task.id,
    checkpoint_id: "checkpoint:1",
    checkpoint_sequence: 2,
    checkpoint_status: "accepted",
    phase: "dispatch_reserved",
    phase_index: 4,
    source_run_id: "run:source",
    source_provider: "codex",
    source_run_status: "paused",
    target_run_id: "run:target",
    target_provider: "claude",
    target_run_status: "starting",
    cursor_run_id: "run:target",
    state_version: 1,
    event_sequence: 1,
    heartbeat_at: now,
    heartbeat_freshness: "fresh",
    heartbeat_age_ms: 1_000,
    reconcile_state: "observing",
    latest_event: {
      run_id: "run:target",
      sequence: 1,
      event_type: "runner.starting",
      occurred_at: now,
    },
    blockers: [],
    next_safe_action: "observe_dispatch",
    motion_eligible: false,
    updated_at: now,
    observed_at: now,
    ...overrides,
  };
}

function renderCommandCenter(overrides: Partial<ComponentProps<typeof CommandCenter>> = {}) {
  const props: ComponentProps<typeof CommandCenter> = {
    connected: true,
    connectionState: "connected",
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
  const rendered = render(<CommandCenter {...props} />);
  return { props, ...rendered };
}

describe("CommandCenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.mocked(getControlPlaneDashboardState).mockResolvedValue(dashboard);
    vi.mocked(getProjects).mockResolvedValue({
      projects: [
        {
          id: "project-runtime-id",
          name: "DonggriCompany",
          project_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
          core_goal: "continuity",
          assignment_mode: "auto",
          last_used_at: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      page: 1,
      page_size: 100,
      total: 1,
      total_pages: 1,
    });
    vi.mocked(getRecentContinuityProjections).mockResolvedValue([]);
    vi.mocked(getTaskContinuityProjection).mockRejectedValue(new Error("projection missing"));
    vi.mocked(getContinuityRunEvents).mockRejectedValue(new Error("events missing"));
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
    expect(screen.getByRole("link", { name: "호환 화면" })).toHaveAttribute("href", "/old");
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
    await user.type(screen.getByLabelText("AI 업무 명령"), "현재 변경 검토");
    await user.selectOptions(screen.getByLabelText("대상 프로젝트"), "DonggriCompany");
    await user.selectOptions(screen.getByLabelText("담당 마스터 역할"), "quality");
    await user.click(screen.getByRole("button", { name: /업무 등록/ }));
    expect(onCreateCommand).toHaveBeenCalledWith({
      title: "현재 변경 검토",
      departmentId: "quality",
      projectId: "project-runtime-id",
      projectPath: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
      provider: "codex",
      assignedAgentId: undefined,
      runAfterCreate: false,
    });
    expect(window.location.search).toBe("?view=tasks&task=task-created");
  });

  it("reports command creation failure instead of showing success", async () => {
    const user = userEvent.setup();
    renderCommandCenter({ onCreateCommand: vi.fn().mockRejectedValue(new Error("create failed")) });
    await user.type(screen.getByLabelText("AI 업무 명령"), "실패 확인");
    await user.click(screen.getByRole("button", { name: /^업무 등록$/ }));
    expect(await screen.findByText(/등록하지 못했습니다/)).toBeInTheDocument();
  });

  it("keeps task state available when the optional projection fails", async () => {
    vi.mocked(getControlPlaneDashboardState).mockRejectedValueOnce(new Error("projection unavailable"));
    renderCommandCenter();
    expect(await screen.findByText("Control Plane 요약을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("공개 후보 검토")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeInTheDocument();
  });

  it("labels theme and mobile menu controls accessibly", async () => {
    renderCommandCenter();
    await screen.findByText("DonggriCompany");
    expect(screen.getByRole("button", { name: "어두운 테마로 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveAttribute("aria-expanded", "false");
  });

  it("applies only an exact next run event as live sync", async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const base = continuityProjection();
    const incoming = continuityProjection({
      phase: "resume_confirmed",
      phase_index: 5,
      target_run_status: "running",
      state_version: 2,
      event_sequence: 2,
      reconcile_state: "in_sync",
      motion_eligible: true,
      latest_event: {
        run_id: "run:target",
        sequence: 2,
        event_type: "runner.child_started",
        occurred_at: "2026-08-29T01:00:02.000Z",
      },
      updated_at: "2026-08-29T01:00:02.000Z",
      observed_at: "2026-08-29T01:00:03.000Z",
    });
    vi.mocked(getRecentContinuityProjections).mockResolvedValue([base]);
    renderCommandCenter({
      on: (type, listener) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      },
    });

    await waitFor(() =>
      expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "snapshot"),
    );
    act(() => listeners.get("continuity_run_event")?.(incoming));
    await waitFor(() => expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "exact"));
    expect(getContinuityRunEvents).not.toHaveBeenCalled();
    expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-continuity-status", "accepted");
  });

  it("freezes on an event gap, verifies the missing range, then refetches the authoritative snapshot", async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    let resolveRange: ((value: Awaited<ReturnType<typeof getContinuityRunEvents>>) => void) | undefined;
    const base = continuityProjection();
    const incoming = continuityProjection({
      phase: "resume_confirmed",
      phase_index: 5,
      target_run_status: "running",
      state_version: 3,
      event_sequence: 3,
      reconcile_state: "in_sync",
      motion_eligible: true,
      latest_event: {
        run_id: "run:target",
        sequence: 3,
        event_type: "runner.child_started",
        occurred_at: "2026-08-29T01:00:03.000Z",
      },
      updated_at: "2026-08-29T01:00:03.000Z",
      observed_at: "2026-08-29T01:00:04.000Z",
    });
    vi.mocked(getRecentContinuityProjections).mockResolvedValue([base]);
    vi.mocked(getContinuityRunEvents).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRange = resolve;
        }),
    );
    vi.mocked(getTaskContinuityProjection).mockResolvedValue(incoming);
    renderCommandCenter({
      on: (type, listener) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      },
    });
    await waitFor(() =>
      expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "snapshot"),
    );

    act(() => listeners.get("continuity_run_event")?.(incoming));
    expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "gap");
    expect(document.querySelector(".cc-transit-line")).not.toHaveClass("is-live-motion");

    await act(async () => {
      resolveRange?.({
        run_id: "run:target",
        after_sequence: 1,
        event_sequence: 3,
        state_version: 3,
        run_status: "running",
        events: [
          {
            run_id: "run:target",
            sequence: 2,
            event_type: "runner.starting",
            occurred_at: "2026-08-29T01:00:02.000Z",
          },
          {
            run_id: "run:target",
            sequence: 3,
            event_type: "runner.child_started",
            occurred_at: "2026-08-29T01:00:03.000Z",
          },
        ],
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "exact"));
    expect(getTaskContinuityProjection).toHaveBeenCalledWith(task.id);
  });

  it.each([
    ["다른 실행 이벤트", 1, "run:other"],
    ["다른 시작 cursor", 0, "run:target"],
  ] as const)(
    "keeps a recovered gap on snapshot when the range contains %s",
    async (_case, afterSequence, eventRunId) => {
      const listeners = new Map<string, (payload: unknown) => void>();
      const base = continuityProjection();
      const incoming = continuityProjection({
        phase: "resume_confirmed",
        phase_index: 5,
        target_run_status: "running",
        state_version: 3,
        event_sequence: 3,
        reconcile_state: "in_sync",
        motion_eligible: true,
      });
      vi.mocked(getRecentContinuityProjections).mockResolvedValue([base]);
      vi.mocked(getContinuityRunEvents).mockResolvedValue({
        run_id: "run:target",
        after_sequence: afterSequence,
        event_sequence: 3,
        state_version: 3,
        run_status: "running",
        events: [
          { run_id: eventRunId, sequence: 2, event_type: "runner.starting", occurred_at: "now" },
          { run_id: "run:target", sequence: 3, event_type: "runner.child_started", occurred_at: "now" },
        ],
      });
      vi.mocked(getTaskContinuityProjection).mockResolvedValue(incoming);
      renderCommandCenter({
        on: (type, listener) => {
          listeners.set(type, listener);
          return () => listeners.delete(type);
        },
      });
      await waitFor(() =>
        expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "snapshot"),
      );

      act(() => listeners.get("continuity_run_event")?.(incoming));

      await waitFor(() => expect(getTaskContinuityProjection).toHaveBeenCalledWith(task.id));
      expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "snapshot");
      expect(document.querySelector(".cc-transit-line")).not.toHaveClass("is-live-motion");
    },
  );

  it("freezes synchronously when the WebSocket connection drops", async () => {
    vi.mocked(getRecentContinuityProjections).mockResolvedValue([continuityProjection()]);
    const rendered = renderCommandCenter();
    await waitFor(() =>
      expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "snapshot"),
    );

    await act(async () => {
      rendered.rerender(<CommandCenter {...rendered.props} connected={false} connectionState="reconnecting" />);
      await Promise.resolve();
    });
    expect(screen.getAllByText(/재연결 중/).length).toBeGreaterThan(0);
    expect(document.querySelector(".cc-transit-line")).toHaveAttribute("data-sync-state", "offline");
    expect(document.querySelector(".cc-transit-line")).not.toHaveClass("is-live-motion");
  });
});
