import { expect, test, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { runE2EDbHelper } from "./fixtures/e2e-db";

const PROJECT_NAME = "E2E Project Health";

type TaskStatusRow = {
  workflow_meta_json: string | null;
  status: string;
};

function seedProjectHealthFixture(): void {
  const projectPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "project-health");
  fs.mkdirSync(projectPath, { recursive: true });
  runE2EDbHelper("project-health-seed", { projectPath });
}

function seedStaleAssignment(): void {
  runE2EDbHelper("project-health-stale-assignment");
}

function readTaskStatus(taskId: string): TaskStatusRow {
  return runE2EDbHelper<TaskStatusRow & Record<string, unknown>>("project-health-task-status", { taskId });
}

function readAgentCurrentTask(agentId: string): string | null {
  const row = runE2EDbHelper<{ current_task_id: string | null } & Record<string, unknown>>(
    "project-health-agent-current-task",
    { agentId },
  );
  return row.current_task_id;
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

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tasksNavigationButton = page
    .getByRole("navigation")
    .getByRole("button", { name: "업무", exact: true });
  await expect(tasksNavigationButton).toBeVisible({ timeout: 30_000 });
  await tasksNavigationButton.click();
  await expect(page.getByRole("heading", { name: "업무 관리", level: 1, exact: true })).toBeVisible({
    // This route is the first browser-only lazy chunk after the API-heavy specs in the full CI suite.
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "프로젝트 연결", exact: true }).click();
  await expect(page.getByRole("heading", { name: "프로젝트 관리", level: 2, exact: true })).toBeVisible();
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
    .poll(() => readAgentCurrentTask("master-quality"), { message: "stale assignment cleanup should clear agent" })
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
