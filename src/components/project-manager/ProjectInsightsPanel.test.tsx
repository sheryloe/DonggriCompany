import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDecisionEventItem, ProjectTaskHistoryItem } from "../../api";
import type { Project } from "../../types";
import type { GroupedProjectTaskCard } from "./types";
import ProjectInsightsPanel from "./ProjectInsightsPanel";

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
  it("renders rollout20 sample badge and progress timeline", () => {
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rollout 20" }));

    expect(screen.getByText("Rollout 20 Progress")).toBeInTheDocument();
    expect(screen.getByText("Sample Data")).toBeInTheDocument();
    expect(screen.getByText("Step Timeline")).toBeInTheDocument();
    expect(screen.getByText("20-A Locale")).toBeInTheDocument();
  });

  it("shows blocking reason when decision history contains hard-block signals", () => {
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rollout 20" }));

    expect(screen.getByText(/Blocking Reason/i)).toBeInTheDocument();
    expect(screen.getByText(/approval_gate_blocked/i)).toBeInTheDocument();
  });
});
