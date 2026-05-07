import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import TaskReportPopup from "./TaskReportPopup";

const baseReport = {
  task: {
    id: "task-1",
    title: "Ship feature",
    description: null,
    department_id: "planning",
    assigned_agent_id: "agent-1",
    status: "done",
    project_path: "/tmp/project",
    created_at: 1000,
    completed_at: 2000,
    agent_name: "Ari",
    agent_name_ko: "아리",
    agent_role: "team_leader",
    dept_name: "Planning",
    dept_name_ko: "기획팀",
  },
  logs: [
    { kind: "system", message: "Final branch verification: passed (ref=main, commits=1, files=1)", created_at: 1500 },
  ],
  subtasks: [],
  meeting_minutes: [],
  planning_summary: {
    title: "Planning Lead Consolidated Summary",
    content: "Summary body",
    source_task_id: "task-1",
    source_agent_name: "Ari",
    source_department_name: "Planning",
    generated_at: 1600,
    documents: [],
  },
  team_reports: [],
  project: {
    root_task_id: "task-1",
    project_name: "Project",
    project_path: "/tmp/project",
    core_goal: "Goal",
  },
};

describe("TaskReportPopup", () => {
  it("shows final branch verification logs in the report popup", () => {
    render(
      <I18nProvider language="en">
        <TaskReportPopup
          report={baseReport as any}
          agents={[{ id: "agent-1", name: "Ari", name_ko: "아리", avatar_emoji: "A" } as any]}
          departments={[{ id: "planning", name: "Planning", name_ko: "기획팀", color: "#00aa88", icon: "P" } as any]}
          uiLanguage="en"
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("최종 브랜치 검증")).toBeInTheDocument();
    expect(screen.getByText(/Final branch verification: passed/)).toBeInTheDocument();
  });

  it("keeps a sprite avatar when the assigned agent is missing from the active agent list", () => {
    render(
      <I18nProvider language="en">
        <TaskReportPopup report={baseReport as any} agents={[]} departments={[]} uiLanguage="en" onClose={() => {}} />
      </I18nProvider>,
    );

    expect(screen.getByAltText("Ari")).toBeInTheDocument();
  });

  it("shows ISO evidence links for smoke screenshot, commit, and CI", () => {
    render(
      <I18nProvider language="en">
        <TaskReportPopup
          report={
            {
              ...baseReport,
              quality_evidence: {
                change_request: "Ship feature",
                implementation_result: "Implemented report evidence",
                verification_result: "build passed",
                approval_record: "Task status done",
                traceability_notes: ["1 report document(s)"],
                smoke_screenshot_path: "reports/smoke.png",
                commit_hash: "abc1234",
                ci_url: "https://github.com/org/repo/actions/runs/42",
              },
            } as any
          }
          agents={[]}
          departments={[]}
          uiLanguage="en"
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId("task-report-evidence-root")).toHaveTextContent("ISO 증거 연결");
    expect(screen.getByText("reports/smoke.png")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/org/repo/actions/runs/42")).toBeInTheDocument();
  });
});
