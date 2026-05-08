import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

import { listQualityMetricEvents, summarizeQualityMetricEvents } from "../../memory/store.ts";

interface RegisterQualityMetricRoutesOptions {
  app: Express;
  db: DatabaseSync;
}

function parseTimestamp(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return Math.trunc(numeric);
  const parsedDate = Date.parse(text);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

export function registerQualityMetricRoutes({ app, db }: RegisterQualityMetricRoutesOptions): void {
  app.get("/api/quality/metrics", (req, res) => {
    const metrics = listQualityMetricEvents(db, {
      metricKey: typeof req.query.metric_key === "string" ? req.query.metric_key : null,
      metricFamily: typeof req.query.metric_family === "string" ? req.query.metric_family : null,
      projectId: typeof req.query.project_id === "string" ? req.query.project_id : null,
      from: parseTimestamp(req.query.from),
      to: parseTimestamp(req.query.to),
      limit: Number(req.query.limit ?? 100),
    });
    return res.json({ ok: true, metrics });
  });

  app.get("/api/quality/metrics/summary", (req, res) => {
    const summary = summarizeQualityMetricEvents(db, {
      metricFamily: typeof req.query.metric_family === "string" ? req.query.metric_family : null,
      projectId: typeof req.query.project_id === "string" ? req.query.project_id : null,
      from: parseTimestamp(req.query.from),
      to: parseTimestamp(req.query.to),
      bucket: typeof req.query.bucket === "string" ? req.query.bucket : "day",
      limit: Number(req.query.limit ?? 100),
    });
    return res.json({ ok: true, summary });
  });
}
