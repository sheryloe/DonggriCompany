import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CliAccountVerifyResponse, OfficeExecutionProvider } from "../../api";
import { DEFAULT_SETTINGS } from "../../types";
import CliSettingsTab from "./CliSettingsTab";
import type { LocalSettings } from "./types";

const providers: OfficeExecutionProvider[] = ["codex", "gemini", "claude", "jules"];

function createVerifyResponse(provider: OfficeExecutionProvider): CliAccountVerifyResponse {
  return {
    pool: {
      id: "x",
      provider,
      accountPoolId: "x",
      label: "x",
      profileHome: "/tmp/x",
      status: "connected",
      lastVerifiedAt: Date.now(),
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    binaryInstalled: true,
    authArtifactFound: true,
  };
}

describe("CliSettingsTab multi-account", () => {
  it("renders pool manager and calls verify for selected pool", async () => {
    const user = userEvent.setup();
    const onVerifyPool = vi.fn(async (provider: OfficeExecutionProvider, accountPoolId: string) => ({
      pool: {
        id: `${provider}-${accountPoolId}`,
        provider,
        accountPoolId,
        label: accountPoolId,
        profileHome: `/app/.office-accounts/${provider}/${accountPoolId}`,
        status: "connected" as const,
        lastVerifiedAt: Date.now(),
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      binaryInstalled: true,
      authArtifactFound: true,
    }));

    render(
      <CliSettingsTab
        t={(messages) => messages.ko}
        cliStatus={null}
        cliModels={null}
        cliModelsLoading={false}
        officeExecutionProviders={providers}
        cliAccountPools={[
          {
            id: "codex-main",
            provider: "codex",
            accountPoolId: "codex-main",
            label: "codex-main",
            profileHome: "/app/.office-accounts/codex/codex-main",
            status: "auth_required",
            lastVerifiedAt: null,
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]}
        officeRunners={[]}
        officeRunnerQueue={[]}
        runnerMeta={{ maxActive: 5, idleTtlMs: 900000, dockerEnabled: false }}
        cliAuthBusyKey={null}
        selectedPoolByProvider={{
          codex: "codex-main",
          gemini: "gemini-main",
          claude: "claude-main",
          jules: "jules-main",
        }}
        form={{ ...(DEFAULT_SETTINGS as LocalSettings), language: "ko" }}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
        onRefresh={vi.fn()}
        onPoolSelect={vi.fn()}
        onCreatePool={vi.fn(async () => undefined)}
        onUpdatePool={vi.fn(async () => undefined)}
        onDeletePool={vi.fn(async () => undefined)}
        onVerifyPool={onVerifyPool}
        onCopyLoginCommand={vi.fn(async () => undefined)}
        onActivateRunner={vi.fn(async () => undefined)}
        onDeactivateRunner={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("CLI 계정/실행 상태")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "codex-main" })).toBeInTheDocument();

    const verifyButtons = screen.getAllByRole("button", { name: "검증" });
    await user.click(verifyButtons[0]);

    expect(onVerifyPool).toHaveBeenCalledWith("codex", "codex-main");
  });

  it("shows gemini fallback model select even while model list is loading", () => {
    render(
      <CliSettingsTab
        t={(messages) => messages.en}
        cliStatus={null}
        cliModels={null}
        cliModelsLoading
        officeExecutionProviders={providers}
        cliAccountPools={[]}
        officeRunners={[]}
        officeRunnerQueue={[]}
        runnerMeta={{ maxActive: 5, idleTtlMs: 900000, dockerEnabled: false }}
        cliAuthBusyKey={null}
        selectedPoolByProvider={{ codex: "", gemini: "", claude: "", jules: "" }}
        form={{ ...(DEFAULT_SETTINGS as LocalSettings), language: "en" }}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
        onRefresh={vi.fn()}
        onPoolSelect={vi.fn()}
        onCreatePool={vi.fn(async () => undefined)}
        onUpdatePool={vi.fn(async () => undefined)}
        onDeletePool={vi.fn(async () => undefined)}
        onVerifyPool={vi.fn(async () => createVerifyResponse("gemini"))}
        onCopyLoginCommand={vi.fn(async () => undefined)}
        onActivateRunner={vi.fn(async () => undefined)}
        onDeactivateRunner={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("option", { name: "Gemini 3 Pro Preview" })).toBeInTheDocument();
  });

  it("shows provider policy controls as read-only in compatibility mode", async () => {
    const user = userEvent.setup();
    const persistSettings = vi.fn();
    const initialForm: LocalSettings = {
      ...(DEFAULT_SETTINGS as LocalSettings),
      language: "en",
      providerModelConfig: {
        codex: {
          model: "gpt-5.3-codex",
          reasoningLevel: "high",
          subModel: "gpt-5.3-codex",
          subModelReasoningLevel: "high",
        },
      },
    };

    function Harness() {
      const [form, setForm] = useState<LocalSettings>(initialForm);
      return (
        <CliSettingsTab
          t={(messages) => messages.en}
          cliStatus={null}
          cliModels={{
            codex: [
              {
                slug: "gpt-5.4",
                displayName: "GPT-5.4",
                reasoningLevels: [
                  { effort: "low", description: "Fast" },
                  { effort: "high", description: "Deep" },
                ],
                defaultReasoningLevel: "high",
              },
              {
                slug: "gpt-5.4-mini",
                displayName: "GPT-5.4 Mini",
                reasoningLevels: [
                  { effort: "low", description: "Fast" },
                  { effort: "medium", description: "Balanced" },
                ],
                defaultReasoningLevel: "medium",
              },
            ],
          }}
          cliModelsLoading={false}
          officeExecutionProviders={["codex"]}
          cliAccountPools={[]}
          officeRunners={[]}
          officeRunnerQueue={[]}
          runnerMeta={{ maxActive: 5, idleTtlMs: 900000, dockerEnabled: false }}
          cliAuthBusyKey={null}
          selectedPoolByProvider={{ codex: "", gemini: "", claude: "", jules: "" }}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
          onRefresh={vi.fn()}
          onPoolSelect={vi.fn()}
          onCreatePool={vi.fn(async () => undefined)}
          onUpdatePool={vi.fn(async () => undefined)}
          onDeletePool={vi.fn(async () => undefined)}
          onVerifyPool={vi.fn(async () => createVerifyResponse("codex"))}
          onCopyLoginCommand={vi.fn(async () => undefined)}
          onActivateRunner={vi.fn(async () => undefined)}
          onDeactivateRunner={vi.fn(async () => undefined)}
        />
      );
    }

    render(<Harness />);

    const selects = screen.getAllByRole("combobox");
    expect(selects[1]).toBeDisabled();
    expect(selects[2]).toBeDisabled();
    expect(selects[3]).toBeDisabled();
    expect(selects[4]).toBeDisabled();
    expect(persistSettings).not.toHaveBeenCalled();
  });

  it("verifies all codex pools from the bulk action button", async () => {
    const user = userEvent.setup();
    const onVerifyPool = vi.fn(async (provider: OfficeExecutionProvider, accountPoolId: string) => ({
      pool: {
        id: `${provider}-${accountPoolId}`,
        provider,
        accountPoolId,
        label: accountPoolId,
        profileHome: `/app/.office-accounts/${provider}/${accountPoolId}`,
        status: "connected" as const,
        lastVerifiedAt: Date.now(),
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      binaryInstalled: true,
      authArtifactFound: true,
    }));

    render(
      <CliSettingsTab
        t={(messages) => messages.en}
        cliStatus={null}
        cliModels={null}
        cliModelsLoading={false}
        officeExecutionProviders={providers}
        cliAccountPools={[
          {
            id: "codex-main",
            provider: "codex",
            accountPoolId: "codex-main",
            label: "codex-main",
            profileHome: "/app/.office-accounts/codex/codex-main",
            status: "auth_required",
            lastVerifiedAt: null,
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: "codex-backup",
            provider: "codex",
            accountPoolId: "codex-backup",
            label: "codex-backup",
            profileHome: "/app/.office-accounts/codex/codex-backup",
            status: "auth_required",
            lastVerifiedAt: null,
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]}
        officeRunners={[]}
        officeRunnerQueue={[]}
        runnerMeta={{ maxActive: 5, idleTtlMs: 900000, dockerEnabled: false }}
        cliAuthBusyKey={null}
        selectedPoolByProvider={{
          codex: "codex-main",
          gemini: "",
          claude: "",
          jules: "",
        }}
        form={{ ...(DEFAULT_SETTINGS as LocalSettings), language: "en" }}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
        onRefresh={vi.fn()}
        onPoolSelect={vi.fn()}
        onCreatePool={vi.fn(async () => undefined)}
        onUpdatePool={vi.fn(async () => undefined)}
        onDeletePool={vi.fn(async () => undefined)}
        onVerifyPool={onVerifyPool}
        onCopyLoginCommand={vi.fn(async () => undefined)}
        onActivateRunner={vi.fn(async () => undefined)}
        onDeactivateRunner={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify All Codex Pools" }));

    expect(onVerifyPool).toHaveBeenCalledWith("codex", "codex-main");
    expect(onVerifyPool).toHaveBeenCalledWith("codex", "codex-backup");
    expect(onVerifyPool).toHaveBeenCalledTimes(2);
  });

  it("renders localized codex card status labels in Korean mode", () => {
    render(
      <CliSettingsTab
        t={(messages) => messages.ko}
        cliStatus={null}
        cliModels={null}
        cliModelsLoading={false}
        officeExecutionProviders={providers}
        cliAccountPools={[
          {
            id: "codex-main",
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
        ]}
        officeRunners={[
          {
            provider: "codex",
            accountPoolId: "codex-main",
            runnerKey: "codex:codex-main",
            containerName: "office-runner-codex-main",
            status: "idle",
            lastUsedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]}
        officeRunnerQueue={[]}
        runnerMeta={{ maxActive: 5, idleTtlMs: 900000, dockerEnabled: false }}
        cliAuthBusyKey={null}
        selectedPoolByProvider={{ codex: "codex-main", gemini: "", claude: "", jules: "" }}
        form={{ ...(DEFAULT_SETTINGS as LocalSettings), language: "ko" }}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
        onRefresh={vi.fn()}
        onPoolSelect={vi.fn()}
        onCreatePool={vi.fn(async () => undefined)}
        onUpdatePool={vi.fn(async () => undefined)}
        onDeletePool={vi.fn(async () => undefined)}
        onVerifyPool={vi.fn(async () => createVerifyResponse("codex"))}
        onCopyLoginCommand={vi.fn(async () => undefined)}
        onActivateRunner={vi.fn(async () => undefined)}
        onDeactivateRunner={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getAllByText("연결됨").length).toBeGreaterThan(0);
    expect(screen.getAllByText("대기").length).toBeGreaterThan(0);
  });
});
