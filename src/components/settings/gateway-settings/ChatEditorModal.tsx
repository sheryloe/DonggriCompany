import type { Dispatch, SetStateAction } from "react";
import AgentSelect from "../../AgentSelect";
import type { Agent, MessengerChannelType, MessengerChannelsConfig, WorkflowPackKey } from "../../../types";
import type { ChannelSettingsTabProps } from "../types";
import { getSettingsCommonCopy } from "../settings-copy";
import { CHANNEL_META, channelTargetHint, isWorkflowPackKey } from "./constants";
import type { ChatEditorState } from "./state";
import { MESSENGER_CHANNELS } from "../../../types";

type WorkflowPackOption = {
  key: WorkflowPackKey;
  name: string;
  enabled: boolean;
};

type ChatEditorModalProps = {
  t: ChannelSettingsTabProps["t"];
  editor: ChatEditorState;
  setEditor: Dispatch<SetStateAction<ChatEditorState>>;
  closeEditorModal: () => void;
  handleSaveEditor: () => void;
  channelsConfig: MessengerChannelsConfig;
  agents: Agent[];
  agentsLoading: boolean;
  workflowPackOptions: WorkflowPackOption[];
  workflowPacksLoading: boolean;
  editorError: string | null;
  discordChannels: Array<{
    id: string;
    name: string;
    guildId: string;
    guildName: string;
    type: number;
  }>;
  discordChannelsLoading: boolean;
  discordChannelsError: string | null;
};

export default function ChatEditorModal({
  t,
  editor,
  setEditor,
  closeEditorModal,
  handleSaveEditor,
  channelsConfig,
  agents,
  agentsLoading,
  workflowPackOptions,
  workflowPacksLoading,
  editorError,
  discordChannels,
  discordChannelsLoading,
  discordChannelsError,
}: ChatEditorModalProps) {
  const common = getSettingsCommonCopy(t);
  const discordSelectedChannel =
    editor.channel === "discord" ? discordChannels.find((entry) => entry.id === editor.targetId.trim()) : null;

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-slate-950/70" onClick={closeEditorModal} aria-label="close modal" />
      <div className="relative w-full max-w-lg space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">
            {editor.mode === "create" ? t({ ko: "채팅 추가", en: "Add Chat" }) : t({ ko: "채팅 수정", en: "Edit Chat" })}
          </h4>
          <button
            onClick={closeEditorModal}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {common.close}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t({ ko: "메신저", en: "Messenger" })}</label>
            <select
              value={editor.channel}
              onChange={(e) => {
                const nextChannel = e.target.value as MessengerChannelType;
                setEditor((prev) => ({
                  ...prev,
                  channel: nextChannel,
                  token: channelsConfig[nextChannel].token ?? "",
                  receiveEnabled: channelsConfig[nextChannel].receiveEnabled !== false,
                }));
              }}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {MESSENGER_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CHANNEL_META[channel].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{common.enabled}</label>
            <label className="inline-flex h-[38px] items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(e) => setEditor((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="accent-blue-500"
              />
              {editor.enabled ? common.enabled : common.disabled}
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">{t({ ko: "토큰", en: "Token" })}</label>
          <input
            type="password"
            value={editor.token}
            onChange={(e) => setEditor((prev) => ({ ...prev, token: e.target.value }))}
            placeholder={t({
              ko: `${CHANNEL_META[editor.channel].label} 토큰 입력`,
              en: `Enter ${CHANNEL_META[editor.channel].label} token`,
            })}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t({ ko: "채팅 이름", en: "Chat Name" })}</label>
            <input
              value={editor.name}
              onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t({ ko: "예: 디자인 알림", en: "e.g. Design Alerts" })}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t({ ko: "채널/대상 ID", en: "Channel/Target ID" })}</label>
            {editor.channel === "discord" && discordChannels.length > 0 && (
              <select
                value={discordSelectedChannel ? discordSelectedChannel.id : ""}
                onChange={(e) => {
                  const nextTargetId = e.target.value;
                  setEditor((prev) => {
                    const matched = discordChannels.find((entry) => entry.id === nextTargetId);
                    return {
                      ...prev,
                      targetId: nextTargetId,
                      name: matched && !prev.name.trim() ? `${matched.guildName} #${matched.name}` : prev.name,
                    };
                  });
                }}
                className="mb-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">{t({ ko: "감지된 Discord 채널 선택 (선택 사항)", en: "Choose detected Discord channel (optional)" })}</option>
                {discordChannels.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.guildName} / #{entry.name} ({entry.id})
                  </option>
                ))}
              </select>
            )}
            <input
              value={editor.targetId}
              onChange={(e) => {
                const nextTargetId = e.target.value;
                setEditor((prev) => {
                  const matched =
                    prev.channel === "discord"
                      ? discordChannels.find((entry) => entry.id === nextTargetId.trim())
                      : undefined;
                  return {
                    ...prev,
                    targetId: nextTargetId,
                    name: matched && !prev.name.trim() ? `${matched.guildName} #${matched.name}` : prev.name,
                  };
                });
              }}
              placeholder={channelTargetHint(editor.channel)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none"
            />
            {editor.channel === "discord" && (
              <div className="mt-1 space-y-1">
                {discordChannelsLoading && <div className="text-[11px] text-blue-300">{t({ ko: "Discord 채널 목록 조회 중...", en: "Loading Discord channels..." })}</div>}
                {!discordChannelsLoading && !discordChannelsError && editor.token.trim() && (
                  <div className="text-[11px] text-slate-500">
                    {discordChannels.length > 0
                      ? t({
                          ko: `${discordChannels.length}개 채널을 자동으로 불러왔습니다.`,
                          en: `Loaded ${discordChannels.length} channels automatically.`,
                        })
                      : t({
                          ko: "조회된 Discord 채널이 없습니다. Bot 권한과 서버 참여 상태를 확인하세요.",
                          en: "No Discord channels found. Check bot permissions and server membership.",
                        })}
                  </div>
                )}
                {discordChannelsError && <div className="text-[11px] text-red-400">{discordChannelsError}</div>}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">{t({ ko: "연결 에이전트", en: "Conversation Agent" })}</label>
          <AgentSelect
            agents={agents}
            value={editor.agentId}
            onChange={(agentId) => setEditor((prev) => ({ ...prev, agentId: agentId || "" }))}
            placeholder={t({ ko: "에이전트 선택", en: "Select Agent" })}
            className={agentsLoading ? "pointer-events-none opacity-60" : ""}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">{t({ ko: "워크플로 팩", en: "Workflow Pack" })}</label>
          <select
            value={editor.workflowPackKey}
            onChange={(e) =>
              setEditor((prev) => ({
                ...prev,
                workflowPackKey: isWorkflowPackKey(e.target.value) ? e.target.value : "development",
              }))
            }
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {workflowPackOptions.map((pack) => (
              <option key={pack.key} value={pack.key} disabled={!pack.enabled && pack.key !== editor.workflowPackKey}>
                {pack.name}
                {!pack.enabled ? ` (${common.disabled.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
          {workflowPacksLoading && <div className="mt-1 text-[11px] text-slate-500">{t({ ko: "팩 목록 불러오는 중...", en: "Loading packs..." })}</div>}
        </div>

        {editor.channel === "telegram" && (
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={editor.receiveEnabled}
              onChange={(e) => setEditor((prev) => ({ ...prev, receiveEnabled: e.target.checked }))}
              className="accent-blue-500"
            />
            {t({ ko: "텔레그램 직접 수신 활성화", en: "Enable direct Telegram receive" })}
          </label>
        )}

        {editorError && <div className="text-xs text-red-400">{editorError}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={closeEditorModal}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            {common.cancel}
          </button>
          <button onClick={handleSaveEditor} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500">
            {common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
