import { describe, expect, it } from "vitest";
import type { Agent, Message } from "../types";
import { mergeDecisionInboxItems } from "./decision-inbox";

const agent = {
  id: "master-quality",
  name: "Quality Master",
  name_ko: "품질 마스터",
  avatar_emoji: "QA",
} as Agent;

const requestMessage = {
  id: "message-1",
  sender_type: "agent",
  sender_id: agent.id,
  receiver_type: "agent",
  receiver_id: null,
  content: "[의사결정 요청]\n1. 승인\n2. 보류",
  message_type: "chat",
  task_id: null,
  created_at: 20,
} satisfies Message;

describe("mergeDecisionInboxItems", () => {
  it("merges workflow and agent-originated requests in descending time order", () => {
    const items = mergeDecisionInboxItems({
      agents: [agent],
      messages: [requestMessage],
      workflowItems: [
        {
          id: "workflow-1",
          kind: "task_timeout_resume",
          agent_id: null,
          agent_name: null,
          agent_name_ko: null,
          agent_avatar: null,
          summary: "재개 여부",
          created_at: 10,
          task_id: "task-1",
          task_title: "테스트 업무",
          project_id: null,
          project_name: null,
          project_path: null,
          options: [{ number: 1, label: "재개", action: "resume_timeout_task" }],
        },
      ],
      language: "ko",
    });

    expect(items.map((item) => item.id)).toEqual(["message-1", "workflow-1"]);
    expect(items[0]).toEqual(expect.objectContaining({ kind: "agent_request", agentNameKo: "품질 마스터" }));
  });
});
