import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ManualLibrary from "./ManualLibrary";

describe("ManualLibrary app shell", () => {
  it("컨셉형 메뉴얼 랜딩, 카드, 코드 예시, 태그를 표시한다", () => {
    render(<ManualLibrary />);

    expect(screen.getByRole("region", { name: "Donggri 운영 메뉴얼" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영 메뉴얼" })).toBeInTheDocument();
    for (const title of [
      "빠른 시작",
      "부서/직원",
      "업무 등록",
      "Skill 문서고",
      "모듈",
      "CLI 계정",
      "프로젝트 관리",
      "품질/ISO",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/docker compose up -d --build/)).toBeInTheDocument();
    expect(screen.getByText("7부서")).toBeInTheDocument();
  });

  it("검색어로 메뉴얼 카드를 실제 필터링한다", async () => {
    const user = userEvent.setup();
    render(<ManualLibrary />);

    await user.type(screen.getByLabelText("메뉴얼 검색"), "NotebookLM");

    expect(screen.getByRole("heading", { name: "모듈" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "빠른 시작" })).not.toBeInTheDocument();
  });
});
