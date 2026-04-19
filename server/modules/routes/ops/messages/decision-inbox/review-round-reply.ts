import type { ReviewRoundReplyInput } from "./types.ts";

function normalizeNote(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBlockingItems(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const normalized = normalizeNote(item);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out;
  } catch {
    return [];
  }
}

function collectRoundFeedbackNotes(
  db: ReviewRoundReplyInput["deps"]["db"],
  taskId: string,
  meetingId: string,
  reviewRound: number,
): string[] {
  let rows: Array<{
    pass2: string | null;
    final_verdict: string | null;
    blocking_items_json: string | null;
    requires_jules_action: number | null;
  }> = [];
  try {
    rows = db
      .prepare(
        `
      SELECT pass2, final_verdict, blocking_items_json, requires_jules_action
      FROM review_round_feedback_items
      WHERE task_id = ?
        AND meeting_id = ?
        AND round = ?
      ORDER BY id ASC
    `,
      )
      .all(taskId, meetingId, reviewRound) as Array<{
      pass2: string | null;
      final_verdict: string | null;
      blocking_items_json: string | null;
      requires_jules_action: number | null;
    }>;
  } catch {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const normalized = normalizeNote(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };
  for (const row of rows) {
    const verdict = String(row.final_verdict ?? "").toLowerCase();
    const requiresFollowUp = Number(row.requires_jules_action ?? 0) === 1;
    const blockingItems = parseBlockingItems(row.blocking_items_json);
    const hasBlocker = verdict !== "approved" || requiresFollowUp || blockingItems.length > 0;
    if (!hasBlocker) continue;
    for (const item of blockingItems) push(item);
    push(row.pass2);
    if (out.length >= 12) break;
  }
  return out.slice(0, 12);
}

export function handleReviewRoundDecisionReply(input: ReviewRoundReplyInput): boolean {
  const { req, res, currentItem, selectedOption, optionNumber, deps } = input;
  if (currentItem.kind !== "review_round_pick") return false;

  const {
    db,
    l,
    pickL,
    nowMs,
    resolveLang,
    normalizeTextField,
    appendTaskLog,
    processSubtaskDelegations,
    seedReviewRevisionSubtasks,
    scheduleNextReviewRound,
    getProjectReviewDecisionState,
    getReviewDecisionNotes,
    getReviewDecisionFallbackLabel,
    recordProjectReviewDecisionEvent,
    openSupplementRound,
    REVIEW_DECISION_RESOLVED_LOG_PREFIX,
  } = deps;

  const taskId = currentItem.task_id;
  const meetingId = normalizeTextField(currentItem.meeting_id);
  if (!taskId || !meetingId) {
    res.status(400).json({ error: "task_or_meeting_required" });
    return true;
  }

  const task = db
    .prepare(
      `
      SELECT id, title, status, project_id, department_id, assigned_agent_id, description
      FROM tasks
      WHERE id = ?
    `,
    )
    .get(taskId) as
    | {
        id: string;
        title: string;
        status: string;
        project_id: string | null;
        department_id: string | null;
        assigned_agent_id: string | null;
        description: string | null;
      }
    | undefined;
  if (!task) {
    res.status(404).json({ error: "task_not_found" });
    return true;
  }
  if (task.status !== "review") {
    res.status(409).json({ error: "task_not_in_review", status: task.status });
    return true;
  }

  const meeting = db
    .prepare(
      `
      SELECT id, round, status
      FROM meeting_minutes
      WHERE id = ?
        AND task_id = ?
        AND meeting_type = 'review'
    `,
    )
    .get(meetingId, taskId) as
    | {
        id: string;
        round: number;
        status: string;
      }
    | undefined;
  if (!meeting) {
    res.status(404).json({ error: "meeting_not_found" });
    return true;
  }
  if (meeting.status !== "revision_requested") {
    res.status(409).json({ error: "meeting_not_pending", status: meeting.status });
    return true;
  }

  const reviewRound = Number.isFinite(meeting.round) ? Math.max(1, Math.trunc(meeting.round)) : 1;
  const lang = resolveLang(task.description ?? task.title);
  const resolvedProjectId = normalizeTextField(currentItem.project_id) ?? normalizeTextField(task.project_id);
  const decisionSnapshotHash = resolvedProjectId
    ? (getProjectReviewDecisionState(resolvedProjectId)?.snapshot_hash ?? null)
    : null;

  const baseNotesRaw = getReviewDecisionNotes(taskId, reviewRound, 6);
  const baseNotes = baseNotesRaw.length > 0 ? baseNotesRaw : [getReviewDecisionFallbackLabel(lang)];
  const feedbackNotes = collectRoundFeedbackNotes(db, taskId, meetingId, reviewRound);
  const candidateNotes = feedbackNotes.length > 0 ? feedbackNotes : baseNotes;

  const selectedActionRaw = String(selectedOption.action ?? "").trim();
  const selectedAction =
    selectedActionRaw === "apply_review_pick"
      ? "apply_selected_feedback"
      : selectedActionRaw === "skip_to_next_round"
        ? "proceed_final_verdict"
        : selectedActionRaw;
  const payloadFeedbackNumbers: unknown[] = Array.isArray(req.body?.selected_feedback_numbers)
    ? (req.body.selected_feedback_numbers as unknown[])
    : Array.isArray(req.body?.selected_option_numbers)
      ? (req.body.selected_option_numbers as unknown[])
      : [];
  const selectedNumbersSet = new Set<number>();
  for (const value of payloadFeedbackNumbers) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const normalized = Math.trunc(numeric);
    if (normalized < 1 || normalized > candidateNotes.length) continue;
    selectedNumbersSet.add(normalized);
  }
  const selectedNumbers = [...selectedNumbersSet].sort((a, b) => a - b);
  const extraNote = normalizeTextField(req.body?.note);

  if (selectedAction === "proceed_final_verdict") {
    if (extraNote) {
      res.status(400).json({ error: "final_verdict_disallows_note" });
      return true;
    }
    const resolvedAt = nowMs();
    db.prepare("UPDATE meeting_minutes SET status = 'completed', completed_at = ? WHERE id = ?").run(
      resolvedAt,
      meetingId,
    );
    appendTaskLog(
      taskId,
      "system",
      `${REVIEW_DECISION_RESOLVED_LOG_PREFIX} (action=proceed_final_verdict, round=${reviewRound}, meeting_id=${meetingId})`,
    );
    if (resolvedProjectId) {
      recordProjectReviewDecisionEvent({
        project_id: resolvedProjectId,
        snapshot_hash: decisionSnapshotHash,
        event_type: "representative_pick",
        summary: pickL(
          l(
            [`리뷰 라운드 ${reviewRound} 의사결정: 최종판정으로 진행`],
            [`Review round ${reviewRound} decision: proceed to final verdict`],
            [`レビューラウンド ${reviewRound} 意思決定: 最終判定へ進行`],
            [`评审轮次 ${reviewRound} 决策：进入最终判定`],
          ),
          lang,
        ),
        selected_options_json: JSON.stringify([
          {
            number: optionNumber,
            action: "proceed_final_verdict",
            label: selectedOption.label || "proceed_final_verdict",
            review_round: reviewRound,
          },
        ]),
        task_id: taskId,
        meeting_id: meetingId,
      });
    }
    scheduleNextReviewRound(taskId, task.title, reviewRound, lang);
    res.json({
      ok: true,
      resolved: true,
      kind: "review_round_pick",
      action: "proceed_final_verdict",
      task_id: taskId,
      review_round: reviewRound,
      review_action_applied: false,
      jules_applied: false,
    });
    return true;
  }

  let mergedNotes: string[] = [];
  if (selectedAction === "apply_all_feedback") {
    mergedNotes = [...candidateNotes];
  } else {
    const pickedFromSelection = selectedNumbers.map((num) => candidateNotes[num - 1]).filter(Boolean);
    mergedNotes = [...pickedFromSelection];
  }
  if (extraNote) mergedNotes.push(extraNote);

  const dedupedNotes: string[] = [];
  const seen = new Set<string>();
  for (const note of mergedNotes) {
    const cleaned = normalizeNote(note);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedNotes.push(cleaned);
  }
  if (dedupedNotes.length <= 0) {
    res.status(400).json({ error: "review_pick_or_note_required" });
    return true;
  }

  const subtaskCount = seedReviewRevisionSubtasks(taskId, task.department_id, dedupedNotes);
  processSubtaskDelegations(taskId);
  const resolvedAt = nowMs();
  db.prepare("UPDATE meeting_minutes SET status = 'completed', completed_at = ? WHERE id = ?").run(
    resolvedAt,
    meetingId,
  );
  appendTaskLog(
    taskId,
    "system",
    `${REVIEW_DECISION_RESOLVED_LOG_PREFIX} (action=${selectedAction}, round=${reviewRound}, picks=${selectedNumbers.join(",") || "all"}, extra_note=${extraNote ? "yes" : "no"}, meeting_id=${meetingId}, subtasks=${subtaskCount})`,
  );

  if (resolvedProjectId) {
    const selectedPayload =
      selectedAction === "apply_all_feedback"
        ? [{ number: 1, action: "apply_all_feedback", label: "apply_all_feedback", review_round: reviewRound }]
        : selectedNumbers.map((num) => ({
            number: num,
            action: "apply_selected_feedback",
            label: candidateNotes[num - 1] || `option_${num}`,
            review_round: reviewRound,
          }));
    recordProjectReviewDecisionEvent({
      project_id: resolvedProjectId,
      snapshot_hash: decisionSnapshotHash,
      event_type: "representative_pick",
      summary: pickL(
        l(
          [
            `리뷰 라운드 ${reviewRound} 의사결정: ${selectedAction === "apply_all_feedback" ? "전체 피드백 반영" : "선택 피드백 반영"}`,
          ],
          [
            `Review round ${reviewRound} decision: ${selectedAction === "apply_all_feedback" ? "apply all feedback" : "apply selected feedback"}`,
          ],
          [
            `レビューラウンド ${reviewRound} 意思決定: ${selectedAction === "apply_all_feedback" ? "全フィードバック反映" : "選択フィードバック反映"}`,
          ],
          [`评审轮次 ${reviewRound} 决策：${selectedAction === "apply_all_feedback" ? "全部反馈采纳" : "选择反馈采纳"}`],
        ),
        lang,
      ),
      selected_options_json: selectedPayload.length > 0 ? JSON.stringify(selectedPayload) : null,
      note: extraNote ?? null,
      task_id: taskId,
      meeting_id: meetingId,
    });
  }

  const supplement = openSupplementRound(
    taskId,
    task.assigned_agent_id,
    task.department_id,
    `Decision inbox round${reviewRound}`,
  );
  res.json({
    ok: true,
    resolved: true,
    kind: "review_round_pick",
    action: selectedAction,
    task_id: taskId,
    selected_feedback_numbers: selectedNumbers,
    selected_option_numbers: selectedNumbers,
    review_round: reviewRound,
    revision_subtask_count: subtaskCount,
    supplement_round_started: supplement.started,
    supplement_round_reason: supplement.reason,
    review_action_applied: true,
    jules_applied: true,
  });
  return true;
}
