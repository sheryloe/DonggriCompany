import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { handleReviewRoundDecisionReply } from "./review-round-reply.ts";
import type { DecisionInboxRouteItem, DecisionOption, ReviewRoundReplyDeps } from "./types.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT,
      department_id TEXT,
      assigned_agent_id TEXT,
      description TEXT
    );

    CREATE TABLE meeting_minutes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      meeting_type TEXT NOT NULL,
      round INTEGER NOT NULL,
      status TEXT NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE review_round_feedback_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      pass2 TEXT,
      final_verdict TEXT,
      blocking_items_json TEXT,
      requires_jules_action INTEGER
    );
  `);
  return db;
}

function createInput(
  db: DatabaseSync,
  body: Record<string, unknown>,
): {
  req: any;
  res: any;
  statusRef: { status: number; body: Record<string, unknown> | null };
  currentItem: DecisionInboxRouteItem;
  selectedOption: DecisionOption;
  deps: ReviewRoundReplyDeps;
  seedSpy: ReturnType<typeof vi.fn>;
} {
  let now = 1000;
  const nowMs = () => {
    now += 1;
    return now;
  };
  const statusRef = { status: 200, body: null as Record<string, unknown> | null };
  const res = {
    status(code: number) {
      statusRef.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      statusRef.body = payload;
      return this;
    },
  } as any;
  const seedSpy = vi.fn(() => 2);

  const deps: ReviewRoundReplyDeps = {
    db,
    l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
    pickL: (pool: any) => (Array.isArray(pool?.ko) ? pool.ko[0] : ""),
    nowMs,
    resolveLang: () => "ko",
    normalizeTextField: (value: unknown) => {
      const text = String(value ?? "").trim();
      return text || null;
    },
    appendTaskLog: vi.fn(),
    processSubtaskDelegations: vi.fn(),
    seedReviewRevisionSubtasks: seedSpy,
    scheduleNextReviewRound: vi.fn(),
    getProjectReviewDecisionState: () => null,
    getReviewDecisionNotes: () => [],
    getReviewDecisionFallbackLabel: () => "검토 항목 없음",
    recordProjectReviewDecisionEvent: vi.fn(),
    openSupplementRound: vi.fn(() => ({ started: true, reason: "started" })),
    REVIEW_DECISION_RESOLVED_LOG_PREFIX: "Decision inbox: review decision resolved",
  };

  const currentItem: DecisionInboxRouteItem = {
    id: "review-round-pick:task-1:meeting-1",
    kind: "review_round_pick",
    created_at: 1000,
    summary: "summary",
    project_id: "proj-1",
    project_name: "Project",
    project_path: "/tmp/project",
    task_id: "task-1",
    task_title: "Task",
    meeting_id: "meeting-1",
    review_round: 1,
    options: [{ number: 2, action: "apply_selected_feedback", label: "선택 반영" }],
  };

  return {
    req: { body } as any,
    res,
    statusRef,
    currentItem,
    selectedOption: currentItem.options[0] as DecisionOption,
    deps,
    seedSpy,
  };
}

describe("review round reply", () => {
  it("selected_feedback_numbers를 우선 해석한다", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, status, project_id, department_id, assigned_agent_id, description)
         VALUES ('task-1', 'Task', 'review', 'proj-1', 'dev', 'agent-1', 'desc')`,
      ).run();
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, status)
         VALUES ('meeting-1', 'task-1', 'review', 1, 'revision_requested')`,
      ).run();
      db.prepare(
        `INSERT INTO review_round_feedback_items
         (task_id, meeting_id, round, pass2, final_verdict, blocking_items_json, requires_jules_action)
         VALUES
         ('task-1', 'meeting-1', 1, '첫 번째 보완', 'hold', '["첫 번째 blocker"]', 1),
         ('task-1', 'meeting-1', 1, '두 번째 보완', 'hold', '["두 번째 blocker"]', 1)`,
      ).run();

      const input = createInput(db, { selected_feedback_numbers: [2], option_number: 2 });
      const handled = handleReviewRoundDecisionReply({
        req: input.req,
        res: input.res,
        currentItem: input.currentItem,
        selectedOption: input.selectedOption,
        optionNumber: 2,
        deps: input.deps,
      });

      expect(handled).toBe(true);
      expect(input.statusRef.status).toBe(200);
      expect(input.seedSpy).toHaveBeenCalledTimes(1);
      const notes = input.seedSpy.mock.calls[0]?.[2] as string[];
      expect(Array.isArray(notes)).toBe(true);
      expect(notes).toContain("첫 번째 보완");
      expect(input.statusRef.body).toMatchObject({
        ok: true,
        action: "apply_selected_feedback",
        selected_feedback_numbers: [2],
        selected_option_numbers: [2],
      });
    } finally {
      db.close();
    }
  });

  it("selected_option_numbers만 와도 하위호환으로 처리한다", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, status, project_id, department_id, assigned_agent_id, description)
         VALUES ('task-1', 'Task', 'review', 'proj-1', 'dev', 'agent-1', 'desc')`,
      ).run();
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, status)
         VALUES ('meeting-1', 'task-1', 'review', 1, 'revision_requested')`,
      ).run();
      db.prepare(
        `INSERT INTO review_round_feedback_items
         (task_id, meeting_id, round, pass2, final_verdict, blocking_items_json, requires_jules_action)
         VALUES ('task-1', 'meeting-1', 1, '하위호환 보완', 'hold', '[]', 1)`,
      ).run();

      const input = createInput(db, { selected_option_numbers: [1], option_number: 2 });
      const handled = handleReviewRoundDecisionReply({
        req: input.req,
        res: input.res,
        currentItem: input.currentItem,
        selectedOption: input.selectedOption,
        optionNumber: 2,
        deps: input.deps,
      });

      expect(handled).toBe(true);
      expect(input.statusRef.status).toBe(200);
      expect(input.seedSpy).toHaveBeenCalledTimes(1);
      expect(input.statusRef.body).toMatchObject({
        ok: true,
        selected_feedback_numbers: [1],
        selected_option_numbers: [1],
      });
    } finally {
      db.close();
    }
  });
});
