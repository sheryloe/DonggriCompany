import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ManualLibrary from "./ManualLibrary";

describe("ManualLibrary app shell", () => {
  it("renders the Korean Dongri-grigri manual sections", () => {
    render(<ManualLibrary />);

    expect(screen.getByRole("region", { name: "Dongri-grigri 운영 매뉴얼" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영 매뉴얼" })).toBeInTheDocument();
    for (const title of [
      "빠른 시작",
      "마스터 부서 에이전트",
      "업무 흐름",
      "Skill",
      "Memory",
      "프로젝트 scope",
      "품질 게이트",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/corepack pnpm run dev:local/)).toBeInTheDocument();
    expect(screen.getByText("6개 마스터 부서")).toBeInTheDocument();
  });

  it("filters manual cards by search text", async () => {
    const user = userEvent.setup();
    render(<ManualLibrary />);

    await user.type(screen.getByLabelText("매뉴얼 검색"), "AgentMemory");

    expect(screen.getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "빠른 시작" })).not.toBeInTheDocument();
  });
});
