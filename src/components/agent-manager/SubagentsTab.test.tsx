import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as api from "../../api";
import type { Department } from "../../types";
import SubagentsTab from "./SubagentsTab";

vi.mock("../../api", () => ({
  getCodexSubagentCatalog: vi.fn(),
  isApiRequestError: vi.fn(() => false),
}));

const departments: Department[] = [
  {
    id: "dev",
    name: "Development",
    name_ko: "개발",
    name_ja: "開発",
    name_zh: "开发",
    icon: "DEV",
    color: "#3b82f6",
    description: null,
    prompt: null,
    sort_order: 1,
    created_at: 1,
  },
];

function Harness() {
  const [deptTab, setDeptTab] = useState("all");
  const [search, setSearch] = useState("");

  return (
    <SubagentsTab
      tr={(_ko, en) => en}
      locale="en"
      isKo={false}
      departments={departments}
      deptTab={deptTab}
      setDeptTab={setDeptTab}
      search={search}
      setSearch={setSearch}
    />
  );
}

describe("SubagentsTab", () => {
  it("renders class path metadata from the catalog snapshot", async () => {
    vi.mocked(api.getCodexSubagentCatalog).mockResolvedValue({
      sourceRepo: "VoltAgent/awesome-codex-subagents",
      sourceRef: "main",
      sourceUrl: "https://github.com/VoltAgent/awesome-codex-subagents",
      generatedAt: "2026-04-14T00:00:00.000Z",
      total: 1,
      departmentSummary: { dev: 1 },
      agents: [
        {
          name: "backend-developer",
          description: "Build backend features",
          upstreamCategory: "01-core-development",
          upstreamPath: "categories/01-core-development/backend-developer.toml",
          department: "dev",
          class_stage_1: "development-core",
          class_stage_2: "core-engineering",
          class_stage_3: "backend-developer",
        },
      ],
    });

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText("backend-developer")).toBeInTheDocument();
      expect(screen.getByText(/Class path:/)).toBeInTheDocument();
      expect(screen.getByText(/development-core > core-engineering > backend-developer/)).toBeInTheDocument();
    });
  });
});
