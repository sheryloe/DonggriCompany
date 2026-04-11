import type { PrnDraftResponse } from "../../types";

type Tr = (ko: string, en: string, ja?: string, zh?: string) => string;

interface PrnDraftModalProps {
  open: boolean;
  loading: boolean;
  draft: PrnDraftResponse | null;
  error: string | null;
  tr: Tr;
  onRegenerate: () => void;
  onSendDirective: () => void;
  onClose: () => void;
}

const SECTION_ORDER: Array<{
  key: keyof PrnDraftResponse["sections"];
  title: { ko: string; en: string; ja: string; zh: string };
}> = [
  { key: "background", title: { ko: "배경", en: "Background", ja: "背景", zh: "背景" } },
  { key: "goal", title: { ko: "목표", en: "Goal", ja: "目標", zh: "目标" } },
  { key: "non_goal", title: { ko: "비목표", en: "Non-goal", ja: "非目標", zh: "非目标" } },
  { key: "requirements", title: { ko: "핵심요구사항", en: "Requirements", ja: "主要要件", zh: "核心需求" } },
  {
    key: "acceptance_criteria",
    title: { ko: "수용기준", en: "Acceptance Criteria", ja: "受け入れ基準", zh: "验收标准" },
  },
  { key: "risks", title: { ko: "리스크", en: "Risks", ja: "リスク", zh: "风险" } },
  { key: "open_questions", title: { ko: "오픈질문", en: "Open Questions", ja: "未解決事項", zh: "开放问题" } },
];

export default function PrnDraftModal({
  open,
  loading,
  draft,
  error,
  tr,
  onRegenerate,
  onSendDirective,
  onClose,
}: PrnDraftModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl shadow-indigo-500/10">
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{tr("PRN 요구사항 초안", "PRN Draft", "PRN要件草案", "PRN需求草案")}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {tr(
                "대표 검토 후 지시 전송을 실행하세요.",
                "Review and send as directive.",
                "確認後に指示として送信してください。",
                "审核后可作为指令发送。",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            {tr("취소", "Cancel", "キャンセル", "取消")}
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-8 text-center text-sm text-slate-300">
              {tr("PRN 초안을 생성하는 중입니다...", "Generating PRN draft...", "PRN草案を生成中...", "正在生成 PRN 草案...")}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-700/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>
          ) : draft ? (
            <div className="space-y-3">
              {SECTION_ORDER.map((section) => (
                <div key={section.key} className="rounded-lg border border-slate-700/70 bg-slate-800/45 p-3">
                  <p className="text-xs font-semibold text-indigo-300">
                    {tr(section.title.ko, section.title.en, section.title.ja, section.title.zh)}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-100">
                    {draft.sections[section.key]}
                  </pre>
                </div>
              ))}

              <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-xs font-semibold text-emerald-300">{tr("지시문 초안", "Directive Text", "指示文草案", "指令草案")}</p>
                <pre className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-100">{draft.directive_text}</pre>
                <p className="mt-2 text-[11px] text-slate-400">
                  {tr("신뢰도", "Confidence", "信頼度", "置信度")}: {draft.confidence.toFixed(2)} /{" "}
                  {tr("폴백 사용", "Fallback used", "フォールバック使用", "是否回退")}:{" "}
                  {draft.generation_meta.fallback_used ? tr("예", "Yes", "はい", "是") : tr("아니오", "No", "いいえ", "否")}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-8 text-center text-sm text-slate-400">
              {tr("표시할 PRN 초안이 없습니다.", "No PRN draft available.", "表示できるPRN草案がありません。", "没有可显示的 PRN 草案。")}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/70 px-5 py-3">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading}
            className="rounded-lg border border-indigo-600/70 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-900/30 disabled:opacity-50"
          >
            {tr("초안 재생성", "Regenerate", "再生成", "重新生成")}
          </button>
          <button
            type="button"
            onClick={onSendDirective}
            disabled={loading || !draft}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {tr("지시 전송", "Send Directive", "指示送信", "发送指令")}
          </button>
        </div>
      </div>
    </div>
  );
}

