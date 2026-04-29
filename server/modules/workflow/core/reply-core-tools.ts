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
    const deptId = String(agent?.department_id ?? "")
      .trim()
      .toLowerCase();
    const isKo = lang === "ko";
    const koFeedbackByDept: Record<string, string> = {
      pmo: "PMO는 요구사항을 실행 작업으로 쪼개 담당 부서와 순서를 지정하겠습니다. 산출물은 SubTask 목록과 완료 기준표입니다.",
      "planning-architecture":
        "기획/설계는 계산기 범위를 사칙연산, 입력 오류, 결과 표시로 확정하겠습니다. 산출물은 요구사항, 화면 흐름, 예외 규칙입니다.",
      planning:
        "기획은 계산기 범위를 사칙연산, 입력 오류, 결과 표시로 확정하겠습니다. 산출물은 요구사항, 화면 흐름, 예외 규칙입니다.",
      development:
        "개발은 숫자 입력 파서와 사칙연산 함수를 분리 구현하고 버튼 클릭에 연결하겠습니다. 산출물은 계산 모듈, UI 연결 코드, 기본 단위 테스트입니다.",
      dev: "개발은 숫자 입력 파서와 사칙연산 함수를 분리 구현하고 버튼 클릭에 연결하겠습니다. 산출물은 계산 모듈, UI 연결 코드, 기본 단위 테스트입니다.",
      "ui-ux":
        "UI/UX는 숫자 입력창, 연산 버튼, 결과 영역을 한 화면 흐름으로 배치하겠습니다. 산출물은 레이아웃 기준과 상태별 오류 문구입니다.",
      design:
        "UI/UX는 숫자 입력창, 연산 버튼, 결과 영역을 한 화면 흐름으로 배치하겠습니다. 산출물은 레이아웃 기준과 상태별 오류 문구입니다.",
      qa: "QA는 정상 계산, 0으로 나누기, 빈 입력, 연속 연산 케이스를 표로 만들고 검증하겠습니다. 산출물은 테스트 체크리스트와 회귀 결과입니다.",
      "knowledge-docs":
        "문서는 결정 사항과 테스트 기준을 한 페이지로 정리하고 최종 보고에 포함하겠습니다. 산출물은 결정 로그와 완료 보고 초안입니다.",
      operations: "운영은 실행 경로와 실패 시 재시도 절차를 확인하겠습니다. 산출물은 실행 절차와 장애 대응 메모입니다.",
      management:
        "관리는 담당자, 진행 상태, 보고 누락 여부를 주기적으로 확인하겠습니다. 산출물은 상태표와 리스크 메모입니다.",
      "cicd-repo":
        "CI/CD는 작업 브랜치, 빌드 명령, 병합 기준을 고정하고 통과 여부를 확인하겠습니다. 산출물은 검증 로그와 병합 준비 체크입니다.",
      devsecops:
        "CI/CD와 보안은 작업 브랜치, 빌드 명령, 병합 기준, 보안 차단 조건을 확인하겠습니다. 산출물은 검증 로그와 승인 체크입니다.",
      "security-approval":
        "보안/승인은 외부 전송, 토큰, 권한 변경이 없는지 확인하겠습니다. 산출물은 승인/차단 체크 결과입니다.",
      "api-research":
        "API 리서치는 외부 API 필요 여부와 무료 토큰 사용 범위를 확인하겠습니다. 산출물은 사용 판단과 제한 조건입니다.",
      bloggent:
        "블로그는 완성 결과를 사용자 설명 글로 전환할 수 있게 핵심 기능과 사용 예시를 정리하겠습니다. 산출물은 게시글 초안 소재입니다.",
    };
    const enFeedbackByDept: Record<string, string> = {
      pmo: "PMO will split requirements into executable work, assign owning departments and order. Deliverables: subtask list and acceptance criteria.",
      "planning-architecture":
        "Planning/architecture will lock calculator scope to arithmetic, input errors, and result display. Deliverables: requirements, screen flow, exception rules.",
      planning:
        "Planning will lock calculator scope to arithmetic, input errors, and result display. Deliverables: requirements, screen flow, exception rules.",
      development:
        "Development will separate the numeric parser and arithmetic functions, then wire them to button clicks. Deliverables: calculation module, UI wiring, basic unit tests.",
      dev: "Development will separate the numeric parser and arithmetic functions, then wire them to button clicks. Deliverables: calculation module, UI wiring, basic unit tests.",
      "ui-ux":
        "UI/UX will lay out the input, operation buttons, and result area as one flow. Deliverables: layout rules and state-specific error copy.",
      design:
        "UI/UX will lay out the input, operation buttons, and result area as one flow. Deliverables: layout rules and state-specific error copy.",
      qa: "QA will create and run a matrix for normal arithmetic, divide-by-zero, empty input, and chained operations. Deliverables: test checklist and regression result.",
      "knowledge-docs":
        "Docs will capture decisions and test criteria on one page and include them in the final report. Deliverables: decision log and report draft.",
      operations:
        "Operations will verify the execution path and retry procedure. Deliverables: run procedure and incident memo.",
      management:
        "Management will track owner, progress state, and report gaps. Deliverables: status table and risk memo.",
      "cicd-repo":
        "CI/CD will fix the work branch, build command, and merge criteria, then verify pass/fail. Deliverables: verification log and merge-readiness check.",
      devsecops:
        "CI/CD and security will check the work branch, build command, merge criteria, and security blocks. Deliverables: verification log and approval check.",
      "security-approval":
        "Security/approval will check external transmission, tokens, and permission changes. Deliverables: approve/block result.",
      "api-research":
        "API research will decide whether external APIs are needed and confirm free-token limits. Deliverables: usage decision and constraints.",
      bloggent:
        "Blog operations will turn the result into user-facing explanation material. Deliverables: post draft material.",
    };
    if (kind === "opening") {
      return isKo
        ? "킥오프를 시작합니다. 각 부서는 대상, 방법, 산출물, 완료 기준을 한 문장으로 공유해 주세요."
        : "Kickoff started. Each department should share target, method, deliverable, and acceptance criteria in one sentence.";
    }
    if (kind === "feedback") {
      return isKo
        ? (koFeedbackByDept[deptId] ??
            "담당 부서는 요청 범위를 구체 작업으로 나누고 산출물과 완료 기준을 함께 보고하겠습니다.")
        : (enFeedbackByDept[deptId] ??
            "The department will split its scope into concrete work and report deliverables with acceptance criteria.");
    }
    if (kind === "summary") {
      return isKo
        ? "각 부서 발언을 담당자, 실행 방법, 산출물, 검증 기준이 포함된 SubTask 목록으로 정리하겠습니다."
        : "I will consolidate department feedback into subtasks with owner, method, deliverable, and validation criteria.";
    }
    if (kind === "approval") {
      return isKo
        ? (koFeedbackByDept[deptId] ?? "회의 결론에 따라 담당 작업을 산출물 기준으로 실행하겠습니다.")
        : (enFeedbackByDept[deptId] ?? "I will execute the assigned work with deliverable-based acceptance criteria.");
    }
    return isKo
      ? "확인했습니다. 요청 범위를 작업, 산출물, 검증 기준으로 나눠 진행하겠습니다."
      : "Acknowledged. I will proceed by splitting the request into work, deliverables, and validation criteria.";
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
    const detailSuffixKo = detail ? ` 세부 정보: ${detail}` : "";
    const detailSuffixEn = detail ? ` Detail: ${detail}` : "";
    if (kind === "permission") {
      return buildAgentReplyText(lang, agent, {
        ko: `파일 접근 권한 문제로 작업이 차단되었습니다. 프로젝트 디렉터리 설정을 확인해 주세요.${detailSuffixKo}`,
        en: `The requested operation was blocked by file-access permissions. Please check the project directory settings.${detailSuffixEn}`,
        ja: `The requested operation was blocked by file-access permissions. Please check the project directory settings.${detailSuffixEn}`,
        zh: `The requested operation was blocked by file-access permissions. Please check the project directory settings.${detailSuffixEn}`,
      });
    }
    if (kind === "stale_file") {
      return buildAgentReplyText(lang, agent, {
        ko: `파일을 읽은 뒤 내용이 바뀌어 작업을 중단했습니다. 최신 파일 기준으로 다시 시도해 주세요.${detailSuffixKo}`,
        en: `The file changed after it was read, so the operation was stopped. Please re-read the file and retry.${detailSuffixEn}`,
        ja: `The file changed after it was read, so the operation was stopped. Please re-read the file and retry.${detailSuffixEn}`,
        zh: `The file changed after it was read, so the operation was stopped. Please re-read the file and retry.${detailSuffixEn}`,
      });
    }
    if (kind === "tool_calls_only") {
      return buildAgentReplyText(lang, agent, {
        ko: `도구 호출 단계에서 종료되어 최종 응답이 생성되지 않았습니다. 같은 지시를 다시 실행해 주세요.${detailSuffixKo}`,
        en: `The run ended at tool-calls without producing a final reply. Please retry.${detailSuffixEn}`,
        ja: `The run ended at tool-calls without producing a final reply. Please retry.${detailSuffixEn}`,
        zh: `The run ended at tool-calls without producing a final reply. Please retry.${detailSuffixEn}`,
      });
    }
    if (kind === "timeout") {
      return buildAgentReplyText(lang, agent, {
        ko: `응답 생성 시간이 초과되었습니다. 해당 부서는 자동 fallback 기준으로 산출물과 검증 기준을 정리하겠습니다.${detailSuffixKo}`,
        en: `The reply timed out. The department will use fallback planning output with deliverables and validation criteria.${detailSuffixEn}`,
        ja: `The reply timed out. The department will use fallback planning output with deliverables and validation criteria.${detailSuffixEn}`,
        zh: `The reply timed out. The department will use fallback planning output with deliverables and validation criteria.${detailSuffixEn}`,
      });
    }
    return buildAgentReplyText(lang, agent, {
      ko: `응답 생성 중 오류가 발생했습니다. 요청 범위를 작업, 산출물, 검증 기준으로 나눠 다시 정리하겠습니다.${detailSuffixKo}`,
      en: `An error occurred while generating the reply. I will restate the request as work, deliverables, and validation criteria.${detailSuffixEn}`,
      ja: `An error occurred while generating the reply. I will restate the request as work, deliverables, and validation criteria.${detailSuffixEn}`,
      zh: `An error occurred while generating the reply. I will restate the request as work, deliverables, and validation criteria.${detailSuffixEn}`,
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
    return /mvp|범위\s*초과|운영환경|프로덕션|production|post[-\s]?merge|post[-\s]?release|안정화\s*단계|stabilization|모니터링|monitoring|sla|체크리스트|checklist|문서화|runbook|후속\s*(개선|처리|모니터링)|defer|deferred|later\s*phase|다음\s*단계|배포\s*후/i.test(
      text,
    );
  }

  function isHardBlockSignal(text: string): boolean {
    return /최종\s*승인\s*불가|배포\s*불가|실행\s*불가|중단|즉시\s*중단|반려|cannot\s+(approve|ship|release)|must\s+fix\s+before|hard\s+blocker|critical\s+blocker|p0|data\s+loss|security\s+incident|integrity\s+broken|audit\s*fail|build\s*fail|무결성\s*(훼손|깨짐)|데이터\s*손실|보안\s*사고|치명/i.test(
      text,
    );
  }

  function hasApprovalAgreementSignal(text: string): boolean {
    return /승인|approve|approved|동의|agree|agreed|lgtm|go\s+ahead|merge\s+approve|병합\s*승인|전환\s*동의|조건부\s*승인/i.test(
      text,
    );
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
      /(리스크\s*(없음|없습니다|없는|없이)|위험\s*(없음|없습니다|없는|없이)|문제\s*(없음|없습니다|없는|없이)|no\s+risk|without\s+risk|risk[-\s]?free|no\s+issue|no\s+blocker)/i.test(
        cleaned,
      );
    const hasConditionalOrHoldSignal =
      /(조건부|보완|수정|보류|리스크|미흡|미완|추가.*필요|일단.*중단|불가|hold|revise|revision|changes?\s+requested|required|pending|risk|block|missing|incomplete|not\s+ready)/i.test(
        cleaned,
      );

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
