import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  approveCalendarIntake,
  listCalendarIntakeItems,
  rejectCalendarIntake,
} from "../../../messenger/calendar-intake-receiver.ts";

type CalendarIntakeRouteCtx = Pick<RuntimeContext, "app" | "db">;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return normalizeText(value[0]);
  return normalizeText(value);
}

export function registerCalendarIntakeRoutes(ctx: CalendarIntakeRouteCtx): void {
  const { app, db } = ctx;

  app.get("/api/calendar-intake/items", (req, res) => {
    try {
      const limit = Number(firstQueryValue(req.query.limit) || 50);
      res.json({ ok: true, items: listCalendarIntakeItems(db, limit) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/calendar-intake/:id/approve", async (req, res) => {
    try {
      const id = normalizeText(req.params.id).toUpperCase();
      if (!id) return res.status(400).json({ ok: false, error: "calendar_intake_id_required" });
      const item = await approveCalendarIntake({ db, id });
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/calendar-intake/:id/reject", (req, res) => {
    try {
      const id = normalizeText(req.params.id).toUpperCase();
      if (!id) return res.status(400).json({ ok: false, error: "calendar_intake_id_required" });
      const body = (req.body ?? {}) as { reason?: unknown };
      const item = rejectCalendarIntake(db, id, normalizeText(body.reason) || "rejected");
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
