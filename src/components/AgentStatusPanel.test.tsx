import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentStatusPanel from "./AgentStatusPanel";

const apiMocks = vi.hoisted(() => ({
  getActiveAgents: vi.fn(),
  getCliProcesses: vi.fn(),
  killCliProcess: vi.fn(),
  stopTask: vi.fn(),
}));

vi.mock("../api", () => apiMocks);

describe("AgentStatusPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getActiveAgents.mockResolvedValue([]);
    apiMocks.getCliProcesses.mockResolvedValue([]);
  });

  it("exposes a named modal dialog and close control", async () => {
    render(<AgentStatusPanel agents={[]} uiLanguage="en" onClose={vi.fn()} />);

    await waitFor(() => expect(apiMocks.getActiveAgents).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("불러오는 중...")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "활성 에이전트" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "에이전트 상태 창 닫기" })).toBeInTheDocument();
  });
});
