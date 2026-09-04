import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContinuityLiveProjection } from "../../api/continuity";
import type { Agent, Task } from "../../types";
import ContinuityTransitMap from "./ContinuityTransitMap";

const claudeAgent = {
  id: "claude-master",
  name: "Claude Master",
  name_ko: "클로드 마스터",
  department_id: "development",
  role: "team_leader",
  cli_provider: "claude",
  avatar_emoji: "",
  status: "working",
  current_task_id: "task-1",
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: 1,
} as Agent;

const codexAgent = {
  ...claudeAgent,
  id: "codex-master",
  name: "Codex Master",
  name_ko: "코덱스 마스터",
  cli_provider: "codex",
} as Agent;

const task = {
  id: "task-1",
  title: "연속성 구현",
  description: null,
  department_id: "development",
  assigned_agent_id: claudeAgent.id,
  project_id: "DonggriCompany",
  status: "in_progress",
  priority: 3,
  task_type: "general",
  project_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
  result: null,
  started_at: 2,
  completed_at: null,
  created_at: 1,
  updated_at: 3,
  subtask_total: 4,
  subtask_done: 2,
} as Task;

function liveProjection(overrides: Partial<ContinuityLiveProjection> = {}): ContinuityLiveProjection {
  const now = new Date().toISOString();
  return {
    project_id: "DonggriCompany",
    task_id: task.id,
    checkpoint_id: "checkpoint:base",
    checkpoint_sequence: 3,
    checkpoint_status: "accepted",
    phase: "resume_confirmed",
    phase_index: 5,
    source_run_id: "run:source",
    source_provider: "codex",
    source_run_status: "paused",
    target_run_id: "run:target",
    target_provider: "claude",
    target_run_status: "running",
    cursor_run_id: "run:target",
    state_version: 2,
    event_sequence: 3,
    heartbeat_at: now,
    heartbeat_freshness: "fresh",
    heartbeat_age_ms: 1_000,
    reconcile_state: "in_sync",
    latest_event: {
      run_id: "run:target",
      sequence: 3,
      event_type: "runner.child_started",
      occurred_at: now,
    },
    blockers: [],
    next_safe_action: "monitor_live_run",
    motion_eligible: true,
    updated_at: now,
    observed_at: now,
    sync_state: "exact",
    ...overrides,
  };
}

describe("ContinuityTransitMap", () => {
  it("does not invent transfer progress from a general task status", () => {
    render(<ContinuityTransitMap tasks={[task]} agents={[claudeAgent]} projects={[]} onOpenTask={vi.fn()} />);

    const line = screen.getByRole("button");
    expect(screen.getByText("실행 제공자 미확인 · 연속성 실행 기록 없음")).toBeInTheDocument();
    expect(screen.getByText("기록 미연결")).toBeInTheDocument();
    expect(screen.getByLabelText(/현재 환승 정류장 운행 기록 없음/)).toBeInTheDocument();
    expect(line).toHaveClass("is-unassigned", "is-continuity-untracked");
    expect(line).not.toHaveClass("is-live-motion");
    expect(screen.queryByAltText("Claude Master")).not.toBeInTheDocument();
  });

  it("shows a character-led empty state instead of a blank dashboard", () => {
    render(<ContinuityTransitMap tasks={[]} agents={[]} projects={[]} onOpenTask={vi.fn()} />);
    expect(screen.getByText("첫 운행을 기다리고 있습니다.")).toBeInTheDocument();
    expect(screen.getByAltText("대기 중인 운영 캐릭터")).toBeInTheDocument();
  });

  it("moves only a persisted running target with fresh heartbeat and exact live sync", () => {
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[claudeAgent, codexAgent]}
        projects={[]}
        continuity={[liveProjection()]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText("codex → claude · 대상 실행 중")).toBeInTheDocument();
    expect(screen.getByText("실시간 운행")).toBeInTheDocument();
    expect(screen.getByText("실시간 순서 검증됨")).toBeInTheDocument();
    expect(screen.getByLabelText(/현재 환승 정류장 재개 확인/)).toBeInTheDocument();
    expect(screen.getByAltText("Claude Master")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveClass("is-claude", "is-continuity-active", "is-live-motion");
  });

  it.each([
    ["snapshot", "서버 스냅샷"],
    ["gap", "이벤트 누락 재검증 중"],
    ["run_changed", "실행 전환 재검증 중"],
    ["offline", "실시간 연결 끊김"],
  ] as const)("freezes the character while sync state is %s", (syncState, label) => {
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[claudeAgent]}
        projects={[]}
        continuity={[liveProjection({ sync_state: syncState })]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
    if (syncState !== "snapshot") expect(screen.getByText("이동 정지·재검증")).toBeInTheDocument();
  });

  it.each([
    ["connecting", "실시간 연결 준비 중"],
    ["reconnecting", "실시간 재연결 중"],
    ["auth_recovering", "실시간 인증 복구 중"],
  ] as const)("freezes exact motion and identifies %s connection state", (connectionState, label) => {
    render(
      <ContinuityTransitMap
        connectionState={connectionState}
        tasks={[task]}
        agents={[claudeAgent]}
        projects={[]}
        continuity={[liveProjection()]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    expect(screen.getByText("이동 정지·재검증")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
  });

  it("freezes a stale heartbeat at dispatch reservation", () => {
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[claudeAgent]}
        projects={[]}
        continuity={[
          liveProjection({
            phase: "dispatch_reserved",
            phase_index: 4,
            heartbeat_freshness: "stale",
            heartbeat_age_ms: 120_000,
            reconcile_state: "reconcile_required",
            blockers: ["heartbeat_stale"],
            motion_eligible: false,
          }),
        ]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText("차단 사유 · heartbeat_stale")).toBeInTheDocument();
    expect(screen.getByLabelText(/현재 환승 정류장 실행 예약/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveClass("is-continuity-uncertain");
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
  });

  it("marks an exact projection as uncertain when the client observation expires", () => {
    const now = Date.now();
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[claudeAgent]}
        projects={[]}
        continuity={[
          liveProjection({
            observed_at: new Date(now - 20_000).toISOString(),
            heartbeat_at: new Date(now - 1_000).toISOString(),
          }),
        ]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText("이동 정지·재검증")).toBeInTheDocument();
    expect(screen.getByText("실시간 확인 만료·재검증 대기")).toBeInTheDocument();
    expect(screen.getByText("차단 사유 · client_projection_stale")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveClass("is-continuity-uncertain");
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
  });

  it("shows approval as a blocked target-validated station", () => {
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[codexAgent]}
        projects={[]}
        continuity={[
          liveProjection({
            checkpoint_status: "approval_required",
            phase: "target_validated",
            phase_index: 2,
            target_run_id: null,
            target_run_status: null,
            cursor_run_id: "run:source",
            event_sequence: 2,
            motion_eligible: false,
            sync_state: "snapshot",
            blockers: ["approval_required"],
          }),
        ]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText("운행 차단")).toBeInTheDocument();
    expect(screen.getByText("codex → claude · 승인 대기")).toBeInTheDocument();
    expect(screen.getByLabelText(/현재 환승 정류장 대상 검증/)).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
  });

  it("keeps task lifecycle counts separate and avoids a fake percentage", () => {
    const unknownTotalTask = { ...task, subtask_total: undefined, subtask_done: undefined } as Task;
    render(
      <ContinuityTransitMap
        tasks={[unknownTotalTask]}
        agents={[]}
        projects={[]}
        continuity={[liveProjection()]}
        onOpenTask={vi.fn()}
      />,
    );
    expect(screen.getByText("업무 상태 in_progress · 작업 총량 미정")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("does not borrow an unrelated provider character for a projection", () => {
    render(
      <ContinuityTransitMap
        tasks={[task]}
        agents={[{ ...claudeAgent, current_task_id: "another-task" }]}
        projects={[]}
        continuity={[liveProjection()]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.queryByAltText("Claude Master")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveClass("is-agent-unassigned");
    expect(screen.getByRole("button")).not.toHaveClass("is-live-motion");
  });

  it("prioritizes risky projections ahead of untracked tasks", () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      ...task,
      id: `task-${index}`,
      title: `업무 ${index}`,
      updated_at: 100 - index,
    })) as Task[];
    render(
      <ContinuityTransitMap
        tasks={tasks}
        agents={[]}
        projects={[]}
        continuity={[
          liveProjection({
            task_id: "task-6",
            checkpoint_id: "checkpoint:risk",
            checkpoint_status: "dispatch_uncertain",
            target_run_status: "dispatch_uncertain",
            phase: "dispatch_reserved",
            phase_index: 4,
            reconcile_state: "reconcile_required",
            blockers: ["reconcile_required"],
            motion_eligible: false,
          }),
        ]}
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByText("업무 6")).toBeInTheDocument();
    expect(screen.queryByText("업무 5")).not.toBeInTheDocument();
    expect(screen.getByText("이동 정지·재검증")).toBeInTheDocument();
  });
});
