import { describe, expect, it } from "vitest";
import {
  applyPlannerOptionAnalysis,
  extractPlannerDecisionAnalysis,
  serializePlannerDecisionAnalysis,
  type PlannerOptionAnalysis,
} from "./planner-option-analysis.ts";

describe("planner option analysis helpers", () => {
  it("extracts planner JSON summary and per-option analysis", () => {
    const raw = JSON.stringify({
      summary: "Pick option 2 first.",
      options: [
        {
          number: 2,
          rationale: "It limits scope.",
          expected_result: "Only selected blockers become work.",
          risk: "Skipped blockers may return.",
          follow_up: "Review selected note coverage.",
        },
      ],
    });

    const parsed = extractPlannerDecisionAnalysis(raw);

    expect(parsed.summary).toBe("Pick option 2 first.");
    expect(parsed.optionsByNumber.get(2)).toMatchObject({
      source: "planner",
      expected_result: "Only selected blockers become work.",
    });
  });

  it("serializes marked analysis and applies planner entries over template analysis", () => {
    const analysis: PlannerOptionAnalysis = {
      number: 1,
      rationale: "Start immediately.",
      expected_result: "The meeting starts.",
      risk: "Incomplete artifacts can block approval.",
      follow_up: "Watch generated remediation tasks.",
      source: "planner",
    };
    const stored = serializePlannerDecisionAnalysis("Ready to decide.", [analysis]);
    const options = applyPlannerOptionAnalysis(
      [
        {
          number: 1,
          action: "start_project_review",
          label: "Start",
          analysis: {
            rationale: "Template rationale",
            expected_result: "Template result",
            risk: "Template risk",
            follow_up: "Template follow-up",
            source: "template" as const,
          },
        },
      ],
      stored,
    );

    expect(extractPlannerDecisionAnalysis(stored).summary).toBe("Ready to decide.");
    expect(options[0]?.analysis).toMatchObject({
      source: "planner",
      rationale: "Start immediately.",
    });
  });
});
