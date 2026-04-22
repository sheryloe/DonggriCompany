import { useI18n } from "../../i18n";
import GitHubDeviceConnect from "../github-import/GitHubDeviceConnect";
import type { GitHubGateReason } from "./github-project-flow";

interface GitHubConnectionDialogProps {
  reason: GitHubGateReason;
  onConnected: () => void;
  onCancel: () => void;
  zIndexClass?: string;
}

export default function GitHubConnectionDialog({
  reason,
  onConnected,
  onCancel,
  zIndexClass = "z-[70]",
}: GitHubConnectionDialogProps) {
  const { t } = useI18n();

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/70 p-4`} onClick={onCancel}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">
            {t({
              ko: "GitHub 연결 필요",
              en: "GitHub Connection Required",
              ja: "GitHub Connection Required",
              zh: "GitHub Connection Required",
            })}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            {t({ ko: "닫기", en: "Close", ja: "Close", zh: "Close" })}
          </button>
        </div>
        <GitHubDeviceConnect reason={reason} onConnected={onConnected} onCancel={onCancel} />
      </div>
    </div>
  );
}
