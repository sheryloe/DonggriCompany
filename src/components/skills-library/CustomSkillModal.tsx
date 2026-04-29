import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import { providerLabel, type TFunction } from "./model";
import { skillText } from "./skillLibraryText";

interface CustomSkillModalProps {
  t: TFunction;
  show: boolean;
  agents: Agent[];
  representatives: Array<{ provider: SkillLearnProvider; agent: Agent | null }>;
  preferKoreanName: boolean;
  customSkillName: string;
  setCustomSkillName: (value: string) => void;
  customSkillContent: string;
  customSkillFileName: string;
  customSkillProviders: SkillLearnProvider[];
  customSkillSubmitting: boolean;
  customSkillError: string | null;
  customFileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleProvider: (provider: SkillLearnProvider) => void;
  onSubmit: () => void;
}

export default function CustomSkillModal({
  t,
  show,
  agents,
  representatives,
  preferKoreanName,
  customSkillName,
  setCustomSkillName,
  customSkillContent,
  customSkillFileName,
  customSkillProviders,
  customSkillSubmitting,
  customSkillError,
  customFileInputRef,
  onClose,
  onFileSelect,
  onToggleProvider,
  onSubmit,
}: CustomSkillModalProps) {
  if (!show) return null;

  return createPortal(
    <div className="custom-skill-modal fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="custom-skill-modal-card w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="rounded-md border border-slate-600/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                CUSTOM
              </span>
              {skillText(t, "custom.title")}
            </h3>
            <div className="mt-1 text-xs text-slate-400">{skillText(t, "custom.description")}</div>
          </div>
          <button
            onClick={onClose}
            disabled={customSkillSubmitting}
            className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 transition-all"
          >
            {skillText(t, "action.close")}
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4 max-h-[calc(90vh-72px)]">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">{skillText(t, "custom.nameLabel")}</label>
            <input
              type="text"
              value={customSkillName}
              onChange={(e) => setCustomSkillName(e.target.value)}
              placeholder={skillText(t, "custom.namePlaceholder")}
              className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25"
            />
            <div className="text-[10px] text-slate-500 mt-1">{skillText(t, "custom.nameHelp")}</div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">{skillText(t, "custom.fileLabel")}</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => customFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-300 hover:bg-slate-700/60 transition-all"
              >
                {skillText(t, "custom.chooseFile")}
              </button>
              <input
                ref={customFileInputRef}
                type="file"
                accept=".md,.txt,.markdown"
                onChange={onFileSelect}
                className="hidden"
              />
              {customSkillFileName && (
                <span className="text-xs text-emerald-300 truncate max-w-[200px]">{customSkillFileName}</span>
              )}
            </div>
            {customSkillContent && (
              <div className="mt-2 rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 max-h-32 overflow-y-auto">
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap break-all">
                  {customSkillContent.slice(0, 500)}
                  {customSkillContent.length > 500 && "..."}
                </pre>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">{skillText(t, "custom.providersLabel")}</label>
            <div className="grid grid-cols-2 gap-2">
              {representatives.map((row) => {
                const isSelected = customSkillProviders.includes(row.provider);
                const hasAgent = !!row.agent;
                const displayName = row.agent
                  ? preferKoreanName
                    ? row.agent.name_ko || row.agent.name
                    : row.agent.name || row.agent.name_ko
                  : skillText(t, "custom.none");
                return (
                  <button
                    key={`custom-${row.provider}`}
                    onClick={() => hasAgent && onToggleProvider(row.provider)}
                    disabled={!hasAgent}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                      !hasAgent
                        ? "cursor-not-allowed border-slate-700/60 bg-slate-800/30 opacity-50"
                        : isSelected
                          ? "border-violet-500/50 bg-violet-500/10"
                          : "border-slate-700/60 bg-slate-800/50 hover:border-slate-500/70"
                    }`}
                  >
                    <AgentAvatar agent={row.agent ?? undefined} agents={agents} size={32} rounded="xl" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-500">{providerLabel(row.provider)}</div>
                      <div className="text-xs text-white truncate">{displayName}</div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        isSelected
                          ? "border-violet-400 bg-violet-500/30 text-violet-200"
                          : "border-slate-600 bg-slate-800/60"
                      }`}
                    >
                      {isSelected && "OK"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {customSkillError && (
            <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {customSkillError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={customSkillSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all"
            >
              {skillText(t, "action.cancel")}
            </button>
            <button
              onClick={onSubmit}
              disabled={
                !customSkillName.trim() ||
                !customSkillContent.trim() ||
                customSkillProviders.length === 0 ||
                customSkillSubmitting
              }
              className={`custom-skill-submit-btn px-4 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
                !customSkillName.trim() || !customSkillContent.trim() || customSkillProviders.length === 0
                  ? "cursor-not-allowed border-slate-700 text-slate-600"
                  : "border-violet-500/50 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
              }`}
            >
              {customSkillSubmitting ? (
                <>
                  <span className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
                  {skillText(t, "custom.submitting")}
                </>
              ) : (
                skillText(t, "custom.startTraining")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
