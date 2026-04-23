import { useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { MESSENGER_CHANNELS, type Agent, type MessengerSessionConfig, type WorkflowPackKey } from "../../types";
import { getGatewaySettingsCopy, getSettingsCommonCopy } from "./settings-copy";
import type { ChannelSettingsTabProps } from "./types";
import ChatEditorModal from "./gateway-settings/ChatEditorModal";
import { CHANNEL_META, isWorkflowPackKey } from "./gateway-settings/constants";
import { type ChatRow, createEditorState, defaultWorkflowPackLabel, normalizeChannelsConfig, resolveChannelsConfig } from "./gateway-settings/state";

const SINGLE_GROUP_CHANNEL = "telegram";
const SINGLE_GROUP_SESSION_ID = "global";

function pickPrimaryTelegramSession(
  channelsConfig: ReturnType<typeof resolveChannelsConfig>,
): MessengerSessionConfig | null {
  const sessions = channelsConfig.telegram.sessions.filter((session) => session.targetId.trim().length > 0);
  if (sessions.length <= 0) return null;
  return sessions.find((session) => session.id === SINGLE_GROUP_SESSION_ID) ?? sessions[0];
}

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

  const [editor, setEditor] = useState(() => createEditorState(channelsConfig));
  const [editorError, setEditorError] = useState<string | null>(null);

  const workflowPackOptions = useMemo(() => {
    const options = new Map<WorkflowPackKey, { key: WorkflowPackKey; name: string; enabled: boolean }>();
    for (const key of ["development", "donggri", "novel", "report", "video_preprod", "web_research_report", "roleplay"] as const) {
      options.set(key, { key, name: defaultWorkflowPackLabel(t, key), enabled: true });
    }
    for (const pack of workflowPacks) {
      if (!isWorkflowPackKey(pack.key)) continue;
      const current = options.get(pack.key);
      options.set(pack.key, {
        key: pack.key,
        name: typeof pack.name === "string" && pack.name.trim().length > 0 ? pack.name.trim() : current?.name ?? pack.key,
        enabled: pack.enabled !== false,
      });
    }
    return Array.from(options.values());
  }, [workflowPacks, t]);

  const primaryTelegramSession = useMemo(() => pickPrimaryTelegramSession(channelsConfig), [channelsConfig]);
  const chatRows = useMemo<ChatRow[]>(() => {
    if (!primaryTelegramSession) return [];
    return [
      {
        key: `${SINGLE_GROUP_CHANNEL}:${primaryTelegramSession.id}`,
        channel: SINGLE_GROUP_CHANNEL,
        token: (primaryTelegramSession.token ?? "").trim() || (channelsConfig.telegram.token ?? ""),
        receiveEnabled: channelsConfig.telegram.receiveEnabled !== false,
        session: primaryTelegramSession,
      },
    ];
  }, [channelsConfig.telegram.receiveEnabled, channelsConfig.telegram.token, primaryTelegramSession]);

  const [selectedChatKey, setSelectedChatKey] = useState("");

  useEffect(() => {
    if (chatRows.length <= 0) {
      setSelectedChatKey("");
      return;
    }
    if (!chatRows.some((row) => row.key === selectedChatKey)) {
      setSelectedChatKey(chatRows[0].key);
    }
  }, [chatRows, selectedChatKey]);

  const selectedChat = chatRows.find((row) => row.key === selectedChatKey) ?? null;
  const selectedChatTransportReady = selectedChat ? CHANNEL_META[selectedChat.channel].transportReady : false;

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

  const openGlobalEditor = () => {
    const current = primaryTelegramSession;
    setEditor({
      ...createEditorState(channelsConfig),
      open: true,
      mode: current ? "edit" : "create",
      ref: current ? { channel: SINGLE_GROUP_CHANNEL, sessionId: current.id } : null,
      channel: SINGLE_GROUP_CHANNEL,
      token: current?.token?.trim() || channelsConfig.telegram.token || "",
      name: current?.name?.trim() || copy.globalSessionName,
      targetId: current?.targetId?.trim() || "",
      enabled: current?.enabled !== false,
      agentId: "",
      workflowPackKey: "development",
      receiveEnabled: channelsConfig.telegram.receiveEnabled !== false,
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
    next.telegram = {
      ...next.telegram,
      token,
      receiveEnabled: editor.receiveEnabled,
      sessions: [
        {
          id: SINGLE_GROUP_SESSION_ID,
          name,
          targetId,
          enabled: editor.enabled,
          token: token || undefined,
          workflowPackKey: "development",
        },
      ],
    };
    for (const channel of MESSENGER_CHANNELS) {
      if (channel === SINGLE_GROUP_CHANNEL) continue;
      next[channel] = {
        ...next[channel],
        token: "",
        sessions: [],
        receiveEnabled: false,
      };
    }

    if (!persistChannelsForm(next, copy.chatSaved)) {
      setEditorError(copy.saveChatFailed);
      return;
    }
    setSelectedChatKey(`${SINGLE_GROUP_CHANNEL}:${SINGLE_GROUP_SESSION_ID}`);
    closeEditorModal();
  };

  const loadRuntimeSessions = async () => {
    setRuntimeLoading(true);
    try {
      const sessions = await api.getMessengerRuntimeSessions();
      const telegram = sessions.find(
        (session) =>
          session.channel === SINGLE_GROUP_CHANNEL &&
          session.enabled &&
          session.targetId.trim().length > 0,
      );
      setRuntimeSessions(telegram ? [telegram] : []);
    } catch {
      setRuntimeSessions([]);
    } finally {
      setRuntimeLoading(false);
    }
  };

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

  useEffect(() => {
    setAgentsLoading(true);
    setWorkflowPacksLoading(true);
    void api
      .getAgents()
      .then((rows) => setAgents(rows))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
    void api
      .getWorkflowPacks()
      .then((result) => setWorkflowPacks(result.packs ?? []))
      .catch(() => setWorkflowPacks([]))
      .finally(() => setWorkflowPacksLoading(false));
  }, []);

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
            onClick={openGlobalEditor}
            disabled={saving}
            className="rounded-md border border-emerald-500/40 bg-emerald-600/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-600/40 disabled:opacity-60"
          >
            {copy.editGlobalChat}
          </button>
        </div>

        {chatRows.length === 0 ? (
          <div className="py-2 text-xs text-slate-500">{copy.noChats}</div>
        ) : (
          <div className="space-y-2">
            {chatRows.map((row) => {
              const meta = CHANNEL_META[row.channel];
              const tokenReady = row.token.trim().length > 0;
              return (
                <div key={row.key} className="rounded-md border border-slate-700/70 bg-slate-800/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{row.session.name}</span>
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                        {meta.label}
                      </span>
                      <span className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                        {copy.singleGroupMode}
                      </span>
                      {!tokenReady && (
                        <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] text-red-300">
                          {copy.noToken}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{row.session.targetId}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{copy.singleGroupNotice}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
              onChange={(event) => setSelectedChatKey(event.target.value)}
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
          onChange={(event) => setSendText(event.target.value)}
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
          discordChannels={[]}
          discordChannelsLoading={false}
          discordChannelsError={null}
        />
      )}
    </section>
  );
}
