import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import {
  STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
  type StrategicMaintenanceSettings,
} from "../../strategic-maintenance/service.ts";
import { registerStrategicMaintenanceRoutes } from "./strategic-maintenance.ts";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

function createHarness(settingsPatch: Partial<StrategicMaintenanceSettings> = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-strategic-maintenance-routes-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  applyBaseSchema(db);
  const now = Date.UTC(2026, 4, 14, 0, 0, 0);
  const settings: StrategicMaintenanceSettings = {
    enabled: false,
    cadence: "weekly",
    dayOfWeek: 1,
    hour: 9,
    timezone: "Asia/Seoul",
    createTasks: true,
    maxTasksPerRun: 5,
    emailEnabled: false,
    emailTo: [],
    emailCc: [],
    ...settingsPatch,
  };

  db.prepare("INSERT INTO settings (key, value) VALUES ('strategicMaintenance', ?)").run(JSON.stringify(settings));
  db.prepare("INSERT INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(
    STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
    "Strategic Maintenance",
    "전략보수팀",
    "SM",
    "#45b9aa",
    8,
  );
  db.prepare("INSERT INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(
    "dev",
    "Development",
    "개발",
    "DEV",
    "#3b82f6",
    3,
  );
  db.prepare(
    "INSERT INTO agents (id, name, name_ko, department_id, role, cli_provider, avatar_emoji, personality, authority_level) VALUES (?, ?, ?, ?, 'team_leader', 'codex', 'SM', ?, 7)",
  ).run("seed-strategic-maintenance-lead", "Beacon", "비컨", STRATEGIC_MAINTENANCE_DEPARTMENT_ID, "lead");
  db.prepare(
    "INSERT INTO projects (id, name, project_path, core_goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("project-donggri", "DonggriCompany", path.join(tmpDir, "DonggriCompany"), "Maintain DonggriCompany", now, now);
  db.prepare(
    "INSERT INTO tasks (id, title, department_id, status, priority, task_type, workflow_pack_key, updated_at, created_at) VALUES (?, ?, 'dev', 'in_progress', 1, 'development', 'development', ?, ?)",
  ).run("stale-task", "stale task", now - 6 * 60 * 60 * 1000, now - 7 * 60 * 60 * 1000);
  db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
    "stale-task",
    "RUN failed (exit code: 1)",
    now - 60_000,
  );

  const app = express();
  app.use(express.json());
  registerStrategicMaintenanceRoutes({
    app,
    db,
    dbPath,
    nowMs: () => now,
    broadcast: vi.fn(),
    recordTaskCreationAudit: vi.fn(),
  } as unknown as RuntimeContext);

  return { app, db, tmpDir };
}

describe("strategic maintenance routes", () => {
  it("returns status, runs a manual check, and lists the run record", async () => {
    const { app, db, tmpDir } = createHarness({
      emailEnabled: true,
      emailTo: ["ops@example.com"],
    });
    try {
      const status = await request(app).get("/api/strategic-maintenance/status").expect(200);
      expect(status.body.ok).toBe(true);
      expect(status.body.status.settings.emailEnabled).toBe(true);
      expect(status.body.status.gmail.configured).toBe(false);

      const runResponse = await request(app).post("/api/strategic-maintenance/run").expect(200);
      expect(runResponse.body.ok).toBe(true);
      expect(runResponse.body.run.status).toBe("completed");
      expect(runResponse.body.run.email_status).toBe("blocked");
      expect(runResponse.body.run.email_error).toBe("gmail_oauth_missing");
      expect(runResponse.body.run.report_path).toContain(path.join(tmpDir, "data", "reports", "strategic-maintenance"));
      expect(fs.existsSync(runResponse.body.run.report_path)).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "data", "reports", "strategic-maintenance", "latest.md"))).toBe(true);

      const createdIds = JSON.parse(String(runResponse.body.run.created_task_ids_json)) as string[];
      expect(createdIds.length).toBeGreaterThan(0);
      const taskCount = db
        .prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE department_id = ? AND status = 'inbox'")
        .get(STRATEGIC_MAINTENANCE_DEPARTMENT_ID) as { cnt: number };
      expect(taskCount.cnt).toBe(createdIds.length);

      const runsResponse = await request(app).get("/api/strategic-maintenance/runs?limit=5").expect(200);
      expect(runsResponse.body.ok).toBe(true);
      expect(runsResponse.body.runs).toHaveLength(1);
      expect(runsResponse.body.runs[0].id).toBe(runResponse.body.run.id);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns a safe blocked response for test email without recipients", async () => {
    const { app, db, tmpDir } = createHarness({ emailEnabled: true, emailTo: [] });
    try {
      const response = await request(app).post("/api/strategic-maintenance/test-email").expect(400);
      expect(response.body).toEqual({ ok: false, error: "gmail_recipients_missing" });
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
