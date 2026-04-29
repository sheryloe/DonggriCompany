import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlannedApprovalTools } from "./planned-approval.ts";

function createMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      description TEXT,
      project_path TEXT,
      workflow_pack_key TEXT,
      approval_gate_state_json TEXT
    );
  `);
  return db;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeTools(db: DatabaseSync, options: { getTaskReviewLeaders: (...args: any[]) => any[] }) {
  const reviewInFlight = new Set<string>();
  const reviewRoundState = new Map<string, number>();
  const onApproved = vi.fn();
  const notifyCeo = vi.fn();
  const beginMeetingMinutes = vi.fn(() => "meeting-1");
  const appendTaskLog = vi.fn();
  const sendAgentMessage = vi.fn();
  const tools = createPlannedApprovalTools({
    reviewInFlight,
    reviewRoundState,
    db,
    getTaskReviewLeaders: options.getTaskReviewLeaders,
    resolveProjectPath: (ctx: { title: string; description: string | null; project_path: string | null }) =>
      ctx.project_path ?? "path/" + ctx.title,
    resolveLang: () => "en",
    beginMeetingMinutes,
    isTaskWorkflowInterrupted: () => false,
    getTaskStatusById: () => "planned",
    finishMeetingMinutes: vi.fn(),
    dismissLeadersFromCeoOffice: vi.fn(),
    clearTaskWorkflowState: vi.fn(),
    getAgentDisplayName: (agent: { name: string }) => agent.name,
    getDeptName: () => "Planning",
    getRoleLabel: () => "Team Leader",
    sendAgentMessage,
    emitMeetingSpeech: vi.fn(),
    appendMeetingMinuteEntry: vi.fn(),
    callLeadersToCeoOffice: vi.fn(),
    notifyCeo,
    pickL: (choices: string[]) => choices[1],
    l: (_ko: string[], en: string[]) => en,
    buildMeetingPrompt: vi.fn(),
    runAgentOneShot: vi.fn(async () => ({ text: "ok" })),
    chooseSafeReply: (_run: { text?: string }, _lang: string) => "ok",
    sleepMs: async () => {},
    randomDelay: (min: number, max: number) => min,
    collectPlannedActionItems: () => [],
    appendTaskProjectMemo: vi.fn(),
    appendTaskLog,
    reviewMeetingOneShotTimeoutMs: 100,
  } as never);

  return {
    db,
    tools,
    onApproved,
    notifyCeo,
    beginMeetingMinutes,
    appendTaskLog,
    sendAgentMessage,
    reviewInFlight,
    reviewRoundState,
  };
}

describe("planned approval gating", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("blocks planned meeting when quorum is not met", async () => {
    db = createMemoryDb();
    db.prepare(`INSERT INTO tasks (id, description, project_path, workflow_pack_key) VALUES (?, ?, ?, ?)`).run(
      "task-1",
      "Review task",
      "/repo",
      "video_preprod",
    );

    const { tools, onApproved, notifyCeo, beginMeetingMinutes, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [
        {
          id: "lead-1",
          name: "Lead",
          role: "team_leader",
          department_id: "planning",
          status: "idle",
          workflow_profile: "{}",
        },
      ],
    });

    tools.startPlannedApprovalMeeting("task-1", "Plan: review", "planning", onApproved);
    await flush();

    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(appendTaskLog).toHaveBeenCalledWith("task-1", "error", expect.stringContaining("quorum_not_met:1/2"));
    expect(onApproved).not.toHaveBeenCalled();
    expect(beginMeetingMinutes).not.toHaveBeenCalled();
  });

  it("blocks planned meeting when approval gate is hard-blocked", async () => {
    db = createMemoryDb();
    db.prepare(
      "INSERT INTO tasks (id, description, project_path, workflow_pack_key, approval_gate_state_json) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "task-2",
      "Release task",
      "/repo",
      "video_preprod",
      JSON.stringify({ gates: ["artifact-health-block"], blocked: true }),
    );

    const { tools, onApproved, notifyCeo, beginMeetingMinutes, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [
        {
          id: "lead-1",
          name: "Lead",
          role: "team_leader",
          department_id: "planning",
          status: "idle",
          workflow_profile: "{}",
        },
        {
          id: "lead-2",
          name: "Sub",
          role: "team_leader",
          department_id: "planning",
          status: "idle",
          workflow_profile: "{}",
        },
      ],
    });

    tools.startPlannedApprovalMeeting("task-2", "Plan: release", "planning", onApproved);
    await flush();

    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-2",
      "error",
      expect.stringContaining("approval_gate=artifact-health-block"),
    );
    expect(onApproved).not.toHaveBeenCalled();
    expect(beginMeetingMinutes).not.toHaveBeenCalled();
  });

  it("blocks planned meeting when canonical authority is not satisfied", async () => {
    db = createMemoryDb();
    db.prepare(`INSERT INTO tasks (id, description, project_path, workflow_pack_key) VALUES (?, ?, ?, ?)`).run(
      "task-3",
      "Release task",
      "/repo",
      "video_preprod",
    );

    const { tools, onApproved, notifyCeo, beginMeetingMinutes, appendTaskLog } = makeTools(db, {
      getTaskReviewLeaders: () => [
        {
          id: "lead-1",
          name: "Lead",
          role: "team_leader",
          department_id: "design",
          status: "idle",
          workflow_profile: "{}",
        },
        {
          id: "lead-2",
          name: "Sub",
          role: "team_leader",
          department_id: "design",
          status: "idle",
          workflow_profile: "{}",
        },
      ],
    });

    tools.startPlannedApprovalMeeting("task-3", "Plan: release", "planning", onApproved);
    await flush();

    expect(notifyCeo).toHaveBeenCalledTimes(1);
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-3",
      "error",
      expect.stringContaining("missing_orchestrator_team_lead"),
    );
    expect(onApproved).not.toHaveBeenCalled();
    expect(beginMeetingMinutes).not.toHaveBeenCalled();
  });

  it("publishes planned feedback from each selected department to the shared room", async () => {
    db = createMemoryDb();
    db.prepare(`INSERT INTO tasks (id, description, project_path, workflow_pack_key) VALUES (?, ?, ?, ?)`).run(
      "task-public",
      "Build a clean calculator",
      "/repo",
      "development",
    );

    const leaders = [
      {
        id: "pmo-lead",
        name: "PMO",
        role: "team_leader",
        department_id: "pmo",
        status: "idle",
        workflow_profile: "{}",
        family: "orchestrator",
        career_stage: "team-lead",
        authority_level: 7,
      },
      {
        id: "dev-lead",
        name: "Dev",
        role: "team_leader",
        department_id: "development",
        status: "idle",
        workflow_profile: "{}",
        family: "backend",
        career_stage: "team-lead",
        authority_level: 5,
      },
      {
        id: "qa-lead",
        name: "QA",
        role: "team_leader",
        department_id: "qa",
        status: "idle",
        workflow_profile: "{}",
        family: "qa",
        career_stage: "team-lead",
        authority_level: 5,
      },
    ];
    const getTaskReviewLeaders = vi.fn(() => leaders);
    const { tools, onApproved, sendAgentMessage, appendTaskLog } = makeTools(db, { getTaskReviewLeaders });

    tools.startPlannedApprovalMeeting("task-public", "계산 기능을 깔끔하게 만들어봐", "planning", onApproved);
    for (let i = 0; i < 8; i += 1) await flush();

    expect(getTaskReviewLeaders).toHaveBeenCalledWith(
      "task-public",
      "planning",
      expect.objectContaining({
        minLeaders: 5,
        includePlanning: true,
        fallbackAll: true,
        requiredDepartmentIds: expect.arrayContaining(["development", "ui-ux", "qa", "knowledge-docs"]),
      }),
    );
    expect(sendAgentMessage).toHaveBeenCalledWith(leaders[1], "ok", "chat", "all", null, "task-public");
    expect(sendAgentMessage).toHaveBeenCalledWith(leaders[2], "ok", "chat", "all", null, "task-public");
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-public",
      "system",
      expect.stringContaining("meeting_public_feedback phase=planned source=feedback department_id=development"),
    );
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-public",
      "system",
      expect.stringContaining("meeting_public_feedback phase=planned source=feedback department_id=qa"),
    );
    expect(onApproved).toHaveBeenCalled();
  });
});
