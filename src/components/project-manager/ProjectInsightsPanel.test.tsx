import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProjectHealth,
  getProjectModules,
  recoverProjectOrphanTask,
  type ProjectDecisionEventItem,
  type ProjectTaskHistoryItem,
} from "../../api";
import { approveMemoryPromotion, drainBeadsOutbox, scanMemoryPromotions } from "../../api/memory";
import type { Agent, Project, ProjectMemoryResponse } from "../../types";
import type { GroupedProjectTaskCard } from "./types";
import ProjectInsightsPanel from "./ProjectInsightsPanel";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    getProjectModules: vi.fn(async () => ({ bindings: [] })),
    getProjectHealth: vi.fn(async () => ({
      ok: true,
      project: {
        id: "project-1",
        name: "Empire",
        project_path: "D:\\Projects\\Empire",
        core_goal: "Stabilize rollout",
      },
      health: "critical",
      summary: {
        total_tasks: 2,
        open_tasks: 2,
        done_tasks: 0,
        cancelled_tasks: 0,
        orphan_candidates: 1,
        qa_hold_items: 1,
        review_waiting: 1,
        active_running: 0,
      },
      status_counts: { inbox: 1, review: 1 },
      department_counts: { dev: 1, qa: 1 },
      blockers: [
        {
          id: "orphan-1",
          title: "Delegated implementation stalled",
          status: "inbox",
          task_type: "development",
          priority: 1,
          department_id: "dev",
          department_name: "Development",
          department_name_ko: "개발",
          assigned_agent_id: "agent-1",
          assigned_agent_name: "Planner",
          assigned_agent_name_ko: "기획 리더",
          source_task_id: "task-1",
          latest_log: "Recovery watchdog moved orphan task to inbox.",
          result_excerpt: null,
          evidence_reason: "orphan_candidate",
          created_at: 1,
          updated_at: 2,
        },
        {
          id: "qa-1",
          title: "QA GO/NO-GO Hold",
          status: "review",
          task_type: "general",
          priority: 1,
          department_id: "qa",
          department_name: "QA",
          department_name_ko: "QA",
          assigned_agent_id: "agent-1",
          assigned_agent_name: "Planner",
          assigned_agent_name_ko: "기획 리더",
          source_task_id: null,
          latest_log: "QA Hold: empty state and 430px screenshot missing.",
          result_excerpt: null,
          evidence_reason: "qa_hold_evidence",
          created_at: 1,
          updated_at: 2,
        },
      ],
      orphan_candidates: [
        {
          id: "orphan-1",
          title: "Delegated implementation stalled",
          status: "inbox",
          task_type: "development",
          priority: 1,
          department_id: "dev",
          department_name: "Development",
          department_name_ko: "개발",
          assigned_agent_id: "agent-1",
          assigned_agent_name: "Planner",
          assigned_agent_name_ko: "기획 리더",
          source_task_id: "task-1",
          latest_log: "Recovery watchdog moved orphan task to inbox.",
          result_excerpt: null,
          evidence_reason: "orphan_candidate",
          created_at: 1,
          updated_at: 2,
        },
      ],
      generated_at: 3,
    })),
    recoverProjectOrphanTask: vi.fn(async () => ({
      ok: true,
      task: {
        id: "orphan-1",
        title: "Delegated implementation stalled",
        status: "planned",
        task_type: "development",
        priority: 1,
        department_id: "dev",
        department_name: "Development",
        department_name_ko: "개발",
        assigned_agent_id: "agent-1",
        assigned_agent_name: "Planner",
        assigned_agent_name_ko: "기획 리더",
        source_task_id: "task-1",
        latest_log: "ORPHAN_RECOVERY queued by project health panel",
        result_excerpt: null,
        evidence_reason: "orphan_recovered",
        created_at: 1,
        updated_at: 3,
      },
      previous_status: "inbox",
      status: "planned",
    })),
    getMemorySearchProfiles: vi.fn(async () => []),
    saveMemorySearchProfile: vi.fn(async (input: any) => ({
      id: "profile-1",
      kind: input.kind,
      owner_key: "local",
      project_id: input.project_id ?? null,
      label: input.label ?? input.query ?? "",
      query: input.query ?? "",
      filters_json: JSON.stringify(input.filters ?? {}),
      last_used_at: 1,
      use_count: 1,
      created_at: 1,
      updated_at: 1,
    })),
    deleteMemorySearchProfile: vi.fn(async () => undefined),
    getQualityMetricSummary: vi.fn(async () => []),
    searchMemory: vi.fn(async () => ({ ok: true, memories: [], quality_metrics: [] })),
  };
});

const getProjectModulesMock = vi.mocked(getProjectModules);
const getProjectHealthMock = vi.mocked(getProjectHealth);
const recoverProjectOrphanTaskMock = vi.mocked(recoverProjectOrphanTask);

vi.mock("../../api/memory", () => ({
  approveMemoryPromotion: vi.fn(async (id: string) => ({ id, status: "approved" })),
  drainBeadsOutbox: vi.fn(async () => ({ ok: true, processed: 1, succeeded: 1, failed: 0, items: [] })),
  scanMemoryPromotions: vi.fn(async () => []),
}));

const approveMemoryPromotionMock = vi.mocked(approveMemoryPromotion);
const drainBeadsOutboxMock = vi.mocked(drainBeadsOutbox);
const scanMemoryPromotionsMock = vi.mocked(scanMemoryPromotions);

function buildProject(): Project {
  return {
    id: "project-1",
    name: "Empire",
    project_path: "D:\\Projects\\Empire",
    core_goal: "Stabilize rollout",
    assignment_mode: "auto",
    last_used_at: null,
    created_at: 1,
    updated_at: 1,
  };
}

function buildAgent(): Agent {
  return {
    id: "agent-1",
    name: "Planner",
    name_ko: "기획 리더",
    department_id: "planning",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "P",
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 1,
  };
}

function buildTask(overrides: Partial<ProjectTaskHistoryItem> = {}): ProjectTaskHistoryItem {
  return {
    id: "task-1",
    title: "Canonical migration",
    status: "in_progress",
    task_type: "task",
    priority: 1,
    source_task_id: null,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_100_000,
    completed_at: null,
    assigned_agent_id: "agent-1",
    assigned_agent_name: "Planner",
    assigned_agent_name_ko: "기획 리더",
    ...overrides,
  };
}

function buildGroupedTaskCards(items: ProjectTaskHistoryItem[]): GroupedProjectTaskCard[] {
  return items.map((root) => ({
    root,
    children: [],
    latestAt: root.updated_at,
  }));
}

describe("ProjectInsightsPanel rollout20", () => {
  beforeEach(() => {
    getProjectModulesMock.mockResolvedValue({ bindings: [], apply_runs: [] });
    approveMemoryPromotionMock.mockClear();
    drainBeadsOutboxMock.mockClear();
    scanMemoryPromotionsMock.mockClear();
    getProjectHealthMock.mockClear();
    recoverProjectOrphanTaskMock.mockClear();
  });

  it("renders rollout20 sample badge and progress timeline", async () => {
    render(
      <ProjectInsightsPanel
        t={(messages) => messages.en}
        selectedProject={buildProject()}
        loadingDetail={false}
        isCreating={false}
        groupedTaskCards={[]}
        sortedReports={[]}
        sortedDecisionEvents={[]}
        getDecisionEventLabel={(eventType) => eventType}
        handleOpenTaskDetail={vi.fn(async () => undefined)}
        agents={[buildAgent()]}
      />,
    );

    await waitFor(() => expect(getProjectModulesMock).toHaveBeenCalledWith("project-1"));

    fireEvent.click(screen.getByRole("button", { name: "Rollout 20" }));

    expect(screen.getByText("Rollout 20 Progress")).toBeInTheDocument();
    expect(screen.getByText("Sample Data")).toBeInTheDocument();
    expect(screen.getByText("Step Timeline")).toBeInTheDocument();
    expect(screen.getByText("20-A Locale")).toBeInTheDocument();
  });

  it("shows blocking reason when decision history contains hard-block signals", async () => {
    const decisionEvents: ProjectDecisionEventItem[] = [
      {
        id: 1,
        snapshot_hash: "hash-1",
        event_type: "start_review_meeting_blocked",
        summary: "approval_gate_blocked: release authority missing",
        selected_options_json: null,
        note: "authority_not_met",
        task_id: "task-1",
        meeting_id: "meeting-1",
        created_at: 1_700_000_200_000,
      },
    ];

    render(
      <ProjectInsightsPanel
        t={(messages) => messages.en}
        selectedProject={buildProject()}
        loadingDetail={false}
        isCreating={false}
        groupedTaskCards={buildGroupedTaskCards([buildTask()])}
        sortedReports={[]}
        sortedDecisionEvents={decisionEvents}
        getDecisionEventLabel={(eventType) => eventType}
        handleOpenTaskDetail={vi.fn(async () => undefined)}
        agents={[buildAgent()]}
      />,
    );

    await waitFor(() => expect(getProjectModulesMock).toHaveBeenCalledWith("project-1"));

    fireEvent.click(screen.getByRole("button", { name: "Rollout 20" }));

    expect(screen.getByText(/Blocking Reason/i)).toBeInTheDocument();
    expect(screen.getByText(/approval_gate_blocked/i)).toBeInTheDocument();
  });

  it("approves global skill candidates and retries Beads outbox from memory view", async () => {
    const projectMemory: ProjectMemoryResponse = {
      ok: true,
      memories: [],
      skill_usage: [],
      beads_status: {
        installed: true,
        initialized: true,
        project_path: "D:\\Projects\\Empire",
        beads_dir: "D:\\Projects\\Empire\\.beads",
        version: "test",
        ready_count: 1,
        error: null,
      },
      memory_outbox: [
        {
          id: "outbox-1",
          project_id: "project-1",
          target: "beads",
          operation: "create_issue",
          payload_json: "{}",
          status: "pending",
          attempt_count: 0,
          last_error: null,
          next_retry_at: null,
          external_ref: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      promotion_candidates: [
        {
          id: "candidate-1",
          candidate_key: "skill:react-router-repair",
          candidate_type: "skill",
          title: "Global skill candidate: react-router-repair",
          summary: "Repeatedly succeeded across projects.",
          tags_json: "[]",
          evidence_json: "{}",
          evidence_count: 3,
          project_count: 3,
          confidence: 0.9,
          status: "candidate",
          approved_at: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      quality_events: [
        {
          id: "quality-1",
          project_id: "project-1",
          event_type: "memory_reconcile",
          title: "Project memory reconcile",
          summary: "프로젝트 기억과 skill 사용 이력을 검증했습니다.",
          evidence_json: "{}",
          status: "recorded",
          created_at: 1,
        },
      ],
    };

    render(
      <ProjectInsightsPanel
        t={(messages) => messages.ko}
        selectedProject={buildProject()}
        loadingDetail={false}
        isCreating={false}
        groupedTaskCards={[]}
        sortedReports={[]}
        sortedDecisionEvents={[]}
        getDecisionEventLabel={(eventType) => eventType}
        handleOpenTaskDetail={vi.fn(async () => undefined)}
        projectMemory={projectMemory}
        agents={[buildAgent()]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "프로젝트 기억" }));
    expect(screen.getByTestId("memory-selected-project")).toHaveTextContent("Empire");
    expect(screen.getByText("품질 증거")).toBeInTheDocument();
    expect(screen.getByText("Project memory reconcile")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Beads Outbox 동기화 재시도" }));
    await waitFor(() => expect(drainBeadsOutboxMock).toHaveBeenCalledWith("project-1"));

    fireEvent.click(screen.getByRole("button", { name: "전사 지식으로 승인" }));
    await waitFor(() => expect(approveMemoryPromotionMock).toHaveBeenCalledWith("candidate-1"));

    fireEvent.click(screen.getByRole("button", { name: "후보 재스캔" }));
    await waitFor(() => expect(scanMemoryPromotionsMock).toHaveBeenCalled());
  });

  it("renders project health panel and queues orphan recovery", async () => {
    const onProjectHealthChanged = vi.fn(async () => undefined);
    render(
      <ProjectInsightsPanel
        t={(messages) => messages.ko}
        selectedProject={buildProject()}
        loadingDetail={false}
        isCreating={false}
        groupedTaskCards={[]}
        sortedReports={[]}
        sortedDecisionEvents={[]}
        getDecisionEventLabel={(eventType) => eventType}
        handleOpenTaskDetail={vi.fn(async () => undefined)}
        agents={[buildAgent()]}
        onProjectHealthChanged={onProjectHealthChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    await waitFor(() => expect(getProjectHealthMock).toHaveBeenCalledWith("project-1"));

    expect(screen.getByTestId("project-health-panel")).toBeInTheDocument();
    expect(screen.getByText("프로젝트 Health Panel")).toBeInTheDocument();
    expect(screen.getByText("고아 복구 액션")).toBeInTheDocument();
    expect(screen.getByText("QA Hold 증거 부족")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "대기열 복구" }));
    await waitFor(() => expect(recoverProjectOrphanTaskMock).toHaveBeenCalledWith("project-1", "orphan-1"));
    await waitFor(() => expect(onProjectHealthChanged).toHaveBeenCalled());
  });
});
