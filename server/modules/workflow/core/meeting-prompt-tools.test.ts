import { describe, expect, it, vi } from "vitest";
import { createMeetingPromptTools } from "./meeting-prompt-tools.ts";
import type { AgentRow } from "./conversation-types.ts";

function createAgent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: "agent-1",
    name: "DORO",
    name_ko: "도로롱",
    role: "junior",
    personality: null,
    status: "idle",
    department_id: "design",
    current_task_id: null,
    avatar_emoji: "🎨",
    cli_provider: "claude",
    oauth_account_id: null,
    api_provider_id: null,
    api_model: null,
    cli_model: null,
    cli_reasoning_level: null,
    run_mode: "standard",
    ...overrides,
  };
}

function createTools() {
  return createMeetingPromptTools({
    getDeptName: () => "Design",
    getDeptRoleConstraint: () => "",
    getRoleLabel: () => "Junior",
    getRecentConversationContext: () => "",
    getAgentDisplayName: (agent) => agent.name,
    formatMeetingTranscript: () => "",
    compactTaskDescriptionForMeeting: () => "",
    normalizeMeetingLang: () => "en",
    localeInstruction: () => "Respond in English.",
    resolveLang: () => "en",
  });
}

describe("buildDirectReplyPrompt", () => {
  it("includes agent growth profile block when personality exists", () => {
    const tools = createTools();
    const agent = createAgent({
      personality: "Playful design specialist. Call CEO '대표님' and keep warm expressive tone.",
    });
    const built = tools.buildDirectReplyPrompt(agent, "Can you help me now?", "chat");
    expect(built.prompt).toContain("[Agent Growth Profile]");
    expect(built.prompt).toContain("Playful design specialist");
    expect(built.prompt).toContain("Custom override (highest priority)");
    expect(built.prompt).toContain("Keep the reply aligned with the Agent Growth Profile");
  });

  it("keeps the base profile block and omits the custom override line when personality is empty", () => {
    const tools = createTools();
    const agent = createAgent({ personality: null });
    const built = tools.buildDirectReplyPrompt(agent, "Can you help me now?", "chat");
    expect(built.prompt).toContain("[Agent Growth Profile]");
    expect(built.prompt).not.toContain("Custom override (highest priority)");
  });

  it("injects the Codex plan mode block only for eligible direct replies", () => {
    const tools = createTools();
    const built = tools.buildDirectReplyPrompt(
      createAgent({
        cli_provider: "codex",
        cli_model: "gpt-5.4",
        run_mode: "plan",
      }),
      "Can you help me now?",
      "chat",
    );
    expect(built.prompt).toContain("[Codex Plan Mode]");
    expect(built.prompt).toContain("Think plan-first internally before answering.");
  });
});

describe("buildMeetingPrompt", () => {
  it("passes workflow pack key into department name lookup", () => {
    const getDeptName = vi.fn(() => "씬 엔진팀");
    const tools = createMeetingPromptTools({
      getDeptName,
      getDeptRoleConstraint: () => "",
      getRoleLabel: () => "팀장",
      getRecentConversationContext: () => "",
      getAgentDisplayName: (agent) => agent.name_ko,
      formatMeetingTranscript: () => "",
      compactTaskDescriptionForMeeting: () => "",
      normalizeMeetingLang: () => "ko",
      localeInstruction: () => "한국어로 응답하세요.",
      resolveLang: () => "ko",
    });
    const prompt = tools.buildMeetingPrompt(createAgent({ department_id: "dev", role: "team_leader" }), {
      meetingType: "planned",
      round: 1,
      taskTitle: "영상 제작",
      taskDescription: "킥오프",
      workflowPackKey: "video_preprod",
      transcript: [],
      turnObjective: "킥오프",
      lang: "ko",
    });
    expect(getDeptName).toHaveBeenCalledWith("dev", "video_preprod");
    expect(prompt).toContain("Remotion");
  });
});
