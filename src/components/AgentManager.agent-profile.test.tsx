import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api";
import { I18nProvider } from "../i18n";
import type { Agent, Department } from "../types";
import AgentManager from "./AgentManager";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getCliAccountPools: vi.fn(),
    getCliModels: vi.fn(),
    updateAgent: vi.fn(),
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
    reorderDepartments: vi.fn(),
  };
});

vi.mock("./AgentAvatar", () => ({
  buildSpriteMap: () => new Map<string, number>(),
}));

vi.mock("./agent-manager/EmojiPicker", () => ({
  default: ({ value }: { value: string }) => <div data-testid="emoji-picker">{value}</div>,
  StackedSpriteIcon: () => <div data-testid="stacked-sprite-icon" />,
}));

vi.mock("./agent-manager/AgentsTab", () => ({
  default: ({ agents, onEditAgent }: { agents: Agent[]; onEditAgent: (agent: Agent) => void }) => (
    <button onClick={() => onEditAgent(agents[0])}>Edit Legacy Agent</button>
  ),
}));

vi.mock("./agent-manager/DepartmentsTab", () => ({
  default: () => <div data-testid="departments-tab" />,
}));

vi.mock("./agent-manager/DepartmentFormModal", () => ({
  default: () => null,
}));

const getCliAccountPoolsMock = vi.mocked(api.getCliAccountPools);
const getCliModelsMock = vi.mocked(api.getCliModels);

const DEPARTMENT: Department = {
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
};

const LEGACY_AGENT: Agent = {
  id: "legacy-agent",
  name: "Legacy Agent",
  name_ko: "레거시 에이전트",
  name_ja: "レガシーエージェント",
  name_zh: "旧版智能体",
  department_id: "dev",
  role: "junior",
  cli_provider: "claude",
  avatar_emoji: "BOT",
  personality: "Legacy override",
  status: "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 35,
  created_at: 1,
};

function getPreviewTextarea(): HTMLTextAreaElement {
  const preview = document.querySelector("textarea[readonly]") as HTMLTextAreaElement | null;
  if (!preview) throw new Error("Generated prompt preview textarea not found");
  return preview;
}

describe("AgentManager legacy agent profile fallback", () => {
  beforeEach(() => {
    getCliAccountPoolsMock.mockResolvedValue([]);
    getCliModelsMock.mockResolvedValue({});
  });

  it("renders default growth profile values when editing a legacy agent without agent_profile", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider language="ko">
        <AgentManager
          agents={[LEGACY_AGENT]}
          departments={[DEPARTMENT]}
          onAgentsChange={() => undefined}
          activeOfficeWorkflowPack="development"
          onSaveOfficePackProfile={() => Promise.resolve()}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit Legacy Agent" }));

    await waitFor(() => {
      expect(getPreviewTextarea().value).toContain("역할 템플릿: 주니어");
      expect(getPreviewTextarea().value).toContain("적용 성장 티어: 2/5");
      expect(getPreviewTextarea().value).toContain("최종 수동 지시: Legacy override");
      expect(screen.getByText("해석된 표준 정체성")).toBeInTheDocument();
      expect(screen.getAllByText(/백엔드|리뷰어/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/주니어/).length).toBeGreaterThan(0);
    });
  });
});
