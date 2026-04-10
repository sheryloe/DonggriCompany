import { describe, expect, it } from "vitest";
import { normalizeSubtaskTitleForDisplay, normalizeSubtaskTitleForStorage } from "./title-normalizer.ts";

describe("subtask title normalizer", () => {
  it("normalizes english generated subtask titles", () => {
    expect(normalizeSubtaskTitleForStorage("Subtask Title 2")).toBe("서브태스크 제목2");
  });

  it("repairs mojibake-like broken subtask title", () => {
    expect(normalizeSubtaskTitleForDisplay("?쒕툕?쒖뒪???쒕ぉ2")).toBe("서브태스크 제목2");
  });

  it("keeps custom user-authored titles", () => {
    expect(normalizeSubtaskTitleForStorage("배포 전 회귀 테스트")).toBe("배포 전 회귀 테스트");
  });
});
