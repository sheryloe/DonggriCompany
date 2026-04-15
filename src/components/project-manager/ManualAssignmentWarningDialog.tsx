import type { ManualAssignmentWarning, ProjectI18nTranslate, ProjectManualSelectionStats } from "./types";

interface ManualAssignmentWarningDialogProps {
  warning: ManualAssignmentWarning | null;
  stats: ProjectManualSelectionStats;
  t: ProjectI18nTranslate;
  onCancel: () => void;
  onConfirm: (warning: ManualAssignmentWarning) => void;
}

export default function ManualAssignmentWarningDialog({
  warning,
  stats,
  t,
  onCancel,
  onConfirm,
}: ManualAssignmentWarningDialogProps) {
  if (!warning) return null;

  const description =
    warning.reason === "no_agents"
      ? t({
          ko: "선택된 에이전트가 없습니다. 지금 저장하면 팀장이 직접 실행할 수 있습니다. 계속 진행할지 확인하세요.",
          en: "No agents are selected. Saving now may let team leaders execute the task directly. Confirm before continuing.",
          ja: "No agents are selected. Saving now may let team leaders execute the task directly. Confirm before continuing.",
          zh: "No agents are selected. Saving now may let team leaders execute the task directly. Confirm before continuing.",
        })
      : t({
          ko: "팀장만 선택되어 있습니다. 실무 에이전트가 없으면 팀장이 직접 실행할 수 있습니다. 계속 진행할지 확인하세요.",
          en: "Only team leaders are selected. Without subordinate agents, team leaders may execute the task directly. Confirm before continuing.",
          ja: "Only team leaders are selected. Without subordinate agents, team leaders may execute the task directly. Confirm before continuing.",
          zh: "Only team leaders are selected. Without subordinate agents, team leaders may execute the task directly. Confirm before continuing.",
        });

  return (
    <div className="fixed inset-0 z-[61] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-amber-500/40 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-amber-500/30 px-4 py-3">
          <h3 className="text-sm font-semibold text-amber-200">
            {t({ ko: "수동 배정 확인", en: "Manual Assignment Check", ja: "Manual Assignment Check", zh: "Manual Assignment Check" })}
          </h3>
        </div>
        <div className="space-y-2 px-4 py-4">
          <p className="text-sm text-slate-100">{description}</p>
          <div className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-300">
            <p>{t({ ko: "선택 요약", en: "Selection Summary", ja: "Selection Summary", zh: "Selection Summary" })}: {stats.total}</p>
            <p>
              {t({ ko: "팀장", en: "Leaders", ja: "Leaders", zh: "Leaders" })}: {stats.leaders} ·{" "}
              {t({ ko: "실무 에이전트", en: "Subordinates", ja: "Subordinates", zh: "Subordinates" })}: {stats.subordinates}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            {t({ ko: "취소", en: "Cancel", ja: "Cancel", zh: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(warning)}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500"
          >
            {t({ ko: "계속 저장", en: "Save Anyway", ja: "Save Anyway", zh: "Save Anyway" })}
          </button>
        </div>
      </div>
    </div>
  );
}
