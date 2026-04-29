import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../../bootstrap/schema/base-schema.ts";
import { registerChatMessageRoutes } from "./chat-routes.ts";

class TestIdempotencyConflictError extends Error {
  key: string;

  constructor(key: string) {
    super("idempotency_conflict");
    this.key = key;
  }
}

class TestStorageBusyError extends Error {
  operation: string;
  attempts: number;

  constructor(operation: string, attempts: number) {
    super("storage_busy");
    this.operation = operation;
    this.attempts = attempts;
  }
}

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

async function createHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  const app = express();
  app.use(express.json());
  const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let seq = 0;

  db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
    "project-a",
    "Project A",
    "D:\\Projects\\A",
    "A goal",
  );
  db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
    "project-b",
    "Project B",
    "D:\\Projects\\B",
    "B goal",
  );

  registerChatMessageRoutes(
    {
      app,
      db,
      broadcast: (event, payload) => {
        broadcasts.push({ event, payload: payload as Record<string, unknown> });
      },
    },
    {
      IdempotencyConflictError: TestIdempotencyConflictError as unknown as any,
      StorageBusyError: TestStorageBusyError as unknown as any,
      firstQueryValue,
      resolveMessageIdempotencyKey: () => `idem-${++seq}`,
      recordMessageIngressAuditOr503: () => true,
      insertMessageWithIdempotency: async (input: {
        senderType: string;
        senderId: string | null;
        receiverType: string;
        receiverId: string | null;
        content: string;
        messageType: string;
        taskId: string | null;
        projectId: string | null;
        idempotencyKey: string;
      }) => {
        const id = `msg-${++seq}`;
        const createdAt = Date.now();
        db.prepare(
          `
            INSERT INTO messages (
              id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, project_id, idempotency_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          id,
          input.senderType,
          input.senderId,
          input.receiverType,
          input.receiverId,
          input.content,
          input.messageType,
          input.taskId,
          input.projectId,
          input.idempotencyKey,
          createdAt,
        );
        return {
          message: {
            id,
            sender_type: input.senderType,
            sender_id: input.senderId,
            receiver_type: input.receiverType,
            receiver_id: input.receiverId,
            content: input.content,
            message_type: input.messageType,
            task_id: input.taskId,
            project_id: input.projectId,
            idempotency_key: input.idempotencyKey,
            created_at: createdAt,
          },
          created: true,
        };
      },
      recordAcceptedIngressAuditOrRollback: async () => true,
      normalizeTextField: (value: unknown) => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      },
      handleReportRequest: () => false,
      scheduleAgentReply: vi.fn(),
      detectMentions: () => ({ deptIds: [] as string[], agentIds: [] as string[] }),
      resolveLang: () => "ko",
      handleMentionDelegation: vi.fn(),
    },
  );

  return { app, db, broadcasts };
}

describe("chat-routes project_id persistence and filtering", () => {
  it("persists project_id on POST and filters by project_id on GET", async () => {
    const { app, db } = await createHarness();

    try {
      await request(app)
        .post("/api/messages")
        .send({
          sender_type: "ceo",
          receiver_type: "all",
          content: "hello-a",
          project_id: "project-a",
        })
        .expect(200);

      await request(app)
        .post("/api/messages")
        .send({
          sender_type: "ceo",
          receiver_type: "all",
          content: "hello-b",
          project_id: "project-b",
        })
        .expect(200);

      const saved = db.prepare("SELECT content, project_id FROM messages ORDER BY created_at ASC").all() as Array<{
        content: string;
        project_id: string | null;
      }>;
      expect(saved).toEqual([
        { content: "hello-a", project_id: "project-a" },
        { content: "hello-b", project_id: "project-b" },
      ]);

      const filtered = await request(app).get("/api/messages").query({ project_id: "project-a" }).expect(200);
      expect(filtered.body.messages).toHaveLength(1);
      expect(filtered.body.messages[0]).toMatchObject({
        content: "hello-a",
        project_id: "project-a",
      });
    } finally {
      db.close();
    }
  });

  it("includes project_id in new_message broadcast payload", async () => {
    const { app, db, broadcasts } = await createHarness();

    try {
      await request(app)
        .post("/api/messages")
        .send({
          sender_type: "ceo",
          receiver_type: "all",
          content: "broadcast-project",
          project_id: "project-a",
        })
        .expect(200);

      const event = broadcasts.find((item) => item.event === "new_message");
      expect(event).toBeDefined();
      expect(event?.payload.project_id).toBe("project-a");
      expect(event?.payload.content).toBe("broadcast-project");
    } finally {
      db.close();
    }
  });
});
