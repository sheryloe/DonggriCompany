import type { Lang } from "../../../../types/lang.ts";
import type { MeetingTranscriptEntry } from "./minutes.ts";

type OutcomeContext = any;

const REVIEW_DECISION_PENDING_LOG_PREFIX = "Decision inbox: review decision pending";

type FollowUpAlias = {
  requiresJulesAction?: boolean;
  requiresFollowUp?: boolean;
  requires_jules_action?: boolean;
  requires_follow_up?: boolean;
};

function readRequiresFollowUpFlag(value?: FollowUpAlias): boolean {
  if (!value) return false;
  return (
    value.requiresJulesAction === true ||
    value.requiresFollowUp === true ||
    value.requires_jules_action === true ||
    value.requires_follow_up === true
  );
}

export async function processReviewConsensusOutcome(ctx: OutcomeContext): Promise<boolean> {
  const {
    taskId,
    taskTitle,
    round,
    roundMode,
    isRound1Remediation,
    isRound2Merge,
    isFinalDecisionRound,
    structuredReviewByAgent,
    leaders,
    transcript,
    lang,
    workflowPackKey,
    meetingId,
    onApproved,
    abortIfInactive,
    meetingReviewDecisionByAgent,
    findLatestTranscriptContentByAgent,
    isDeferrableReviewHold,
    summarizeForMeetingBubble,
    getDeptName,
    getAgentDisplayName,
    appendTaskLog,
    REVIEW_MAX_REVISION_SIGNALS_PER_ROUND,
    REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND,
    appendTaskProjectMemo,
    sleepMs,
    randomDelay,
    collectRevisionMemoItems,
    REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
    REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
    reserveReviewRevisionMemoItems,
    loadRecentReviewRevisionMemoItems,
    pickL,
    l,
    db,
    REVIEW_MAX_REMEDIATION_REQUESTS,
    notifyCeo,
    broadcast,
    notifyTaskStatus,
    finishMeetingMinutes,
    dismissLeadersFromCeoOffice,
    reviewRoundState,
    reviewInFlight,
    appendTaskReviewFinalMemo,
    scheduleNextReviewRound,
  } = ctx;

  // Final review result should follow each leader's last approval statement,
  // not stale "needs revision" flags from earlier feedback turns.
  const structuredFeedbackMap: Map<string, any> =
    structuredReviewByAgent instanceof Map ? structuredReviewByAgent : new Map<string, any>();
  const finalHoldLeaders: any[] = [];
  const deferredMonitoringLeaders: any[] = [];
  const deferredMonitoringNotes: string[] = [];
  const finalHoldDeptCount = new Map<string, number>();
  for (const leader of leaders as any[]) {
    const structured = structuredFeedbackMap.get(leader.id) as
      | {
          pass1?: string;
          pass2?: string;
          finalVerdict?: string;
          blockingItems?: string[];
          requiresJulesAction?: boolean;
          requiresFollowUp?: boolean;
          requires_jules_action?: boolean;
          requires_follow_up?: boolean;
        }
      | undefined;
    const latestDecision = meetingReviewDecisionByAgent.get(leader.id);
    let hasStructuredBlocker = structured
      ? String(structured.finalVerdict ?? "").toLowerCase() !== "approved" ||
        (Array.isArray(structured.blockingItems) && structured.blockingItems.length > 0) ||
        readRequiresFollowUpFlag(structured)
      : false;
    if (latestDecision === "approved") {
      hasStructuredBlocker = false;
    } else if (latestDecision === "hold") {
      hasStructuredBlocker = true;
    }
    if (!structured && meetingReviewDecisionByAgent.get(leader.id) !== "hold") continue;
    if (structured && !hasStructuredBlocker) continue;
    const latestDecisionLine =
      structured && (structured.pass2 || structured.pass1)
        ? `${String(structured.pass2 ?? "").trim()} ${String(structured.pass1 ?? "").trim()}`.trim()
        : findLatestTranscriptContentByAgent(transcript as MeetingTranscriptEntry[], leader.id);
    if (isDeferrableReviewHold(latestDecisionLine)) {
      const clipped = summarizeForMeetingBubble(latestDecisionLine, 160, lang as Lang);
      deferredMonitoringLeaders.push(leader);
      deferredMonitoringNotes.push(
        `${getDeptName(leader.department_id ?? "", workflowPackKey)} ${getAgentDisplayName(leader, lang)}: ${clipped}`,
      );
      appendTaskLog(
        taskId,
        "system",
        `Review round ${round}: converted deferrable hold to post-merge monitoring (${leader.id})`,
      );
      continue;
    }
    if (finalHoldLeaders.length >= REVIEW_MAX_REVISION_SIGNALS_PER_ROUND) {
      appendTaskLog(
        taskId,
        "system",
        `Review round ${round}: hold signal ignored (round cap ${REVIEW_MAX_REVISION_SIGNALS_PER_ROUND})`,
      );
      continue;
    }
    const deptKey = leader.department_id ?? `agent:${leader.id}`;
    const deptCount = finalHoldDeptCount.get(deptKey) ?? 0;
    if (deptCount >= REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND) {
      appendTaskLog(
        taskId,
        "system",
        `Review round ${round}: hold signal ignored for dept ${deptKey} (dept cap ${REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND})`,
      );
      continue;
    }
    finalHoldDeptCount.set(deptKey, deptCount + 1);
    finalHoldLeaders.push(leader);
  }
  const needsRevision = finalHoldLeaders.length > 0;
  if (!needsRevision && deferredMonitoringNotes.length > 0) {
    appendTaskProjectMemo(taskId, "review", round, deferredMonitoringNotes, lang);
    appendTaskLog(
      taskId,
      "system",
      `Review round ${round}: deferred ${deferredMonitoringLeaders.length} hold opinions to SLA monitoring checklist`,
    );
  }

  await sleepMs(randomDelay(540, 920));
  if (abortIfInactive()) return true;

  if (needsRevision) {
    if (isFinalDecisionRound) {
      const escalatedAt = Date.now();
      db.prepare("UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'review'").run(
        escalatedAt,
        taskId,
      );
      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      if (typeof broadcast === "function") {
        broadcast("task_update", updatedTask);
      }
      if (typeof notifyTaskStatus === "function") {
        notifyTaskStatus(taskId, taskTitle, "pending", lang as Lang);
      }
      appendTaskLog(
        taskId,
        "system",
        `Review consensus round ${round}: blocker remains in final round, reject and escalate`,
      );
      notifyCeo(
        pickL(
          l(
            [
              `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 종료 시점에도 blocker가 남아 있어 승인 거절 및 에스컬레이션으로 종료합니다.`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' still has blocker(s) at the end of final review round ${round}. Closing as reject + escalation.`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' は最終レビューラウンド ${round} 終了時点でも blocker が残っているため、承認拒否 + エスカレーションで終了します。`,
            ],
            [`[CEO OFFICE] '${taskTitle}' 在最终评审轮次 ${round} 结束时仍存在 blocker，已按拒绝批准并升级处理结束。`],
          ),
          lang,
        ),
        taskId,
      );
      if (meetingId) finishMeetingMinutes(meetingId, "failed");
      dismissLeadersFromCeoOffice(taskId, leaders);
      reviewRoundState.delete(taskId);
      reviewInFlight.delete(taskId);
      return true;
    }

    const rawMemoItems = collectRevisionMemoItems(
      transcript as MeetingTranscriptEntry[],
      REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
      REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
    );
    const { freshItems, duplicateCount } = reserveReviewRevisionMemoItems(taskId, round, rawMemoItems);
    const hasFreshMemoItems = freshItems.length > 0;
    const fallbackMemoItem = pickL(
      l(
        [
          "리뷰 보완 요청이 감지되었습니다. 합의된 품질 게이트 기준으로 잔여 리스크를 문서화하고 최종 결정이 필요합니다.",
        ],
        [
          "A review hold signal was detected. Document residual risks against agreed quality gates and move to a final decision.",
        ],
        [
          "レビュー保留シグナルを検知しました。合意済み品質ゲート基準で残余リスクを文書化し、最終決定が必要です。",
        ],
        ["检测到评审保留信号。请按既定质量门禁记录剩余风险，并进入最终决策。"],
      ),
      lang,
    );
    const memoItemsForAction = hasFreshMemoItems ? freshItems : [fallbackMemoItem];
    const recentMemoItems = hasFreshMemoItems ? [] : loadRecentReviewRevisionMemoItems(taskId, 4);
    const memoItemsForProject = hasFreshMemoItems
      ? freshItems
      : recentMemoItems.length > 0
        ? recentMemoItems
        : memoItemsForAction;
    appendTaskProjectMemo(taskId, "review", round, memoItemsForProject, lang);

    appendTaskLog(
      taskId,
      "system",
      `Review consensus round ${round}: revision requested (mode=${roundMode}, new_items=${freshItems.length}, duplicates=${duplicateCount})`,
    );

    const remediationRequestCountRow = db
      .prepare(
        `
          SELECT COUNT(*) AS cnt
          FROM meeting_minutes
          WHERE task_id = ?
            AND meeting_type = 'review'
            AND status = 'revision_requested'
        `,
      )
      .get(taskId) as { cnt: number } | undefined;
    const remediationRequestCount = remediationRequestCountRow?.cnt ?? 0;
    const remediationLimitReached = remediationRequestCount >= REVIEW_MAX_REMEDIATION_REQUESTS;

    if ((isRound1Remediation || isRound2Merge) && !remediationLimitReached) {
      const nextRound = round + 1;
      appendTaskLog(
        taskId,
        "system",
        `${REVIEW_DECISION_PENDING_LOG_PREFIX} (round=${round}, options=${memoItemsForAction.length})`,
      );
      notifyCeo(
        pickL(
          l(
            [
              `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}에서 팀장 보완 의견이 취합되었습니다. Decision Inbox에서 항목을 복수 선택(체리픽)하고 필요 시 추가 메모를 입력해 보완 작업을 진행하거나, 다음 라운드(${nextRound})로 SKIP을 선택해 주세요.`,
            ],
            [
              `[CEO OFFICE] Team-lead remediation opinions for '${taskTitle}' in review round ${round} are consolidated. In Decision Inbox, cherry-pick multiple items and optionally add an extra note for remediation, or skip to round ${nextRound}.`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' のレビューラウンド ${round} でチームリードの補完意見が集約されました。Decision Inbox で複数項目を選択（cherry-pick）し、必要に応じて追加メモを入力して補完作業を進めるか、次ラウンド（${nextRound}）へ SKIP を選択してください。`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' 在评审轮次 ${round} 的组长补充意见已汇总。请在 Decision Inbox 中多选条目（cherry-pick）并按需补充备注推进整改，或选择 SKIP 进入下一轮（${nextRound}）。`,
            ],
          ),
          lang,
        ),
        taskId,
      );
      if (meetingId) finishMeetingMinutes(meetingId, "revision_requested");
      dismissLeadersFromCeoOffice(taskId, leaders);
      reviewRoundState.delete(taskId);
      reviewInFlight.delete(taskId);
      return true;
    }

    if ((isRound1Remediation || isRound2Merge) && remediationLimitReached) {
      appendTaskLog(
        taskId,
        "system",
        `Review consensus round ${round}: remediation request cap reached (${REVIEW_MAX_REMEDIATION_REQUESTS}/task), skipping additional remediation`,
      );
      notifyCeo(
        pickL(
          l(
            [
              `[CEO OFFICE] '${taskTitle}' 보완 요청은 태스크당 최대 ${REVIEW_MAX_REMEDIATION_REQUESTS}회로 제한되어 있어 추가 보완 생성 없이 최종 판단 단계로 전환합니다.`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' reached the remediation-request cap (${REVIEW_MAX_REMEDIATION_REQUESTS} per task). Skipping additional remediation and moving to final decision.`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' は補完要求上限（タスク当たり ${REVIEW_MAX_REMEDIATION_REQUESTS} 回）に到達したため、追加補完なしで最終判断へ移行します。`,
            ],
            [
              `[CEO OFFICE] '${taskTitle}' 已达到补充整改上限（每个任务 ${REVIEW_MAX_REMEDIATION_REQUESTS} 次），将不再追加整改并转入最终决策。`,
            ],
          ),
          lang,
        ),
        taskId,
      );
    }

    const forceReason = isRound2Merge ? "round2_no_more_remediation_allowed" : `round${round}_finalization`;
    appendTaskLog(
      taskId,
      "system",
      `Review consensus round ${round}: forcing finalization with documented residual risk (${forceReason})`,
    );

    appendTaskReviewFinalMemo(taskId, round, transcript as MeetingTranscriptEntry[], lang, true);
    notifyCeo(
      pickL(
        l(
          [
            `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}에서 잔여 리스크를 최종 문서에 반영했습니다. 추가 보완 없이 최종 승인 판단으로 종료합니다.`,
          ],
          [
            `[CEO OFFICE] In review round ${round} for '${taskTitle}', residual risks were embedded in the final document package. Closing with final approval decision and no further remediation.`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' のレビューラウンド ${round} で残余リスクを最終文書に反映しました。追加補完なしで最終承認判断に進みます。`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' 在评审轮次 ${round} 已将剩余风险写入最终文档。将不再追加整改并直接进入最终批准判断。`,
          ],
        ),
        lang,
      ),
      taskId,
    );
    if (meetingId) finishMeetingMinutes(meetingId, "completed");
    dismissLeadersFromCeoOffice(taskId, leaders);
    reviewRoundState.delete(taskId);
    reviewInFlight.delete(taskId);
    onApproved();
    return true;
  }

  if (deferredMonitoringLeaders.length > 0) {
    notifyCeo(
      pickL(
        l(
          [
            `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}에서 ${deferredMonitoringLeaders.length}건의 보류 의견이 'MVP 범위 외 + SLA 모니터링 전환'으로 분류되어 코드 병합 후 체크리스트로 이관됩니다.`,
          ],
          [
            `[CEO OFFICE] In review round ${round} for '${taskTitle}', ${deferredMonitoringLeaders.length} hold opinions were classified as MVP-out-of-scope and moved to post-merge SLA monitoring checklist.`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' のレビューラウンド ${round} で ${deferredMonitoringLeaders.length} 件の保留意見が 'MVP 範囲外 + SLA 監視' に分類され、コードマージ後チェックリストへ移管されます。`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' 在评审轮次 ${round} 中有 ${deferredMonitoringLeaders.length} 条保留意见被归类为 '超出 MVP 范围 + SLA 监控'，将于代码合并后转入检查清单。`,
          ],
        ),
        lang,
      ),
      taskId,
    );
  }

  if (isRound2Merge) {
    appendTaskLog(taskId, "system", `Review consensus round ${round}: merge consolidation complete`);
    notifyCeo(
      pickL(
        l(
          [
            `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 취합/머지 검토가 완료되었습니다. 라운드 3 최종 승인 회의로 전환합니다.`,
          ],
          [
            `[CEO OFFICE] Review round ${round} consolidation/merge review for '${taskTitle}' is complete. Moving to round 3 final approval.`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' のレビューラウンド ${round} の集約/マージ検討が完了しました。ラウンド 3 の最終承認会議へ移行します。`,
          ],
          [`[CEO OFFICE] '${taskTitle}' 在评审轮次 ${round} 的汇总/合并审查已完成，现转入第 3 轮最终批准会议。`],
        ),
        lang,
      ),
      taskId,
    );
    if (meetingId) finishMeetingMinutes(meetingId, "completed");
    dismissLeadersFromCeoOffice(taskId, leaders);
    reviewRoundState.delete(taskId);
    reviewInFlight.delete(taskId);
    scheduleNextReviewRound(taskId, taskTitle, round, lang);
    return true;
  }

  appendTaskLog(taskId, "system", `Review consensus round ${round}: all leaders approved`);
  if (isFinalDecisionRound) {
    appendTaskReviewFinalMemo(
      taskId,
      round,
      transcript as MeetingTranscriptEntry[],
      lang,
      deferredMonitoringLeaders.length > 0,
    );
  }
  notifyCeo(
    pickL(
      l(
        [`[CEO OFFICE] '${taskTitle}' 전원 Approved 완료. Done 단계로 진행합니다.`],
        [`[CEO OFFICE] '${taskTitle}' is approved by all leaders. Proceeding to Done.`],
        [`[CEO OFFICE] '${taskTitle}' は全員 Approved 完了。Done 段階へ進みます。`],
        [`[CEO OFFICE] '${taskTitle}' 已完成全员 Approved，进入 Done 阶段。`],
      ),
      lang,
    ),
    taskId,
  );
  if (meetingId) finishMeetingMinutes(meetingId, "completed");
  dismissLeadersFromCeoOffice(taskId, leaders);
  reviewRoundState.delete(taskId);
  reviewInFlight.delete(taskId);
  onApproved();
  return true;
}
