import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionReviewTools } from "./session-review-tools.ts";
import { getCanonicalSnapshotByVersion } from "../../company/canonical-policy.ts";

describe("session review tools policy pinning", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("binds a legacy task to current policy and pins the execution session", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        project_path TEXT,
        workflow_pack_key TEXT,
        policy_version TEXT,
        resolved_execution_policy_json TEXT,
        status TEXT
      );
    `);
    db.prepare(
      `INSERT INTO tasks (id, title, description, project_path, workflow_pack_key, policy_version, resolved_execution_policy_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("task-1", "Legacy task", "Need orchestration review", null, "donggri", null, null, "in_progress");

    const taskExecutionSessions = new Map<string, any>();
    const appendTaskLog = vi.fn();
    const tools = createSessionReviewTools({
      taskExecutionSessions,
      nowMs: () => 100,
      randomUUID: () => "session-1",
      stopRequestedTasks: new Set(),
      stopRequestModeByTask: new Map(),
      clearCliOutputDedup: () => {},
      crossDeptNextCallbacks: new Map(),
      subtaskDelegationCallbacks: new Map(),
      subtaskDelegationDispatchInFlight: new Set(),
      delegatedTaskToSubtask: new Map(),
      subtaskDelegationCompletionNoticeSent: new Set(),
      reviewRoundState: new Map(),
      reviewInFlight: new Map(),
      appendTaskLog,
      notifyCeo: () => {},
      pickL: (choices: string[]) => choices[0],
      l: (ko: string[]) => ko,
      db,
      getProviderModelConfig: () => ({}),
      finishReview: () => {},
      randomDelay: () => 0,
      startPlannedApprovalMeeting: () => {},
    } as never);

    const session = tools.ensureTaskExecutionSession("task-1", "agent-1", "claude");
    const taskRow = db.prepare("SELECT policy_version, resolved_execution_policy_json FROM tasks WHERE id = ?").get("task-1") as
      | { policy_version?: string | null; resolved_execution_policy_json?: string | null }
      | undefined;

    expect(session.policyVersion).toBeTruthy();
    expect(session.policySnapshotHash).toBe(getCanonicalSnapshotByVersion(session.policyVersion)?.policy.hash ?? null);
    expect(taskRow?.policy_version).toBe(session.policyVersion);
    expect(taskRow?.resolved_execution_policy_json).toContain(session.policyVersion);
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-1",
      "system",
      expect.stringContaining("policy_snapshot_missing_on_legacy_row"),
    );
  });
});
