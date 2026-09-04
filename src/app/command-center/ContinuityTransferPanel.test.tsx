import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as continuityApi from "../../api/continuity";
import type { ContinuityTransitProjectionView } from "../../api/continuity";
import * as accountApi from "../../api/messaging-runtime-oauth";
import type { CliAccountPoolView } from "../../api/messaging-runtime-oauth";
import type { Task } from "../../types";
import ContinuityTransferPanel from "./ContinuityTransferPanel";

vi.mock("../../api/continuity", async (importOriginal) => {
  const actual = await importOriginal<typeof continuityApi>();
  return {
    ...actual,
    getTaskContinuityCheckpoints: vi.fn(),
    createContinuityCheckpoint: vi.fn(),
    validateContinuityCheckpoint: vi.fn(),
    resumeContinuityCheckpoint: vi.fn(),
  };
});

vi.mock("../../api/messaging-runtime-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof accountApi>();
  return { ...actual, getCliAccountPools: vi.fn() };
});

const codexPool: CliAccountPoolView = {
  id: "pool-row-codex",
  provider: "codex",
  accountPoolId: "codex-main",
  label: "Codex primary",
  profileHome: "C:\\profiles\\codex-main",
  status: "connected",
  lastVerifiedAt: 1,
  lastError: null,
  createdAt: 1,
  updatedAt: 1,
};

const claudePool: CliAccountPoolView = {
  ...codexPool,
  id: "pool-row-claude",
  provider: "claude",
  accountPoolId: "claude-main",
  label: "Claude primary",
  profileHome: "C:\\profiles\\claude-main",
};

const task = {
  id: "task-transfer",
  title: "환승 업무",
  description: "목표를 보존한다.",
  department_id: null,
  assigned_agent_id: null,
  project_id: "DonggriCompany",
  status: "in_progress",
  priority: 1,
  task_type: "general",
  project_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
  continuity_source_run_id: "run:source:001",
  result: null,
  started_at: 1,
  completed_at: null,
  created_at: 1,
  updated_at: 2,
} as Task;

function projection(overrides: Partial<ContinuityTransitProjectionView> = {}): ContinuityTransitProjectionView {
  return {
    project_id: "DonggriCompany",
    task_id: task.id,
    checkpoint_id: "checkpoint:1",
    checkpoint_sequence: 1,
    checkpoint_status: "ready_for_transfer",
    phase: "checkpoint_persisted",
    phase_index: 1,
    source_run_id: "run:source:001",
    source_provider: "codex",
    source_run_status: "paused",
    target_run_id: null,
    target_provider: "claude",
    target_run_status: null,
    cursor_run_id: "run:source:001",
    state_version: 2,
    event_sequence: 3,
    heartbeat_at: "2026-08-29T01:00:00.000Z",
    heartbeat_freshness: "not_applicable",
    heartbeat_age_ms: null,
    reconcile_state: "source_paused",
    latest_event: {
      run_id: "run:source:001",
      sequence: 3,
      event_type: "runner.pause_acknowledged",
      occurred_at: "2026-08-29T01:00:00.000Z",
    },
    blockers: [],
    next_safe_action: "validate_target",
    motion_eligible: false,
    updated_at: "2026-08-29T01:00:00.000Z",
    observed_at: "2026-08-29T01:00:01.000Z",
    ...overrides,
  };
}

describe("ContinuityTransferPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates a checkpoint from a real run and connected account-pool IDs", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([]);
    vi.mocked(continuityApi.createContinuityCheckpoint).mockResolvedValue(projection());
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={task} agents={[]} />);

    await screen.findByText("새 환승 체크포인트를 만들 수 있습니다.");
    fireEvent.change(screen.getByLabelText("현재 Codex 계정"), { target: { value: "codex-main" } });
    fireEvent.change(screen.getByLabelText("대상 Claude 계정"), { target: { value: "claude-main" } });
    fireEvent.click(screen.getByRole("button", { name: "체크포인트 만들기" }));

    await waitFor(() => expect(continuityApi.createContinuityCheckpoint).toHaveBeenCalledTimes(1));
    expect(continuityApi.createContinuityCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        source_run_id: "run:source:001",
        source_account_pool_id: "codex-main",
        target_account_pool_id: "claude-main",
      }),
    );
    expect(screen.getByText("환승 준비")).toBeInTheDocument();
    expect(screen.getByLabelText("환승 정류장 체크포인트 단계")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대상 환경 검증" })).toBeInTheDocument();
  });

  it("allows an explicit same-provider resume while keeping connected-pool selection required", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([]);
    vi.mocked(continuityApi.createContinuityCheckpoint).mockResolvedValue(projection({ target_provider: "codex" }));
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={task} agents={[]} />);

    await screen.findByText("새 환승 체크포인트를 만들 수 있습니다.");
    fireEvent.change(screen.getByLabelText("현재 Codex 계정"), { target: { value: "codex-main" } });
    fireEvent.change(screen.getByLabelText("대상 제공자"), { target: { value: "codex" } });
    expect(screen.getByRole("button", { name: "체크포인트 만들기" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("대상 Codex 계정"), { target: { value: "codex-main" } });
    fireEvent.click(screen.getByRole("button", { name: "체크포인트 만들기" }));

    await waitFor(() =>
      expect(continuityApi.createContinuityCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ target_provider: "codex", target_account_pool_id: "codex-main" }),
      ),
    );
  });

  it("shows the server approval gate without inventing or exposing an approval value", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([
      projection({
        checkpoint_status: "approval_required",
        phase: "target_validated",
        phase_index: 2,
        blockers: ["approval_required"],
        next_safe_action: "obtain_control_plane_approval",
      }),
    ]);
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={task} agents={[]} />);

    expect(await screen.findByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByText(/화면에서 승인값을 만들지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "환승 승인" })).not.toBeInTheDocument();
  });

  it("does not offer an observation mutation after a fresh target is already running", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([
      projection({
        checkpoint_status: "accepted",
        phase: "resume_confirmed",
        phase_index: 5,
        target_run_id: "run:target",
        target_run_status: "running",
        cursor_run_id: "run:target",
        heartbeat_freshness: "fresh",
        reconcile_state: "in_sync",
        motion_eligible: true,
      }),
    ]);
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={task} agents={[]} />);

    expect(await screen.findByText("실행 예약 완료")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재개 상태 확인" })).not.toBeInTheDocument();
    expect(continuityApi.resumeContinuityCheckpoint).not.toHaveBeenCalled();
  });

  it("keeps creation blocked until the task projection contains a real source run ID", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([]);
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={{ ...task, continuity_source_run_id: null }} agents={[]} />);

    expect(await screen.findByText(/실제 실행 Run ID가 아직 연결되지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "체크포인트 만들기" })).toBeDisabled();
  });

  it("shows a truthful empty state when no connected target account exists", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([]);
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, { ...claudePool, status: "auth_required" }]);
    render(<ContinuityTransferPanel task={task} agents={[]} />);

    expect(await screen.findByText(/연결된 claude 계정이 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "체크포인트 만들기" })).toBeDisabled();
  });

  it("uses the canonical project path when a projected task has no runtime project id", async () => {
    vi.mocked(continuityApi.getTaskContinuityCheckpoints).mockResolvedValue([]);
    vi.mocked(continuityApi.createContinuityCheckpoint).mockResolvedValue(projection());
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    render(<ContinuityTransferPanel task={{ ...task, project_id: null }} agents={[]} />);

    await screen.findByText("새 환승 체크포인트를 만들 수 있습니다.");
    fireEvent.change(screen.getByLabelText("현재 Codex 계정"), { target: { value: "codex-main" } });
    fireEvent.change(screen.getByLabelText("대상 Claude 계정"), { target: { value: "claude-main" } });
    fireEvent.click(screen.getByRole("button", { name: "체크포인트 만들기" }));

    await waitFor(() =>
      expect(continuityApi.createContinuityCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: task.project_path, project_path: task.project_path }),
      ),
    );
  });

  it("clears the previous task projection before loading the next task", async () => {
    let resolveNext: ((items: ContinuityTransitProjectionView[]) => void) | undefined;
    vi.mocked(continuityApi.getTaskContinuityCheckpoints)
      .mockResolvedValueOnce([projection({ checkpoint_status: "approval_required" })])
      .mockImplementationOnce(
        () =>
          new Promise<ContinuityTransitProjectionView[]>((resolve) => {
            resolveNext = resolve;
          }),
      );
    vi.mocked(accountApi.getCliAccountPools).mockResolvedValue([codexPool, claudePool]);
    const { rerender } = render(<ContinuityTransferPanel task={task} agents={[]} />);

    expect(await screen.findByText("승인 대기")).toBeInTheDocument();
    rerender(
      <ContinuityTransferPanel
        task={{ ...task, id: "task-transfer-next", continuity_source_run_id: "run:source:next" }}
        agents={[]}
      />,
    );
    expect(screen.queryByText("승인 대기")).not.toBeInTheDocument();
    expect(screen.getByText("체크포인트 이력 확인 중")).toBeInTheDocument();
    resolveNext?.([]);
    await screen.findByText("새 환승 체크포인트를 만들 수 있습니다.");
  });
});
