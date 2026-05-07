import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchMemory } from "../../api";
import type { Agent, NativeMemory } from "../../types";
import MemorySearchPanel from "./MemorySearchPanel";

vi.mock("../../api", () => ({
  isApiRequestError: vi.fn(() => false),
  searchMemory: vi.fn(),
}));

const searchMemoryMock = vi.mocked(searchMemory);

const TEST_AGENT: Agent = {
  id: "agent-1",
  name: "Atlas",
  name_ko: "아틀라스",
  department_id: "dev",
  role: "team_leader",
  cli_provider: "codex",
  avatar_emoji: "A",
  personality: null,
  status: "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: 1,
};

const TEST_MEMORY: NativeMemory = {
  id: "memory-1",
  agent_id: "agent-1",
  project_id: "project-1",
  memory_type: "lesson",
  scope_type: "project",
  title: "Design routing decision",
  body: "Route design department events through the component workbench.",
  display_summary_ko: "디자인 부서 이벤트를 컴포넌트 워크벤치로 연결했습니다.",
  tags_json: JSON.stringify(["design", "approved"]),
  confidence: 0.9,
  strength: 0.8,
  source_type: "manual",
  source_id: null,
  external_ref: null,
  memory_layer: "archival",
  thread_id: null,
  promotion_status: "local",
  retrieval_count: 0,
  last_retrieved_at: null,
  episode_json: null,
  status: "active",
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_010_000,
  last_used_at: null,
};

describe("MemorySearchPanel", () => {
  beforeEach(() => {
    searchMemoryMock.mockReset();
    searchMemoryMock.mockResolvedValue([TEST_MEMORY]);
  });

  it("searches memories with text, tags, date range, layer, scope, and agent filter", async () => {
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "routing" } });
    fireEvent.change(screen.getByTestId("memory-search-tags"), { target: { value: "design, approved" } });
    fireEvent.change(screen.getByTestId("memory-search-created-from"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByTestId("memory-search-created-to"), { target: { value: "2026-05-07" } });
    fireEvent.change(screen.getByTestId("memory-search-updated-from"), { target: { value: "2026-05-02" } });
    fireEvent.change(screen.getByTestId("memory-search-updated-to"), { target: { value: "2026-05-08" } });
    fireEvent.change(screen.getByTestId("memory-search-layer"), { target: { value: "archival" } });
    fireEvent.change(screen.getByTestId("memory-search-scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByTestId("memory-search-agent"), { target: { value: "agent-1" } });
    fireEvent.change(screen.getByTestId("memory-search-project"), { target: { value: "project-1" } });

    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() => {
      expect(searchMemoryMock).toHaveBeenCalledTimes(1);
    });
    expect(searchMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "routing",
        tags: ["design", "approved"],
        layer: "archival",
        scope: "all",
        agent_id: "agent-1",
        project_id: "project-1",
        created_from: expect.any(Number),
        created_to: expect.any(Number),
        updated_from: expect.any(Number),
        updated_to: expect.any(Number),
        limit: 20,
      }),
    );
    expect(await screen.findByText("Design routing decision")).toBeInTheDocument();
    expect(screen.getByText("디자인 부서 이벤트를 컴포넌트 워크벤치로 연결했습니다.")).toBeInTheDocument();
  });

  it("shows an empty search state after a successful search with no results", async () => {
    searchMemoryMock.mockResolvedValueOnce([]);
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });
});
