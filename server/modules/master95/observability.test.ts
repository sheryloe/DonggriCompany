import { describe, expect, it } from "vitest";
import { MASTER95_REQUIRED_SPANS, Master95ObservabilityCollector } from "./observability.js";

const correlation = {
  project_id: "project:BloggerGent",
  task_id: "task:1",
  run_id: "run:1",
  trace_id: "trace:1",
};
const at = "2026-07-14T00:00:00.000Z";

function span(name: (typeof MASTER95_REQUIRED_SPANS)[number], index: number) {
  return {
    ...correlation,
    span_id: `span:${index}`,
    parent_span_id: index === 0 ? null : "span:0",
    name,
    status: "ok",
    started_at: at,
    ended_at: at,
    duration_ms: index + 1,
    cost_units: index,
    attributes: { operation: name },
  };
}

function completeCollector() {
  const collector = new Master95ObservabilityCollector();
  MASTER95_REQUIRED_SPANS.forEach((name, index) => collector.recordSpan(span(name, index)));
  collector.recordLog({
    ...correlation,
    span_id: "span:0",
    level: "info",
    message: "run complete",
    fields: { result: "pass" },
    occurred_at: at,
  });
  collector.recordMetric({
    ...correlation,
    span_id: "span:5",
    name: "run.cost_units",
    value: 15,
    unit: "cost-unit",
    recorded_at: at,
  });
  return collector;
}

describe("Master95ObservabilityCollector", () => {
  it("correlates complete spans, logs, metrics, and cost", () => {
    expect(completeCollector().assessRun(correlation)).toMatchObject({
      complete: true,
      missing_spans: [],
      orphan_records: 0,
      cost_consistent: true,
    });
  });

  it("reports missing critical spans", () => {
    const collector = completeCollector();
    const partial = new Master95ObservabilityCollector();
    for (const item of collector.snapshot().spans.slice(0, -1)) partial.recordSpan(item);
    expect(partial.assessRun(correlation)).toMatchObject({ complete: false, missing_spans: ["run.finalize"] });
  });

  it("blocks logs and metrics without an exact correlated span", () => {
    const collector = new Master95ObservabilityCollector();
    expect(() =>
      collector.recordLog({
        ...correlation,
        span_id: "missing",
        level: "info",
        message: "x",
        fields: {},
        occurred_at: at,
      }),
    ).toThrow("correlated_span_not_found");
    collector.recordSpan(span("run.accept", 0));
    expect(() =>
      collector.recordMetric({
        ...correlation,
        project_id: "project:DonggriCompany",
        span_id: "span:0",
        name: "run.cost_units",
        value: 0,
        unit: "cost-unit",
        recorded_at: at,
      }),
    ).toThrow("correlation_identity_mismatch");
  });

  it("redacts sensitive keys and values before storage", () => {
    const collector = new Master95ObservabilityCollector();
    collector.recordSpan({ ...span("run.accept", 0), attributes: { access_token: "abc", note: "api_key=xyz" } });
    collector.recordLog({
      ...correlation,
      span_id: "span:0",
      level: "info",
      message: "Authorization: Bearer hidden-value",
      fields: { password: "guess" },
      occurred_at: at,
    });
    expect(JSON.stringify(collector.snapshot())).not.toMatch(/abc|xyz|hidden-value|guess/);
    expect(JSON.stringify(collector.snapshot())).toContain("[REDACTED]");
  });

  it("marks cost mismatch incomplete", () => {
    const collector = completeCollector();
    const rebuilt = new Master95ObservabilityCollector();
    for (const item of collector.snapshot().spans) rebuilt.recordSpan(item);
    for (const item of collector.snapshot().logs) rebuilt.recordLog(item);
    rebuilt.recordMetric({ ...collector.snapshot().metrics[0], value: 999 });
    expect(rebuilt.assessRun(correlation)).toMatchObject({ complete: false, cost_consistent: false });
  });
});
