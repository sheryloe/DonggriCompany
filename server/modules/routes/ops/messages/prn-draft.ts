import type { AgentRow } from "../../shared/types.ts";

export type PrnLanguage = "ko" | "en" | "ja" | "zh";

export type PrnSectionKey =
  | "background"
  | "goal"
  | "non_goal"
  | "requirements"
  | "acceptance_criteria"
  | "risks"
  | "open_questions";

export type PrnSections = Record<PrnSectionKey, string>;

export interface PrnDraftResponse {
  sections: PrnSections;
  directive_text: string;
  confidence: number;
  generation_meta: {
    fallback_used: boolean;
    parser_error: string | null;
    planner_agent_id: string | null;
    planner_agent_name: string | null;
    source: "planning_lead" | "fallback";
    pass1: string;
    pass2: string;
  };
}

type BuildFallbackPrnDraftInput = {
  prompt: string;
  projectContext: string | null;
  language: PrnLanguage;
  plannerAgent?: AgentRow | null;
  parserError?: string | null;
};

type ParsedPrnOutput = {
  pass1: string;
  pass2: string;
  confidence: number;
  sections: PrnSections;
  directiveText: string;
};

const PRN_SECTION_KEYS: PrnSectionKey[] = [
  "background",
  "goal",
  "non_goal",
  "requirements",
  "acceptance_criteria",
  "risks",
  "open_questions",
];

const SECTION_ALIASES: Record<PrnSectionKey, string[]> = {
  background: ["background", "context", "배경", "背景", "背景説明"],
  goal: ["goal", "objective", "목표", "目标", "目標"],
  non_goal: ["non_goal", "non-goal", "out_of_scope", "비목표", "非目标", "非目標"],
  requirements: ["requirements", "core_requirements", "핵심요구사항", "要求事项", "要件"],
  acceptance_criteria: ["acceptance_criteria", "acceptance", "done_criteria", "수용기준", "验收标准", "受け入れ基準"],
  risks: ["risks", "risk", "리스크", "风险", "リスク"],
  open_questions: ["open_questions", "questions", "pending_questions", "오픈질문", "开放问题", "未解決事項"],
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampConfidence(value: unknown, fallback = 0.65): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeLangToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
}

export function normalizePrnLanguage(value: unknown, fallback: PrnLanguage = "ko"): PrnLanguage {
  const token = normalizeLangToken(value);
  if (token === "ko" || token.startsWith("ko-")) return "ko";
  if (token === "en" || token.startsWith("en-")) return "en";
  if (token === "ja" || token.startsWith("ja-")) return "ja";
  if (token === "zh" || token.startsWith("zh-")) return "zh";
  return fallback;
}

function languageTemplate(
  lang: PrnLanguage,
  prompt: string,
  projectContext: string,
): { sections: PrnSections; directiveText: string } {
  if (lang === "en") {
    return {
      sections: {
        background: `Request origin: ${prompt}`,
        goal: `Define implementation-ready requirements aligned with project context: ${projectContext}.`,
        non_goal: "Do not define rollout/migration plans outside immediate execution scope.",
        requirements:
          "1) Functional requirements\n2) Non-functional constraints\n3) Interface/data contract expectations",
        acceptance_criteria:
          "1) Testable acceptance points\n2) Edge/failure handling criteria\n3) Review-completion conditions",
        risks: "List major risks, blockers, and mitigation boundaries.",
        open_questions: "List unresolved questions that require CEO confirmation before execution.",
      },
      directiveText: `Create and execute implementation tasks based on this PRN.\n- Keep scope aligned with project context: ${projectContext}\n- Validate with tests and review gates before final approval`,
    };
  }
  if (lang === "ja") {
    return {
      sections: {
        background: `依頼背景: ${prompt}`,
        goal: `プロジェクト文脈 (${projectContext}) に整合する実行可能な要求仕様を定義する。`,
        non_goal: "今すぐ必要ない拡張設計や過剰な範囲拡大は含めない。",
        requirements: "1) 機能要件\n2) 非機能制約\n3) インターフェース/データ契約",
        acceptance_criteria: "1) テスト可能な受け入れ基準\n2) 失敗/例外ハンドリング条件\n3) レビュー完了条件",
        risks: "主要なリスク/ブロッカーと緩和方針を明記する。",
        open_questions: "実行前に代表確認が必要な未解決事項を列挙する。",
      },
      directiveText: `本 PRN に基づいて実装タスクを作成し実行してください。\n- プロジェクト文脈: ${projectContext}\n- 最終承認前にテストとレビューゲートを通過すること`,
    };
  }
  if (lang === "zh") {
    return {
      sections: {
        background: `需求背景: ${prompt}`,
        goal: `定义与项目上下文 (${projectContext}) 一致且可执行的需求规格。`,
        non_goal: "不包含当前阶段不需要的扩展设计与额外范围。",
        requirements: "1) 功能需求\n2) 非功能约束\n3) 接口/数据契约要求",
        acceptance_criteria: "1) 可测试验收点\n2) 失败/异常处理条件\n3) 评审完成条件",
        risks: "列出主要风险、阻塞项与缓解边界。",
        open_questions: "列出执行前需要代表确认的未决问题。",
      },
      directiveText: `请基于本 PRN 创建并执行实现任务。\n- 范围必须与项目上下文保持一致: ${projectContext}\n- 最终审批前必须通过测试与评审闸门`,
    };
  }

  return {
    sections: {
      background: `요청 배경: ${prompt}`,
      goal: `프로젝트 맥락 (${projectContext}) 과 정합되는 실행 가능한 요구사항을 정의한다.`,
      non_goal: "현재 단계에서 불필요한 확장 설계/범위 확대는 포함하지 않는다.",
      requirements: "1) 기능 요구사항\n2) 비기능 제약\n3) 인터페이스/데이터 계약 요구",
      acceptance_criteria: "1) 테스트 가능한 수용 기준\n2) 실패/예외 처리 조건\n3) 리뷰 완료 조건",
      risks: "주요 리스크/블로커와 완화 원칙을 명시한다.",
      open_questions: "실행 전 대표 확인이 필요한 미해결 질문을 정리한다.",
    },
    directiveText: `본 PRN 기준으로 구현 태스크를 생성하고 실행해 주세요.\n- 범위는 프로젝트 맥락(${projectContext})을 유지\n- 최종 승인 전 테스트/리뷰 게이트 통과 필수`,
  };
}

export function buildFallbackPrnDraft(input: BuildFallbackPrnDraftInput): PrnDraftResponse {
  const prompt = normalizeText(input.prompt);
  const projectContext = normalizeText(input.projectContext) || "not_set";
  const template = languageTemplate(input.language, prompt, projectContext);

  return {
    sections: template.sections,
    directive_text: template.directiveText,
    confidence: 0.45,
    generation_meta: {
      fallback_used: true,
      parser_error: normalizeText(input.parserError) || null,
      planner_agent_id: input.plannerAgent?.id ?? null,
      planner_agent_name: input.plannerAgent?.name ?? null,
      source: "fallback",
      pass1:
        input.language === "ko"
          ? "기본 템플릿으로 초기 요구사항을 구성했습니다."
          : "Composed baseline PRN with fallback template.",
      pass2:
        input.language === "ko"
          ? "반증검사: 누락 가능성이 있어 대표 검토 후 보완이 필요합니다."
          : "Counter-check: missing details may remain; CEO review is required.",
    },
  };
}

export function buildPrnDraftPrompt(input: {
  prompt: string;
  projectContext: string | null;
  language: PrnLanguage;
}): string {
  const prompt = normalizeText(input.prompt);
  const projectContext = normalizeText(input.projectContext) || "not_set";
  const languageName =
    input.language === "ko"
      ? "Korean"
      : input.language === "ja"
        ? "Japanese"
        : input.language === "zh"
          ? "Chinese"
          : "English";

  return [
    "[PRN Draft Contract v1]",
    `Write all output in ${languageName}.`,
    "You are the planning leader preparing a PRN draft for CEO review.",
    "Use 2x reasoning:",
    "1) pass1: initial judgment",
    "2) pass2: counter-check/refutation scan",
    "Return strict JSON only (no markdown, no prose outside JSON).",
    "Required schema:",
    "{",
    '  "pass1": "string",',
    '  "pass2": "string",',
    '  "confidence": 0.0,',
    '  "sections": {',
    '    "background": "string",',
    '    "goal": "string",',
    '    "non_goal": "string",',
    '    "requirements": "string",',
    '    "acceptance_criteria": "string",',
    '    "risks": "string",',
    '    "open_questions": "string"',
    "  },",
    '  "directive_text": "string"',
    "}",
    "Constraints:",
    "- sections must be concise and execution-ready.",
    "- include concrete, testable acceptance criteria.",
    "- directive_text must be directly usable as CEO directive content.",
    "",
    `project_context: ${projectContext}`,
    `user_prompt: ${prompt}`,
  ].join("\n");
}

function parseJsonCandidates(raw: string): Record<string, unknown>[] {
  const trimmed = normalizeText(raw);
  if (!trimmed) return [];
  const candidates = new Set<string>();
  candidates.add(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.add(normalizeText(fenced));

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(normalizeText(trimmed.slice(firstBrace, lastBrace + 1)));
  }

  const out: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!isObjectRecord(parsed)) continue;
      out.push(parsed);
    } catch {
      // ignore
    }
  }
  return out;
}

function resolveSectionValue(rawSections: Record<string, unknown>, key: PrnSectionKey, fallbackValue: string): string {
  for (const alias of SECTION_ALIASES[key]) {
    const value = normalizeText(rawSections[alias]);
    if (value) return value;
  }
  return fallbackValue;
}

function parseStructuredOutput(raw: string, fallback: PrnDraftResponse): ParsedPrnOutput | null {
  const parsedCandidates = parseJsonCandidates(raw);
  for (const parsed of parsedCandidates) {
    const pass1 = normalizeText(parsed.pass1);
    const pass2 = normalizeText(parsed.pass2);
    if (!pass1 || !pass2) continue;

    const rawSections = isObjectRecord(parsed.sections) ? parsed.sections : {};
    const nextSections = PRN_SECTION_KEYS.reduce((acc, key) => {
      acc[key] = resolveSectionValue(rawSections, key, fallback.sections[key]);
      return acc;
    }, {} as PrnSections);

    const directiveText = normalizeText(parsed.directive_text || parsed.directiveText) || fallback.directive_text;

    return {
      pass1,
      pass2,
      confidence: clampConfidence(parsed.confidence, 0.65),
      sections: nextSections,
      directiveText,
    };
  }
  return null;
}

export function parsePrnDraftResponse(input: {
  rawText: string;
  prompt: string;
  projectContext: string | null;
  language: PrnLanguage;
  plannerAgent?: AgentRow | null;
}): PrnDraftResponse {
  const fallback = buildFallbackPrnDraft({
    prompt: input.prompt,
    projectContext: input.projectContext,
    language: input.language,
    plannerAgent: input.plannerAgent,
    parserError: "structured_output_missing_or_invalid",
  });

  const structured = parseStructuredOutput(input.rawText, fallback);
  if (!structured) return fallback;

  return {
    sections: structured.sections,
    directive_text: structured.directiveText,
    confidence: structured.confidence,
    generation_meta: {
      fallback_used: false,
      parser_error: null,
      planner_agent_id: input.plannerAgent?.id ?? null,
      planner_agent_name: input.plannerAgent?.name ?? null,
      source: "planning_lead",
      pass1: structured.pass1,
      pass2: structured.pass2,
    },
  };
}
