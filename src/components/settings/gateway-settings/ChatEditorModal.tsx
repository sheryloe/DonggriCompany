import type { Dispatch, SetStateAction } from "react";
import type { Agent, MessengerChannelsConfig, WorkflowPackKey } from "../../../types";
import type { ChannelSettingsTabProps } from "../types";
import { getSettingsCommonCopy } from "../settings-copy";
import { CHANNEL_META, channelTargetHint } from "./constants";
import type { ChatEditorState } from "./state";

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
  void agents;
  void agentsLoading;
  void workflowPackOptions;
  void workflowPacksLoading;
  void discordChannels;
  void discordChannelsLoading;
  void discordChannelsError;

  const common = getSettingsCommonCopy(t);
  const messengerLabel = CHANNEL_META.telegram.label;

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-slate-950/70" onClick={closeEditorModal} aria-label="close modal" />
      <div className="relative w-full max-w-lg space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">
            {editor.mode === "create"
              ? t({ ko: "전역 그룹 설정", en: "Global Group Settings" })
              : t({ ko: "전역 그룹 수정", en: "Edit Global Group" })}
          </h4>
          <button
            onClick={closeEditorModal}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {common.close}
          </button>
        </div>

        <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
          {t({
            ko: "단일 그룹 모드: 텔레그램 세션 1개 + 그룹 chat_id 1개만 사용합니다.",
            en: "Single-group mode: one Telegram session and one group chat_id are used.",
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t({ ko: "메신저", en: "Messenger" })}</label>
            <div className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200">
              {messengerLabel}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{common.enabled}</label>
            <label className="inline-flex h-[38px] items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(e) => setEditor((prev) => ({ ...prev, channel: "telegram", enabled: e.target.checked }))}
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
            onChange={(e) => setEditor((prev) => ({ ...prev, channel: "telegram", token: e.target.value }))}
            placeholder={t({ ko: `${messengerLabel} 토큰 입력`, en: `Enter ${messengerLabel} token` })}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t({ ko: "채팅 이름", en: "Chat Name" })}</label>
            <input
              value={editor.name}
              onChange={(e) => setEditor((prev) => ({ ...prev, channel: "telegram", name: e.target.value }))}
              placeholder={t({ ko: "예: 전역 운영 보고", en: "e.g. Global Ops Reports" })}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t({ ko: "전역 그룹 chat_id", en: "Global Group chat_id" })}
            </label>
            <input
              value={editor.targetId}
              onChange={(e) => setEditor((prev) => ({ ...prev, channel: "telegram", targetId: e.target.value }))}
              placeholder={channelTargetHint("telegram")}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={editor.receiveEnabled}
            onChange={(e) => setEditor((prev) => ({ ...prev, channel: "telegram", receiveEnabled: e.target.checked }))}
            className="accent-blue-500"
          />
          {t({ ko: "텔레그램 직접 수신 활성화", en: "Enable direct Telegram receive" })}
        </label>

        {editorError && <div className="text-xs text-red-400">{editorError}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={closeEditorModal}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            {common.cancel}
          </button>
          <button
            onClick={handleSaveEditor}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500"
          >
            {common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
