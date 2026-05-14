import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../bootstrap/schema/base-schema.ts";
import {
  STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
  getStrategicMaintenanceStatus,
  runStrategicMaintenanceOnce,
  type StrategicMaintenanceSettings,
} from "./service.ts";
import type { RuntimeContext } from "../../types/runtime-context.ts";

function createCtx(settingsPatch: Partial<StrategicMaintenanceSettings> = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-strategic-maintenance-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  applyBaseSchema(db);
  const now = Date.UTC(2026, 4, 13, 1, 0, 0);
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
    "#14b8a6",
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

  const ctx = {
    db,
    dbPath,
    nowMs: () => now,
    broadcast: vi.fn(),
    recordTaskCreationAudit: vi.fn(),
  } as unknown as RuntimeContext;
  return { ctx, db, tmpDir };
}

describe("strategic maintenance service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a run record, report files, and idempotent improvement tasks", async () => {
    const { ctx, db, tmpDir } = createCtx();
    try {
      const first = await runStrategicMaintenanceOnce(ctx, { trigger: "manual" });
      expect(first.status).toBe("completed");
      expect(first.email_status).toBe("skipped");
      expect(first.report_path).toBeTruthy();
      expect(fs.existsSync(first.report_path!)).toBe(true);
      expect(first.report_path).toContain(path.join(tmpDir, "data", "reports", "strategic-maintenance"));

      const createdIds = JSON.parse(first.created_task_ids_json) as string[];
      expect(createdIds.length).toBeGreaterThan(0);
      const taskCount = db
        .prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE department_id = ?")
        .get(STRATEGIC_MAINTENANCE_DEPARTMENT_ID) as { cnt: number };
      expect(taskCount.cnt).toBe(createdIds.length);

      const second = await runStrategicMaintenanceOnce(ctx, { trigger: "manual" });
      const secondIds = JSON.parse(second.created_task_ids_json) as string[];
      expect(secondIds).toContain(createdIds[0]);
      const taskCountAfterSecond = db
        .prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE department_id = ?")
        .get(STRATEGIC_MAINTENANCE_DEPARTMENT_ID) as { cnt: number };
      expect(taskCountAfterSecond.cnt).toBe(taskCount.cnt);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("marks Gmail reporting as blocked when enabled without Gmail OAuth", async () => {
    const { ctx, db, tmpDir } = createCtx({
      emailEnabled: true,
      emailTo: ["ops@example.com"],
    });
    try {
      const run = await runStrategicMaintenanceOnce(ctx, { trigger: "manual" });
      expect(run.status).toBe("completed");
      expect(run.email_status).toBe("blocked");
      expect(run.email_error).toBe("gmail_oauth_missing");
      expect(run.email_recipient_count).toBe(1);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reports next run and Gmail readiness in status", () => {
    const { ctx, db, tmpDir } = createCtx({ enabled: true });
    try {
      const status = getStrategicMaintenanceStatus(ctx);
      expect(status.settings.enabled).toBe(true);
      expect(status.nextRunAt).toBeGreaterThan(ctx.nowMs());
      expect(status.gmail.configured).toBe(false);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
