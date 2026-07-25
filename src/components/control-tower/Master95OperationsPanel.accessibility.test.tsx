import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Master95Status } from "../../api/control-plane";
import { auditCriticalAccessibility } from "../../test/critical-accessibility-audit";
import Master95OperationsPanel from "./Master95OperationsPanel";

const statusFixture: Master95Status = {
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
  run_summaries: [
    {
      project_id: "project:BloggerGent",
      task_id: "task:quality-audit",
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

describe("Master95OperationsPanel critical accessibility", () => {
  it("has no critical structural findings and exposes named controls", () => {
    const { container } = render(<Master95OperationsPanel master95={statusFixture} />);

    expect(auditCriticalAccessibility(container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 2, name: /Run \/ Trace \/ Artifact/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(13);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
  });

  it("keeps native disclosure and action controls reachable in keyboard order", async () => {
    const user = userEvent.setup();
    render(<Master95OperationsPanel master95={statusFixture} />);

    const versionDisclosure = screen.getByText(/Agent .*read-only/);
    const retryButton = screen.getByRole("button", { name: "재시도 계획" });
    const traceDisclosure = screen.getByText(/Trace event/);
    const recoveryButton = screen.getByRole("button", { name: "재시작 상태 불러오기" });
    const projectSwitcher = screen.getByRole("combobox", { name: "Project 전환" });

    await user.tab();
    expect(recoveryButton).toHaveFocus();
    await user.tab();
    expect(projectSwitcher).toHaveFocus();
    await user.tab();
    expect(versionDisclosure).toHaveFocus();
    await user.tab();
    expect(retryButton).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "에스컬레이션 계획" })).toHaveFocus();
    await user.tab();
    expect(traceDisclosure).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "여정 1 리허설 확인" })).toHaveFocus();
  });
});
