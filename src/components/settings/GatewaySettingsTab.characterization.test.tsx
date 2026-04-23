import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GatewaySettingsTab from "./GatewaySettingsTab";

const apiMocks = vi.hoisted(() => ({
  getAgents: vi.fn(),
  getWorkflowPacks: vi.fn(),
  getMessengerRuntimeSessions: vi.fn(),
  getTelegramReceiverStatus: vi.fn(),
  getDiscordReceiverStatus: vi.fn(),
  sendMessengerRuntimeMessage: vi.fn(),
  listDiscordChannelsByToken: vi.fn(),
}));

vi.mock("../../api", () => ({
  getAgents: apiMocks.getAgents,
  getWorkflowPacks: apiMocks.getWorkflowPacks,
  getMessengerRuntimeSessions: apiMocks.getMessengerRuntimeSessions,
  getTelegramReceiverStatus: apiMocks.getTelegramReceiverStatus,
  getDiscordReceiverStatus: apiMocks.getDiscordReceiverStatus,
  sendMessengerRuntimeMessage: apiMocks.sendMessengerRuntimeMessage,
  listDiscordChannelsByToken: apiMocks.listDiscordChannelsByToken,
  isApiRequestError: () => false,
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

function createFormWithMessengerChannels(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    messengerChannels: {
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [],
      },
      whatsapp: { token: "", receiveEnabled: false, sessions: [] },
      discord: { token: "", receiveEnabled: false, sessions: [] },
      googlechat: { token: "", receiveEnabled: false, sessions: [] },
      slack: { token: "", receiveEnabled: false, sessions: [] },
      signal: { token: "", receiveEnabled: false, sessions: [] },
      imessage: { token: "", receiveEnabled: false, sessions: [] },
      ...overrides,
    },
  };
}

describe("GatewaySettingsTab single-group behavior", () => {
  beforeEach(() => {
    apiMocks.getAgents.mockReset();
    apiMocks.getWorkflowPacks.mockReset();
    apiMocks.getMessengerRuntimeSessions.mockReset();
    apiMocks.getTelegramReceiverStatus.mockReset();
    apiMocks.getDiscordReceiverStatus.mockReset();
    apiMocks.sendMessengerRuntimeMessage.mockReset();
    apiMocks.listDiscordChannelsByToken.mockReset();

    apiMocks.getAgents.mockResolvedValue([]);
    apiMocks.getWorkflowPacks.mockResolvedValue({ packs: [] });
    apiMocks.getMessengerRuntimeSessions.mockResolvedValue([]);
    apiMocks.getTelegramReceiverStatus.mockResolvedValue({
      running: false,
      configured: false,
      receiveEnabled: false,
      enabled: false,
      allowedChatCount: 0,
      nextOffset: 0,
      lastPollAt: null,
      lastForwardAt: null,
      lastUpdateId: null,
      lastError: null,
    });
    apiMocks.getDiscordReceiverStatus.mockResolvedValue({
      running: false,
      configured: false,
      enabled: false,
      routeCount: 0,
      nextCursorCount: 0,
      lastPollAt: null,
      lastForwardAt: null,
      lastMessageId: null,
      lastError: null,
    });
    apiMocks.sendMessengerRuntimeMessage.mockResolvedValue({ ok: true });
    apiMocks.listDiscordChannelsByToken.mockResolvedValue([]);
  });

  it("keeps only telegram sessions with targetId in list", async () => {
    const form = createFormWithMessengerChannels({
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [
          { id: "empty", name: "Empty Chat", targetId: "", enabled: true, token: "t1" },
          { id: "valid", name: "Valid Chat", targetId: "-100123456", enabled: true, token: "t2" },
        ],
      },
    });

    render(<GatewaySettingsTab t={t} form={form as any} setForm={vi.fn()} persistSettings={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Empty Chat")).not.toBeInTheDocument();
      expect(screen.getByText("Valid Chat")).toBeInTheDocument();
    });
  });

  it("sends runtime message to selected telegram session", async () => {
    const user = userEvent.setup();
    const form = createFormWithMessengerChannels({
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [{ id: "ops", name: "Ops", targetId: "-100123456", enabled: true, token: "t-ops" }],
      },
    });

    render(<GatewaySettingsTab t={t} form={form as any} setForm={vi.fn()} persistSettings={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Type a test message...");
    await user.type(textarea, "  hello from test  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(apiMocks.sendMessengerRuntimeMessage).toHaveBeenCalledWith({
        sessionKey: "telegram:ops",
        text: "hello from test",
      });
    });

    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("Message sent")).toBeInTheDocument();
  });

  it("persists single global telegram session and clears non-telegram sessions", async () => {
    const user = userEvent.setup();
    const setForm = vi.fn();
    const persistSettings = vi.fn();
    const form = createFormWithMessengerChannels({
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [{ id: "ops", name: "Ops", targetId: "-100123456", enabled: true, token: "t-ops" }],
      },
      discord: {
        token: "discord-token",
        receiveEnabled: true,
        sessions: [{ id: "dc-1", name: "Discord", targetId: "123", enabled: true, token: "dc-token" }],
      },
    });

    render(<GatewaySettingsTab t={t} form={form as any} setForm={setForm} persistSettings={persistSettings} />);

    await user.click(screen.getByRole("button", { name: "Edit Global Group" }));
    const targetInput = screen.getByPlaceholderText("chat_id");
    await user.clear(targetInput);
    await user.type(targetInput, "-100987654");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(persistSettings).toHaveBeenCalledTimes(1);
    const saved = persistSettings.mock.calls[0][0];
    expect(saved.messengerChannels.telegram.sessions).toHaveLength(1);
    expect(saved.messengerChannels.telegram.sessions[0]).toMatchObject({
      id: "global",
      targetId: "-100987654",
    });
    expect(saved.messengerChannels.discord.sessions).toEqual([]);
  });

  it("shows shared dictionary copy for empty state", async () => {
    render(
      <GatewaySettingsTab
        t={t}
        form={createFormWithMessengerChannels() as any}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("No chats yet. Use Add Chat to register messenger, token, and channel."),
      ).toBeInTheDocument();
      expect(screen.getByText("No saved session. Add a chat first.")).toBeInTheDocument();
    });
  });
});
