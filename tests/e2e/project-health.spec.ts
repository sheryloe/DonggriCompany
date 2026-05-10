import { expect, test, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PROJECT_ID = "e2e-project-health";
const PROJECT_NAME = "E2E Project Health";
const NOW = 1_778_500_000_000;

type TaskStatusRow = {
  workflow_meta_json: string | null;
  status: string;
};

function openE2EDb(): DatabaseSync {
  const dbPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "claw-empire.e2e.sqlite");
  if (!fs.existsSync(dbPath)) {
    throw new Error(`E2E database is missing: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

function insertTask(
  db: DatabaseSync,
  input: {
    assignedAgentId: string;
    departmentId: string;
    id: string;
    result?: string | null;
    sourceTaskId?: string | null;
    status: string;
    taskType: string;
    title: string;
  },
): void {
  db
    .prepare(
      `
        INSERT INTO tasks (
          id, title, description, department_id, assigned_agent_id, project_id, status,
          priority, task_type, workflow_pack_key, result, source_task_id, created_at, updated_at
        ) VALUES (?, ?, '', ?, ?, ?, ?, 1, ?, 'development', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          department_id = excluded.department_id,
          assigned_agent_id = excluded.assigned_agent_id,
          project_id = excluded.project_id,
          status = excluded.status,
          task_type = excluded.task_type,
          result = excluded.result,
          source_task_id = excluded.source_task_id,
          updated_at = excluded.updated_at
      `,
    )
    .run(
      input.id,
      input.title,
      input.departmentId,
      input.assignedAgentId,
      PROJECT_ID,
      input.status,
      input.taskType,
      input.result ?? null,
      input.sourceTaskId ?? null,
      NOW,
      NOW,
    );
}

function seedProjectHealthFixture(): void {
  const db = openE2EDb();
  try {
    db.exec("BEGIN");
    const projectPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "project-health");
    fs.mkdirSync(projectPath, { recursive: true });

    db
      .prepare(
        `
          INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
          VALUES (?, ?, ?, 'Verify Project Health operator actions', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            project_path = excluded.project_path,
            core_goal = excluded.core_goal,
            last_used_at = excluded.last_used_at,
            updated_at = excluded.updated_at
        `,
      )
      .run(PROJECT_ID, PROJECT_NAME, projectPath, NOW, NOW, NOW);

    insertTask(db, {
      assignedAgentId: "seed-dev-lead",
      departmentId: "dev",
      id: "e2e-health-orphan",
      result: "Recovery watchdog moved orphan task to inbox.",
      sourceTaskId: "e2e-health-root",
      status: "inbox",
      taskType: "development",
      title: "E2E health orphan candidate",
    });
    insertTask(db, {
      assignedAgentId: "seed-planning-lead",
      departmentId: "planning",
      id: "e2e-health-review",
      result: "Review gate: waiting for project-level decision.",
      status: "review",
      taskType: "general",
      title: "E2E health review waiting",
    });
    insertTask(db, {
      assignedAgentId: "seed-dev-lead",
      departmentId: "dev",
      id: "e2e-health-path-blocked",
      status: "pending",
      taskType: "development",
      title: "E2E health path blocked rerun",
    });
    insertTask(db, {
      assignedAgentId: "seed-qa-lead",
      departmentId: "qa",
      id: "e2e-health-done",
      result: "Completed but still held by agent.",
      status: "done",
      taskType: "general",
      title: "E2E health done stale owner",
    });

    db.prepare("DELETE FROM task_logs WHERE task_id IN (?, ?, ?)").run(
      "e2e-health-orphan",
      "e2e-health-review",
      "e2e-health-path-blocked",
    );
    db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
      "e2e-health-orphan",
      "Recovery watchdog moved orphan task to inbox.",
      NOW,
    );
    db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
      "e2e-health-review",
      "Review gate: waiting for project-level decision.",
      NOW + 1,
    );
    db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'error', ?, ?)").run(
      "e2e-health-path-blocked",
      "Execution blocked (project_path_not_allowed): Project path is outside allowed roots.",
      NOW + 2,
    );
    db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
      "e2e-health-path-blocked",
      "policy_snapshot_missing_on_legacy_row (api.tasks.list) -> bound 2026-05-06-26b847e3ba1d",
      NOW + 3,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

function seedStaleAssignment(): void {
  const db = openE2EDb();
  try {
    db.prepare("UPDATE agents SET status = 'idle', current_task_id = ? WHERE id = 'seed-qa-lead'").run(
      "e2e-health-done",
    );
  } finally {
    db.close();
  }
}

function readTaskStatus(taskId: string): TaskStatusRow {
  const db = openE2EDb();
  try {
    const row = db.prepare("SELECT status, workflow_meta_json FROM tasks WHERE id = ?").get(taskId) as
      | TaskStatusRow
      | undefined;
    if (!row) throw new Error(`Task not found: ${taskId}`);
    return row;
  } finally {
    db.close();
  }
}

function readAgentCurrentTask(agentId: string): string | null {
  const db = openE2EDb();
  try {
    const row = db.prepare("SELECT current_task_id FROM agents WHERE id = ?").get(agentId) as
      | { current_task_id: string | null }
      | undefined;
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return row.current_task_id;
  } finally {
    db.close();
  }
}

function taskCard(panel: Locator, title: string, index = 0): Locator {
  return panel
    .getByRole("button", { name: new RegExp(title) })
    .nth(index)
    .locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]");
}

test("Project Health tab renders operator evidence actions and executes recovery flow", async ({ page }) => {
  seedProjectHealthFixture();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByRole("button", { name: /업무 관리|Task/i }).first().click();
  await page.getByRole("button", { name: /프로젝트 관리|Project Manager/i }).first().click();
  await expect(page.getByRole("button", { name: new RegExp(PROJECT_NAME) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(PROJECT_NAME) }).click();
  seedStaleAssignment();
  await page.getByRole("button", { name: /^Health$/i }).click();

  const panel = page.locator('[data-testid="project-health-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("E2E health review waiting");
  await expect(panel).toContainText("실행 경로 차단");

  await expect(panel.locator('input[placeholder="예: 557b3ec"]')).toHaveCount(4);
  await expect(panel.locator('input[placeholder="승인/대체 종료 근거"]')).toHaveCount(4);
  await expect(panel.getByRole("button", { name: /대체 증거로 종료/ })).toHaveCount(3);
  await expect(panel.getByRole("button", { name: /리뷰 승인/ })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: /stale.*정리/i })).toHaveCount(1);

  const overflow = await panel.evaluate((element) => ({
    bodyClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.documentElement.scrollWidth,
    panelClientWidth: element.clientWidth,
    panelScrollWidth: element.scrollWidth,
  }));
  expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth + 2);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 2);

  await panel.getByRole("button", { name: /stale.*정리/i }).click();
  await expect
    .poll(() => readAgentCurrentTask("seed-qa-lead"), { message: "stale assignment cleanup should clear agent" })
    .toBeNull();

  const reviewCard = taskCard(panel, "E2E health review waiting");
  await reviewCard.getByPlaceholder("예: 557b3ec").fill("e2e-review");
  await reviewCard.getByPlaceholder("승인/대체 종료 근거").fill("E2E review approval evidence.");
  await reviewCard.getByRole("button", { name: /리뷰 승인/ }).click();
  await expect
    .poll(() => readTaskStatus("e2e-health-review").status, { message: "review task should be approved" })
    .toBe("done");

  const pathBlockedCard = taskCard(panel, "E2E health path blocked rerun");
  await pathBlockedCard.getByPlaceholder("예: 557b3ec").fill("e2e-path");
  await pathBlockedCard.getByPlaceholder("승인/대체 종료 근거").fill("E2E path-blocked task superseded.");
  await pathBlockedCard.getByRole("button", { name: /대체 증거로 종료/ }).click();
  await expect
    .poll(() => readTaskStatus("e2e-health-path-blocked").status, {
      message: "path-blocked task should be superseded",
    })
    .toBe("cancelled");
  expect(readTaskStatus("e2e-health-path-blocked").workflow_meta_json ?? "").toContain("e2e-path");

  const orphanCard = taskCard(panel, "E2E health orphan candidate");
  await orphanCard.getByRole("button", { name: /대기열 복구/ }).click();
  await expect
    .poll(() => readTaskStatus("e2e-health-orphan").status, { message: "orphan task should be requeued" })
    .toBe("planned");

  await expect(panel.getByRole("button", { name: /리뷰 승인/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /stale.*정리/i })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
