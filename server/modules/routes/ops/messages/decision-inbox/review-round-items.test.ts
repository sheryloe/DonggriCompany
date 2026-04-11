import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createReviewRoundDecisionItems } from "./review-round-items.ts";
import type { ReviewRoundDecisionState } from "./types.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      status TEXT,
      source_task_id TEXT,
      project_id TEXT,
      project_path TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT
    );
    CREATE TABLE meeting_minutes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      meeting_type TEXT NOT NULL,
      round INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER
    );
    CREATE TABLE review_revision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      first_round INTEGER NOT NULL,
      raw_note TEXT
    );
    CREATE TABLE review_round_feedback_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      pass2 TEXT,
      final_verdict TEXT,
      blocking_items_json TEXT,
      requires_jules_action INTEGER,
      lens TEXT,
      confidence REAL,
      agent_id TEXT
    );
  `);
  return db;
}

function buildDeps(db: DatabaseSync, states: Map<string, ReviewRoundDecisionState | null>) {
  const nowMs = () => 10_000;
  const getState = (meetingId: string) => states.get(meetingId) ?? null;
  const upsert = (
    meetingId: string,
    snapshotHash: string,
    status: "collecting" | "ready" | "failed",
    plannerSummary: string | null,
    plannerAgentId: string | null,
    plannerAgentName: string | null,
  ) => {
    const previous = states.get(meetingId);
    states.set(meetingId, {
      meeting_id: meetingId,
      snapshot_hash: snapshotHash,
      status,
      planner_summary: plannerSummary,
      planner_agent_id: plannerAgentId,
      planner_agent_name: plannerAgentName,
      created_at: previous?.created_at ?? nowMs(),
      updated_at: nowMs(),
    });
  };

  return createReviewRoundDecisionItems({
    db,
    nowMs,
    getPreferredLanguage: () => "ko",
    pickL: (pool: any) => (Array.isArray(pool?.ko) ? pool.ko[0] : ""),
    l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
    buildReviewRoundSnapshotHash: (meetingId: string, reviewRound: number, notes: string[]) =>
      `${meetingId}:${reviewRound}:${notes.join("|")}`,
    getReviewRoundDecisionState: getState,
    upsertReviewRoundDecisionState: upsert,
    resolvePlanningLeadMeta: () => ({
      agent_id: "planner-1",
      agent_name: "Planner",
      agent_name_ko: "기획팀장",
      agent_avatar: "PL",
    }),
    formatPlannerSummaryForDisplay: (input: string) => input,
    queueReviewRoundPlanningConsolidation: () => {},
  });
}

describe("review round decision items", () => {
  it("reviewer verdict가 없으면 option_notes 개수로 blocker를 계산한다", () => {
    const db = createDb();
    try {
      db.prepare("INSERT INTO projects (id, name) VALUES ('proj-1', 'Project 1')").run();
      db.prepare(
        `INSERT INTO tasks (id, title, status, source_task_id, project_id, project_path)
         VALUES ('task-1', 'Task 1', 'review', NULL, 'proj-1', '/tmp/project')`,
      ).run();
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, status, started_at, completed_at, created_at)
         VALUES ('meeting-1', 'task-1', 'review', 1, 'revision_requested', 1000, 2000, 1000)`,
      ).run();
      db.prepare(
        `INSERT INTO review_revision_history (task_id, first_round, raw_note)
         VALUES ('task-1', 1, '보완 항목 A'), ('task-1', 1, '보완 항목 B')`,
      ).run();

      const states = new Map<string, ReviewRoundDecisionState | null>();
      const tools = buildDeps(db, states);
      const items = tools.buildReviewRoundDecisionItems();

      expect(items).toHaveLength(1);
      expect(items[0]?.option_notes).toHaveLength(2);
      expect(new Set(items[0]?.option_notes ?? [])).toEqual(new Set(["보완 항목 A", "보완 항목 B"]));
      expect(items[0]?.blocker_count).toBe(2);
    } finally {
      db.close();
    }
  });

  it("decision state가 ready면 created_at은 ready 시각을 사용한다", () => {
    const db = createDb();
    try {
      db.prepare("INSERT INTO projects (id, name) VALUES ('proj-1', 'Project 1')").run();
      db.prepare(
        `INSERT INTO tasks (id, title, status, source_task_id, project_id, project_path)
         VALUES ('task-1', 'Task 1', 'review', NULL, 'proj-1', '/tmp/project')`,
      ).run();
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, status, started_at, completed_at, created_at)
         VALUES ('meeting-1', 'task-1', 'review', 1, 'revision_requested', 1000, 2000, 1000)`,
      ).run();
      db.prepare(
        `INSERT INTO review_revision_history (task_id, first_round, raw_note)
         VALUES ('task-1', 1, '보완 항목 A')`,
      ).run();

      const states = new Map<string, ReviewRoundDecisionState | null>();
      states.set("meeting-1", {
        meeting_id: "meeting-1",
        snapshot_hash: "meeting-1:1:보완 항목 A",
        status: "ready",
        planner_summary: "요약 완료",
        planner_agent_id: "planner-1",
        planner_agent_name: "Planner",
        created_at: 4100,
        updated_at: 5200,
      });

      const tools = buildDeps(db, states);
      const items = tools.buildReviewRoundDecisionItems();

      expect(items).toHaveLength(1);
      expect(items[0]?.created_at).toBe(5200);
    } finally {
      db.close();
    }
  });

  it("리뷰어 3명 verdict를 카드에 반영하고 blocker 수를 계산한다", () => {
    const db = createDb();
    try {
      db.prepare("INSERT INTO projects (id, name) VALUES ('proj-1', 'Project 1')").run();
      db.prepare(
        `INSERT INTO tasks (id, title, status, source_task_id, project_id, project_path)
         VALUES ('task-1', 'Task 1', 'review', NULL, 'proj-1', '/tmp/project')`,
      ).run();
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, status, started_at, completed_at, created_at)
         VALUES ('meeting-1', 'task-1', 'review', 1, 'revision_requested', 1000, 2000, 1000)`,
      ).run();
      db.prepare(
        `INSERT INTO review_round_feedback_items
         (task_id, meeting_id, round, pass2, final_verdict, blocking_items_json, requires_jules_action, lens, confidence, agent_id)
         VALUES
         ('task-1', 'meeting-1', 1, 'counter A', 'approved', '[]', 0, 'quality', 0.91, 'reviewer-1'),
         ('task-1', 'meeting-1', 1, 'counter B', 'hold', '["B blocker"]', 1, 'security', 0.72, 'reviewer-2'),
         ('task-1', 'meeting-1', 1, 'counter C', 'rejected', '["C blocker"]', 1, 'ux', 0.68, 'reviewer-3')`,
      ).run();

      const states = new Map<string, ReviewRoundDecisionState | null>();
      const tools = buildDeps(db, states);
      const items = tools.buildReviewRoundDecisionItems();
      const item = items[0];

      expect(items).toHaveLength(1);
      expect(item?.reviewer_verdicts).toHaveLength(3);
      expect(item?.reviewer_verdicts?.map((verdict) => verdict.final_verdict)).toEqual([
        "approved",
        "hold",
        "rejected",
      ]);
      expect(item?.blocker_count).toBe(2);
      expect(item?.option_notes).toContain("B blocker");
    } finally {
      db.close();
    }
  });
});
