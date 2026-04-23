import { isLang, type Lang } from "../../../types/lang.ts";
import { readNonNegativeIntEnv } from "../../../db/runtime.ts";
import {
  compactMeetingPromptText,
  formatMeetingTranscriptForPrompt,
  type MeetingTranscriptLine,
} from "../meeting-prompt-utils.ts";
import type {
  AgentRow,
  MeetingReviewDecision,
  MeetingTranscriptEntry,
  OneShotRunResult,
  ReplyKind,
  RunFailureKind,
} from "./conversation-types.ts";

type LocalizedLines = {
  ko: string[];
  en: string[];
  ja: string[];
  zh: string[];
};

type CreateReplyCoreToolsDeps = {
  detectLang: (text: string) => string;
  getPreferredLanguage: () => string;
  pickL: (lines: LocalizedLines, lang: string) => string;
  prettyStreamJson: (raw: string) => string;
};

const MEETING_BUBBLE_EMPTY: LocalizedLines = {
  ko: ["의견을 곧 공유하겠습니다."],
  en: ["Sharing thoughts shortly."],
  ja: ["Sharing thoughts shortly."],
  zh: ["Sharing thoughts shortly."],
};

const MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS = Math.max(
  320,
  readNonNegativeIntEnv("MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS", 1200),
);
const MEETING_TRANSCRIPT_MAX_TURNS = Math.max(4, readNonNegativeIntEnv("MEETING_TRANSCRIPT_MAX_TURNS", 20));
const MEETING_TRANSCRIPT_LINE_MAX_CHARS = Math.max(72, readNonNegativeIntEnv("MEETING_TRANSCRIPT_LINE_MAX_CHARS", 180));
const MEETING_TRANSCRIPT_TOTAL_MAX_CHARS = Math.max(
  720,
  readNonNegativeIntEnv("MEETING_TRANSCRIPT_TOTAL_MAX_CHARS", 2400),
);

export function createReplyCoreTools(deps: CreateReplyCoreToolsDeps) {
  const { detectLang, getPreferredLanguage, pickL, prettyStreamJson } = deps;

  function normalizeMeetingLang(value: unknown): Lang {
    if (isLang(value)) return value;
    const preferred = getPreferredLanguage();
    return isLang(preferred) ? preferred : "ko";
  }

  function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelay(minMs: number, maxMs: number): number {
    return Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
  }

  function getAgentDisplayName(agent: AgentRow, lang: string): string {
    return lang === "ko" ? agent.name_ko || agent.name : agent.name;
  }

  function localeInstruction(lang: string): string {
    switch (lang) {
      case "ja":
        return "Respond in Japanese.";
      case "zh":
        return "Respond in Chinese.";
      case "en":
        return "Respond in English.";
      case "ko":
      default:
        return "Respond in Korean.";
    }
  }

  function normalizeConversationReply(raw: string, maxChars = 420, opts: { maxSentences?: number } = {}): string {
    if (!raw.trim()) return "";
    const parsed = prettyStreamJson(raw);
    let text = parsed.trim() ? parsed : raw;
    text = text
      .replace(/^\[(init|usage|mcp|thread)\][^\n]*$/gim, "")
      .replace(/^\[reasoning\]\s*/gim, "")
      .replace(/\[(tool|result|output|spawn_agent|agent_done|one-shot-error)[^\]]*\]/gi, " ")
      .replace(/^\[(copilot|antigravity)\][^\n]*$/gim, "")
      .replace(
        /\{"type"\s*:\s*"(?:step_finish|step-finish|tool_use|tool_result|thinking|reasoning|text|content)"[^\n]*\}/gm,
        " ",
      )
      .replace(/^!?\s*permission requested:.*auto-rejecting\s*$/gim, "")
      .replace(/^!?\s*execution error:.*$/gim, "")
      .replace(/^!?\s*command rejected:.*$/gim, "")
      .replace(/^!?\s*Tool execution failed:.*$/gim, "")
      .replace(/^\[(?:stdout|stderr)\]\s*/gim, "")
      .replace(/^"(.*)"$/gm, "$1")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) return "";

    let cleaned = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^[{}[\],]+$/.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    cleaned = collapseRepeatedSentenceCycles(cleaned);

    if (opts.maxSentences && opts.maxSentences > 0) {
      const sentences = cleaned
        .split(/(?<=[.!?。！？])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > opts.maxSentences) {
        cleaned = sentences.slice(0, opts.maxSentences).join(" ");
      }
    }

    if (cleaned.length > maxChars) {
      cleaned = `${cleaned.slice(0, maxChars - 3).trimEnd()}...`;
    }

    return cleaned;
  }

  function collapseRepeatedSentenceCycles(text: string): string {
    const sentences = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length < 4) return text;

    const total = sentences.length;
    for (let cycleLen = 1; cycleLen <= Math.floor(total / 2); cycleLen += 1) {
      if (total % cycleLen !== 0) continue;
      const repeatCount = total / cycleLen;
      if (repeatCount < 2) continue;

      const pattern = sentences.slice(0, cycleLen);
      let repeated = true;
      for (let i = cycleLen; i < total; i += 1) {
        if (sentences[i] !== pattern[i % cycleLen]) {
          repeated = false;
          break;
        }
      }
      if (!repeated) continue;

      const collapsed = pattern.join(" ").trim();
      if (collapsed.length >= 24) return collapsed;
    }
    return text;
  }

  function isInternalWorkNarration(text: string): boolean {
    return /\b(I need to|Let me|I'll|I will|analy[sz]e|examin|inspect|check files|run command|current codebase|relevant files)\b/i.test(
      text,
    );
  }

  function departmentFallbackBody(kind: ReplyKind, lang: string, agent?: AgentRow): string {
    const deptId = String(agent?.department_id ?? "").trim().toLowerCase();
    const isKo = lang === "ko";
    const koFeedbackByDept: Record<string, string> = {
      pmo: "PMO 관점에서는 목표, 담당 부서, 일정 기준을 명확히 정리하겠습니다.",
      "planning-architecture": "기획/설계 관점에서는 범위, 산출물 기준, 의사결정 항목을 먼저 정리하겠습니다.",
      planning: "기획 관점에서는 범위, 산출물 기준, 의사결정 항목을 먼저 정리하겠습니다.",
      development: "개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.",
      dev: "개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.",
      "ui-ux": "UI/UX 관점에서는 입력 흐름, 버튼 배치, 오류 피드백을 확인하겠습니다.",
      design: "UI/UX 관점에서는 입력 흐름, 버튼 배치, 오류 피드백을 확인하겠습니다.",
      qa: "QA 관점에서는 사칙연산, 예외 입력, 회귀 테스트 기준을 먼저 잡겠습니다.",
      "knowledge-docs": "문서 관점에서는 결정 사항, 검증 기준, 최종 보고 항목을 남기겠습니다.",
      operations: "운영 관점에서는 실행 경로, 상태 보고, 장애 시 재시도 기준을 점검하겠습니다.",
      management: "관리 관점에서는 진행 상태, 담당자, 보고 누락 여부를 점검하겠습니다.",
      "cicd-repo": "CI/CD 관점에서는 브랜치, 병합, 빌드 검증 흐름을 확인하겠습니다.",
      devsecops: "CI/CD와 보안 관점에서는 브랜치, 병합, 빌드 검증 흐름을 확인하겠습니다.",
      "security-approval": "보안/승인 관점에서는 권한, 외부 연동, 배포 차단 조건을 확인하겠습니다.",
      "api-research": "API 리서치 관점에서는 필요한 외부 정보와 무료 토큰 범위를 확인하겠습니다.",
      bloggent: "블로그 운영 관점에서는 결과 요약과 콘텐츠 전환 가능성을 확인하겠습니다.",
    };
    const enFeedbackByDept: Record<string, string> = {
      pmo: "From PMO, I will clarify goals, owning departments, and schedule criteria.",
      "planning-architecture": "From planning and architecture, I will clarify scope, deliverables, and decision points.",
      planning: "From planning, I will clarify scope, deliverables, and decision points.",
      development: "From development, I will check calculation logic, input validation, and UI wiring first.",
      dev: "From development, I will check calculation logic, input validation, and UI wiring first.",
      "ui-ux": "From UI/UX, I will check input flow, button placement, and error feedback.",
      design: "From UI/UX, I will check input flow, button placement, and error feedback.",
      qa: "From QA, I will define arithmetic, invalid-input, and regression checks first.",
      "knowledge-docs": "From documentation, I will capture decisions, validation criteria, and final report items.",
      operations: "From operations, I will check execution flow, status reporting, and retry criteria.",
      management: "From management, I will check progress state, ownership, and report gaps.",
      "cicd-repo": "From CI/CD, I will check branch, merge, and build verification flow.",
      devsecops: "From CI/CD and security, I will check branch, merge, and build verification flow.",
      "security-approval": "From security and approval, I will check permissions, external integrations, and release blocks.",
      "api-research": "From API research, I will confirm required external information and free-token limits.",
      bloggent: "From blog operations, I will check summary and content conversion opportunities.",
    };
    if (kind === "opening") {
      return isKo
        ? "킥오프 회의를 시작합니다. 각 부서는 관점별 보완 항목과 다음 액션을 한 줄씩 공유해주세요."
        : "Kickoff started. Each department should share gaps and next actions from its own perspective.";
    }
    if (kind === "feedback") {
      return isKo
        ? (koFeedbackByDept[deptId] ?? "부서 관점에서 보완 항목과 다음 액션을 정리하겠습니다.")
        : (enFeedbackByDept[deptId] ?? "From my department, I will clarify gaps and next actions.");
    }
    if (kind === "summary") {
      return isKo
        ? "각 부서 의견을 취합해 실행 가능한 SubTask와 검증 기준으로 정리하겠습니다."
        : "I will consolidate department feedback into executable subtasks and validation criteria.";
    }
    if (kind === "approval") {
      return isKo
        ? (koFeedbackByDept[deptId] ?? "회의 결론에 따라 담당 액션을 진행하겠습니다.")
        : (enFeedbackByDept[deptId] ?? "I will proceed with the assigned action from the meeting conclusion.");
    }
    return isKo ? "확인했습니다. 요청 방향에 맞춰 진행하겠습니다." : "Acknowledged. Proceeding with the requested direction.";
  }

  function fallbackTurnReply(kind: ReplyKind, lang: string, agent?: AgentRow): string {
    const name = agent ? getAgentDisplayName(agent, lang) : "";
    const body = departmentFallbackBody(kind, lang, agent);
    return name ? `${name}: ${body}` : body;
  }

  function buildAgentReplyText(
    lang: string,
    agent: AgentRow | undefined,
    messages: { ko: string; en: string; ja: string; zh: string },
  ): string {
    const body = lang === "en" ? messages.en : lang === "ja" ? messages.ja : lang === "zh" ? messages.zh : messages.ko;
    const name = agent ? getAgentDisplayName(agent, lang) : "";
    return name ? `${name}: ${body}` : body;
  }

  function clipFailureDetail(value: string, max = 180): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 3).trimEnd()}...`;
  }

  function extractRunFailureDetail(rawText: string, runError?: string): string {
    const candidates: string[] = [];
    if (runError && runError.trim()) candidates.push(runError.trim());
    for (const line of rawText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      candidates.push(trimmed);
    }
    for (const candidate of candidates) {
      const line = candidate
        .replace(/^\[(?:one-shot-error|tool-error)\]\s*/i, "")
        .replace(/^error:\s*/i, "")
        .trim();
      if (!line) continue;
      if (line.startsWith("{")) continue;
      if (/^(permission requested:|auto-rejecting)/i.test(line)) continue;
      if (/^(type=|sessionid=|timestamp=)/i.test(line)) continue;
      return clipFailureDetail(line);
    }
    return "";
  }

  function detectRunFailure(rawText: string, runError?: string): RunFailureKind | null {
    const source = [runError || "", rawText || ""].filter(Boolean).join("\n");
    if (!source.trim()) return null;
    if (
      /auto-rejecting|permission.*rejected|rejected permission|external_directory|user rejected permission/i.test(
        source,
      )
    )
      return "permission";
    if (/modified since it was last read|read the file again before modifying/i.test(source)) return "stale_file";
    if (/"type"\s*:\s*"(?:step_finish|step-finish)".*"reason"\s*:\s*"tool-calls"/i.test(source))
      return "tool_calls_only";
    if (/timeout after|timed out|request timed out/i.test(source)) return "timeout";
    if (runError || /\[(?:one-shot-error|tool-error)\]/i.test(source) || /^error:/im.test(source)) return "generic";
    return null;
  }

  function buildRunFailureReply(kind: RunFailureKind, lang: string, agent?: AgentRow, detail = ""): string {
    if (kind === "permission") {
      return buildAgentReplyText(lang, agent, {
        ko: "파일 접근 권한 문제로 작업이 차단되었습니다. 프로젝트 디렉터리 설정을 확인해주세요.",
        en: "The requested operation was blocked by a file-access permission. Please check the project directory settings.",
        ja: "The requested operation was blocked by a file-access permission. Please check the project directory settings.",
        zh: "The requested operation was blocked by a file-access permission. Please check the project directory settings.",
      });
    }
    if (kind === "stale_file") {
      return buildAgentReplyText(lang, agent, {
        ko: "파일을 읽은 뒤 내용이 변경되어 작업을 중단했습니다. 파일을 다시 읽고 재시도해주세요.",
        en: "The file changed after it was read, so the operation was stopped. Please re-read the file and retry.",
        ja: "The file changed after it was read, so the operation was stopped. Please re-read the file and retry.",
        zh: "The file changed after it was read, so the operation was stopped. Please re-read the file and retry.",
      });
    }
    if (kind === "tool_calls_only") {
      return buildAgentReplyText(lang, agent, {
        ko: "도구 호출 단계에서 종료되어 최종 응답이 생성되지 않았습니다. 다시 시도해주세요.",
        en: "The run ended at tool-calls without producing a final reply. Please retry.",
        ja: "The run ended at tool-calls without producing a final reply. Please retry.",
        zh: "The run ended at tool-calls without producing a final reply. Please retry.",
      });
    }
    if (kind === "timeout") {
      return buildAgentReplyText(lang, agent, {
        ko: "응답 생성 시간이 초과되어 작업을 중단했습니다. 잠시 후 다시 시도해주세요.",
        en: "Response generation timed out, so the run was stopped. Please try again shortly.",
        ja: "Response generation timed out, so the run was stopped. Please try again shortly.",
        zh: "Response generation timed out, so the run was stopped. Please try again shortly.",
      });
    }
    const suffix = detail ? ` (${detail})` : "";
    return buildAgentReplyText(lang, agent, {
      ko: `CLI 실행 중 오류가 발생했습니다${suffix}.`,
      en: `CLI execution failed${suffix}.`,
      ja: `CLI execution failed${suffix}.`,
      zh: `CLI execution failed${suffix}.`,
    });
  }

  function chooseSafeReply(run: OneShotRunResult, lang: string, kind: ReplyKind, agent?: AgentRow): string {
    const maxReplyChars = kind === "direct" ? 12000 : 2000;
    const rawText = run.text || "";
    const failureKind = detectRunFailure(rawText, run.error);
    if (failureKind) {
      const detail = failureKind === "generic" ? extractRunFailureDetail(rawText, run.error) : "";
      return buildRunFailureReply(failureKind, lang, agent, detail);
    }
    const cleaned = normalizeConversationReply(rawText, maxReplyChars, { maxSentences: 0 });
    if (!cleaned) return fallbackTurnReply(kind, lang, agent);
    if (/timeout after|CLI 응답 생성 실패|response failed|one-shot-error/i.test(cleaned)) {
      return fallbackTurnReply(kind, lang, agent);
    }
    if (isInternalWorkNarration(cleaned)) return fallbackTurnReply(kind, lang, agent);
    if ((lang === "ko" || lang === "ja" || lang === "zh") && detectLang(cleaned) === "en" && cleaned.length > 20) {
      return fallbackTurnReply(kind, lang, agent);
    }
    return cleaned;
  }

  function compactForMeetingPrompt(text: string, maxChars: number): string {
    return compactMeetingPromptText(text, maxChars);
  }

  function summarizeForMeetingBubble(
    text: string,
    maxChars = 96,
    lang: Lang = normalizeMeetingLang(getPreferredLanguage()),
  ): string {
    const cleaned = normalizeConversationReply(text, maxChars + 24)
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return pickL(MEETING_BUBBLE_EMPTY, lang);
    if (cleaned.length <= maxChars) return cleaned;
    return `${cleaned.slice(0, maxChars - 3).trimEnd()}...`;
  }

  function isMvpDeferralSignal(text: string): boolean {
    return /mvp|범위\s*초과|운영환경|프로덕션|production|post[-\s]?merge|post[-\s]?release|안정화\s*단계|stabilization|모니터링|monitoring|sla|체크리스트|checklist|문서화|runbook|후속\s*(개선|처리|모니터링)|defer|deferred|later\s*phase|다음\s*단계|배포\s*후/i.test(text);
  }

  function isHardBlockSignal(text: string): boolean {
    return /최종\s*승인\s*불가|배포\s*불가|실행\s*불가|중단|즉시\s*중단|반려|cannot\s+(approve|ship|release)|must\s+fix\s+before|hard\s+blocker|critical\s+blocker|p0|data\s+loss|security\s+incident|integrity\s+broken|audit\s*fail|build\s*fail|무결성\s*(훼손|깨짐)|데이터\s*손실|보안\s*사고|치명/i.test(text);
  }

  function hasApprovalAgreementSignal(text: string): boolean {
    return /승인|approve|approved|동의|agree|agreed|lgtm|go\s+ahead|merge\s+approve|병합\s*승인|전환\s*동의|조건부\s*승인/i.test(text);
  }

  function isDeferrableReviewHold(text: string): boolean {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return false;
    if (!isMvpDeferralSignal(cleaned)) return false;
    if (isHardBlockSignal(cleaned)) return false;
    return true;
  }

  function classifyMeetingReviewDecision(text: string): MeetingReviewDecision {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return "reviewing";
    const hasApprovalAgreement = hasApprovalAgreementSignal(cleaned);
    const hasMvpDeferral = isMvpDeferralSignal(cleaned);
    const hasHardBlock = isHardBlockSignal(cleaned);
    const hasApprovalSignal =
      /(승인|통과|문제\s*없음|진행\s*가능|배포\s*가능|approve|approved|lgtm|ship\s+it|go\s+ahead)/i.test(cleaned);
    const hasNoRiskSignal =
      /(리스크\s*(없음|없습니다|없는|없이)|위험\s*(없음|없습니다|없는|없이)|문제\s*(없음|없습니다|없는|없이)|no\s+risk|without\s+risk|risk[-\s]?free|no\s+issue|no\s+blocker)/i.test(cleaned);
    const hasConditionalOrHoldSignal =
      /(조건부|보완|수정|보류|리스크|미흡|미완|추가.*필요|일단.*중단|불가|hold|revise|revision|changes?\s+requested|required|pending|risk|block|missing|incomplete|not\s+ready)/i.test(cleaned);

    if (hasApprovalSignal && hasNoRiskSignal) return "approved";
    if ((hasApprovalAgreement || hasApprovalSignal) && hasMvpDeferral && !hasHardBlock) return "approved";
    if (hasConditionalOrHoldSignal) {
      if ((hasApprovalAgreement || hasApprovalSignal) && hasMvpDeferral && !hasHardBlock) return "approved";
      return "hold";
    }
    if (hasApprovalSignal || hasNoRiskSignal || hasApprovalAgreement) return "approved";
    return "reviewing";
  }

  function wantsReviewRevision(content: string): boolean {
    return classifyMeetingReviewDecision(content) === "hold";
  }

  function findLatestTranscriptContentByAgent(transcript: MeetingTranscriptEntry[], agentId: string): string {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const row = transcript[i];
      if (row.speaker_agent_id === agentId) return row.content;
    }
    return "";
  }

  function compactTaskDescriptionForMeeting(taskDescription: string | null): string {
    if (!taskDescription) return "";
    const marker = "[PROJECT MEMO]";
    const markerIdx = taskDescription.indexOf(marker);
    const base = markerIdx >= 0 ? taskDescription.slice(0, markerIdx) : taskDescription;
    return compactForMeetingPrompt(base, MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS);
  }

  function formatMeetingTranscript(
    transcript: MeetingTranscriptEntry[],
    lang: Lang = normalizeMeetingLang(getPreferredLanguage()),
  ): string {
    const lines: MeetingTranscriptLine[] = transcript.map((row) => ({
      speaker: row.speaker,
      department: row.department,
      role: row.role,
      content: row.content,
    }));

    return formatMeetingTranscriptForPrompt(lines, {
      maxTurns: MEETING_TRANSCRIPT_MAX_TURNS,
      maxLineChars: MEETING_TRANSCRIPT_LINE_MAX_CHARS,
      maxTotalChars: MEETING_TRANSCRIPT_TOTAL_MAX_CHARS,
      summarize: (text, maxChars) => summarizeForMeetingBubble(text, maxChars, lang),
    });
  }

  return {
    normalizeMeetingLang,
    sleepMs,
    randomDelay,
    getAgentDisplayName,
    localeInstruction,
    normalizeConversationReply,
    isInternalWorkNarration,
    fallbackTurnReply,
    chooseSafeReply,
    summarizeForMeetingBubble,
    isMvpDeferralSignal,
    isHardBlockSignal,
    hasApprovalAgreementSignal,
    isDeferrableReviewHold,
    classifyMeetingReviewDecision,
    wantsReviewRevision,
    findLatestTranscriptContentByAgent,
    compactTaskDescriptionForMeeting,
    formatMeetingTranscript,
  };
}
