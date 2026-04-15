import type { MissingPathPrompt, ProjectI18nTranslate } from "./types";

interface MissingPathPromptDialogProps {
  prompt: MissingPathPrompt | null;
  t: ProjectI18nTranslate;
  saving: boolean;
  onCancel: () => void;
  onConfirmCreate: () => void;
}

export default function MissingPathPromptDialog({
  prompt,
  t,
  saving,
  onCancel,
  onConfirmCreate,
}: MissingPathPromptDialogProps) {
  if (!prompt) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">
            {t({
              ko: "프로젝트 경로 확인",
              en: "Confirm Project Path",
              ja: "Confirm Project Path",
              zh: "Confirm Project Path",
            })}
          </h3>
        </div>
        <div className="space-y-2 px-4 py-4">
          <p className="text-sm text-slate-200">
            {t({
              ko: "이 경로가 아직 없습니다. 지금 생성할까요?",
              en: "This path does not exist yet. Create it now?",
              ja: "This path does not exist yet. Create it now?",
              zh: "This path does not exist yet. Create it now?",
            })}
          </p>
          <p className="break-all rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-2 text-xs text-slate-200">
            {prompt.normalizedPath}
          </p>
          {prompt.nearestExistingParent && (
            <p className="text-xs text-slate-400">
              {t({ ko: "기준 폴더", en: "Base folder", ja: "Base folder", zh: "Base folder" })}:{" "}
              {prompt.nearestExistingParent}
            </p>
          )}
          {!prompt.canCreate && (
            <p className="text-xs text-amber-300">
              {t({
                ko: "현재 권한으로는 이 경로를 생성할 수 없습니다. 다른 경로를 선택하세요.",
                en: "This path is not creatable with current permissions. Choose another path.",
                ja: "This path is not creatable with current permissions. Choose another path.",
                zh: "This path is not creatable with current permissions. Choose another path.",
              })}
            </p>
          )}
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
            disabled={!prompt.canCreate || saving}
            onClick={onConfirmCreate}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t({ ko: "생성", en: "Create", ja: "Create", zh: "Create" })}
          </button>
        </div>
      </div>
    </div>
  );
}
