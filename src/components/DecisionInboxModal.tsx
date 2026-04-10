import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { pickLang } from "../i18n";
import type { Agent } from "../types";
import AgentAvatar, { buildSpriteMap } from "./AgentAvatar";
import MessageContent from "./MessageContent";
import type { DecisionInboxItem } from "./chat/decision-inbox";
import { formatDecisionInboxTime as formatTime, type DecisionInboxModalProps } from "./chat/decision-inbox-modal.meta";

function verdictLabel(
  verdict: "approved" | "hold" | "rejected",
  uiLanguage: UiLanguage,
): { text: string; className: string } {
  if (verdict === "approved") {
    return {
      text: pickLang(uiLanguage, { ko: "승인", en: "Approved", ja: "承認", zh: "通过" }),
      className: "text-emerald-300",
    };
  }
  if (verdict === "rejected") {
    return {
      text: pickLang(uiLanguage, { ko: "거절", en: "Rejected", ja: "却下", zh: "拒绝" }),
      className: "text-rose-300",
    };
  }
  return {
    text: pickLang(uiLanguage, { ko: "보류", en: "Hold", ja: "保留", zh: "保留" }),
    className: "text-amber-300",
  };
}

function findOption(item: DecisionInboxItem, action: string): { number: number; label: string; action?: string } | null {
  return item.options.find((option) => option.action === action) ?? null;
}

export default function DecisionInboxModal({
  open,
  loading,
  items,
  agents,
  busyKey,
  uiLanguage,
  onClose,
  onRefresh,
  onReplyOption,
  onOpenChat,
}: DecisionInboxModalProps) {
  const t = (text: { ko: string; en: string; ja?: string; zh?: string }) => pickLang(uiLanguage, text);
  const isKorean = uiLanguage.startsWith("ko");
  const spriteMap = useMemo(() => buildSpriteMap(agents), [agents]);
  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents) map.set(agent.id, agent);
    return map;
  }, [agents]);

  const [followupTarget, setFollowupTarget] = useState<{ itemId: string; optionNumber: number } | null>(null);
  const [followupDraft, setFollowupDraft] = useState("");
  const [selectedFeedbackDraftByItem, setSelectedFeedbackDraftByItem] = useState<Record<string, string>>({});
  const [selectedFeedbackNumbersByItem, setSelectedFeedbackNumbersByItem] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!open) {
      setFollowupTarget(null);
      setFollowupDraft("");
      setSelectedFeedbackDraftByItem({});
      setSelectedFeedbackNumbersByItem({});
      return;
    }
    if (!followupTarget) return;
    if (!items.some((entry) => entry.id === followupTarget.itemId)) {
      setFollowupTarget(null);
      setFollowupDraft("");
    }
  }, [open, followupTarget, items]);

  useEffect(() => {
    const keep = new Set(items.map((item) => item.id));
    setSelectedFeedbackDraftByItem((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const [itemId, value] of Object.entries(prev)) {
        if (!keep.has(itemId)) {
          changed = true;
          continue;
        }
        next[itemId] = value;
      }
      return changed ? next : prev;
    });
    setSelectedFeedbackNumbersByItem((prev) => {
      const next: Record<string, number[]> = {};
      let changed = false;
      for (const [itemId, value] of Object.entries(prev)) {
        if (!keep.has(itemId)) {
          changed = true;
          continue;
        }
        next[itemId] = value;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const followupItem = useMemo(
    () => (followupTarget ? (items.find((entry) => entry.id === followupTarget.itemId) ?? null) : null),
    [followupTarget, items],
  );
  const followupBusyKey = followupTarget ? `${followupTarget.itemId}:${followupTarget.optionNumber}` : null;
  const isFollowupSubmitting = followupBusyKey ? busyKey === followupBusyKey : false;
  const canSubmitFollowup = Boolean(followupItem && followupDraft.trim() && !isFollowupSubmitting);

  function handleOptionClick(item: DecisionInboxItem, optionNumber: number, action?: string) {
    if (action === "add_followup_request") {
      setFollowupTarget({ itemId: item.id, optionNumber });
      setFollowupDraft("");
      return;
    }
    onReplyOption(item, optionNumber);
  }

  function handleSubmitFollowup() {
    if (!followupItem || !followupTarget) return;
    const note = followupDraft.trim();
    if (!note) return;
    onReplyOption(followupItem, followupTarget.optionNumber, { note });
    setFollowupTarget(null);
    setFollowupDraft("");
  }

  function handleCancelFollowup() {
    setFollowupTarget(null);
    setFollowupDraft("");
  }

  function setSelectedFeedbackDraft(itemId: string, value: string) {
    setSelectedFeedbackDraftByItem((prev) => ({ ...prev, [itemId]: value }));
  }

  function toggleSelectedFeedbackNumber(itemId: string, number: number) {
    setSelectedFeedbackNumbersByItem((prev) => {
      const current = prev[itemId] ?? [];
      const exists = current.includes(number);
      const nextNumbers = exists ? current.filter((entry) => entry !== number) : [...current, number].sort((a, b) => a - b);
      return { ...prev, [itemId]: nextNumbers };
    });
  }

  function submitApplySelected(item: DecisionInboxItem) {
    const option = findOption(item, "apply_selected_feedback") ?? findOption(item, "apply_review_pick");
    if (!option) return;
    const selectedFeedbackNumbers = selectedFeedbackNumbersByItem[item.id] ?? [];
    const note = (selectedFeedbackDraftByItem[item.id] ?? "").trim();
    if (selectedFeedbackNumbers.length <= 0 && !note) {
      window.alert(
        t({
          ko: "선택 반영은 항목 선택 또는 메모 입력이 필요합니다.",
          en: "Apply Selected requires selected feedback or a note.",
          ja: "Apply Selected には選択項目またはメモが必要です。",
          zh: "Apply Selected 需要选择项或备注。",
        }),
      );
      return;
    }
    onReplyOption(item, option.number, {
      ...(selectedFeedbackNumbers.length > 0 ? { selected_feedback_numbers: selectedFeedbackNumbers } : {}),
      ...(note ? { note } : {}),
    });
    setSelectedFeedbackDraftByItem((prev) => ({ ...prev, [item.id]: "" }));
    setSelectedFeedbackNumbersByItem((prev) => ({ ...prev, [item.id]: [] }));
  }

  const getKindLabel = (kind: DecisionInboxItem["kind"]) => {
    if (kind === "project_review_ready") {
      return t({ ko: "프로젝트 의사결정", en: "Project Decision", ja: "プロジェクト意思決定", zh: "项目决策" });
    }
    if (kind === "task_timeout_resume") {
      return t({ ko: "중단 작업 재개", en: "Timeout Resume", ja: "中断タスク再開", zh: "超时恢复" });
    }
    if (kind === "review_round_pick") {
      return t({ ko: "리뷰 라운드 의사결정", en: "Review Round Decision", ja: "レビュー判定", zh: "评审决策" });
    }
    return t({ ko: "에이전트 요청", en: "Agent Request", ja: "エージェント要請", zh: "代理请求" });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-3xl rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl shadow-indigo-500/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{t({ ko: "미결 의사결정", en: "Pending Decisions", ja: "未決定", zh: "待决事项" })}</h2>
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {t({ ko: "미결 목록 불러오는 중...", en: "Loading pending decisions...", ja: "読み込み中...", zh: "正在加载..." })}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {t({ ko: "현재 미결 의사결정이 없습니다.", en: "No pending decisions right now.", ja: "未決定はありません。", zh: "当前没有待决事项。" })}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const agent = item.agentId ? agentById.get(item.agentId) : undefined;
                const applyAllOption = findOption(item, "apply_all_feedback");
                const applySelectedOption = findOption(item, "apply_selected_feedback") ?? findOption(item, "apply_review_pick");
                const proceedOption = findOption(item, "proceed_final_verdict") ?? findOption(item, "skip_to_next_round");
                const selectedDraft = selectedFeedbackDraftByItem[item.id] ?? "";
                const selectedFeedbackNumbers = selectedFeedbackNumbersByItem[item.id] ?? [];
                const optionNotes = Array.isArray(item.optionNotes) ? item.optionNotes : [];
                const isItemBusy = Boolean(busyKey?.startsWith(`${item.id}:`));

                return (
                  <div key={item.id} className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {agent ? (
                          <AgentAvatar
                            agent={agent}
                            spriteMap={spriteMap}
                            size={32}
                            className="mt-0.5 border border-slate-600 bg-slate-900"
                          />
                        ) : (
                          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-base">
                            {item.agentAvatar || "•"}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{isKorean ? item.agentNameKo : item.agentName}</p>
                          <p className="text-[11px] text-indigo-300/90">{getKindLabel(item.kind)}</p>
                          <p className="text-[11px] text-slate-400">{formatTime(item.createdAt, uiLanguage)}</p>
                        </div>
                      </div>
                      {item.agentId ? (
                        <button
                          onClick={() => onOpenChat(item.agentId!)}
                          className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          {t({ ko: "채팅 열기", en: "Open Chat", ja: "チャット", zh: "打开聊天" })}
                        </button>
                      ) : null}
                    </div>

                    {item.kind === "review_round_pick" ? (
                      <div className="mb-2 rounded-md border border-slate-700/70 bg-slate-900/50 px-2.5 py-2 text-[11px] text-slate-300">
                        <p>
                          {t({ ko: "Blocker", en: "Blocker", ja: "Blocker", zh: "Blocker" })}:{" "}
                          <span className="font-semibold text-amber-300">{item.blockerCount ?? 0}</span>
                          {typeof item.blockerDelta === "number" ? (
                            <span className="ml-2 text-slate-400">
                              ({item.blockerDelta > 0 ? "+" : ""}
                              {item.blockerDelta})
                            </span>
                          ) : null}
                        </p>
                        {item.reviewerVerdicts && item.reviewerVerdicts.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {item.reviewerVerdicts.map((verdict, index) => {
                              const badge = verdictLabel(verdict.finalVerdict, uiLanguage);
                              return (
                                <div key={`${item.id}:reviewer:${index}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="text-slate-200">{isKorean ? verdict.agentNameKo || verdict.agentName : verdict.agentName || verdict.agentNameKo || "Reviewer"}</span>
                                  <span className={`font-semibold ${badge.className}`}>{badge.text}</span>
                                  <span className="text-slate-400">{verdict.lens || "general"}</span>
                                  <span className="text-slate-500">c={verdict.confidence.toFixed(2)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2.5 py-2 text-xs text-slate-200">
                      <MessageContent content={item.requestContent} />
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {item.kind === "review_round_pick" ? (
                        <div className="space-y-2">
                          {applyAllOption ? (
                            <button
                              type="button"
                              onClick={() => onReplyOption(item, applyAllOption.number)}
                              disabled={isItemBusy}
                              className="decision-inbox-option w-full rounded-md px-2.5 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {`${applyAllOption.number}. ${applyAllOption.label}`}
                            </button>
                          ) : null}

                          {applySelectedOption ? (
                            <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-900/40 p-2.5">
                              <p className="text-[11px] text-slate-300">
                                {`${applySelectedOption.number}. ${applySelectedOption.label}`}
                              </p>
                              {optionNotes.length > 0 ? (
                                <div className="space-y-1 rounded-md border border-slate-700/70 bg-slate-950/60 p-2">
                                  <p className="text-[11px] text-slate-400">
                                    {t({
                                      ko: "반영할 검토 항목",
                                      en: "Feedback to apply",
                                      ja: "反映するレビュー項目",
                                      zh: "要采纳的评审项",
                                    })}
                                  </p>
                                  <div className="space-y-1">
                                    {optionNotes.map((note, noteIndex) => {
                                      const number = noteIndex + 1;
                                      const checked = selectedFeedbackNumbers.includes(number);
                                      return (
                                        <label
                                          key={`${item.id}:note:${number}`}
                                          className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700/60 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleSelectedFeedbackNumber(item.id, number)}
                                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-500 bg-slate-950 text-indigo-400"
                                          />
                                          <span className="shrink-0 text-indigo-300">{number}.</span>
                                          <span className="min-w-0 flex-1 break-words">{note}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                              <textarea
                                value={selectedDraft}
                                onChange={(event) => setSelectedFeedbackDraft(item.id, event.target.value)}
                                rows={2}
                                placeholder={t({
                                  ko: "추가 메모(선택)",
                                  en: "Additional note (optional)",
                                  ja: "追加メモ（任意）",
                                  zh: "补充备注（可选）",
                                })}
                                className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => submitApplySelected(item)}
                                disabled={isItemBusy}
                                className="decision-round-submit rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t({ ko: "선택 반영 실행", en: "Run Apply Selected", ja: "選択反映実行", zh: "执行选择采纳" })}
                              </button>
                            </div>
                          ) : null}

                          {proceedOption ? (
                            <button
                              type="button"
                              onClick={() => onReplyOption(item, proceedOption.number)}
                              disabled={isItemBusy}
                              className="decision-round-skip rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {`${proceedOption.number}. ${proceedOption.label}`}
                            </button>
                          ) : null}
                        </div>
                      ) : item.options.length > 0 ? (
                        item.options.map((option) => {
                          const key = `${item.id}:${option.number}`;
                          const isBusy = busyKey === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleOptionClick(item, option.number, option.action)}
                              disabled={isBusy}
                              className="decision-inbox-option w-full rounded-md px-2.5 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isBusy ? t({ ko: "전송 중...", en: "Sending...", ja: "送信中...", zh: "发送中..." }) : `${option.number}. ${option.label}`}
                            </button>
                          );
                        })
                      ) : (
                        <p className="rounded-md border border-slate-700/70 bg-slate-900/50 px-2.5 py-2 text-xs text-slate-400">
                          {t({ ko: "선택지 준비 중...", en: "Options are being prepared...", ja: "オプション準備中...", zh: "选项准备中..." })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {followupItem ? (
          <div className="border-t border-slate-700/60 bg-slate-900/90 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-slate-200">
              {t({ ko: "추가 요청 입력", en: "Additional Request", ja: "追加依頼", zh: "补充请求" })}
            </p>
            <textarea
              value={followupDraft}
              onChange={(event) => setFollowupDraft(event.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelFollowup}
                disabled={isFollowupSubmitting}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
              </button>
              <button
                type="button"
                onClick={handleSubmitFollowup}
                disabled={!canSubmitFollowup}
                className="decision-followup-submit rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFollowupSubmitting
                  ? t({ ko: "전송 중...", en: "Sending...", ja: "送信中...", zh: "发送中..." })
                  : t({ ko: "요청 등록", en: "Submit Request", ja: "依頼登録", zh: "提交请求" })}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
