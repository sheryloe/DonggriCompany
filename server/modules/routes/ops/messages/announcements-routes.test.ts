import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../../bootstrap/schema/base-schema.ts";
import { registerAnnouncementRoutes } from "./announcements-routes.ts";

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

afterEach(() => {
  vi.restoreAllMocks();
});

function createHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  const app = express();
  app.use(express.json());

  let seq = 0;
  const handleTaskDelegation = vi.fn();
  const scheduleAnnouncementReplies = vi.fn();

  db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
    "project-toss",
    "Toss Test",
    "G:\\Donggri_DevDrive\\repos\\runtime\\DonggriCompany\\toss",
    "Apps in Toss validation",
  );

  registerAnnouncementRoutes(
    {
      app,
      db,
      broadcast: vi.fn(),
    },
    {
      IdempotencyConflictError: TestIdempotencyConflictError as unknown as any,
      StorageBusyError: TestStorageBusyError as unknown as any,
      resolveMessageIdempotencyKey: () => `announcement-${++seq}`,
      recordMessageIngressAuditOr503: () => true,
      insertMessageWithIdempotency: async (input: {
        senderType: string;
        senderId: string | null;
        receiverType: string;
        receiverId: string | null;
        content: string;
        messageType: string;
        projectId?: string | null;
        idempotencyKey: string;
      }) => {
        const id = `msg-${++seq}`;
        const createdAt = Date.now();
        const projectId = input.projectId ?? null;
        db.prepare(
          `
            INSERT INTO messages (
              id, sender_type, sender_id, receiver_type, receiver_id, content,
              message_type, task_id, project_id, idempotency_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
          `,
        ).run(
          id,
          input.senderType,
          input.senderId,
          input.receiverType,
          input.receiverId,
          input.content,
          input.messageType,
          projectId,
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
            task_id: null,
            project_id: projectId,
            idempotency_key: input.idempotencyKey,
            created_at: createdAt,
          },
          created: true,
        };
      },
      recordAcceptedIngressAuditOrRollback: async () => true,
      scheduleAnnouncementReplies,
      detectMentions: () => ({ deptIds: ["design"], agentIds: [] }),
      findTeamLeader: () =>
        ({
          id: "seed-design-lead",
          name: "Iris",
          department_id: "design",
        }) as any,
      handleTaskDelegation,
    },
  );

  return { app, db, handleTaskDelegation, scheduleAnnouncementReplies };
}

describe("announcement route project binding", () => {
  it("persists project_id and forwards project binding to mention delegation", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: Parameters<typeof setTimeout>[0]) => {
      if (typeof handler === "function") {
        handler();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const { app, db, handleTaskDelegation, scheduleAnnouncementReplies } = createHarness();
    try {
      await request(app)
        .post("/api/announcements")
        .send({
          content: "@design 토스인앱 지도형 미니앱 검토",
          project_id: "project-toss",
          project_path: "G:\\Donggri_DevDrive\\repos\\runtime\\DonggriCompany\\toss",
          project_context: "Apps in Toss validation",
          skipPlannedMeeting: false,
        })
        .expect(200);

      const saved = db.prepare("SELECT project_id FROM messages LIMIT 1").get() as { project_id: string | null };
      expect(saved.project_id).toBe("project-toss");
      expect(scheduleAnnouncementReplies).toHaveBeenCalledWith("@design 토스인앱 지도형 미니앱 검토");

      expect(handleTaskDelegation).toHaveBeenCalledTimes(1);
      expect(handleTaskDelegation).toHaveBeenCalledWith(
        expect.objectContaining({ id: "seed-design-lead" }),
        "@design 토스인앱 지도형 미니앱 검토",
        "",
        expect.objectContaining({
          projectId: "project-toss",
          projectPath: "G:\\Donggri_DevDrive\\repos\\runtime\\DonggriCompany\\toss",
          projectContext: "Apps in Toss validation",
          skipPlannedMeeting: false,
        }),
      );
    } finally {
      db.close();
    }
  });
});
