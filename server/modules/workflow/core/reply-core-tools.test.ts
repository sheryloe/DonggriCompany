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

    expect(reply).toContain("아리아 (개발팀장): 개발 관점에서는 계산 로직");
    expect(reply).not.toMatch(/\?{3,}|怨|藥|鴉|竊|亮|訝/);
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
        name_ko: "호크 (품질팀장)",
        department_id: "qa",
      } as any,
    );

    expect(reply).toContain("Hawk: From QA");
    expect(reply).not.toMatch(/\?{3,}|怨|藥|鴉|竊|亮|訝/);
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
        name_ko: "호크 (품질팀장)",
        department_id: "qa",
      } as any,
    );

    expect(reply).toContain("응답 생성 시간이 초과");
    expect(reply).not.toMatch(/\?{3,}|怨|藥|鴉|竊|亮|訝/);
  });
});
