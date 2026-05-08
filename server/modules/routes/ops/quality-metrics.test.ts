import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { recordQualityMetricEvent } from "../../memory/store.ts";
import { registerQualityMetricRoutes } from "./quality-metrics.ts";

type RouteHandler = (req: any, res: any) => any;

function createFakeResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
  };
  registerQualityMetricRoutes({ app: app as any, db });
  return { db, routes };
}

describe("quality metric routes", () => {
  let db: DatabaseSync | null = null;
  let routes: Map<string, RouteHandler>;

  beforeEach(() => {
    const harness = createHarness();
    db = harness.db;
    routes = harness.routes;
    db.prepare(
      `
      INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
      VALUES ('project-1', 'Quality Project', 'G:\\runtime\\quality', 'quality metrics', 1, 1, 1)
    `,
    ).run();
  });

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("lists quality metrics and summarizes bucketed values", () => {
    recordQualityMetricEvent(db!, {
      metricKey: "memory.embedding.coverage",
      metricFamily: "memory",
      projectId: "project-1",
      value: 0.5,
      unit: "ratio",
      sourceType: "test",
      sourceId: "coverage-1",
      recordedAt: Date.parse("2026-05-07T02:00:00.000Z"),
    });
    recordQualityMetricEvent(db!, {
      metricKey: "memory.embedding.coverage",
      metricFamily: "memory",
      projectId: "project-1",
      value: 0.75,
      unit: "ratio",
      sourceType: "test",
      sourceId: "coverage-2",
      recordedAt: Date.parse("2026-05-07T03:00:00.000Z"),
    });

    const listHandler = routes.get("GET /api/quality/metrics");
    const listRes = createFakeResponse();
    listHandler?.({ query: { metric_key: "memory.embedding.coverage", project_id: "project-1" } }, listRes);
    expect(listRes.statusCode).toBe(200);
    expect((listRes.payload as { metrics: unknown[] }).metrics).toHaveLength(2);

    const summaryHandler = routes.get("GET /api/quality/metrics/summary");
    const summaryRes = createFakeResponse();
    summaryHandler?.({ query: { metric_family: "memory", project_id: "project-1", bucket: "day" } }, summaryRes);
    expect(summaryRes.statusCode).toBe(200);
    const summary = (summaryRes.payload as { summary: Array<{ metric_key: string; count: number; avg_value: number }> })
      .summary;
    expect(summary[0]).toMatchObject({
      metric_key: "memory.embedding.coverage",
      count: 2,
      avg_value: 0.625,
    });
  });

  it("upserts metric events by metric/source pair", () => {
    recordQualityMetricEvent(db!, {
      metricKey: "provider.capacity_429",
      metricFamily: "provider",
      value: 1,
      sourceType: "api_provider_test",
      sourceId: "provider-1",
      recordedAt: 100,
    });
    recordQualityMetricEvent(db!, {
      metricKey: "provider.capacity_429",
      metricFamily: "provider",
      value: 2,
      sourceType: "api_provider_test",
      sourceId: "provider-1",
      recordedAt: 200,
    });
    const row = db!
      .prepare("SELECT COUNT(*) AS cnt, value, recorded_at FROM quality_metric_events WHERE metric_key = ?")
      .get("provider.capacity_429") as { cnt: number; value: number; recorded_at: number };
    expect(row.cnt).toBe(1);
    expect(row.value).toBe(2);
    expect(row.recorded_at).toBe(200);
  });
});
