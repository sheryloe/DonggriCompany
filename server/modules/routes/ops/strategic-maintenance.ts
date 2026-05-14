import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  getStrategicMaintenanceStatus,
  listStrategicMaintenanceRuns,
  runStrategicMaintenanceOnce,
  sendStrategicMaintenanceTestEmail,
} from "../../strategic-maintenance/service.ts";

type StrategicMaintenanceRouteCtx = RuntimeContext;

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export function registerStrategicMaintenanceRoutes(ctx: StrategicMaintenanceRouteCtx): void {
  const { app, db } = ctx;

  app.get("/api/strategic-maintenance/status", (_req, res) => {
    try {
      res.json({ ok: true, status: getStrategicMaintenanceStatus(ctx) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/strategic-maintenance/runs", (req, res) => {
    try {
      const limit = Number(firstQueryValue(req.query.limit) || 20);
      res.json({ ok: true, runs: listStrategicMaintenanceRuns(db, limit) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/strategic-maintenance/run", async (_req, res) => {
    try {
      const run = await runStrategicMaintenanceOnce(ctx, { trigger: "manual" });
      res.json({ ok: true, run });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "strategic_maintenance_run_in_progress") {
        return res.status(409).json({ ok: false, error: message });
      }
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/strategic-maintenance/test-email", async (_req, res) => {
    try {
      const result = await sendStrategicMaintenanceTestEmail(ctx);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = message === "gmail_recipients_missing" || message === "gmail_send_scope_missing";
      res.status(blocked ? 400 : 500).json({ ok: false, error: message });
    }
  });
}
