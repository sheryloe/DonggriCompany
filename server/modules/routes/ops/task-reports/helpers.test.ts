import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskReportHelpers } from "./helpers.ts";

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE meeting_minutes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      meeting_type TEXT,
      round INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE meeting_minute_entries (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      speaker_name TEXT,
      content TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      sender_id TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      message_type TEXT NOT NULL
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL DEFAULT '',
      department_id TEXT
    );
    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

describe("task report helpers document extraction", () => {
  const tempDirs: string[] = [];
  const dbs: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      try {
        db.close();
      } catch {
        // ignore test cleanup errors
      }
    }
    for (const dir of tempDirs.splice(0)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore test cleanup errors
      }
    }
  });

  it("PPT 보고서에서 HTML/PPTX 산출물을 모두 문서 목록에 포함한다", () => {
    const db = setupDb();
    dbs.push(db);
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "claw-report-docs-"));
    tempDirs.push(tmpProject);

    const reportDir = path.join(tmpProject, "docs", "reports");
    const slidesDir = path.join(reportDir, "2026-03-01-report-slides");
    fs.mkdirSync(slidesDir, { recursive: true });
    fs.writeFileSync(path.join(slidesDir, "index.html"), "<html><body><h1>Slides</h1></body></html>", "utf8");
    fs.writeFileSync(path.join(reportDir, "2026-03-01-report-deck.pptx"), "PPTX_BINARY", "utf8");

    const { buildTaskSection } = createTaskReportHelpers({
      db: db as unknown as any,
      nowMs: () => 1_700_000_000_000,
    });

    const section = buildTaskSection(
      {
        id: "task-1",
        title: "보고서 작성",
        description: [
          "Target file path: docs/reports/2026-03-01-report-deck.pptx",
          "HTML source entry path: docs/reports/2026-03-01-report-slides/index.html",
        ].join("\n"),
        project_path: tmpProject,
        result: "",
        source_task_id: null,
        status: "done",
        department_id: "planning",
        created_at: 1,
        started_at: 2,
        completed_at: 3,
        agent_name: "Planner",
        agent_name_ko: "기획팀장",
        agent_role: "team_leader",
        dept_name: "Planning",
        dept_name_ko: "기획팀",
      },
      [],
    );

    const docs = (section.documents ?? []) as Array<Record<string, unknown>>;
    const titles = docs.map((doc) => String(doc.title ?? ""));
    expect(titles).toContain("index.html");
    expect(titles).toContain("2026-03-01-report-deck.pptx");
  });

  it("captures generated image files referenced in task logs", () => {
    const db = setupDb();
    dbs.push(db);
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "claw-report-images-"));
    tempDirs.push(tmpProject);

    const imageDir = path.join(tmpProject, ".claw-empire", "generated-images", "task-1");
    fs.mkdirSync(imageDir, { recursive: true });
    const imagePath = path.join(imageDir, "gemini-2.5-flash-image-01.png");
    fs.writeFileSync(imagePath, "PNG_BINARY", "utf8");

    db.prepare("INSERT INTO task_logs (id, task_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "log-1",
      "task-1",
      "stdout",
      `Saved image: ${imagePath}`,
      10,
    );

    const { buildTaskSection } = createTaskReportHelpers({
      db: db as unknown as any,
      nowMs: () => 1_700_000_000_000,
    });

    const section = buildTaskSection(
      {
        id: "task-1",
        title: "Image generation",
        description: "",
        project_path: tmpProject,
        result: "",
        source_task_id: null,
        status: "done",
        department_id: "design",
        created_at: 1,
        started_at: 2,
        completed_at: 3,
        agent_name: "Pixel",
        agent_name_ko: "Pixel",
        agent_role: "team_leader",
        dept_name: "Design",
        dept_name_ko: "Design",
      },
      [],
    );

    const docs = (section.documents ?? []) as Array<Record<string, unknown>>;
    expect(docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "gemini-2.5-flash-image-01.png",
          mime: "image/png",
        }),
      ]),
    );
  });
});
