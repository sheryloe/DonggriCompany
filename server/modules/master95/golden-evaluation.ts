import { z } from "zod";

const NonEmpty = z.string().trim().min(1);
export const Master95GoldenTaskSchema = z
  .object({
    task_id: z.string().regex(/^GT-\d{3}$/),
    category: NonEmpty,
    title: NonEmpty,
    critical: z.boolean(),
    project_id: z.string().regex(/^project:[A-Za-z0-9._-]+$/),
    actor: z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]),
    fixture: z.record(z.string(), z.unknown()),
    expected_status: z.enum(["pass", "block"]),
    expected_reason_code: NonEmpty,
    acceptance_criteria: z.array(NonEmpty).min(1),
  })
  .strict();

export type Master95GoldenTask = z.infer<typeof Master95GoldenTaskSchema>;
export type Master95GoldenObservation = { status: "pass" | "block"; reason_code: string };
export type Master95GoldenRunner = (
  task: Master95GoldenTask,
  repeat: number,
) => Master95GoldenObservation | Promise<Master95GoldenObservation>;

type Master95GoldenGrade = {
  task_id: string;
  category: string;
  critical: boolean;
  repeat: number;
  trace_id: string;
  expected_status: Master95GoldenTask["expected_status"];
  observed_status: Master95GoldenObservation["status"];
  expected_reason_code: string;
  observed_reason_code: string;
  passed: boolean;
};

export async function evaluateMaster95GoldenCatalog(input: unknown[], runner: Master95GoldenRunner, repeats = 5) {
  if (repeats !== 5) throw new Error("golden_repeat_count_must_equal_five");
  const tasks = input.map((item) => Master95GoldenTaskSchema.parse(item));
  if (tasks.length !== 120) throw new Error("golden_catalog_must_contain_120_tasks");
  if (new Set(tasks.map((task) => task.task_id)).size !== tasks.length)
    throw new Error("golden_task_ids_must_be_unique");
  const grades: Master95GoldenGrade[] = [];
  for (const task of tasks) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const observed = await runner(task, repeat);
      const passed = observed.status === task.expected_status && observed.reason_code === task.expected_reason_code;
      grades.push({
        task_id: task.task_id,
        category: task.category,
        critical: task.critical,
        repeat,
        trace_id: `trace:golden:${task.task_id}:${repeat}`,
        expected_status: task.expected_status,
        observed_status: observed.status,
        expected_reason_code: task.expected_reason_code,
        observed_reason_code: observed.reason_code,
        passed,
      });
    }
  }
  const passed = grades.filter((grade) => grade.passed).length;
  const critical = grades.filter((grade) => grade.critical);
  const criticalPassed = critical.filter((grade) => grade.passed).length;
  const successRate = passed / grades.length;
  const criticalSuccessRate = critical.length === 0 ? 0 : criticalPassed / critical.length;
  const categorySummary = Object.fromEntries(
    [...new Set(tasks.map((task) => task.category))].map((category) => {
      const selected = grades.filter((grade) => grade.category === category);
      return [category, { runs: selected.length, passed: selected.filter((grade) => grade.passed).length }];
    }),
  );
  return {
    status: successRate >= 0.95 && criticalSuccessRate === 1 ? ("pass" as const) : ("fail" as const),
    task_count: tasks.length,
    repeats,
    run_count: grades.length,
    passed_runs: passed,
    success_rate: successRate,
    critical_runs: critical.length,
    critical_passed_runs: criticalPassed,
    critical_success_rate: criticalSuccessRate,
    trace_coverage: grades.filter((grade) => grade.trace_id).length / grades.length,
    category_summary: categorySummary,
    grades,
  };
}

export function evaluateMaster95RegressionGate(input: {
  baseline_success_rate: number;
  candidate_success_rate: number;
  candidate_critical_success_rate: number;
  max_regression: number;
}) {
  const regression = input.baseline_success_rate - input.candidate_success_rate;
  const pass =
    input.candidate_success_rate >= 0.95 &&
    input.candidate_critical_success_rate === 1 &&
    regression <= input.max_regression;
  return {
    decision: pass ? ("allow" as const) : ("block" as const),
    reason_code: pass ? "golden_regression_gate_passed" : "golden_regression_gate_failed",
    regression,
  };
}
