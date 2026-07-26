import { z } from "zod";

export const MASTER95_REQUIRED_SPANS = [
  "run.accept",
  "policy.evaluate",
  "agent.route",
  "skill.invoke",
  "artifact.record",
  "run.finalize",
] as const;

const NonEmpty = z.string().trim().min(1);
const Correlation = {
  project_id: z.string().regex(/^project:[A-Za-z0-9._-]+$/),
  task_id: NonEmpty,
  run_id: NonEmpty,
  trace_id: NonEmpty,
};

export const Master95SpanSchema = z
  .object({
    ...Correlation,
    span_id: NonEmpty,
    parent_span_id: NonEmpty.nullable(),
    name: z.enum(MASTER95_REQUIRED_SPANS),
    status: z.enum(["ok", "blocked", "error", "canceled"]),
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
    duration_ms: z.number().int().nonnegative(),
    cost_units: z.number().nonnegative(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export const Master95LogSchema = z
  .object({
    ...Correlation,
    span_id: NonEmpty,
    level: z.enum(["info", "warn", "error"]),
    message: NonEmpty,
    fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    occurred_at: z.string().datetime(),
  })
  .strict();

export const Master95MetricSchema = z
  .object({
    ...Correlation,
    span_id: NonEmpty,
    name: z.enum(["run.duration_ms", "run.cost_units", "tool.calls", "artifact.count"]),
    value: z.number().nonnegative(),
    unit: NonEmpty,
    recorded_at: z.string().datetime(),
  })
  .strict();

export type Master95Span = z.infer<typeof Master95SpanSchema>;
export type Master95Log = z.infer<typeof Master95LogSchema>;
export type Master95Metric = z.infer<typeof Master95MetricSchema>;

export class Master95ObservabilityCollector {
  readonly #spans: Master95Span[] = [];
  readonly #logs: Master95Log[] = [];
  readonly #metrics: Master95Metric[] = [];

  recordSpan(input: unknown) {
    const span = Master95SpanSchema.parse(redact(input));
    this.#spans.push(span);
    return structuredClone(span);
  }

  recordLog(input: unknown) {
    const log = Master95LogSchema.parse(redact(input));
    this.#requireSpan(log);
    this.#logs.push(log);
    return structuredClone(log);
  }

  recordMetric(input: unknown) {
    const metric = Master95MetricSchema.parse(redact(input));
    this.#requireSpan(metric);
    this.#metrics.push(metric);
    return structuredClone(metric);
  }

  assessRun(input: { project_id: string; run_id: string; trace_id: string }) {
    const spans = this.#spans.filter(
      (item) =>
        item.project_id === input.project_id && item.run_id === input.run_id && item.trace_id === input.trace_id,
    );
    const present = new Set(spans.map((item) => item.name));
    const missing_spans = MASTER95_REQUIRED_SPANS.filter((name) => !present.has(name));
    const spanIds = new Set(spans.map((item) => item.span_id));
    const logs = this.#logs.filter((item) => item.run_id === input.run_id && item.trace_id === input.trace_id);
    const metrics = this.#metrics.filter((item) => item.run_id === input.run_id && item.trace_id === input.trace_id);
    const orphan_records = [...logs, ...metrics].filter(
      (item) => item.project_id !== input.project_id || !spanIds.has(item.span_id),
    ).length;
    const cost_units = spans.reduce((total, span) => total + span.cost_units, 0);
    const costMetric = metrics.find((metric) => metric.name === "run.cost_units");
    const cost_consistent = Boolean(costMetric && costMetric.value === cost_units);
    return {
      complete:
        missing_spans.length === 0 && orphan_records === 0 && logs.length > 0 && metrics.length > 0 && cost_consistent,
      missing_spans,
      orphan_records,
      span_count: spans.length,
      log_count: logs.length,
      metric_count: metrics.length,
      cost_units,
      cost_consistent,
    };
  }

  snapshot() {
    return {
      spans: structuredClone(this.#spans),
      logs: structuredClone(this.#logs),
      metrics: structuredClone(this.#metrics),
    };
  }

  #requireSpan(item: Master95Log | Master95Metric) {
    const span = this.#spans.find((candidate) => candidate.span_id === item.span_id);
    if (!span) throw new Error("correlated_span_not_found");
    for (const key of ["project_id", "task_id", "run_id", "trace_id"] as const) {
      if (span[key] !== item[key]) throw new Error("correlation_identity_mismatch");
    }
  }
}

function redact(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redact);
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, value]) => {
      if (/(?:secret|token|password|authorization|credential|raw_transcript)/i.test(key)) return [key, "[REDACTED]"];
      if (typeof value === "string") {
        return [key, value.replace(/(?:Bearer\s+\S+|api[_-]?key\s*[=:]\s*\S+|password\s*[=:]\s*\S+)/gi, "[REDACTED]")];
      }
      return [key, redact(value)];
    }),
  );
}
