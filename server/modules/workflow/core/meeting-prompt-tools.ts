import type { AgentRow, MeetingPromptOptions } from "./conversation-types.ts";
import type { Lang } from "../../../types/lang.ts";
import { buildAgentPromptProfileBlock } from "../agents/agent-profile.ts";
import { buildAgentRunModePromptBlock } from "../agents/run-mode.ts";

type CreateMeetingPromptToolsDeps = {
  getDeptName: (departmentId: string, workflowPackKey?: string | null) => string;
  getDeptRoleConstraint: (departmentId: string, departmentName?: string) => string;
  getRoleLabel: (role: string, lang: string) => string;
  getRecentConversationContext: (agentId: string, limit?: number) => string;
  getAgentDisplayName: (agent: AgentRow, lang: string) => string;
  formatMeetingTranscript: (transcript: MeetingPromptOptions["transcript"], lang?: Lang) => string;
  compactTaskDescriptionForMeeting: (taskDescription: string | null) => string;
  normalizeMeetingLang: (value: unknown) => Lang;
  localeInstruction: (lang: string) => string;
  resolveLang: (text: string) => string;
};

export function createMeetingPromptTools(deps: CreateMeetingPromptToolsDeps) {
  const {
    getDeptName,
    getDeptRoleConstraint,
    getRoleLabel,
    getRecentConversationContext,
    getAgentDisplayName,
    formatMeetingTranscript,
    compactTaskDescriptionForMeeting,
    normalizeMeetingLang,
    localeInstruction,
    resolveLang,
  } = deps;

  function buildMeetingPrompt(agent: AgentRow, opts: MeetingPromptOptions): string {
    const lang = normalizeMeetingLang(opts.lang);
    const deptName = getDeptName(agent.department_id ?? "", opts.workflowPackKey);
    const role = getRoleLabel(agent.role, lang);
    const deptConstraint = agent.department_id ? getDeptRoleConstraint(agent.department_id, deptName) : "";
    const recentCtx = getRecentConversationContext(agent.id, 8);
    const meetingLabel = opts.meetingType === "planned" ? "Planned Approval" : "Review Consensus";
    const compactTaskContext = compactTaskDescriptionForMeeting(opts.taskDescription);
    const agentProfileBlock = buildAgentPromptProfileBlock(agent);
    const videoPlanningInvariant =
      opts.workflowPackKey === "video_preprod"
        ? lang === "ko"
          ? [
              "[Video Runtime Invariant]",
              "- 최종 영상 렌더링은 Remotion으로 고정합니다.",
              "- 실행 항목은 Remotion 흐름(composition/scene/timeline/transition)을 기준으로 계획하세요.",
              "- Python(moviepy/Pillow) 또는 비-Remotion 렌더링 파이프라인은 제안하지 마세요.",
            ].join("\n")
          : [
              "[Video Runtime Invariant]",
              "- Final video rendering is fixed to Remotion.",
              "- Plan action items around Remotion flow (composition/scene/timeline/transitions).",
              "- Do not propose Python renderers (moviepy/Pillow) or any non-Remotion pipeline.",
            ].join("\n")
        : "";
    return [
      `[CEO OFFICE ${meetingLabel}]`,
      `Task: ${opts.taskTitle}`,
      compactTaskContext ? `Task context: ${compactTaskContext}` : "",
      `Round: ${opts.round}`,
      `You are ${getAgentDisplayName(agent, lang)} (${deptName} ${role}).`,
      agentProfileBlock,
      deptConstraint,
      localeInstruction(lang),
      videoPlanningInvariant,
      "Output rules:",
      "- Return one natural chat message only (no JSON, no markdown).",
      "- Keep it concise: 1-3 sentences.",
      "- Make your stance explicit and actionable.",
      "- Do not call tools, run commands, or inspect files. Respond from the provided context only.",
      opts.stanceHint ? `Required stance: ${opts.stanceHint}` : "",
      `Current turn objective: ${opts.turnObjective}`,
      "",
      "[Meeting transcript so far]",
      formatMeetingTranscript(opts.transcript, lang),
      recentCtx,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildDirectReplyPrompt(
    agent: AgentRow,
    ceoMessage: string,
    messageType: string,
  ): { prompt: string; lang: string } {
    const lang = resolveLang(ceoMessage);
    const deptName = getDeptName(agent.department_id ?? "");
    const role = getRoleLabel(agent.role, lang);
    const deptConstraint = agent.department_id ? getDeptRoleConstraint(agent.department_id, deptName) : "";
    const recentCtx = getRecentConversationContext(agent.id, 12);
    const typeHint =
      messageType === "report"
        ? "CEO requested a report update."
        : messageType === "task_assign"
          ? "CEO assigned a task. Confirm understanding and concrete next step."
          : "CEO sent a direct chat message.";
    const agentProfileBlock = buildAgentPromptProfileBlock(agent);
    const runModeBlock = buildAgentRunModePromptBlock({
      runMode: agent.run_mode,
      cliProvider: agent.cli_provider,
      cliModel: agent.cli_model,
      promptKind: "direct_reply",
      lang,
    });
    const prompt = [
      "[CEO 1:1 Conversation]",
      `You are ${getAgentDisplayName(agent, lang)} (${deptName} ${role}).`,
      agentProfileBlock,
      runModeBlock,
      deptConstraint,
      localeInstruction(lang),
      "Output rules:",
      "- Return one direct response message only (no JSON, no markdown).",
      "- Keep it concise and practical (1-3 sentences).",
      "- Keep the reply aligned with the Agent Growth Profile and Custom Override if present.",
      `Message type: ${messageType}`,
      `Conversation intent: ${typeHint}`,
      "",
      `CEO message: ${ceoMessage}`,
      recentCtx,
    ]
      .filter(Boolean)
      .join("\n");
    return { prompt, lang };
  }

  function buildCliFailureMessage(agent: AgentRow, lang: string, error?: string): string {
    const name = getAgentDisplayName(agent, lang);
    const detail = error || (lang === "ko" ? "알 수 없는 오류" : "unknown error");
    return lang === "ko"
      ? `${name}: CLI 응답 생성에 실패했습니다 (${detail}).`
      : `${name}: CLI response failed (${detail}).`;
  }

  return {
    buildMeetingPrompt,
    buildDirectReplyPrompt,
    buildCliFailureMessage,
  };
}
