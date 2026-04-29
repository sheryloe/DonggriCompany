import {
  MESSENGER_CHANNELS,
  type MessengerChannelConfig,
  type MessengerDepartmentBotConfig,
  type MessengerChannelType,
  type MessengerChannelsConfig,
  type MessengerSessionConfig,
  type WorkflowPackKey,
} from "../../../types";
import type { ChannelSettingsTabProps } from "../types";
import { CHANNEL_META, isWorkflowPackKey } from "./constants";

export type ChatRow = {
  key: string;
  channel: MessengerChannelType;
  token: string;
  receiveEnabled: boolean;
  session: MessengerSessionConfig;
};

export type ChatEditorRef = { channel: MessengerChannelType; sessionId: string } | null;

export type ChatEditorState = {
  open: boolean;
  mode: "create" | "edit";
  ref: ChatEditorRef;
  channel: MessengerChannelType;
  token: string;
  name: string;
  targetId: string;
  enabled: boolean;
  agentId: string;
  workflowPackKey: WorkflowPackKey;
  receiveEnabled: boolean;
};

export function createSessionId(channel: MessengerChannelType): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${channel}-${crypto.randomUUID()}`;
  }
  return `${channel}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyChannelConfig(channel: MessengerChannelType): MessengerChannelConfig {
  return {
    token: "",
    sessions: [],
    receiveEnabled: channel === "telegram",
  };
}

export function defaultChannelsConfig(): MessengerChannelsConfig {
  return MESSENGER_CHANNELS.reduce((acc, channel) => {
    acc[channel] = emptyChannelConfig(channel);
    return acc;
  }, {} as MessengerChannelsConfig);
}

function normalizeSession(
  session: MessengerSessionConfig,
  channel: MessengerChannelType,
  index: number,
): MessengerSessionConfig {
  const id = (session.id || "").trim() || `${channel}-${index + 1}`;
  const agentId = session.agentId?.trim() || "";
  const token = session.token?.trim() || "";
  const workflowPackKey = isWorkflowPackKey(session.workflowPackKey) ? session.workflowPackKey : "development";
  return {
    id,
    name: session.name?.trim() || `${CHANNEL_META[channel].label} Session ${index + 1}`,
    targetId: session.targetId?.trim() || "",
    enabled: session.enabled !== false,
    token: token || undefined,
    agentId: agentId || undefined,
    workflowPackKey,
  };
}

function normalizeDepartmentBots(
  bots: Record<string, MessengerDepartmentBotConfig> | undefined,
): Record<string, MessengerDepartmentBotConfig> | undefined {
  if (!bots) return undefined;
  const normalized = Object.entries(bots).reduce<Record<string, MessengerDepartmentBotConfig>>((acc, [key, bot]) => {
    const departmentId = key.trim().toLowerCase();
    const token = bot.token?.trim?.() ?? "";
    const targetId = bot.targetId?.trim?.() ?? "";
    if (!departmentId || !token) return acc;
    acc[departmentId] = {
      token,
      ...(targetId ? { targetId } : {}),
      enabled: bot.enabled !== false,
    };
    return acc;
  }, {});
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeChannelsConfig(config: MessengerChannelsConfig): MessengerChannelsConfig {
  return MESSENGER_CHANNELS.reduce((acc, channel) => {
    const channelConfig = config[channel] ?? emptyChannelConfig(channel);
    const departmentBots = channel === "telegram" ? normalizeDepartmentBots(channelConfig.departmentBots) : undefined;
    acc[channel] = {
      token: channelConfig.token?.trim?.() ?? "",
      receiveEnabled:
        channel === "telegram" ? channelConfig.receiveEnabled !== false : channelConfig.receiveEnabled === true,
      sessions: (channelConfig.sessions ?? []).map((session, idx) => normalizeSession(session, channel, idx)),
      ...(departmentBots ? { departmentBots } : {}),
    };
    return acc;
  }, {} as MessengerChannelsConfig);
}

export function resolveChannelsConfig(
  raw: ChannelSettingsTabProps["form"]["messengerChannels"],
): MessengerChannelsConfig {
  const defaults = defaultChannelsConfig();
  return MESSENGER_CHANNELS.reduce((acc, channel) => {
    acc[channel] = {
      ...defaults[channel],
      ...(raw?.[channel] ?? {}),
      sessions: raw?.[channel]?.sessions ?? defaults[channel].sessions,
      ...(channel === "telegram" && raw?.[channel]?.departmentBots
        ? { departmentBots: raw[channel].departmentBots }
        : {}),
    };
    return acc;
  }, {} as MessengerChannelsConfig);
}

export function createEditorState(channelsConfig: MessengerChannelsConfig): ChatEditorState {
  return {
    open: false,
    mode: "create",
    ref: null,
    channel: "telegram",
    token: channelsConfig.telegram.token ?? "",
    name: "",
    targetId: "",
    enabled: true,
    agentId: "",
    workflowPackKey: "development",
    receiveEnabled: channelsConfig.telegram.receiveEnabled !== false,
  };
}

export function defaultWorkflowPackLabel(t: ChannelSettingsTabProps["t"], key: WorkflowPackKey): string {
  switch (key) {
    case "development":
      return t({ ko: "개발", en: "Development" });
    case "donggri":
      return t({ ko: "동그리 통합", en: "Donggri Unified" });
    case "novel":
      return t({ ko: "소설", en: "Novel" });
    case "report":
      return t({ ko: "보고서", en: "Report" });
    case "video_preprod":
      return t({ ko: "영상 기획", en: "Video Preprod" });
    case "web_research_report":
      return t({ ko: "웹 리서치", en: "Web Research" });
    case "roleplay":
      return t({ ko: "롤플레이", en: "Roleplay" });
    default:
      return key;
  }
}
