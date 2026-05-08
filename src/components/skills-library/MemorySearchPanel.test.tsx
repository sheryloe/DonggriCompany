import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteMemorySearchProfile,
  getMemorySearchProfiles,
  getProjects,
  getQualityMetricSummary,
  saveMemorySearchProfile,
  searchMemory,
} from "../../api";
import type { Agent, NativeMemory, Project } from "../../types";
import MemorySearchPanel from "./MemorySearchPanel";

vi.mock("../../api", () => ({
  deleteMemorySearchProfile: vi.fn(),
  getMemorySearchProfiles: vi.fn(),
  getProjects: vi.fn(),
  getQualityMetricSummary: vi.fn(),
  isApiRequestError: vi.fn(() => false),
  saveMemorySearchProfile: vi.fn(),
  searchMemory: vi.fn(),
}));

const deleteMemorySearchProfileMock = vi.mocked(deleteMemorySearchProfile);
const getMemorySearchProfilesMock = vi.mocked(getMemorySearchProfiles);
const getProjectsMock = vi.mocked(getProjects);
const getQualityMetricSummaryMock = vi.mocked(getQualityMetricSummary);
const saveMemorySearchProfileMock = vi.mocked(saveMemorySearchProfile);
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

const TEST_PROJECT: Project = {
  id: "project-1",
  name: "Empire",
  project_path: "G:\\Donggri_DevDrive\\repos\\runtime\\Empire",
  core_goal: "부서별 컴포넌트 운영성 검증",
  assignment_mode: "auto",
  last_used_at: null,
  created_at: 1,
  updated_at: 1,
};

describe("MemorySearchPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getProjectsMock.mockReset();
    getProjectsMock.mockResolvedValue({
      projects: [TEST_PROJECT],
      page: 1,
      page_size: 8,
      total: 1,
      total_pages: 1,
    });
    getMemorySearchProfilesMock.mockReset();
    getMemorySearchProfilesMock.mockResolvedValue([]);
    getQualityMetricSummaryMock.mockReset();
    getQualityMetricSummaryMock.mockResolvedValue([
      {
        metric_key: "memory.embedding.coverage",
        metric_family: "memory",
        bucket: "total",
        count: 1,
        sum_value: 0.82,
        avg_value: 0.82,
        latest_value: 0.82,
        latest_status: "recorded",
        latest_recorded_at: 1_700_000_000_000,
      },
      {
        metric_key: "provider.capacity_429",
        metric_family: "provider",
        bucket: "total",
        count: 2,
        sum_value: 2,
        avg_value: 1,
        latest_value: 1,
        latest_status: "capacity_limited",
        latest_recorded_at: 1_700_000_000_000,
      },
    ]);
    saveMemorySearchProfileMock.mockReset();
    saveMemorySearchProfileMock.mockImplementation(async (input) => ({
      id: input.id || `server-${input.kind}`,
      kind: input.kind,
      owner_key: "local",
      project_id: input.project_id ?? null,
      label: input.label || input.query || "검색",
      query: input.query || "",
      filters_json: JSON.stringify(input.filters ?? {}),
      last_used_at: 1,
      use_count: input.kind === "recent" ? 1 : 0,
      created_at: 1,
      updated_at: 1,
    }));
    deleteMemorySearchProfileMock.mockReset();
    deleteMemorySearchProfileMock.mockResolvedValue(undefined);
    searchMemoryMock.mockReset();
    searchMemoryMock.mockResolvedValue([TEST_MEMORY]);
  });

  it("searches memories with selected project, advanced filters, tags, dates, layer, scope, agent, and provider ranking", async () => {
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    fireEvent.change(screen.getByTestId("memory-project-query"), { target: { value: "Empire" } });
    fireEvent.click(await screen.findByTestId("memory-project-option-project-1"));
    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "routing" } });
    fireEvent.change(screen.getByTestId("memory-search-tags"), { target: { value: "design, approved" } });
    fireEvent.change(screen.getByTestId("memory-search-created-from"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByTestId("memory-search-created-to"), { target: { value: "2026-05-07" } });
    fireEvent.change(screen.getByTestId("memory-search-updated-from"), { target: { value: "2026-05-02" } });
    fireEvent.change(screen.getByTestId("memory-search-updated-to"), { target: { value: "2026-05-08" } });
    fireEvent.change(screen.getByTestId("memory-search-layer"), { target: { value: "archival" } });
    fireEvent.change(screen.getByTestId("memory-search-scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByTestId("memory-search-promotion"), { target: { value: "promoted" } });
    fireEvent.change(screen.getByTestId("memory-search-source"), { target: { value: "task_run" } });
    fireEvent.change(screen.getByTestId("memory-search-ranking"), { target: { value: "semantic_provider" } });
    fireEvent.change(screen.getByTestId("memory-search-agent"), { target: { value: "agent-1" } });

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
        promotion_status: "promoted",
        source_type: "task_run",
        ranking: "semantic_provider",
        agent_id: "agent-1",
        project_id: "project-1",
        created_from: expect.any(Number),
        created_to: expect.any(Number),
        updated_from: expect.any(Number),
        updated_to: expect.any(Number),
        limit: 20,
      }),
    );
    expect(saveMemorySearchProfileMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "recent" }));
    expect(await screen.findByText("Design routing decision")).toBeInTheDocument();
    expect(screen.getByText("디자인 부서 이벤트를 컴포넌트 워크벤치로 연결했습니다.")).toBeInTheDocument();
    expect(screen.getByText("project Empire")).toBeInTheDocument();
  });

  it("shows quality metric summary", async () => {
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    expect(await screen.findByTestId("memory-quality-summary")).toHaveTextContent("82%");
    expect(screen.getByTestId("memory-quality-summary")).toHaveTextContent("2");
  });

  it("shows an empty search state after a successful search with no results", async () => {
    searchMemoryMock.mockResolvedValueOnce([]);
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });

  it("keeps the locked project selected after reset", async () => {
    render(<MemorySearchPanel agents={[TEST_AGENT]} initialProject={TEST_PROJECT} lockProject defaultScope="all" />);

    expect(screen.getByTestId("memory-selected-project")).toHaveTextContent("Empire");
    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "temporary" } });
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByTestId("memory-selected-project")).toHaveTextContent("Empire");

    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => {
      expect(searchMemoryMock).toHaveBeenCalledTimes(1);
    });
    expect(searchMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        scope: "all",
      }),
    );
  });

  it("stores saved/recent searches on the server and can delete saved searches", async () => {
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    fireEvent.change(screen.getByTestId("memory-search-query"), { target: { value: "routing" } });
    fireEvent.change(screen.getByTestId("memory-search-ranking"), { target: { value: "vector" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() => {
      expect(searchMemoryMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId("memory-recent-searches")).toHaveTextContent("routing");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(saveMemorySearchProfileMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "saved" }));
    });
    expect(screen.getByTestId("memory-saved-searches")).toHaveTextContent("routing");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    fireEvent.click(screen.getAllByRole("button", { name: "routing" })[0]);
    expect(screen.getByTestId("memory-search-query")).toHaveValue("routing");
    expect(screen.getByTestId("memory-search-ranking")).toHaveValue("vector");

    fireEvent.click(screen.getByRole("button", { name: "routing 삭제" }));
    await waitFor(() => {
      expect(deleteMemorySearchProfileMock).toHaveBeenCalledWith("server-saved");
    });
  });

  it("falls back to localStorage when server saved/recent search API fails", async () => {
    getMemorySearchProfilesMock.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    render(<MemorySearchPanel agents={[TEST_AGENT]} />);

    expect(await screen.findByText("서버 저장 검색을 사용할 수 없어 브라우저 로컬 캐시로 동작 중입니다.")).toBeInTheDocument();
  });
});
