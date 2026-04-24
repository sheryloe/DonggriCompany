import { describe, expect, it } from "vitest";

import { createReplyCoreTools } from "./reply-core-tools.ts";

function makeTools() {
  return createReplyCoreTools({
    detectLang: (text: string) => (/[\uac00-\ud7af]/.test(text) ? "ko" : "en"),
    getPreferredLanguage: () => "ko",
    pickL: (lines, lang) => (lang === "ko" ? lines.ko[0] : lines.en[0]) ?? "",
    prettyStreamJson: (raw: string) => raw,
  });
}

const mojibakePattern = /\?{3,}|�|怨|願|媛|塋|畑|鼇/;

describe("reply core safe fallback", () => {
  it("returns department-specific Korean planned feedback without mojibake", () => {
    const tools = makeTools();
    const reply = tools.chooseSafeReply(
      { text: "" },
      "ko",
      "feedback",
      {
        id: "dev-lead",
        name: "Aria",
        name_ko: "아리아 (개발팀장)",
        department_id: "development",
      } as any,
    );

    expect(reply).toContain("아리아 (개발팀장): 개발은 숫자 입력 파서와 사칙연산 함수를 분리 구현");
    expect(reply).toContain("산출물");
    expect(reply).not.toMatch(mojibakePattern);
  });

  it("uses English fallback for non-Korean locales", () => {
    const tools = makeTools();
    const reply = tools.chooseSafeReply(
      { text: "" },
      "ja",
      "feedback",
      {
        id: "qa-lead",
        name: "Hawk",
        name_ko: "호크 (QA팀장)",
        department_id: "qa",
      } as any,
    );

    expect(reply).toContain("Hawk: QA will create and run a matrix");
    expect(reply).toContain("Deliverables");
    expect(reply).not.toMatch(mojibakePattern);
  });

  it("returns readable Korean failure messages", () => {
    const tools = makeTools();
    const reply = tools.chooseSafeReply(
      { text: "", error: "timeout after 100ms" },
      "ko",
      "feedback",
      {
        id: "qa-lead",
        name: "Hawk",
        name_ko: "호크 (QA팀장)",
        department_id: "qa",
      } as any,
    );

    expect(reply).toContain("응답 생성 시간이 초과");
    expect(reply).toContain("산출물");
    expect(reply).not.toMatch(mojibakePattern);
  });
});
