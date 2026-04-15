import type { ManualPathEntry, ProjectI18nTranslate } from "./types";

interface ManualPathPickerDialogProps {
  open: boolean;
  t: ProjectI18nTranslate;
  manualPathCurrent: string;
  manualPathParent: string | null;
  manualPathEntries: ManualPathEntry[];
  manualPathLoading: boolean;
  manualPathError: string | null;
  manualPathTruncated: boolean;
  onClose: () => void;
  onLoadEntries: (targetPath?: string) => Promise<void>;
  onSelectCurrent: () => void;
}

export default function ManualPathPickerDialog({
  open,
  t,
  manualPathCurrent,
  manualPathParent,
  manualPathEntries,
  manualPathLoading,
  manualPathError,
  manualPathTruncated,
  onClose,
  onLoadEntries,
  onSelectCurrent,
}: ManualPathPickerDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">
            {t({ ko: "인앱 폴더 탐색", en: "In-App Folder Browser", ja: "In-App Folder Browser", zh: "In-App Folder Browser" })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
            <p className="text-[11px] text-slate-400">
              {t({ ko: "현재 위치", en: "Current Location", ja: "Current Location", zh: "Current Location" })}
            </p>
            <p className="break-all text-xs text-slate-200">{manualPathCurrent || "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!manualPathParent || manualPathLoading}
              onClick={() => {
                if (!manualPathParent) return;
                void onLoadEntries(manualPathParent);
              }}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "상위 폴더", en: "Up", ja: "Up", zh: "Up" })}
            </button>
            <button
              type="button"
              disabled={manualPathLoading}
              onClick={() => void onLoadEntries(manualPathCurrent || undefined)}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh" })}
            </button>
          </div>
          <div className="max-h-[45dvh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50">
            {manualPathLoading ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                {t({ ko: "폴더 목록을 불러오는 중...", en: "Loading directories...", ja: "Loading directories...", zh: "Loading directories..." })}
              </p>
            ) : manualPathError ? (
              <p className="px-3 py-2 text-xs text-rose-300">{manualPathError}</p>
            ) : manualPathEntries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                {t({ ko: "선택 가능한 하위 폴더가 없습니다.", en: "No selectable subdirectories.", ja: "No selectable subdirectories.", zh: "No selectable subdirectories." })}
              </p>
            ) : (
              manualPathEntries.map((entry: ManualPathEntry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => void onLoadEntries(entry.path)}
                  className="w-full border-b border-slate-700/70 px-3 py-2 text-left transition hover:bg-slate-700/60"
                >
                  <p className="text-xs font-semibold text-slate-100">{entry.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{entry.path}</p>
                </button>
              ))
            )}
          </div>
          {manualPathTruncated && (
            <p className="text-[11px] text-slate-400">
              {t({ ko: "항목이 많아 상위 300개 폴더만 표시합니다.", en: "Only the first 300 directories are shown.", ja: "Only the first 300 directories are shown.", zh: "Only the first 300 directories are shown." })}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            {t({ ko: "취소", en: "Cancel", ja: "Cancel", zh: "Cancel" })}
          </button>
          <button
            type="button"
            disabled={!manualPathCurrent}
            onClick={onSelectCurrent}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t({ ko: "현재 폴더 선택", en: "Select Current Folder", ja: "Select Current Folder", zh: "Select Current Folder" })}
          </button>
        </div>
      </div>
    </div>
  );
}
