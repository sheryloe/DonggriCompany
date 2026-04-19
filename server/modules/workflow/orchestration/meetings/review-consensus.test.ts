import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createReviewConsensusTools } from "./review-consensus.ts";

function createMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      description TEXT,
      project_path TEXT,
      workflow_pack_key TEXT,
      status TEXT,
      approval_gate_state_json TEXT
    );
    CREATE TABLE tasks_meta (
      id TEXT PRIMARY KEY,
      version INTEGER
    );
    CREATE TABLE meeting_minutes (
      id TEXT,
      task_id TEXT,
      meeting_type TEXT,
      round INTEGER,
      status TEXT,
      started_at INTEGER,
      created_at INTEGER
    );
    CREATE TABLE review_round_feedback_items (
      meeting_id TEXT,
      task_id TEXT,
      round INTEGER,
      agent_id TEXT,
      lens TEXT,
      pass1 TEXT,
      pass2 TEXT,
      final_verdict TEXT,
      confidence REAL,
      blocking_items_json TEXT,
      requires_jules_action INTEGER
    );
    CREATE TABLE meeting_minute_entries (
      meeting_id TEXT,
      seq INTEGER
    );
  `);
  return db;
}

async function flush(times = 2): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function makeTools(
  db: DatabaseSync,
  options: {
    getTaskReviewLeaders: (...args: any[]) => any[];
    runAgentOneShot?: (...args: any[]) => any;
    wantsReviewRevision?: (...args: any[]) => boolean;
    getReviewRoundMode?: (...args: any[]) => any;
  },
) {
  const reviewInFlight = new Set<string>();
  const reviewRoundState = new Map<string, number>();
  const onApproved = vi.fn();
  const onBlocked = vi.fn();
  const notifyCeo = vi.fn();
  const appendTaskLog = vi.fn();
  const runAgentOneShot =
    options.runAgentOneShot ??
    vi.fn(() => ({
      text: JSON.stringify({
        pass1: "looks good",
        pass2: "no blocker",
        final_verdict: "approved",
        confidence: 0.92,
        blocking_items: [],
      }),
    }));
  const tools = createReviewConsensusTools({
    reviewInFlight,
    reviewRoundState,
    db,
    getTaskReviewLeaders: options.getTaskReviewLeaders,
    getTaskStatusById: () => "review",
    getReviewRoundMode: options.getReviewRoundMode ?? (() => "round1_review"),
    scheduleNextReviewRound: vi.fn(),
    resolveProjectPath: (ctx: { title: string; description: string | null; project_path: string | null }) =>
      ctx.project_path ?? `path/${ctx.title}`,
    resolveLang: () => "en",
    runAgentOneShot,
    chooseSafeReply: () => "ok",
    appendTaskLog,
    notifyCeo,
    broadcast: vi.fn(),
    notifyTaskStatus: vi.fn(),
    pickL: (choices: string[]) => choices[1],
    l: (_ko: string[], en: string[]) => en,
    sendAgentMessage: vi.fn(),
    emitMeetingSpeech: vi.fn(),
    getAgentDisplayName: (agent: { name: string }) => agent.name,
    getDeptName: () => "Ops",
    getRoleLabel: () => "Team Leader",
    appendMeetingMinuteEntry: vi.fn(),
    beginMeetingMinutes: vi.fn(() => "meeting-1"),
    finishMeetingMinutes: vi.fn(),
    callLeadersToCeoOffice: vi.fn(),
    dismissLeadersFromCeoOffice: vi.fn(),
    wantsReviewRevision: options.wantsReviewRevision ?? (() => false),
    meetingReviewDecisionByAgent: new Map<string, string>(),
    findLatestTranscriptContentByAgent: vi.fn(),
    summarizeForMeetingBubble: () => "",
    appendTaskProjectMemo: vi.fn(),
    appendTaskReviewFinalMemo: vi.fn(),
    collectRevisionMemoItems: () => [],
    reserveReviewRevisionMemoItems: vi.fn(),
    loadRecentReviewRevisionMemoItems: vi.fn(),
    clearTaskWorkflowState: vi.fn(),
    isTaskWorkflowInterrupted: () => false,
    randomDelay: () => 0,
    sleepMs: async () => {},
    buildMeetingPrompt: () => "",
    reviewMeetingOneShotTimeoutMs: 100,
    REVIEW_MAX_ROUNDS: 1,
    REVIEW_MAX_MEMO_ITEMS_PER_ROUND: 10,
    REVIEW_MAX_MEMO_ITEMS_PER_DEPT: 10,
    REVIEW_MAX_REMEDIATION_REQUESTS: 10,
    REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND: 10,
    REVIEW_MAX_REVISION_SIGNALS_PER_ROUND: 10,
  } as never);

  return { tools, onApproved, onBlocked, notifyCeo, appendTaskLog };
}

describe("review consensus authority hard block", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("blocks review meeting when quorum is not met", async () => {
    db = createMemoryDb();
    db.prepare("INSERT INTO tasks (id, description, project_path, workflow_pack_key, status) VALUES (?, ?, ?, ?, ?)").run(
      "task-1",
      "Review task",
      "/repo",
      "video_preprod",
      "review",
    );

    const { tools, onApproved, onBlocked, notifyCeo, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [{ id: "lead-1", name: "Lead", role: "team_leader", department_id: "planning", status: "idle" }],
    });

    tools.startReviewConsensusMeeting("task-1", "Need consensus", "planning", onApproved, onBlocked);
    await flush();

    expect(appendTaskLog).toHaveBeenCalledWith("task-1", "error", expect.stringContaining("quorum_not_met:1/2"));
    expect(onBlocked).toHaveBeenCalledWith(["quorum_not_met:1/2"]);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("blocks review meeting when canonical authority is not satisfied", async () => {
    db = createMemoryDb();
    db.prepare("INSERT INTO tasks (id, description, project_path, workflow_pack_key, status) VALUES (?, ?, ?, ?, ?)").run(
      "task-2",
      "Release task",
      "/repo",
      "video_preprod",
      "review",
    );

    const { tools, onApproved, onBlocked, notifyCeo, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [
        { id: "lead-1", name: "Lead", role: "team_leader", department_id: "design", status: "idle" },
        { id: "lead-2", name: "Sub", role: "team_leader", department_id: "design", status: "idle" },
      ],
    });

    tools.startReviewConsensusMeeting("task-2", "Need consensus", "planning", onApproved, onBlocked);
    await flush();

    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-2",
      "error",
      expect.stringContaining("missing_reviewer_senior"),
    );
    const blockedBy = onBlocked.mock.calls[0]?.[0] as string[];
    expect([...blockedBy].sort()).toEqual(
      ["missing_orchestrator_team_lead", "missing_qa_senior", "missing_reviewer_senior"].sort(),
    );
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("blocks review meeting when approval gate is hard-blocked", async () => {
    db = createMemoryDb();
    db
      .prepare(
        "INSERT INTO tasks (id, description, project_path, workflow_pack_key, status, approval_gate_state_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "task-3",
        "Release task",
        "/repo",
        "video_preprod",
        "review",
        JSON.stringify({ blocked: true, gates: ["human-approval-general", "artifact-health-block"] }),
      );

    const { tools, onApproved, onBlocked, notifyCeo, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [
        {
          id: "lead-1",
          name: "Lead",
          role: "team_leader",
          department_id: "planning",
          status: "idle",
        },
        {
          id: "lead-2",
          name: "Qa Senior",
          role: "senior",
          department_id: "qa",
          status: "idle",
        },
        {
          id: "lead-3",
          name: "Reviewer Senior",
          role: "senior",
          department_id: "devsecops",
          status: "idle",
        },
      ],
    });

    tools.startReviewConsensusMeeting("task-3", "Need consensus", "planning", onApproved, onBlocked);
    await flush();

    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-3",
      "error",
      expect.stringContaining("approval_gate_blocked"),
    );
    const blockedBy = onBlocked.mock.calls[0]?.[0] as string[];
    expect([...blockedBy].sort()).toEqual(
      ["approval_gate_blocked", "approval_gate=artifact-health-block", "approval_gate=human-approval-general"].sort(),
    );
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("does not hard-block when quorum, authority, and approval gates are all satisfied", async () => {
    db = createMemoryDb();
    db.prepare("INSERT INTO tasks (id, description, project_path, workflow_pack_key, status) VALUES (?, ?, ?, ?, ?)").run(
      "task-4",
      "General implementation task",
      "/repo",
      "development",
      "review",
    );

    const { tools, onApproved, onBlocked, appendTaskLog } = makeTools(db, {
      getReviewRoundMode: () => "round2_final",
      getTaskReviewLeaders: () => [
        {
          id: "lead-1",
          name: "Planner Lead",
          role: "team_leader",
          department_id: "planning",
          status: "idle",
        },
        {
          id: "lead-2",
          name: "QA Senior",
          role: "senior",
          department_id: "qa",
          status: "idle",
        },
        {
          id: "lead-3",
          name: "Reviewer Senior",
          role: "senior",
          department_id: "devsecops",
          status: "idle",
        },
      ],
    });

    tools.startReviewConsensusMeeting("task-4", "Need consensus", "planning", onApproved, onBlocked);
    await flush();

    expect(onBlocked).not.toHaveBeenCalled();
    expect(
      appendTaskLog.mock.calls.some((call) => String(call[2] ?? "").includes("blocked by canonical authority gate")),
    ).toBe(false);
  });
});
