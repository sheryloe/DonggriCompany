import type { KeyboardEvent, RefObject } from "react";
import type { Agent } from "../../types";
import ChatModeHint from "./ChatModeHint";
import type { CommandPreview } from "./model";

type ChatMode = "chat" | "task" | "announcement" | "report";
type Tr = (ko: string, en: string, ja?: string, zh?: string) => string;

interface ChatComposerProps {
  mode: ChatMode;
  input: string;
  selectedAgent: Agent | null;
  isDirectiveMode: boolean;
  isPrnCommandMode: boolean;
  isAnnouncementMode: boolean;
  commandPreview: CommandPreview | null;
  tr: Tr;
  getAgentName: (agent: Agent | null | undefined) => string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: ChatMode) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCreatePrn: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function ChatComposer({
  mode,
  input,
  selectedAgent,
  isDirectiveMode,
  isPrnCommandMode,
  isAnnouncementMode,
  commandPreview,
  tr,
  getAgentName,
  textareaRef,
  onModeChange,
  onInputChange,
  onSend,
  onCreatePrn,
  onKeyDown,
}: ChatComposerProps) {
  const isTaskPreview = commandPreview?.code === "task";
  return (
    <>
      <div className="flex flex-shrink-0 gap-2 border-t border-gray-700/50 px-4 pb-1 pt-3">
        <button
          onClick={() => onModeChange(mode === "task" ? "chat" : "task")}
          disabled={!selectedAgent}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "task"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          <span>{tr("작업", "Task")}</span>
        </button>

        <button
          onClick={() => onModeChange(mode === "announcement" ? "chat" : "announcement")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "announcement" ? "bg-yellow-500 text-gray-900" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          <span>{tr("공지", "Announcement")}</span>
        </button>

        <button
          onClick={() => onModeChange(mode === "report" ? "chat" : "report")}
          disabled={!selectedAgent}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "report"
              ? "bg-emerald-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          <span>{tr("보고", "Report")}</span>
        </button>

        <button
          onClick={onCreatePrn}
          disabled={!input.trim()}
          className="flex flex-1 items-center justify-center rounded-lg bg-indigo-700 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>{tr("PRN 작성", "Create PRN")}</span>
        </button>
      </div>

      <ChatModeHint mode={mode} isDirectiveMode={isDirectiveMode} isPrnCommandMode={isPrnCommandMode} tr={tr} />

      {commandPreview ? (
        <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-2" data-testid="command-preview">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-200">
              {commandPreview.label}
            </span>
            <span className="text-slate-300">{commandPreview.description}</span>
            <span className="font-mono text-[11px] text-slate-500">{commandPreview.routeLabel}</span>
          </div>
        </div>
      ) : null}

      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div
          className={`flex items-end gap-2 rounded-2xl border bg-gray-800 transition-colors ${
            isDirectiveMode
              ? "border-red-500/50 focus-within:border-red-400"
              : isPrnCommandMode
                ? "border-indigo-500/50 focus-within:border-indigo-400"
                : isTaskPreview
                  ? "border-blue-500/50 focus-within:border-blue-400"
                  : isAnnouncementMode
                    ? "border-yellow-500/50 focus-within:border-yellow-400"
                    : mode === "task"
                      ? "border-blue-500/50 focus-within:border-blue-400"
                      : mode === "report"
                        ? "border-emerald-500/50 focus-within:border-emerald-400"
                        : "border-gray-600 focus-within:border-blue-500"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              isAnnouncementMode
                ? tr("공지 내용을 입력하세요...", "Write an announcement...")
                : mode === "task"
                  ? tr("작업 지시를 입력하세요...", "Write a task instruction...")
                  : mode === "report"
                    ? tr("보고 요청을 입력하세요...", "Write a report request...")
                    : selectedAgent
                      ? tr(
                          `${getAgentName(selectedAgent)}에게 메시지 보내기...`,
                          `Send a message to ${getAgentName(selectedAgent)}...`,
                        )
                      : tr("메시지를 입력하세요...", "Type a message...")
            }
            rows={1}
            className="min-h-[44px] max-h-32 flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-relaxed text-gray-100 placeholder-gray-500 focus:outline-none"
            style={{ scrollbarWidth: "none" }}
            onInput={(event) => {
              const el = event.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className={`mb-2 mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
              input.trim()
                ? isDirectiveMode
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : isPrnCommandMode
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : isTaskPreview
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : isAnnouncementMode
                        ? "bg-yellow-500 text-gray-900 hover:bg-yellow-400"
                        : mode === "task"
                          ? "bg-blue-600 text-white hover:bg-blue-500"
                          : mode === "report"
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-blue-600 text-white hover:bg-blue-500"
                : "cursor-not-allowed bg-gray-700 text-gray-600"
            }`}
            aria-label={tr("전송", "Send")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 px-1 text-xs text-gray-600">
          {tr(
            "Enter 전송, Shift+Enter 줄바꿈, /prn 요구사항 초안 작성",
            "Enter to send, Shift+Enter newline, /prn to draft requirements",
          )}
        </p>
      </div>
    </>
  );
}
