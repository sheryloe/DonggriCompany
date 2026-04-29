import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createMeetingMinutesTools } from "./minutes.ts";
import { getCanonicalPolicy } from "../../../company/canonical-policy.ts";

describe("meeting minutes policy pinning", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("stores policy version and hash when a meeting starts", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        policy_version TEXT
      );
      CREATE TABLE meeting_minutes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        meeting_type TEXT NOT NULL,
        round INTEGER NOT NULL,
        title TEXT NOT NULL,
        policy_version TEXT,
        policy_snapshot_hash TEXT,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        created_at INTEGER
      );
      CREATE TABLE meeting_minute_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        speaker_agent_id TEXT,
        speaker_name TEXT NOT NULL,
        department_name TEXT,
        role_label TEXT,
        message_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER
      );
    `);
    const policy = getCanonicalPolicy();
    db.prepare("INSERT INTO tasks (id, policy_version) VALUES (?, ?)").run("task-1", policy.version);

    const tools = createMeetingMinutesTools({
      db,
      nowMs: () => 1,
      getDeptName: () => "Planning",
      getRoleLabel: () => "Team Leader",
      getAgentDisplayName: (agent: { name: string }) => agent.name,
      pickL: (choices: string[]) => choices[0],
      l: (ko: string[]) => ko,
      summarizeForMeetingBubble: (text: string) => text,
      appendTaskLog: () => {},
      broadcast: () => {},
      REVIEW_MAX_MEMO_ITEMS_PER_ROUND: 4,
      REVIEW_MAX_MEMO_ITEMS_PER_DEPT: 2,
    } as never);

    const meetingId = tools.beginMeetingMinutes("task-1", "planned", 1, "Kickoff");
    const row = db
      .prepare("SELECT policy_version, policy_snapshot_hash FROM meeting_minutes WHERE id = ?")
      .get(meetingId) as { policy_version?: string | null; policy_snapshot_hash?: string | null } | undefined;

    expect(row?.policy_version).toBe(policy.version);
    expect(row?.policy_snapshot_hash).toBe(policy.hash);
  });
});
