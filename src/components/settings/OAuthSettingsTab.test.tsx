import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OAuthSettingsTab from "./OAuthSettingsTab";
import type { OAuthCommonProps } from "./types";

vi.mock("./OAuthConnectedProvidersSection", () => ({
  default: () => <div>OAuthConnectedProvidersSection</div>,
}));

vi.mock("./OAuthConnectCards", () => ({
  default: () => <div>OAuthConnectCards</div>,
}));

vi.mock("./GoogleOAuthAppConfig", () => ({
  default: () => <div>GoogleOAuthAppConfig</div>,
}));

vi.mock("./GitHubOAuthAppConfig", () => ({
  default: () => <div>GitHubOAuthAppConfig</div>,
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

function createOauthCommonProps(): OAuthCommonProps {
  return {
    t,
    localeTag: "en-US",
    form: {
      language: "en",
      providerModelConfig: {},
    } as any,
    setForm: vi.fn(),
    persistSettings: vi.fn(),
    oauthStatus: {
      storageReady: true,
      providers: {
        "github-copilot": {
          detected: true,
          connected: true,
          executionReady: true,
          source: "web-oauth",
          accounts: [],
        },
      },
    } as any,
    models: null,
    modelsLoading: false,
    refreshing: null,
    disconnecting: null,
    savingAccountId: null,
    accountDrafts: {},
    onConnect: vi.fn(),
    onDisconnect: vi.fn(async () => {}),
    onRefreshToken: vi.fn(async () => {}),
    onUpdateAccountDraft: vi.fn(),
    onActivateAccount: vi.fn(async () => {}),
    onSaveAccount: vi.fn(async () => {}),
    onToggleAccount: vi.fn(async () => {}),
    onDeleteAccount: vi.fn(async () => {}),
  };
}

describe("OAuthSettingsTab", () => {
  it("renders shared status copy and oauth result message", () => {
    const common = createOauthCommonProps();

    render(
      <OAuthSettingsTab
        {...common}
        oauthLoading={false}
        oauthResult={{ provider: "github-copilot", error: null }}
        onOauthResultClear={vi.fn()}
        onRefresh={vi.fn()}
        deviceCode={null}
        deviceStatus={null}
        deviceError={null}
        onStartDeviceCodeFlow={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByText("OAuth Status")).toBeInTheDocument();
    expect(screen.getByText("OAuth storage is active (encryption key configured)")).toBeInTheDocument();
    expect(screen.getByText("GitHub connected")).toBeInTheDocument();
  });

  it("shows loading state with shared dictionary copy", () => {
    const common = createOauthCommonProps();

    render(
      <OAuthSettingsTab
        {...common}
        oauthLoading={true}
        oauthResult={null}
        onOauthResultClear={vi.fn()}
        onRefresh={vi.fn()}
        deviceCode={null}
        deviceStatus={null}
        deviceError={null}
        onStartDeviceCodeFlow={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
