import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildDirectChatConversationKey,
  clearAllDirectChatProjectContextsForAgent,
  clearDirectChatProjectContext,
  loadDirectChatProjectContext,
  saveDirectChatProjectContext,
} from "./direct-chat-project-context.ts";

describe("direct-chat-project-context", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        project_path TEXT,
        core_goal TEXT
      );
      CREATE TABLE conversation_project_contexts (
        conversation_key TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        project_id TEXT,
        project_path TEXT,
        project_context TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (conversation_key, agent_id)
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("builds desktop and messenger conversation keys with the expected shape", () => {
    expect(buildDirectChatConversationKey("agent-1")).toBe("desktop:agent:agent-1");
    expect(
      buildDirectChatConversationKey("agent-1", {
        messengerChannel: "telegram",
        messengerSessionKey: "telegram:session-77",
      }),
    ).toBe("telegram:session:session-77:agent:agent-1");
  });

  it("saves, loads, clears by conversation, and clears all by agent", () => {
    db.prepare("INSERT INTO projects (id, project_path, core_goal) VALUES (?, ?, ?)").run(
      "project-1",
      "D:\\Projects\\Empire",
      "Build Empire Claw",
    );
    db.prepare("INSERT INTO projects (id, project_path, core_goal) VALUES (?, ?, ?)").run(
      "project-2",
      "D:\\Projects\\Ops",
      "Run Ops",
    );

    saveDirectChatProjectContext(db as never, {
      conversationKey: "telegram:session:session-1:agent:agent-1",
      agentId: "agent-1",
      projectId: "project-1",
      projectPath: "D:\\Projects\\Empire",
      projectContext: "Build Empire Claw",
      updatedAt: 100,
    });
    saveDirectChatProjectContext(db as never, {
      conversationKey: "discord:session:session-2:agent:agent-1",
      agentId: "agent-1",
      projectId: "project-2",
      projectPath: "D:\\Projects\\Ops",
      projectContext: "Run Ops",
      updatedAt: 200,
    });

    expect(loadDirectChatProjectContext(db as never, "telegram:session:session-1:agent:agent-1", "agent-1")).toEqual({
      conversationKey: "telegram:session:session-1:agent:agent-1",
      agentId: "agent-1",
      projectId: "project-1",
      projectPath: "D:\\Projects\\Empire",
      projectContext: "Build Empire Claw",
      updatedAt: 100,
    });

    expect(clearDirectChatProjectContext(db as never, "telegram:session:session-1:agent:agent-1", "agent-1")).toBe(
      true,
    );
    expect(loadDirectChatProjectContext(db as never, "telegram:session:session-1:agent:agent-1", "agent-1")).toBeNull();

    expect(clearAllDirectChatProjectContextsForAgent(db as never, "agent-1")).toBe(1);
    expect(loadDirectChatProjectContext(db as never, "discord:session:session-2:agent:agent-1", "agent-1")).toBeNull();
  });

  it("drops stale rows when the linked project no longer exists", () => {
    saveDirectChatProjectContext(db as never, {
      conversationKey: "telegram:session:session-1:agent:agent-1",
      agentId: "agent-1",
      projectId: null,
      projectPath: "D:\\Projects\\Deleted",
      projectContext: "Deleted project",
      updatedAt: 100,
    });

    expect(loadDirectChatProjectContext(db as never, "telegram:session:session-1:agent:agent-1", "agent-1")).toBeNull();

    const remaining = db
      .prepare(
        "SELECT COUNT(*) AS count FROM conversation_project_contexts WHERE conversation_key = ? AND agent_id = ?",
      )
      .get("telegram:session:session-1:agent:agent-1", "agent-1") as { count: number };
    expect(remaining.count).toBe(0);
  });
});
