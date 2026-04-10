import { describe, expect, it } from "vitest";
import { classifyWorkflowPackText } from "./text-routing.ts";

describe("classifyWorkflowPackText", () => {
  it("routes instagram card-news requests to donggri", () => {
    const result = classifyWorkflowPackText("인스타그램 카드뉴스를 동그리 스타일로 만들어줘");
    expect(result.packKey).toBe("donggri");
    expect(result.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("falls back to development for generic coding tasks", () => {
    const result = classifyWorkflowPackText("Fix API bug and deploy the service");
    expect(result.packKey).toBe("development");
  });
});
