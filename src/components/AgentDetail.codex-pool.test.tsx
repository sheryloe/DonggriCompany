import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api";
import { I18nProvider } from "../i18n";
import type { Agent, Department } from "../types";
import AgentDetail from "./AgentDetail";

vi.mock("./AgentAvatar", () => ({
  default: () => <div data-testid="agent-avatar" />,
}));

vi.mock("./agent-detail/AgentDetailTabContent", () => ({
  default: () => <div data-testid="agent-detail-tab-content" />,
}));

const department: Department = {
  id: "dev",
  name: "Development",
  name_ko: "개발",
  name_ja: "Development",
  name_zh: "Development",
  icon: "D",
  color: "#3b82f6",
  description: null,
  prompt: null,
  sort_order: 1,
  created_at: 1,
};

function renderDetail(agent: Agent) {
  return render(
    <I18nProvider language="en">
      <AgentDetail
        agent={agent}
        agents={[agent]}
        department={department}
        departments={[department]}
        tasks={[]}
        subAgents={[]}
        subtasks={[]}
        activeOfficeWorkflowPack="development"
        onClose={() => {}}
        onChat={() => {}}
        onAssignTask={() => {}}
        onAgentUpdated={() => {}}
      />
    </I18nProvider>,
  );
}

describe("AgentDetail cli execution settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getOAuthDebugStatus").mockResolvedValue({
      storageReady: true,
      providers: {},
    });
  });

  it("shows codex pool dropdown and sends only provider/pool settings", async () => {
    const user = userEvent.setup();
    const updateAgentMock = vi.spyOn(api, "updateAgent").mockResolvedValue();
    vi.spyOn(api, "getCliAccountPools").mockResolvedValue([
      {
        id: "pool-1",
        provider: "codex",
        accountPoolId: "codex-main",
        label: "Codex Main",
        profileHome: "/app/.office-accounts/codex/codex-main",
        status: "connected",
        lastVerifiedAt: Date.now(),
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const agent: Agent = {
      id: "agent-1",
      name: "Codex Agent",
      name_ko: "코덱스 에이전트",
      name_ja: "Codex Agent",
      name_zh: "Codex Agent",
      department_id: "dev",
      role: "junior",
      cli_provider: "codex",
      oauth_account_id: null,
      api_provider_id: null,
      api_model: null,
      cli_model: "gpt-5.3-codex",
      cli_reasoning_level: "medium",
      run_mode: "plan",
      cli_account_pool_id: null,
      avatar_emoji: "C",
      sprite_number: null,
      personality: null,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 1,
    };

    renderDetail(agent);

    await user.click(screen.getByTitle("Change CLI execution settings"));
    const [providerSelect, poolSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(providerSelect, "codex");
    await user.selectOptions(poolSelect, "codex-main");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledTimes(1);
    });

    expect(updateAgentMock).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        cli_provider: "codex",
        cli_account_pool_id: "codex-main",
        cli_model: null,
        cli_reasoning_level: null,
        run_mode: "standard",
      }),
    );
  });

  it("does not render gemini model selector and still saves execution pool", async () => {
    const user = userEvent.setup();
    const updateAgentMock = vi.spyOn(api, "updateAgent").mockResolvedValue();
    vi.spyOn(api, "getCliAccountPools").mockResolvedValue([
      {
        id: "pool-g1",
        provider: "gemini",
        accountPoolId: "gemini-main",
        label: "Gemini Main",
        profileHome: "/app/.office-accounts/gemini/gemini-main",
        status: "connected",
        lastVerifiedAt: Date.now(),
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const agent: Agent = {
      id: "agent-g1",
      name: "Gemini Agent",
      name_ko: "제미나이 에이전트",
      name_ja: "Gemini Agent",
      name_zh: "Gemini Agent",
      department_id: "dev",
      role: "junior",
      cli_provider: "gemini",
      oauth_account_id: null,
      api_provider_id: null,
      api_model: null,
      cli_model: "gemini-2.5-flash",
      cli_reasoning_level: null,
      run_mode: "standard",
      cli_account_pool_id: null,
      avatar_emoji: "G",
      sprite_number: null,
      personality: null,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 1,
    };

    renderDetail(agent);

    await user.click(screen.getByTitle("Change CLI execution settings"));
    const [, poolSelect] = screen.getAllByRole("combobox");

    expect(screen.queryByDisplayValue("gemini-2.5-flash")).not.toBeInTheDocument();
    expect(screen.queryByText("Syncing models...")).not.toBeInTheDocument();

    await user.selectOptions(poolSelect, "gemini-main");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledTimes(1);
    });

    expect(updateAgentMock).toHaveBeenCalledWith(
      "agent-g1",
      expect.objectContaining({
        cli_provider: "gemini",
        cli_account_pool_id: "gemini-main",
        cli_model: null,
        cli_reasoning_level: null,
        run_mode: "standard",
      }),
    );
  });

  it("shows loading state for execution pools without exposing model controls", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "updateAgent").mockResolvedValue();
    vi.spyOn(api, "getCliAccountPools").mockImplementation(
      () =>
        new Promise<import("../api").CliAccountPoolView[]>(() => {
          // keep pending for loading-state verification
        }),
    );

    const agent: Agent = {
      id: "agent-g2",
      name: "Gemini Agent",
      name_ko: "제미나이 에이전트",
      name_ja: "Gemini Agent",
      name_zh: "Gemini Agent",
      department_id: "dev",
      role: "junior",
      cli_provider: "gemini",
      oauth_account_id: null,
      api_provider_id: null,
      api_model: null,
      cli_model: null,
      cli_reasoning_level: null,
      run_mode: "standard",
      cli_account_pool_id: null,
      avatar_emoji: "G",
      sprite_number: null,
      personality: null,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 1,
    };

    renderDetail(agent);

    await user.click(screen.getByTitle("Change CLI execution settings"));

    expect(screen.getByText("Loading pools...")).toBeInTheDocument();
    expect(screen.queryByText("Syncing models...")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("gemini-2.5-flash")).not.toBeInTheDocument();
  });
});
