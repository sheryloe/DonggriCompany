import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OfficeExecutionProvider } from "../../api";
import { DEFAULT_SETTINGS } from "../../types";
import CliSettingsTab from "./CliSettingsTab";
import type { LocalSettings } from "./types";

const providers: OfficeExecutionProvider[] = ["codex", "gemini", "claude", "jules"];

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
        onVerifyPool={vi.fn(async () => ({
          pool: {
            id: "x",
            provider: "gemini",
            accountPoolId: "x",
            label: "x",
            profileHome: "/tmp/x",
            status: "connected" as const,
            lastVerifiedAt: Date.now(),
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          binaryInstalled: true,
          authArtifactFound: true,
        }))}
        onCopyLoginCommand={vi.fn(async () => undefined)}
        onActivateRunner={vi.fn(async () => undefined)}
        onDeactivateRunner={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("option", { name: "Gemini 3 Pro Preview" })).toBeInTheDocument();
  });
});
