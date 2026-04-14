import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

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

describe("AgentDetail codex account pool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows codex pool dropdown and sends cli_account_pool_id in update payload", async () => {
    const user = userEvent.setup();
    const updateAgentMock = vi.spyOn(api, "updateAgent").mockResolvedValue();
    vi.spyOn(api, "getOAuthStatus").mockResolvedValue({
      storageReady: true,
      providers: {},
    });
    vi.spyOn(api, "getCliModels").mockResolvedValue({
      codex: [
        {
          slug: "gpt-5.3-codex",
          displayName: "GPT-5.3 Codex",
          reasoningLevels: [
            { effort: "medium", description: "Balanced" },
            { effort: "xhigh", description: "Deep" },
          ],
          defaultReasoningLevel: "medium",
        },
      ],
    });
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

    const department: Department = {
      id: "dev",
      name: "Development",
      name_ko: "개발",
      name_ja: "開発",
      name_zh: "开发",
      icon: "🧪",
      color: "#3b82f6",
      description: null,
      prompt: null,
      sort_order: 1,
      created_at: 1,
    };
    const agent: Agent = {
      id: "agent-1",
      name: "Codex Agent",
      name_ko: "코덱스 에이전트",
      name_ja: "Codex エージェント",
      name_zh: "Codex 代理",
      department_id: "dev",
      role: "junior",
      cli_provider: "codex",
      oauth_account_id: null,
      api_provider_id: null,
      api_model: null,
      cli_model: "gpt-5.3-codex",
      cli_reasoning_level: "medium",
      run_mode: "standard",
      cli_account_pool_id: null,
      avatar_emoji: "🤖",
      sprite_number: null,
      personality: null,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 1,
    };

    render(
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

    const editButton = screen.getByTitle("Click to change CLI");
    await user.click(editButton);

    const poolOption = await screen.findByRole("option", { name: "Codex Main" });
    const poolSelect = poolOption.closest("select");
    expect(poolSelect).toBeTruthy();
    await user.selectOptions(poolSelect as HTMLSelectElement, "codex-main");
    await user.selectOptions(screen.getByLabelText("Codex reasoning level"), "xhigh");
    await user.click(screen.getByLabelText("Codex plan mode"));

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledTimes(1);
    });

    expect(updateAgentMock).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        cli_provider: "codex",
        cli_model: "gpt-5.3-codex",
        cli_reasoning_level: "xhigh",
        run_mode: "plan",
        cli_account_pool_id: "codex-main",
      }),
    );
  });

  it("shows gemini model selector in pool edit and saves cli_model", async () => {
    const user = userEvent.setup();
    const updateAgentMock = vi.spyOn(api, "updateAgent").mockResolvedValue();
    vi.spyOn(api, "getOAuthStatus").mockResolvedValue({
      storageReady: true,
      providers: {},
    });
    vi.spyOn(api, "getCliModels").mockResolvedValue({
      gemini: [
        {
          slug: "gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
        },
      ],
    });
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

    const department: Department = {
      id: "dev",
      name: "Development",
      name_ko: "Development",
      name_ja: "Development",
      name_zh: "Development",
      icon: "D",
      color: "#3b82f6",
      description: null,
      prompt: null,
      sort_order: 1,
      created_at: 1,
    };
    const agent: Agent = {
      id: "agent-g1",
      name: "Gemini Agent",
      name_ko: "Gemini Agent",
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

    render(
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

    await user.click(screen.getByTitle("Click to change CLI"));

    const poolOption = await screen.findByRole("option", { name: "Gemini Main" });
    const poolSelect = poolOption.closest("select");
    expect(poolSelect).toBeTruthy();
    await user.selectOptions(poolSelect as HTMLSelectElement, "gemini-main");

    const modelOption = await screen.findByRole("option", { name: "Gemini 2.5 Flash" });
    const modelSelect = modelOption.closest("select");
    expect(modelSelect).toBeTruthy();
    await user.selectOptions(modelSelect as HTMLSelectElement, "gemini-2.5-flash");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledTimes(1);
    });

    expect(updateAgentMock).toHaveBeenCalledWith(
      "agent-g1",
      expect.objectContaining({
        cli_provider: "gemini",
        cli_model: "gemini-2.5-flash",
        cli_reasoning_level: null,
        run_mode: "standard",
        cli_account_pool_id: "gemini-main",
      }),
    );
  });
});
