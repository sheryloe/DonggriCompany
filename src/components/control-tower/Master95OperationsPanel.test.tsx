import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Master95Status } from "../../api/control-plane";
import type { DurableControlTowerSnapshot } from "../../api/control-tower";
import Master95OperationsPanel, { deriveControlTowerLaneOperations } from "./Master95OperationsPanel";

const controlTowerApi = vi.hoisted(() => ({
  read: vi.fn(),
  run: vi.fn(),
  action: vi.fn(),
  execute: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("../../api/control-tower", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/control-tower")>();
  return {
    ...original,
    readDurableControlTowerState: controlTowerApi.read,
    runDurableControlTowerJourney: controlTowerApi.run,
    runDurableControlTowerAction: controlTowerApi.action,
    executeDurableControlTowerMutation: controlTowerApi.execute,
    subscribeDurableControlTowerState: controlTowerApi.subscribe,
  };
});

function statusFixture(runCount = 1): Master95Status {
  return {
    spec_id: "20260714-donggricompany-95-master-operating-system-v1",
    generated_at: "2026-07-15T02:00:00.000Z",
    source_epoch: `sha256:${"a".repeat(64)}`,
    projection_epoch: `sha256:${"b".repeat(64)}`,
    phase: "phase-2-runtime-alpha-in-progress",
    certification_state: "not_certified_foundation_in_progress",
    root_active_spec_id: null,
    active_spec_is_master95: false,
    companion_mode: true,
    spec_dir: "G:\\spec",
    quality_root: "G:\\quality",
    docs: { spec: [], quality: [], missing_count: 0, missing: [] },
    dirty_worktree: { repo: "G:\\repo", count: 0, untracked_count: 0, grouped_changes: [], policy: "read-only" },
    approvals_required: [],
    scorecard_summary: {
      targets: {
        design_specification: 98,
        implementation_execution_evidence: 97,
        aggregate: 97.45,
        agy_each_axis_minimum: 950,
      },
      hard_gate_count: 10,
      blocking_gate_count: 3,
    },
    traceability_summary: { total: 20, implemented: 15, in_progress: 2, planned: 3, orphan_evidence: 0 },
    agent_versions: [
      {
        agent_id: "OPS",
        version: "1.0.0",
        lifecycle: "active",
        registered_at: "2026-07-14T00:00:00+09:00",
        activated_at: "2026-07-14T00:00:00+09:00",
        deactivated_at: null,
        manifest_id: "manifest:ops:1.0.0",
        display_name: "Operations Master",
        rollback_target_version: null,
      },
    ],
    live_pilot_projection: {
      source_path: "E:\\runtime\\pilot-runs.jsonl",
      event_source_path: "E:\\runtime\\pilot-events.jsonl",
      mode: "read-only",
      available: true,
      parse_error_count: 0,
      event_parse_error_count: 0,
      message: "정상적으로 읽었습니다.",
    },
    run_summaries:
      runCount === 0
        ? []
        : [
            {
              project_id: "project:BloggerGent",
              task_id: null,
              run_id: "run-20260715-001",
              trace_id: "trace-20260715-001",
              artifact_id: "artifact:report",
              artifact_refs: ["artifact:report"],
              status: "completed",
              critical: false,
              work_type: "quality-audit",
              scenario_type: "pilot",
              concurrency_group_id: "pilot-1",
              started_at: "2026-07-15T01:59:00.000Z",
              completed_at: "2026-07-15T02:00:00.000Z",
              agent_version: "ops-db-quality@1",
              skill_version: "master95@1",
              memory_version: "read-only",
              trace_span_count: 4,
              owner_department: "OPS",
              handoff_departments: ["OPS", "REVIEW"],
              events: [
                {
                  event_id: "event-1",
                  event_type: "run.started",
                  sequence: 1,
                  occurred_at: "2026-07-15T01:59:00.000Z",
                  department: null,
                  routing: ["OPS", "REVIEW"],
                  reason: null,
                  reason_code: null,
                  escalation_department: null,
                  decision: null,
                },
                {
                  event_id: "event-2",
                  event_type: "run.step_completed",
                  sequence: 2,
                  occurred_at: "2026-07-15T02:00:00.000Z",
                  department: "OPS",
                  routing: [],
                  reason: null,
                  reason_code: "runtime_preview:ops_responsibility",
                  escalation_department: null,
                  decision: null,
                },
              ],
              evidence_refs: ["EV-PILOT-001"],
            },
          ],
    bloggergent_ops: {
      department: "OPS",
      project_id: "project:BloggerGent",
      project_key: "BloggerGent",
      mode: "read-only-dry-run-routing-preview",
      role_agents: [],
      lanes: [],
      implementation_delegate: "IMPLEMENT",
      review_delegate: "REVIEW",
      approval_owner: "CONTROL",
      separately_approved_operations: [],
    },
    next_safe_action: "read-only",
  };
}

function durableFixture(): DurableControlTowerSnapshot {
  const now = "2026-07-15T04:30:00.000Z";
  return {
    root_project_id: "project:BloggerGent",
    root_project: {
      project_id: "project:BloggerGent",
      project_key: "BloggerGent",
      display_name: "BloggerGent Project Scope",
      owner_department: "OPS",
      implementation_delegate: "IMPLEMENT",
      lifecycle_status: "active",
      role_agents: ["ops-db-quality"],
      lanes: [
        {
          lane_id: "quality-index-analytics",
          group_id: "shared-infra",
          role_agent: "ops-db-quality",
          operating_mode: "dry-run",
        },
      ],
    },
    projects: [
      {
        project_id: "project:BloggerGent:sandbox:ui",
        root_project_id: "project:BloggerGent",
        display_name: "Control Tower UI",
        created_at: now,
        sandbox_only: true,
      },
    ],
    deployments: [
      {
        deployment_id: "deployment:ui",
        project_id: "project:BloggerGent:sandbox:ui",
        agent_id: "OPS",
        version: "1.0.0",
        lifecycle: "active",
        deployed_at: now,
        process_started: false,
      },
    ],
    tasks: [
      {
        task_id: "task:ui",
        project_id: "project:BloggerGent",
        title: "실패 원인 확인과 재실행",
        owner_department: "OPS",
        recommended_owner: "OPS",
        recommended_agent: "ops-db-quality",
        status: "WORKING",
        risk_level: "high",
        memory_status: "skipped",
        created_at: now,
        closed_at: now,
      },
    ],
    runs: [
      {
        run_id: "run:ui:1",
        project_id: "project:BloggerGent",
        task_id: "task:ui",
        trace_id: "trace:ui:1",
        parent_run_id: null,
        child_run_ids: ["run:ui:2"],
        owner_department: "OPS",
        agent_version: "OPS@1.0.0",
        skill_version: "control-tower-operations@1.0.0",
        memory_version: "read-only@1.0.0",
        status: "failed",
        failure_reason: "provider_timeout_after_checkpoint",
        next_action: "새 Run lineage로 재시도하세요.",
        token_count: 367,
        cost_usd: 0.0109,
        spans: [{ span_id: "span:ui:1", name: "routing", status: "error", started_at: now, ended_at: now }],
        started_at: now,
        completed_at: now,
      },
      {
        run_id: "run:ui:2",
        project_id: "project:BloggerGent",
        task_id: "task:ui",
        trace_id: "trace:ui:2",
        parent_run_id: "run:ui:1",
        child_run_ids: [],
        owner_department: "OPS",
        agent_version: "OPS@1.0.0",
        skill_version: "control-tower-operations@1.0.0",
        memory_version: "read-only@1.0.0",
        status: "completed",
        failure_reason: null,
        next_action: null,
        token_count: 418,
        cost_usd: 0.0127,
        spans: [{ span_id: "span:ui:2", name: "artifact", status: "ok", started_at: now, ended_at: now }],
        started_at: now,
        completed_at: now,
      },
    ],
    approvals: [
      {
        approval_id: "approval:ui",
        project_id: "project:BloggerGent",
        task_id: "task:ui",
        run_id: "run:ui:1",
        operation: "local-control-tower-proof",
        scope: "project:BloggerGent:task:ui",
        reason: "Step 18 approval clarity evidence",
        expires_at: now,
        next_action: "CONTROL이 범위를 확인하세요.",
        status: "approved",
        decided_by: "CONTROL",
        decided_at: now,
      },
    ],
    handoffs: [
      {
        handoff_id: "handoff:ui",
        project_id: "project:BloggerGent",
        task_id: "task:ui",
        run_id: "run:ui:2",
        trace_id: "trace:ui:2",
        from_department: "OPS",
        to_department: "CONTROL",
        purpose: "retry lineage review",
        scope: "project:BloggerGent:task:ui:run:ui:2",
        constraints: ["no external effect"],
        artifact_refs: [],
        acceptance_criteria: ["parent Run preserved", "new Trace issued"],
        status: "accepted",
        accepted_at: now,
      },
    ],
    artifacts: [
      {
        artifact_id: "artifact:ui",
        project_id: "project:BloggerGent",
        task_id: "task:ui",
        run_id: "run:ui:2",
        trace_id: "trace:ui:2",
        mime_type: "application/json",
        content_preview: '{"result":"verified"}',
        sha256: "a".repeat(64),
        verified: true,
        created_at: now,
        verified_at: now,
      },
    ],
    journeys: ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"].map((journeyId) => ({
      journey_id: journeyId as DurableControlTowerSnapshot["journeys"][number]["journey_id"],
      attempt_id: `ui-${journeyId}`,
      project_id: "project:BloggerGent",
      task_id: journeyId === "project-agent" ? null : "task:ui",
      run_id: journeyId === "project-agent" ? null : "run:ui:2",
      trace_id: journeyId === "project-agent" ? null : "trace:ui:2",
      completed_at: now,
      external_effect: false,
    })),
    event_count: 30,
  };
}

function preparedMutation(
  operation: string,
  label: string,
  scope: Record<string, unknown> = { external_effect: false },
) {
  const confirmation = `승인 ${operation} abcdef123456`;
  return {
    label,
    preview: {
      schema_version: "1.0.0",
      preview_id: `preview:${operation}`,
      spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
      project_id: "project:BloggerGent",
      operation,
      resolved_target: `project:BloggerGent/${operation}`,
      scope: {
        ...scope,
        external_effect: false,
        backup: "hash-chained-journal-and-checkpoint",
        rollback: "new-approved-operation",
      },
      command: { executable_id: "control-tower-v2", args: [], cwd_ref: "worktree:test" },
      target_digest: "a".repeat(64),
      scope_digest: "b".repeat(64),
      command_digest: "c".repeat(64),
      source_epoch: `sha256:${"d".repeat(64)}`,
      requester: "local-session",
      confirmation_text: confirmation,
      issued_at: "2026-07-25T00:00:00.000Z",
      expires_at: "2026-07-25T00:05:00.000Z",
    },
    approval_receipt: {
      approval_id: `approval:${operation}`,
      preview_id: `preview:${operation}`,
      spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
      project_id: "project:BloggerGent",
      operation,
      resolved_target: `project:BloggerGent/${operation}`,
      target_digest: "a".repeat(64),
      scope_digest: "b".repeat(64),
      command_digest: "c".repeat(64),
      source_epoch: `sha256:${"d".repeat(64)}`,
      issued_at: "2026-07-25T00:00:00.000Z",
      expires_at: "2026-07-25T00:05:00.000Z",
      requester: "local-session",
      approver: "local-session",
      receipt_sha256: "e".repeat(64),
    },
  };
}

describe("Master95OperationsPanel", () => {
  beforeEach(() => {
    controlTowerApi.read.mockReset();
    controlTowerApi.run.mockReset();
    controlTowerApi.action.mockReset();
    controlTowerApi.execute.mockReset();
    controlTowerApi.subscribe.mockReset();
    controlTowerApi.subscribe.mockResolvedValue(() => undefined);
  });

  it("derives isolated role-agent operating facts and labels shared-role lanes", () => {
    const snapshot = durableFixture();
    snapshot.root_project.role_agents.push("cloudflare-archive", "blogger-travel-en");
    snapshot.root_project.lanes.push(
      {
        lane_id: "cloudflare-archive",
        group_id: "cloudflare-blog",
        role_agent: "cloudflare-archive",
        operating_mode: "dry-run",
      },
      {
        lane_id: "mystery-cloudflare",
        group_id: "mystery-cloudflare-blog",
        role_agent: "cloudflare-archive",
        operating_mode: "dry-run",
      },
      {
        lane_id: "google-travel-en",
        group_id: "google-travel-blog",
        role_agent: "blogger-travel-en",
        operating_mode: "dry-run",
      },
    );
    snapshot.tasks.push({
      ...snapshot.tasks[0],
      task_id: "task:cloudflare",
      recommended_agent: "cloudflare-archive",
      status: "WAITING_APPROVAL",
      closed_at: null,
    });
    snapshot.runs.push({
      ...snapshot.runs[1],
      run_id: "run:cloudflare",
      task_id: "task:cloudflare",
      status: "running",
      completed_at: null,
    });
    snapshot.approvals.push({
      ...snapshot.approvals[0],
      approval_id: "approval:cloudflare",
      task_id: "task:cloudflare",
      run_id: "run:cloudflare",
      status: "pending",
      decided_by: null,
      decided_at: null,
    });
    snapshot.tasks.push({
      ...snapshot.tasks[0],
      task_id: "task:unassigned",
      recommended_agent: undefined,
    });

    const summaries = deriveControlTowerLaneOperations(snapshot);
    expect(summaries.find((item) => item.laneId === "quality-index-analytics")).toMatchObject({
      totalTasks: 1,
      activeTasks: 1,
      failedRuns: 1,
      status: "attention",
      sharedRoleAgent: false,
    });
    expect(summaries.filter((item) => item.roleAgent === "cloudflare-archive")).toEqual([
      expect.objectContaining({
        totalTasks: 1,
        blockedTasks: 1,
        activeRuns: 1,
        pendingApprovals: 1,
        sharedRoleAgent: true,
      }),
      expect.objectContaining({
        totalTasks: 1,
        blockedTasks: 1,
        activeRuns: 1,
        pendingApprovals: 1,
        sharedRoleAgent: true,
      }),
    ]);
    expect(summaries.find((item) => item.laneId === "google-travel-en")).toMatchObject({
      totalTasks: 0,
      activeTasks: 0,
      blockedTasks: 0,
      activeRuns: 0,
      failedRuns: 0,
      pendingApprovals: 0,
      status: "idle",
    });
  });

  it("shows lineage and creates retry/escalation dry-run plans without mutation", async () => {
    const user = userEvent.setup();
    render(<Master95OperationsPanel master95={statusFixture()} />);

    expect(screen.getByText("project:BloggerGent · Owner OPS")).toBeInTheDocument();
    expect(screen.getByText("run-20260715-001")).toBeInTheDocument();
    expect(screen.getByText("trace-20260715-001")).toBeInTheDocument();
    expect(screen.getByText("artifact:report")).toBeInTheDocument();
    expect(screen.getByText("EV-PILOT-001")).toBeInTheDocument();
    expect(screen.getByText("Trace event 2개 보기")).toBeInTheDocument();
    expect(screen.getByText("REVIEW")).toBeInTheDocument();
    expect(screen.getByText("Agent 버전 인벤토리 1개 · read-only")).toBeInTheDocument();
    expect(screen.getByText("OPS@1.0.0")).toBeInTheDocument();
    expect(screen.getByText("deploy/rollback mutation 미연결")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "재시도 계획" }));
    expect(screen.getByText("재시도 dry-run 계획")).toBeInTheDocument();
    expect(screen.getByText(/원 Run run-20260715-001을 보존/)).toBeInTheDocument();
    expect(screen.getByText("실행되지 않음 · DB write 없음 · 승인 API 미연결")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "에스컬레이션 계획" }));
    expect(screen.getByText("에스컬레이션 dry-run 계획")).toBeInTheDocument();
    expect(screen.getByText(/OPS에서 CONTROL로 원인/)).toBeInTheDocument();
  });

  it("shows cause and next action when there are no runs", () => {
    render(<Master95OperationsPanel master95={statusFixture(0)} />);

    expect(screen.getByText("표시할 live-pilot Run이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText(/원인: collector 파일이 없거나/)).toBeInTheDocument();
    expect(screen.getByText(/다음 조치: collector 상태/)).toBeInTheDocument();
  });

  it("subscribes to the active Project and applies isolated real-time snapshots without manual refresh", async () => {
    let callbacks:
      | {
          onStatus: (status: "connecting" | "connected" | "reconnecting" | "unsupported") => void;
          onSnapshot: (event: {
            reason: "connected" | "journey" | "action";
            emitted_at: string;
            snapshot: DurableControlTowerSnapshot;
          }) => void;
        }
      | undefined;
    const close = vi.fn();
    controlTowerApi.subscribe.mockImplementation(async (_projectId: string, nextCallbacks: typeof callbacks) => {
      callbacks = nextCallbacks;
      nextCallbacks?.onStatus("connecting");
      return close;
    });
    render(<Master95OperationsPanel master95={statusFixture()} />);

    await waitFor(() =>
      expect(controlTowerApi.subscribe).toHaveBeenCalledWith("project:BloggerGent", expect.any(Object)),
    );
    const snapshot = durableFixture();
    act(() => {
      callbacks?.onStatus("connected");
      callbacks?.onSnapshot({
        reason: "journey",
        emitted_at: "2026-07-15T05:15:00.000Z",
        snapshot,
      });
    });

    expect(screen.getByTestId("control-tower-stream-status")).toHaveTextContent("실시간 연결됨 · event 30 · journey");
    expect(screen.getByTestId("durable-control-tower-state")).toHaveTextContent("event 30");
    expect(screen.getByText(/마지막 실시간 갱신/)).toBeInTheDocument();
  });

  it("previews all five required journeys before explicit local evidence execution", async () => {
    const user = userEvent.setup();
    render(<Master95OperationsPanel master95={statusFixture()} />);

    expect(screen.getByText("0/5 durable · 5/5 previewable")).toBeInTheDocument();
    for (let index = 1; index <= 5; index += 1) {
      const button = screen.getByRole("button", { name: `여정 ${index} 리허설 확인` });
      await user.click(button);
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("journey-readiness-preview")).toHaveTextContent("preview only");
      expect(screen.getByTestId("journey-readiness-preview")).toHaveTextContent("남은 조건:");
    }
    expect(screen.getByText(/durable close API/)).toBeInTheDocument();
  });

  it("executes all five bounded local journeys and exposes approval, Trace, Handoff, cost, Memory, and Artifact facts", async () => {
    const user = userEvent.setup();
    const snapshot = durableFixture();
    controlTowerApi.run.mockImplementation(async (_projectId: string, journeyId: string, label: string) =>
      preparedMutation(`control-tower.journey.${journeyId}`, label),
    );
    controlTowerApi.execute.mockResolvedValue({
      status: "executed",
      result: { result: snapshot.journeys[0], duplicate: false, snapshot },
      approval_id: "approval:journey",
      receipt_sha256: "e".repeat(64),
    });
    render(<Master95OperationsPanel master95={statusFixture()} />);

    for (const journeyId of ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"]) {
      await user.click(screen.getByTestId(`execute-journey-${journeyId}`));
      const approval = await screen.findByTestId("control-tower-v2-approval");
      const required = approval.querySelector("code")?.textContent ?? "";
      await user.type(screen.getByRole("textbox", { name: "확인문 직접 입력" }), required);
      await user.click(screen.getByRole("button", { name: "승인된 변경 실행" }));
      await waitFor(() => expect(screen.queryByTestId("control-tower-v2-approval")).not.toBeInTheDocument());
    }
    await waitFor(() => expect(controlTowerApi.run).toHaveBeenCalledTimes(5));
    expect(controlTowerApi.execute).toHaveBeenCalledTimes(5);

    expect(screen.getByText("5/5 durable · 5/5 previewable")).toBeInTheDocument();
    expect(screen.getByTestId("durable-control-tower-state")).toHaveTextContent("event 30");
    expect(screen.getByText(/local-control-tower-proof/)).toBeInTheDocument();
    expect(screen.getByText(/Step 18 approval clarity evidence/)).toBeInTheDocument();
    expect(screen.getAllByText(/provider_timeout_after_checkpoint/)).toHaveLength(2);
    expect(screen.getByText(/OPS → CONTROL/)).toBeInTheDocument();
    expect(screen.getByText(/verified=true/)).toBeInTheDocument();
    expect(screen.getAllByText(/Memory skipped/)).toHaveLength(2);
    expect(screen.getByText(/Token \/ Cost/)).toBeInTheDocument();
    expect(screen.getByText("Agent 조직·운영 레인 1명 / 1개")).toBeInTheDocument();
    expect(screen.getByTestId("lane-operations-quality-index-analytics")).toHaveTextContent("Task 1/1");
    expect(screen.getByTestId("lane-operations-quality-index-analytics")).toHaveTextContent("실패 1");
    expect(screen.getByTestId("lane-operations-quality-index-analytics")).toHaveTextContent("확인 필요");
    expect(screen.getByText("Skill·Memory·Agent 버전 상태 2개 Run")).toBeInTheDocument();
    expect(screen.getByText("승인 대기함 0건 · 전체 이력 1건")).toBeInTheDocument();
    expect(screen.getByText("장애·차단 업무 1건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업 생성 및 진행 시작" })).toBeInTheDocument();
  });

  it("switches Project context, discards the previous durable view, and reloads the selected Project only", async () => {
    const user = userEvent.setup();
    const cardNews = durableFixture();
    cardNews.root_project_id = "project:CardNewsAgent";
    cardNews.root_project = {
      ...cardNews.root_project,
      project_id: "project:CardNewsAgent",
      project_key: "CardNewsAgent",
      display_name: "CardNewsAgent Project Scope",
    };
    controlTowerApi.read.mockResolvedValue(cardNews);

    render(
      <Master95OperationsPanel
        master95={statusFixture()}
        initialProjectId="project:BloggerGent"
        projectOptions={[
          { project_id: "project:BloggerGent", project_key: "BloggerGent" },
          { project_id: "project:CardNewsAgent", project_key: "CardNewsAgent" },
        ]}
      />,
    );

    const switcher = screen.getByRole("combobox", { name: "Project 전환" });
    await user.selectOptions(switcher, "project:CardNewsAgent");
    expect(switcher).toHaveValue("project:CardNewsAgent");
    expect(screen.getByText("CardNewsAgent 운영 범위")).toBeInTheDocument();
    expect(screen.getByText(/로컬 상태를 불러오세요/)).toBeInTheDocument();
    expect(screen.queryByTestId("durable-control-tower-state")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "재시작 상태 불러오기" }));
    await screen.findByTestId("durable-control-tower-state");
    expect(controlTowerApi.read).toHaveBeenCalledWith("project:CardNewsAgent", expect.any(AbortSignal));
    expect(screen.getByText("CardNewsAgent Project Scope 운영 범위")).toBeInTheDocument();
  });

  it("discards a delayed restart response from the previously selected Project", async () => {
    const user = userEvent.setup();
    let resolveRead: ((value: Record<string, unknown>) => void) | undefined;
    controlTowerApi.read.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    render(
      <Master95OperationsPanel
        master95={statusFixture()}
        initialProjectId="project:BloggerGent"
        projectOptions={[
          { project_id: "project:BloggerGent", project_key: "BloggerGent" },
          { project_id: "project:CardNewsAgent", project_key: "CardNewsAgent" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "재시작 상태 불러오기" }));
    await waitFor(() => expect(controlTowerApi.read).toHaveBeenCalledTimes(1));
    const switcher = screen.getByRole("combobox", { name: "Project 전환" });
    await user.selectOptions(switcher, "project:CardNewsAgent");
    await waitFor(() => expect(switcher).toHaveValue("project:CardNewsAgent"));
    expect(screen.getByText("CardNewsAgent 운영 범위")).toBeInTheDocument();
    await act(async () => {
      resolveRead?.({
        ok: true,
        external_effect: false,
        source_epoch: `sha256:${"a".repeat(64)}`,
        projection_epoch: `sha256:${"b".repeat(64)}`,
        snapshot_version: `sha256:${"b".repeat(64)}`,
        ...durableFixture(),
      });
    });

    expect(switcher).toHaveValue("project:CardNewsAgent");
    expect(screen.getByText("CardNewsAgent 운영 범위")).toBeInTheDocument();
    expect(screen.queryByTestId("durable-control-tower-state")).not.toBeInTheDocument();
  });

  it("exposes the current owner within the ten-second machine-observation threshold", () => {
    const startedAt = performance.now();
    render(<Master95OperationsPanel master95={statusFixture()} />);
    expect(screen.getByTestId("current-owner")).toHaveTextContent("OPS");
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it("exposes and executes the bounded owner, Run, approval, Agent, escalation, and Artifact controls", async () => {
    const user = userEvent.setup();
    const current = durableFixture();
    current.runs[1].status = "running";
    current.runs[1].completed_at = null;
    current.approvals = [
      { ...current.approvals[0], approval_id: "approval:approve", operation: "approve-candidate", status: "pending" },
      { ...current.approvals[0], approval_id: "approval:reject", operation: "reject-candidate", status: "pending" },
    ];
    controlTowerApi.read.mockResolvedValue(structuredClone(current));
    controlTowerApi.action.mockImplementation(
      async (_rootProjectId: string, actionId: string, targetId: string, value?: string, label?: string) =>
        preparedMutation(`control-tower.action.${actionId}`, label ?? actionId, {
          target_id: targetId,
          ...(value ? { value } : {}),
        }),
    );
    controlTowerApi.execute.mockImplementation(async (pending: ReturnType<typeof preparedMutation>) => {
      const actionId = pending.preview.operation.replace("control-tower.action.", "");
      const targetId = String((pending.preview.scope as Record<string, unknown>).target_id);
      const value = (pending.preview.scope as Record<string, unknown>).value;
      if (actionId === "agent-recommend") current.tasks[0].recommended_agent = String(value ?? "OPS");
      if (actionId === "owner-change") {
        current.tasks[0].owner_department = String(value ?? "REVIEW");
        current.runs[1].owner_department = String(value ?? "REVIEW");
      }
      if (actionId === "run-pause") current.runs.find((run) => run.run_id === targetId)!.status = "paused";
      if (actionId === "run-resume") current.runs.find((run) => run.run_id === targetId)!.status = "running";
      if (actionId === "run-cancel") current.runs.find((run) => run.run_id === targetId)!.status = "canceled";
      if (actionId === "approval-approve") {
        current.approvals.find((approval) => approval.approval_id === targetId)!.status = "approved";
      }
      if (actionId === "approval-reject") {
        current.approvals.find((approval) => approval.approval_id === targetId)!.status = "rejected";
      }
      if (actionId === "agent-rollback") {
        current.deployments[0].rollback_from_version = current.deployments[0].version;
        current.deployments[0].version = String(value ?? "0.9.0");
        current.deployments[0].lifecycle = "rolled_back";
      }
      if (actionId === "agent-revoke") current.deployments[0].lifecycle = "revoked";
      current.event_count += 2;
      return {
        status: "executed",
        result: {
          duplicate: false,
          result: { action_id: actionId, target_id: targetId },
          snapshot: structuredClone(current),
        },
        approval_id: pending.approval_receipt.approval_id,
        receipt_sha256: pending.approval_receipt.receipt_sha256,
      };
    });
    render(<Master95OperationsPanel master95={statusFixture()} />);

    await user.click(screen.getByRole("button", { name: "재시작 상태 불러오기" }));
    await screen.findByTestId("durable-control-tower-state");
    async function approve(buttonName: string) {
      await user.click(screen.getByRole("button", { name: buttonName }));
      const approval = await screen.findByTestId("control-tower-v2-approval");
      const required = approval.querySelector("code")?.textContent ?? "";
      await user.type(screen.getByRole("textbox", { name: "확인문 직접 입력" }), required);
      await user.click(screen.getByRole("button", { name: "승인된 변경 실행" }));
      await waitFor(() => expect(screen.queryByTestId("control-tower-v2-approval")).not.toBeInTheDocument());
    }
    await approve("run:ui:2 Agent 추천");
    await approve("run:ui:2 Owner 변경");
    await approve("run:ui:2 일시정지");
    await approve("run:ui:2 재개");
    await approve("run:ui:2 취소");
    await approve("approve-candidate 승인");
    await approve("reject-candidate 거절");
    await approve("run:ui:1 재시도");
    await approve("run:ui:1 에스컬레이션");
    await approve("OPS Agent 롤백");
    await approve("OPS Agent 회수");
    await user.click(screen.getByRole("button", { name: "Artifact 열기" }));

    expect(controlTowerApi.action).toHaveBeenCalledTimes(11);
    expect(controlTowerApi.execute).toHaveBeenCalledTimes(11);
    expect(screen.getByText('{"result":"verified"}')).toBeInTheDocument();
    expect(screen.getByText(/revoked · process_started=false/)).toBeInTheDocument();
  });
});
