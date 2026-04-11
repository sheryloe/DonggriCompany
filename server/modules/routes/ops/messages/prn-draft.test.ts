import { describe, expect, it } from "vitest";

import { buildFallbackPrnDraft, normalizePrnLanguage, parsePrnDraftResponse } from "./prn-draft.ts";

describe("prn-draft helpers", () => {
  it("normalizes language tokens", () => {
    expect(normalizePrnLanguage("ko-KR")).toBe("ko");
    expect(normalizePrnLanguage("en")).toBe("en");
    expect(normalizePrnLanguage("ja_JP")).toBe("ja");
    expect(normalizePrnLanguage("zh-CN")).toBe("zh");
    expect(normalizePrnLanguage("unknown", "ko")).toBe("ko");
  });

  it("parses strict structured json response", () => {
    const parsed = parsePrnDraftResponse({
      rawText: JSON.stringify({
        pass1: "초기 판단",
        pass2: "반증 검사",
        confidence: 0.91,
        sections: {
          background: "배경",
          goal: "목표",
          non_goal: "비목표",
          requirements: "요구",
          acceptance_criteria: "수용",
          risks: "리스크",
          open_questions: "질문",
        },
        directive_text: "지시문",
      }),
      prompt: "요구사항 만들어줘",
      projectContext: "프로젝트 컨텍스트",
      language: "ko",
      plannerAgent: { id: "a1", name: "Planning", name_ko: "기획팀장" } as any,
    });

    expect(parsed.generation_meta.fallback_used).toBe(false);
    expect(parsed.sections.goal).toBe("목표");
    expect(parsed.directive_text).toBe("지시문");
    expect(parsed.confidence).toBeCloseTo(0.91, 2);
    expect(parsed.generation_meta.pass1).toBe("초기 판단");
    expect(parsed.generation_meta.pass2).toBe("반증 검사");
  });

  it("falls back when pass2 is missing", () => {
    const parsed = parsePrnDraftResponse({
      rawText: JSON.stringify({
        pass1: "초기 판단만 있음",
        confidence: 0.9,
        sections: {
          goal: "깨진 응답",
        },
      }),
      prompt: "요구사항 만들어줘",
      projectContext: "컨텍스트",
      language: "ko",
      plannerAgent: { id: "a2", name: "Planning", name_ko: "기획팀장" } as any,
    });

    expect(parsed.generation_meta.fallback_used).toBe(true);
    expect(parsed.generation_meta.parser_error).toBe("structured_output_missing_or_invalid");
    expect(parsed.sections.goal.length).toBeGreaterThan(0);
    expect(parsed.directive_text.length).toBeGreaterThan(0);
  });

  it("supports fenced json payload", () => {
    const raw = [
      "```json",
      JSON.stringify({
        pass1: "p1",
        pass2: "p2",
        confidence: 0.73,
        sections: {
          background: "bg",
          goal: "goal",
          non_goal: "non",
          requirements: "req",
          acceptance_criteria: "acc",
          risks: "risk",
          open_questions: "q",
        },
        directive_text: "run this",
      }),
      "```",
    ].join("\n");

    const parsed = parsePrnDraftResponse({
      rawText: raw,
      prompt: "prompt",
      projectContext: "ctx",
      language: "en",
    });

    expect(parsed.generation_meta.fallback_used).toBe(false);
    expect(parsed.sections.background).toBe("bg");
    expect(parsed.directive_text).toBe("run this");
  });

  it("builds deterministic fallback template", () => {
    const fallback = buildFallbackPrnDraft({
      prompt: "카드뉴스 로컬 제작",
      projectContext: "인스타그램 카드뉴스",
      language: "ko",
    });

    expect(fallback.generation_meta.fallback_used).toBe(true);
    expect(fallback.sections.requirements).toContain("기능 요구사항");
    expect(fallback.directive_text).toContain("본 PRN 기준");
  });
});

