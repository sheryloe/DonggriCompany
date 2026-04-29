import { describe, expect, it } from "vitest";
import type { GoalCommandPreset } from "../../types";
import {
  getGoalCommandDescription,
  getGoalCommandTeamLabel,
  getGoalCommandTitle,
  goalCommandModalText,
} from "./goal-command-text";

const researchCommand: GoalCommandPreset = {
  key: "research",
  slashCommand: "/dg-research",
  workflowPackKey: "web_research_report",
  teamPreset: "research_report",
  departmentId: "api-research",
  taskType: "analysis",
  priority: 3,
  requiredDepartments: ["pmo", "api-research", "knowledge-docs"],
  maxParallelWorkstreams: 2,
  verificationGates: ["sources"],
  routingTags: ["research"],
};

describe("goal command text", () => {
  it("renders Korean UI labels from canonical goal command keys", () => {
    expect(getGoalCommandTitle(researchCommand, "ko")).toBe("조사/분석");
    expect(getGoalCommandDescription(researchCommand, "ko")).toContain("근거 자료");
    expect(getGoalCommandTeamLabel(researchCommand, "ko")).toBe("조사 보고");
  });

  it("keeps English labels available for non-Korean locales", () => {
    expect(getGoalCommandTitle(researchCommand, "en")).toBe("Research");
    expect(getGoalCommandTeamLabel(researchCommand, "en")).toBe("Research report");
  });

  it("uses localized modal copy without persisting localized keys", () => {
    const text = goalCommandModalText((messages) => messages.ko);
    expect(text.title).toBe("목표별로 선택하세요");
    expect(text.description).toContain("제목과 설명은 그대로 유지됩니다.");
  });
});
