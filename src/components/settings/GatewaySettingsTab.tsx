import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../api";
import AgentAvatar, { useSpriteMap } from "../AgentAvatar";
import {
  MESSENGER_CHANNELS,
  WORKFLOW_PACK_KEYS,
  type Agent,
  type MessengerSessionConfig,
  type WorkflowPackKey,
} from "../../types";
import { getGatewaySettingsCopy, getSettingsCommonCopy } from "./settings-copy";
import type { ChannelSettingsTabProps } from "./types";
import ChatEditorModal from "./gateway-settings/ChatEditorModal";
import { CHANNEL_META, isWorkflowPackKey } from "./gateway-settings/constants";
import {
  type ChatRow,
  createEditorState,
  createSessionId,
  defaultWorkflowPackLabel,
  normalizeChannelsConfig,
  resolveChannelsConfig,
} from "./gateway-settings/state";

export default function GatewaySettingsTab({ t, form, setForm, persistSettings }: ChannelSettingsTabProps) {
  const common = getSettingsCommonCopy(t);
  const copy = getGatewaySettingsCopy(t);
  const channelsConfig = resolveChannelsConfig(form.messengerChannels);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ ok: boolean; msg: string } | null>(null);

  const [sending, setSending] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSessions, setRuntimeSessions] = useState<Awaited<ReturnType<typeof api.getMessengerRuntimeSessions>>>(
    [],
  );
  const [receiverLoading, setReceiverLoading] = useState(false);
  const [telegramReceiverStatus, setTelegramReceiverStatus] = useState<Awaited<
    ReturnType<typeof api.getTelegramReceiverStatus>
  > | null>(null);
  const [discordReceiverStatus, setDiscordReceiverStatus] = useState<Awaited<
    ReturnType<typeof api.getDiscordReceiverStatus>
  > | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workflowPacksLoading, setWorkflowPacksLoading] = useState(false);
  const [workflowPacks, setWorkflowPacks] = useState<Awaited<ReturnType<typeof api.getWorkflowPacks>>["packs"]>([]);
  const spriteMap = useSpriteMap(agents);

  const [editor, setEditor] = useState(() => createEditorState(channelsConfig));
  const [editorError, setEditorError] = useState<string | null>(null);
  const [discordChannelsLoading, setDiscordChannelsLoading] = useState(false);
  const [discordChannelOptions, setDiscordChannelOptions] = useState<api.DiscordDiscoverableChannel[]>([]);
  const [discordChannelsError, setDiscordChannelsError] = useState<string | null>(null);
  const discordLookupSeq = useRef(0);

  const chatRows = useMemo<ChatRow[]>(() => {
    return MESSENGER_CHANNELS.flatMap((channel) => {
      const channelConfig = channelsConfig[channel];
      return (channelConfig.sessions ?? [])
        .map((session) => ({
          key: `${channel}:${session.id}`,
          channel,
          token: (session.token ?? "").trim() || (channelConfig.token ?? ""),
          receiveEnabled: channelConfig.receiveEnabled !== false,
          session,
        }))
        .filter((entry) => entry.session.targetId.trim().length > 0);
    });
  }, [channelsConfig]);

  const [selectedChatKey, setSelectedChatKey] = useState<string>("");

  useEffect(() => {
    if (chatRows.length === 0) {
      setSelectedChatKey("");
      return;
    }
    const exists = chatRows.some((row) => row.key === selectedChatKey);
    if (!exists) {
      setSelectedChatKey(chatRows[0].key);
    }
  }, [chatRows, selectedChatKey]);

  const selectedChat = chatRows.find((row) => row.key === selectedChatKey) ?? null;

  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const workflowPackOptions = useMemo(() => {
    const map = new Map<WorkflowPackKey, { key: WorkflowPackKey; name: string; enabled: boolean }>();
    for (const key of WORKFLOW_PACK_KEYS) {
      map.set(key, { key, name: defaultWorkflowPackLabel(t, key), enabled: true });
    }
    for (const pack of workflowPacks) {
      if (!isWorkflowPackKey(pack.key)) continue;
      const existing = map.get(pack.key);
      map.set(pack.key, {
        key: pack.key,
        name: typeof pack.name === "string" && pack.name.trim() ? pack.name.trim() : (existing?.name ?? pack.key),
        enabled: pack.enabled !== false,
      });
    }
    return Array.from(map.values());
  }, [workflowPacks, t]);

  const workflowPackNameByKey = useMemo(() => {
    const map = new Map<WorkflowPackKey, string>();
    for (const option of workflowPackOptions) {
      map.set(option.key, option.name);
    }
    return map;
  }, [workflowPackOptions]);

  const resolveDiscordLookupErrorMessage = useCallback((error: unknown): string => {
    if (api.isApiRequestError(error)) {
      const code = error.code ?? "";
      if (code === "discord_token_required") return "Please enter a Discord token.";
      if (code === "discord_auth_failed") return "Discord authentication failed. Check your bot token and permissions.";
      if (code === "discord_rate_limited") return "Discord API is rate-limited. Please try again shortly.";
      if (code === "discord_channel_lookup_failed") {
        return "Failed to load Discord channels. Check network connectivity and permissions.";
      }
    }
    return "An error occurred while loading Discord channels.";
  }, []);

  const persistChannelsForm = (nextChannels: ReturnType<typeof resolveChannelsConfig>, successMsg?: string) => {
    const normalized = normalizeChannelsConfig(nextChannels);
    const nextForm = { ...form, messengerChannels: normalized };
    setForm(nextForm);
    setSaving(true);
    setSaved(null);
    try {
      persistSettings(nextForm);
      setSaved({ ok: true, msg: successMsg ?? copy.channelSettingsSaved });
      setTimeout(() => setSaved(null), 2500);
      return true;
    } catch (error) {
      setSaved({ ok: false, msg: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeChat = (row: ChatRow) => {
    const next = resolveChannelsConfig(form.messengerChannels);
    next[row.channel] = {
      ...next[row.channel],
      sessions: next[row.channel].sessions.filter((session) => session.id !== row.session.id),
    };
    persistChannelsForm(next, copy.chatDeleted);
    setSendStatus(null);
  };

  const openCreateModal = () => {
    setEditor({
      ...createEditorState(channelsConfig),
      open: true,
      mode: "create",
    });
    setEditorError(null);
  };

  const openEditModal = (row: ChatRow) => {
    setEditor({
      open: true,
      mode: "edit",
      ref: { channel: row.channel, sessionId: row.session.id },
      channel: row.channel,
      token: row.session.token?.trim() || (channelsConfig[row.channel].token ?? ""),
      name: row.session.name ?? "",
      targetId: row.session.targetId ?? "",
      enabled: row.session.enabled !== false,
      agentId: row.session.agentId ?? "",
      workflowPackKey: isWorkflowPackKey(row.session.workflowPackKey) ? row.session.workflowPackKey : "development",
      receiveEnabled: channelsConfig[row.channel].receiveEnabled !== false,
    });
    setEditorError(null);
  };

  const closeEditorModal = () => {
    setEditor((prev) => ({ ...prev, open: false, ref: null }));
    setEditorError(null);
  };

  const handleSaveEditor = () => {
    const token = editor.token.trim();
    const name = editor.name.trim();
    const targetId = editor.targetId.trim();
    const agentId = editor.agentId.trim();

    if (!token) {
      setEditorError(copy.tokenRequired);
      return;
    }
    if (!name) {
      setEditorError(copy.chatNameRequired);
      return;
    }
    if (!targetId) {
      setEditorError(copy.targetIdRequired);
      return;
    }

    const next = resolveChannelsConfig(form.messengerChannels);
    next[editor.channel] = {
      ...next[editor.channel],
      receiveEnabled: editor.channel === "telegram" ? editor.receiveEnabled : next[editor.channel].receiveEnabled,
    };

    const nextSession: MessengerSessionConfig = {
      id: editor.ref?.sessionId || createSessionId(editor.channel),
      name,
      targetId,
      enabled: editor.enabled,
      token,
      agentId: agentId || undefined,
      workflowPackKey: editor.workflowPackKey,
    };

    let insertIndex: number | null = null;
    if (editor.ref) {
      const sourceChannel = editor.ref.channel;
      const sourceSessions = [...next[sourceChannel].sessions];
      const sourceIndex = sourceSessions.findIndex((session) => session.id === editor.ref?.sessionId);
      if (sourceIndex >= 0) {
        sourceSessions.splice(sourceIndex, 1);
        next[sourceChannel] = { ...next[sourceChannel], sessions: sourceSessions };
        if (sourceChannel === editor.channel) {
          insertIndex = sourceIndex;
        }
      }
    }

    const targetSessions = [...next[editor.channel].sessions];
    if (insertIndex !== null && insertIndex >= 0 && insertIndex <= targetSessions.length) {
      targetSessions.splice(insertIndex, 0, nextSession);
    } else {
      targetSessions.push(nextSession);
    }

    next[editor.channel] = { ...next[editor.channel], sessions: targetSessions };
    const savedOk = persistChannelsForm(next, copy.chatSaved);
    if (!savedOk) {
      setEditorError(copy.saveChatFailed);
      return;
    }
    setSelectedChatKey(`${editor.channel}:${nextSession.id}`);
    closeEditorModal();
  };

  const handleSendMessage = async () => {
    if (!selectedChat || !sendText.trim()) return;
    setSending(true);
    setSendStatus(null);
    try {
      const result = await api.sendMessengerRuntimeMessage({
        sessionKey: selectedChat.key,
        text: sendText.trim(),
      });
      if (!result.ok) {
        setSendStatus({ ok: false, msg: result.error || "send_failed" });
        return;
      }
      setSendStatus({ ok: true, msg: copy.messageSent });
      setSendText("");
    } catch (error) {
      setSendStatus({ ok: false, msg: error instanceof Error ? error.message : String(error) });
    } finally {
      setSending(false);
    }
  };

  const loadRuntimeSessions = async () => {
    setRuntimeLoading(true);
    try {
      setRuntimeSessions(await api.getMessengerRuntimeSessions());
    } catch {
      setRuntimeSessions([]);
    } finally {
      setRuntimeLoading(false);
    }
  };

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      setAgents(await api.getAgents());
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadWorkflowPacks = async () => {
    setWorkflowPacksLoading(true);
    try {
      const result = await api.getWorkflowPacks();
      setWorkflowPacks(result.packs ?? []);
    } catch {
      setWorkflowPacks([]);
    } finally {
      setWorkflowPacksLoading(false);
    }
  };

  useEffect(() => {
    void loadAgents();
    void loadWorkflowPacks();
  }, []);

  useEffect(() => {
    if (!editor.open || editor.channel !== "discord") {
      setDiscordChannelsLoading(false);
      setDiscordChannelsError(null);
      setDiscordChannelOptions([]);
      return;
    }
    const token = editor.token.trim();
    if (!token) {
      setDiscordChannelsLoading(false);
      setDiscordChannelsError(null);
      setDiscordChannelOptions([]);
      return;
    }

    const seq = discordLookupSeq.current + 1;
    discordLookupSeq.current = seq;
    const timer = setTimeout(() => {
      setDiscordChannelsLoading(true);
      setDiscordChannelsError(null);
      void api
        .listDiscordChannelsByToken(token)
        .then((channels) => {
          if (discordLookupSeq.current !== seq) return;
          setDiscordChannelOptions(channels);
        })
        .catch((error) => {
          if (discordLookupSeq.current !== seq) return;
          setDiscordChannelOptions([]);
          setDiscordChannelsError(resolveDiscordLookupErrorMessage(error));
        })
        .finally(() => {
          if (discordLookupSeq.current !== seq) return;
          setDiscordChannelsLoading(false);
        });
    }, 450);

    return () => clearTimeout(timer);
  }, [editor.open, editor.channel, editor.token, resolveDiscordLookupErrorMessage]);

  const loadMessengerReceiverStatus = async () => {
    setReceiverLoading(true);
    try {
      const [telegramStatus, discordStatus] = await Promise.all([
        api.getTelegramReceiverStatus().catch(() => null),
        api.getDiscordReceiverStatus().catch(() => null),
      ]);
      setTelegramReceiverStatus(telegramStatus);
      setDiscordReceiverStatus(discordStatus);
    } catch {
      setTelegramReceiverStatus(null);
      setDiscordReceiverStatus(null);
    } finally {
      setReceiverLoading(false);
    }
  };

  const selectedChatTransportReady = selectedChat ? CHANNEL_META[selectedChat.channel].transportReady : false;

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{copy.title}</h3>
        {saved && <span className={`text-xs ${saved.ok ? "text-emerald-400" : "text-red-400"}`}>{saved.msg}</span>}
      </div>

      <p className="text-xs text-slate-400">{copy.intro}</p>

      <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">{copy.chatSessions}</div>
          <button
            onClick={openCreateModal}
            className="rounded-md border border-emerald-500/40 bg-emerald-600/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-600/40"
          >
            + {copy.addChat}
          </button>
        </div>

        {chatRows.length === 0 ? (
          <div className="py-2 text-xs text-slate-500">{copy.noChats}</div>
        ) : (
          <div className="space-y-2">
            {chatRows.map((row) => {
              const meta = CHANNEL_META[row.channel];
              const assignedAgent = row.session.agentId ? agentById.get(row.session.agentId) : undefined;
              const assignedAgentName = assignedAgent
                ? assignedAgent.name_ko || assignedAgent.name
                : row.session.agentId || "";
              const workflowPackKey = isWorkflowPackKey(row.session.workflowPackKey)
                ? row.session.workflowPackKey
                : "development";
              const workflowPackLabel =
                workflowPackNameByKey.get(workflowPackKey) ?? defaultWorkflowPackLabel(t, workflowPackKey);
              const tokenReady = row.token.trim().length > 0;

              return (
                <div key={row.key} className="rounded-md border border-slate-700/70 bg-slate-800/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100">{row.session.name}</span>
                        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                          {meta.label}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            meta.transportReady
                              ? "bg-emerald-600/20 text-emerald-300"
                              : "bg-amber-600/20 text-amber-300"
                          }`}
                        >
                          {meta.transportReady ? copy.native : copy.compat}
                        </span>
                        <span className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                          {workflowPackLabel}
                        </span>
                        {!tokenReady && (
                          <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] text-red-300">
                            {copy.noToken}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{row.session.targetId}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {assignedAgentName ? (
                          <>
                            <span>{copy.assignedAgent}:</span>
                            {assignedAgent && (
                              <AgentAvatar agent={assignedAgent} spriteMap={spriteMap} size={14} rounded="xl" />
                            )}
                            <span className="truncate">{assignedAgentName}</span>
                          </>
                        ) : (
                          <span>{copy.noAssignedAgent}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEditModal(row)}
                        className="rounded border border-slate-600 bg-slate-700/70 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                      >
                        {common.edit}
                      </button>
                      <button
                        onClick={() => removeChat(row)}
                        className="rounded border border-red-500/30 bg-red-600/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-600/30"
                      >
                        {common.delete}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-slate-500">{copy.directiveRoutingHelp}</div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">{copy.testSend}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadMessengerReceiverStatus()}
              disabled={receiverLoading}
              className="text-xs text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-60"
            >
              {common.receiver}
            </button>
            <button
              onClick={() => void loadRuntimeSessions()}
              disabled={runtimeLoading}
              className="text-xs text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-60"
            >
              {common.runtime}
            </button>
          </div>
        </div>

        {telegramReceiverStatus && (
          <div className="space-y-1 rounded-md border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
            <div>
              {copy.telegramReceiver}:{" "}
              <span className={telegramReceiverStatus.enabled ? "text-emerald-400" : "text-amber-300"}>
                {telegramReceiverStatus.enabled ? "active" : "inactive"}
              </span>
            </div>
            <div>
              {copy.allowedChats}: {telegramReceiverStatus.allowedChatCount}
            </div>
            {telegramReceiverStatus.lastError && <div className="text-red-400">{telegramReceiverStatus.lastError}</div>}
          </div>
        )}

        {discordReceiverStatus && (
          <div className="space-y-1 rounded-md border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
            <div>
              {copy.discordReceiver}:{" "}
              <span className={discordReceiverStatus.enabled ? "text-emerald-400" : "text-amber-300"}>
                {discordReceiverStatus.enabled ? "active" : "inactive"}
              </span>
            </div>
            <div>
              {copy.polledChannels}: {discordReceiverStatus.routeCount}
            </div>
            {discordReceiverStatus.lastError && <div className="text-red-400">{discordReceiverStatus.lastError}</div>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-slate-400">{copy.targetSession}</label>
          {chatRows.length === 0 ? (
            <div className="py-1 text-xs text-slate-500">{copy.noSavedSession}</div>
          ) : (
            <select
              value={selectedChat?.key ?? ""}
              onChange={(e) => setSelectedChatKey(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {chatRows.map((row) => (
                <option key={row.key} value={row.key}>
                  {CHANNEL_META[row.channel].label} · {row.session.name} ({row.session.targetId})
                </option>
              ))}
            </select>
          )}
        </div>

        <textarea
          value={sendText}
          onChange={(e) => setSendText(e.target.value)}
          rows={3}
          placeholder={copy.testMessagePlaceholder}
          className="w-full resize-y rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        />

        {!selectedChatTransportReady && selectedChat && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {copy.transportNotReady}
          </div>
        )}

        <button
          onClick={() => void handleSendMessage()}
          disabled={sending || !selectedChat || !sendText.trim() || !selectedChatTransportReady}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? copy.sending : copy.send}
        </button>

        {sendStatus && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              sendStatus.ok
                ? "border border-green-500/20 bg-green-500/10 text-green-400"
                : "border border-red-500/20 bg-red-500/10 text-red-400"
            }`}
          >
            {sendStatus.msg}
          </div>
        )}

        {runtimeSessions.length > 0 && (
          <div className="pt-1">
            <div className="mb-1 text-xs text-slate-400">{copy.runtimeSessions}</div>
            <div className="max-h-44 overflow-auto rounded-md border border-slate-700/60">
              {runtimeSessions.map((session) => (
                <div
                  key={session.sessionKey}
                  className="border-b border-slate-700/60 px-2.5 py-2 text-[11px] text-slate-300 last:border-b-0"
                >
                  <span className="font-semibold">{session.channel}</span> · {session.displayName} · {session.targetId}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editor.open && (
        <ChatEditorModal
          t={t}
          editor={editor}
          setEditor={setEditor}
          closeEditorModal={closeEditorModal}
          handleSaveEditor={handleSaveEditor}
          channelsConfig={channelsConfig}
          agents={agents}
          agentsLoading={agentsLoading}
          workflowPackOptions={workflowPackOptions}
          workflowPacksLoading={workflowPacksLoading}
          editorError={editorError}
          discordChannels={discordChannelOptions}
          discordChannelsLoading={discordChannelsLoading}
          discordChannelsError={discordChannelsError}
        />
      )}
    </section>
  );
}
