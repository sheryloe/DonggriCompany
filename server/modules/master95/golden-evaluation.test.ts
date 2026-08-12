import { describe, expect, it } from "vitest";
import {
  evaluateMaster95GoldenCatalog,
  evaluateMaster95RegressionGate,
  type Master95GoldenTask,
} from "./golden-evaluation.js";

function catalog(): Master95GoldenTask[] {
  return Array.from({ length: 120 }, (_, index) => ({
    task_id: `GT-${String(index + 1).padStart(3, "0")}`,
    category: `category-${index % 12}`,
    title: `Golden control ${index + 1}`,
    critical: index < 24,
    project_id: ["project:DonggriCompany", "project:BloggerGent", "project:CardNewsAgent"][index % 3],
    actor: ["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"][index % 6] as Master95GoldenTask["actor"],
    fixture: { index },
    expected_status: index % 2 === 0 ? "pass" : "block",
    expected_reason_code: index % 2 === 0 ? "authorized" : "denied",
    acceptance_criteria: ["observed status and reason match"],
  }));
}

describe("Master95 golden evaluation", () => {
  it("grades 120 tasks five times with complete traces", async () => {
    const result = await evaluateMaster95GoldenCatalog(catalog(), (task) => ({
      status: task.expected_status,
      reason_code: task.expected_reason_code,
    }));
    expect(result).toMatchObject({
      status: "pass",
      task_count: 120,
      repeats: 5,
      run_count: 600,
      passed_runs: 600,
      success_rate: 1,
      critical_success_rate: 1,
      trace_coverage: 1,
    });
    expect(Object.keys(result.category_summary)).toHaveLength(12);
  });

  it("requires exactly 120 unique tasks and five repeats", async () => {
    await expect(
      evaluateMaster95GoldenCatalog(catalog().slice(0, 119), () => ({ status: "pass", reason_code: "x" })),
    ).rejects.toThrow("golden_catalog_must_contain_120_tasks");
    const duplicate = catalog();
    duplicate[119] = { ...duplicate[119], task_id: "GT-001" };
    await expect(
      evaluateMaster95GoldenCatalog(duplicate, () => ({ status: "pass", reason_code: "x" })),
    ).rejects.toThrow("golden_task_ids_must_be_unique");
    await expect(
      evaluateMaster95GoldenCatalog(catalog(), () => ({ status: "pass", reason_code: "x" }), 4),
    ).rejects.toThrow("golden_repeat_count_must_equal_five");
  });

  it("fails when any Critical repeat fails", async () => {
    const result = await evaluateMaster95GoldenCatalog(catalog(), (task, repeat) =>
      task.critical && repeat === 1
        ? { status: task.expected_status === "pass" ? "block" : "pass", reason_code: "mismatch" }
        : { status: task.expected_status, reason_code: task.expected_reason_code },
    );
    expect(result.status).toBe("fail");
    expect(result.critical_success_rate).toBeLessThan(1);
  });

  it("blocks a sub-95 or Critical regression candidate", () => {
    expect(
      evaluateMaster95RegressionGate({
        baseline_success_rate: 1,
        candidate_success_rate: 0.94,
        candidate_critical_success_rate: 1,
        max_regression: 0.02,
      }),
    ).toMatchObject({ decision: "block", reason_code: "golden_regression_gate_failed" });
    expect(
      evaluateMaster95RegressionGate({
        baseline_success_rate: 1,
        candidate_success_rate: 0.99,
        candidate_critical_success_rate: 0.99,
        max_regression: 0.02,
      }),
    ).toMatchObject({ decision: "block" });
  });

  it("allows a non-regressing candidate above all gates", () => {
    expect(
      evaluateMaster95RegressionGate({
        baseline_success_rate: 0.97,
        candidate_success_rate: 0.98,
        candidate_critical_success_rate: 1,
        max_regression: 0.02,
      }),
    ).toMatchObject({ decision: "allow", reason_code: "golden_regression_gate_passed" });
  });
});
