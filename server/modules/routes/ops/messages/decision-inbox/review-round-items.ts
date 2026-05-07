import type {
  ReviewRoundDecisionItem,
  ReviewRoundDecisionItemDeps,
  ReviewRoundDecisionItems,
  ReviewRoundReviewerVerdict,
} from "./types.ts";
import { buildDecisionOptionAnalysis } from "./option-analysis.ts";
import { applyPlannerOptionAnalysis, extractPlannerDecisionAnalysis } from "./planner-option-analysis.ts";

const DECISION_COLLECTING_STALE_MS = 20_000;

function normalizeNote(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBlockingItemsJson(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const note = normalizeNote(item);
      if (!note) continue;
      const key = note.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(note);
    }
    return out;
  } catch {
    return [];
  }
}

export function createReviewRoundDecisionItems(deps: ReviewRoundDecisionItemDeps): ReviewRoundDecisionItems {
  const {
    db,
    nowMs,
    getPreferredLanguage,
    pickL,
    l,
    buildReviewRoundSnapshotHash,
    getReviewRoundDecisionState,
    upsertReviewRoundDecisionState,
    resolvePlanningLeadMeta,
    formatPlannerSummaryForDisplay,
    queueReviewRoundPlanningConsolidation,
  } = deps;

  function t(lang: string, ko: string, en: string, ja: string, zh: string): string {
    return pickL(l([ko], [en], [ja], [zh]), lang);
  }

  function getReviewDecisionFallbackLabel(lang: string): string {
    return t(lang, "검토 항목 없음", "No review notes", "レビュー項目なし", "无审查项");
  }

  function getReviewDecisionNotes(taskId: string, reviewRound: number, limit = 6): string[] {
    const boundedLimit = Math.max(1, Math.min(limit, 12));
    const rows = db
      .prepare(
        `
      SELECT raw_note
      FROM review_revision_history
      WHERE task_id = ?
        AND first_round <= ?
      ORDER BY
        CASE WHEN first_round = ? THEN 0 ELSE 1 END ASC,
        first_round DESC,
        id DESC
      LIMIT ?
    `,
      )
      .all(taskId, reviewRound, reviewRound, Math.max(boundedLimit * 3, boundedLimit)) as Array<{
      raw_note: string | null;
    }>;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const normalized = normalizeNote(row.raw_note);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
      if (out.length >= boundedLimit) break;
    }
    return out;
  }

  function getReviewerVerdicts(taskId: string, meetingId: string, reviewRound: number): ReviewRoundReviewerVerdict[] {
    const mapRowsToVerdicts = (
      rows: Array<{
        agent_id: string | null;
        agent_name: string | null;
        agent_name_ko: string | null;
        lens: string | null;
        final_verdict: string;
        confidence: number | null;
        requires_jules_action: number | null;
      }>,
    ): ReviewRoundReviewerVerdict[] =>
      rows.map((row) => {
        const requiresFollowUp = Number(row.requires_jules_action ?? 0) === 1;
        return {
          agent_id: row.agent_id ?? null,
          agent_name: row.agent_name ?? null,
          agent_name_ko: row.agent_name_ko ?? row.agent_name ?? null,
          lens: row.lens ?? null,
          final_verdict:
            row.final_verdict === "approved" || row.final_verdict === "hold" || row.final_verdict === "rejected"
              ? row.final_verdict
              : "hold",
          confidence: Number.isFinite(Number(row.confidence ?? NaN)) ? Number(row.confidence) : 0.5,
          requires_follow_up: requiresFollowUp,
          requires_jules_action: requiresFollowUp,
        };
      });

    try {
      const rows = db
        .prepare(
          `
      SELECT
        r.agent_id AS agent_id,
        a.name AS agent_name,
        a.name_ko AS agent_name_ko,
        r.lens AS lens,
        r.final_verdict AS final_verdict,
        r.confidence AS confidence,
        r.requires_jules_action AS requires_jules_action
      FROM review_round_feedback_items r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE r.task_id = ?
        AND r.meeting_id = ?
        AND r.round = ?
      ORDER BY r.id ASC
    `,
        )
        .all(taskId, meetingId, reviewRound) as Array<{
        agent_id: string | null;
        agent_name: string | null;
        agent_name_ko: string | null;
        lens: string | null;
        final_verdict: string;
        confidence: number | null;
        requires_jules_action: number | null;
      }>;
      return mapRowsToVerdicts(rows);
    } catch {
      try {
        const fallbackRows = db
          .prepare(
            `
        SELECT
          agent_id AS agent_id,
          NULL AS agent_name,
          NULL AS agent_name_ko,
          lens AS lens,
          final_verdict AS final_verdict,
          confidence AS confidence,
          requires_jules_action AS requires_jules_action
        FROM review_round_feedback_items
        WHERE task_id = ?
          AND meeting_id = ?
          AND round = ?
        ORDER BY id ASC
      `,
          )
          .all(taskId, meetingId, reviewRound) as Array<{
          agent_id: string | null;
          agent_name: string | null;
          agent_name_ko: string | null;
          lens: string | null;
          final_verdict: string;
          confidence: number | null;
          requires_jules_action: number | null;
        }>;
        return mapRowsToVerdicts(fallbackRows);
      } catch {
        return [];
      }
    }
  }

  function getBlockerCount(verdicts: ReviewRoundReviewerVerdict[]): number {
    return verdicts.filter((verdict) => verdict.final_verdict !== "approved" || verdict.requires_follow_up).length;
  }

  function getPreviousRoundBlockerCount(taskId: string, reviewRound: number): number | null {
    const prevRound = reviewRound - 1;
    if (prevRound <= 0) return null;
    let rows: Array<{ final_verdict: string; requires_jules_action: number | null }> = [];
    try {
      rows = db
        .prepare(
          `
      SELECT final_verdict, requires_jules_action
      FROM review_round_feedback_items
      WHERE task_id = ?
        AND round = ?
    `,
        )
        .all(taskId, prevRound) as Array<{ final_verdict: string; requires_jules_action: number | null }>;
    } catch {
      return null;
    }
    if (rows.length <= 0) return null;
    let blockers = 0;
    for (const row of rows) {
      const isApproved = String(row.final_verdict ?? "").toLowerCase() === "approved";
      const requiresFollowUp = Number(row.requires_jules_action ?? 0) === 1;
      if (!isApproved || requiresFollowUp) blockers += 1;
    }
    return blockers;
  }

  function collectRoundOptionNotes(
    taskId: string,
    meetingId: string,
    reviewRound: number,
    fallback: string[],
  ): string[] {
    let rows: Array<{ pass2: string | null; blocking_items_json: string | null }> = [];
    try {
      rows = db
        .prepare(
          `
      SELECT pass2, blocking_items_json
      FROM review_round_feedback_items
      WHERE task_id = ?
        AND meeting_id = ?
        AND round = ?
      ORDER BY id ASC
    `,
        )
        .all(taskId, meetingId, reviewRound) as Array<{ pass2: string | null; blocking_items_json: string | null }>;
    } catch {
      return fallback.slice(0, 6);
    }
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: unknown) => {
      const normalized = normalizeNote(raw);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    };
    for (const row of rows) {
      for (const item of parseBlockingItemsJson(row.blocking_items_json)) push(item);
      if (out.length >= 6) break;
      push(row.pass2);
      if (out.length >= 6) break;
    }
    if (out.length > 0) return out.slice(0, 6);
    return fallback.slice(0, 6);
  }

  function buildReviewRoundDecisionItems(): ReviewRoundDecisionItem[] {
    const lang = getPreferredLanguage();
    const rows = db
      .prepare(
        `
      SELECT
        t.id AS task_id,
        t.title AS task_title,
        t.project_id AS project_id,
        p.name AS project_name,
        t.project_path AS project_path,
        mm.id AS meeting_id,
        mm.round AS meeting_round,
        mm.started_at AS meeting_started_at,
        mm.completed_at AS meeting_completed_at
      FROM tasks t
      JOIN meeting_minutes mm ON mm.task_id = t.id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'review'
        AND t.source_task_id IS NULL
        AND mm.meeting_type = 'review'
        AND mm.round IN (1, 2)
        AND mm.status = 'revision_requested'
        AND mm.id = (
          SELECT mm2.id
          FROM meeting_minutes mm2
          WHERE mm2.task_id = t.id
            AND mm2.meeting_type = 'review'
          ORDER BY mm2.started_at DESC, mm2.created_at DESC
          LIMIT 1
        )
      ORDER BY COALESCE(mm.completed_at, mm.started_at) DESC
      LIMIT 120
    `,
      )
      .all() as Array<{
      task_id: string;
      task_title: string | null;
      project_id: string | null;
      project_name: string | null;
      project_path: string | null;
      meeting_id: string;
      meeting_round: number;
      meeting_started_at: number | null;
      meeting_completed_at: number | null;
    }>;

    const out: ReviewRoundDecisionItem[] = [];
    for (const row of rows) {
      const taskTitle = normalizeNote(row.task_title) || row.task_id;
      const projectName = normalizeNote(row.project_name) || null;
      const fallbackNotesRaw = getReviewDecisionNotes(row.task_id, row.meeting_round, 6);
      const fallbackNotes = fallbackNotesRaw.length > 0 ? fallbackNotesRaw : [getReviewDecisionFallbackLabel(lang)];
      const optionNotes = collectRoundOptionNotes(row.task_id, row.meeting_id, row.meeting_round, fallbackNotes);
      const reviewerVerdicts = getReviewerVerdicts(row.task_id, row.meeting_id, row.meeting_round);
      const blockerCount = reviewerVerdicts.length > 0 ? getBlockerCount(reviewerVerdicts) : optionNotes.length;
      const previousBlockerCount = getPreviousRoundBlockerCount(row.task_id, row.meeting_round);
      const blockerDelta = previousBlockerCount === null ? null : blockerCount - previousBlockerCount;

      const optionsBase = [
        {
          number: 1,
          action: "apply_all_feedback",
          label: t(lang, "전체 반영", "Apply All", "すべて反映", "全部采纳"),
        },
        {
          number: 2,
          action: "apply_selected_feedback",
          label: t(lang, "선택 반영", "Apply Selected", "選択反映", "选择采纳"),
        },
        {
          number: 3,
          action: "proceed_final_verdict",
          label: t(lang, "최종판정으로 진행", "Proceed To Final Verdict", "最終判定へ進行", "进入最终判定"),
        },
      ];
      const optionsTemplate = optionsBase.map((option) => ({
        ...option,
        analysis: buildDecisionOptionAnalysis({
          kind: "review_round_pick",
          number: option.number,
          action: option.action,
          label: option.label,
          t: (ko, en, ja, zh) => t(lang, ko, en, ja, zh),
          blockerCount,
          reviewRound: row.meeting_round,
        }),
      }));

      const summary = t(
        lang,
        `리뷰 라운드 ${row.meeting_round}에서 blocker ${blockerCount}건이 감지되었습니다.\n작업: '${taskTitle}'\n${projectName ? `프로젝트: '${projectName}'\n` : ""}피드백 처리 방식을 선택하세요. 전체 반영 / 선택 반영 / 최종판정으로 진행.`,
        `Review round ${row.meeting_round} detected ${blockerCount} blocker(s).\nTask: '${taskTitle}'\n${projectName ? `Project: '${projectName}'\n` : ""}Choose feedback handling mode: apply all, apply selected, or proceed to final verdict.`,
        `レビューラウンド ${row.meeting_round} で blocker ${blockerCount} 件を検出しました。\nタスク: '${taskTitle}'\n${projectName ? `プロジェクト: '${projectName}'\n` : ""}フィードバック処理方式を選択してください。すべて反映 / 選択反映 / 最終判定へ進行。`,
        `评审轮次 ${row.meeting_round} 检测到 ${blockerCount} 个 blocker。\n任务: '${taskTitle}'\n${projectName ? `项目: '${projectName}'\n` : ""}请选择反馈处理方式：全部采纳 / 选择采纳 / 进入最终判定。`,
      );

      const snapshotHash = buildReviewRoundSnapshotHash(row.meeting_id, row.meeting_round, optionNotes);
      const existingState = getReviewRoundDecisionState(row.meeting_id);
      const now = nowMs();
      const stateNeedsReset = !existingState || existingState.snapshot_hash !== snapshotHash;
      if (stateNeedsReset) {
        upsertReviewRoundDecisionState(row.meeting_id, snapshotHash, "collecting", null, null, null);
      } else if (existingState.status === "failed" && now - (existingState.updated_at ?? 0) > 3000) {
        upsertReviewRoundDecisionState(row.meeting_id, snapshotHash, "collecting", null, null, null);
      }

      const decisionState = getReviewRoundDecisionState(row.meeting_id);
      const planningLeadMeta = resolvePlanningLeadMeta(lang, decisionState);
      const collectingElapsedMs =
        decisionState?.status === "collecting"
          ? now - (decisionState.updated_at ?? decisionState.created_at ?? now)
          : 0;
      const useCollectingFallback = Boolean(
        decisionState && decisionState.status === "collecting" && collectingElapsedMs >= DECISION_COLLECTING_STALE_MS,
      );

      if (!decisionState || (decisionState.status !== "ready" && !useCollectingFallback)) {
        queueReviewRoundPlanningConsolidation({
          projectId: row.project_id,
          projectName: row.project_name,
          projectPath: row.project_path,
          taskId: row.task_id,
          taskTitle,
          meetingId: row.meeting_id,
          reviewRound: row.meeting_round,
          optionNotes,
          snapshotHash,
          lang,
          options: optionsBase,
        });
      }

      const plannerHeader = useCollectingFallback
        ? t(
            lang,
            "기획팀 요약 지연 - 기본 옵션으로 진행",
            "Planning summary delayed - baseline options enabled",
            "企画要約遅延 - 基本オプションで進行",
            "规划摘要延迟 - 使用基线选项继续",
          )
        : t(lang, "기획팀 요약 완료", "Planning summary ready", "企画要約完了", "规划摘要已完成");
      const rawPlannerSummary = useCollectingFallback ? "" : String(decisionState?.planner_summary ?? "").trim();
      const plannerAnalysis = extractPlannerDecisionAnalysis(
        rawPlannerSummary,
        optionsTemplate.map((option) => option.number),
      );
      const plannerSummary = useCollectingFallback ? "" : formatPlannerSummaryForDisplay(plannerAnalysis.summary);
      const options = useCollectingFallback
        ? optionsTemplate
        : applyPlannerOptionAnalysis(optionsTemplate, rawPlannerSummary);
      const combinedSummary = plannerSummary
        ? `${plannerHeader}\n${plannerSummary}\n\n${summary}`
        : `${plannerHeader}\n\n${summary}`;
      const decisionReadyAt =
        decisionState?.status === "ready" ? (decisionState.updated_at ?? decisionState.created_at ?? null) : null;

      out.push({
        id: `review-round-pick:${row.task_id}:${row.meeting_id}`,
        kind: "review_round_pick",
        created_at: decisionReadyAt ?? row.meeting_completed_at ?? row.meeting_started_at ?? now,
        summary: combinedSummary,
        agent_id: planningLeadMeta.agent_id,
        agent_name: planningLeadMeta.agent_name,
        agent_name_ko: planningLeadMeta.agent_name_ko,
        agent_avatar: planningLeadMeta.agent_avatar,
        project_id: row.project_id,
        project_name: row.project_name,
        project_path: row.project_path,
        task_id: row.task_id,
        task_title: row.task_title,
        meeting_id: row.meeting_id,
        review_round: row.meeting_round,
        reviewer_verdicts: reviewerVerdicts,
        blocker_count: blockerCount,
        blocker_delta: blockerDelta,
        review_action_applied: null,
        jules_applied: null,
        option_notes: optionNotes,
        planner_analysis_quality: plannerAnalysis.quality,
        options,
      });
    }

    return out;
  }

  return {
    getReviewDecisionFallbackLabel,
    getReviewDecisionNotes,
    buildReviewRoundDecisionItems,
  };
}
