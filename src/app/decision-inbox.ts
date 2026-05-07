import type { DecisionInboxRouteItem } from "../api";
import { normalizeLanguage, pickLang, type UiLanguage } from "../i18n";
import type { DecisionInboxItem } from "../components/chat/decision-inbox";
import {
  buildFallbackDecisionOptionAnalysis,
  type DecisionOptionAnalysis,
  type DecisionOptionAnalysisSource,
} from "../components/chat/decision-request";

function normalizeAnalysisSource(source: unknown): DecisionOptionAnalysisSource | undefined {
  return source === "template" || source === "fallback" || source === "planner" ? source : undefined;
}

function mapOptionAnalysis(
  analysis: DecisionInboxRouteItem["options"][number]["analysis"],
): DecisionOptionAnalysis | undefined {
  if (!analysis) return undefined;
  const rationale = String(analysis.rationale ?? "").trim();
  const expectedResult = String(analysis.expected_result ?? "").trim();
  const risk = String(analysis.risk ?? "").trim();
  const followUp = String(analysis.follow_up ?? "").trim();
  if (!rationale && !expectedResult && !risk && !followUp) return undefined;
  return {
    rationale,
    expectedResult,
    risk,
    followUp,
    source: normalizeAnalysisSource(analysis.source),
  };
}

function mapWorkflowOption(
  option: DecisionInboxRouteItem["options"][number],
  label: string,
): DecisionInboxItem["options"][number] {
  const mapped = {
    number: option.number,
    label,
    action: option.action,
  };
  return {
    ...mapped,
    analysis: mapOptionAnalysis(option.analysis) ?? buildFallbackDecisionOptionAnalysis(mapped),
  };
}

function baseWorkflowDecisionItem(item: DecisionInboxRouteItem): Omit<DecisionInboxItem, "options"> {
  return {
    id: item.id,
    kind: item.kind,
    agentId: item.agent_id ?? null,
    agentName:
      item.agent_name ||
      (item.kind === "project_review_ready"
        ? item.project_name || item.project_id || "Planning Lead"
        : item.task_title || item.task_id || "Task"),
    agentNameKo:
      item.agent_name_ko ||
      item.agent_name ||
      (item.kind === "project_review_ready"
        ? item.project_name || item.project_id || "기획팀장"
        : item.task_title || item.task_id || "작업"),
    agentAvatar:
      item.agent_avatar ?? (item.kind === "project_review_ready" || item.kind === "review_round_pick" ? "PL" : null),
    requestContent: item.summary,
    createdAt: item.created_at,
    taskId: item.task_id,
    projectId: item.project_id,
    projectName: item.project_name,
    reviewerVerdicts: (item.reviewer_verdicts ?? []).map((verdict) => ({
      agentId: verdict.agent_id,
      agentName: verdict.agent_name,
      agentNameKo: verdict.agent_name_ko,
      lens: verdict.lens,
      finalVerdict: verdict.final_verdict,
      confidence: verdict.confidence,
      requiresJulesAction: verdict.requires_jules_action,
    })),
    blockerCount: item.blocker_count,
    blockerDelta: item.blocker_delta ?? null,
    julesApplied: item.jules_applied ?? null,
    optionNotes: Array.isArray(item.option_notes)
      ? item.option_notes.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [],
  };
}

function localizedOptionLabel(
  kind: DecisionInboxItem["kind"],
  action: string,
  number: number,
  language: UiLanguage,
): string {
  if (kind === "project_review_ready") {
    if (action === "start_project_review") {
      return pickLang(language, {
        ko: "팀장 회의 시작",
        en: "Start Team-Lead Meeting",
        ja: "チームリード会議開始",
        zh: "开始组长会议",
      });
    }
    if (action === "keep_waiting") {
      return pickLang(language, {
        ko: "대기 유지",
        en: "Keep Waiting",
        ja: "待機維持",
        zh: "继续等待",
      });
    }
    if (action === "add_followup_request") {
      return pickLang(language, {
        ko: "추가 요청",
        en: "Add Follow-up Request",
        ja: "追加依頼",
        zh: "追加请求",
      });
    }
  }

  if (kind === "task_timeout_resume") {
    if (action === "resume_timeout_task") {
      return pickLang(language, {
        ko: "작업 재개",
        en: "Resume Task",
        ja: "タスク再開",
        zh: "恢复任务",
      });
    }
    if (action === "keep_inbox") {
      return pickLang(language, {
        ko: "인박스 유지",
        en: "Keep in Inbox",
        ja: "Inboxに維持",
        zh: "保留在 Inbox",
      });
    }
  }

  if (kind === "review_round_pick") {
    if (action === "apply_all_feedback") {
      return pickLang(language, {
        ko: "전체 반영",
        en: "Apply All",
        ja: "すべて反映",
        zh: "全部采纳",
      });
    }
    if (action === "apply_selected_feedback") {
      return pickLang(language, {
        ko: "선택 반영",
        en: "Apply Selected",
        ja: "選択反映",
        zh: "选择采纳",
      });
    }
    if (action === "proceed_final_verdict") {
      return pickLang(language, {
        ko: "최종판정으로 진행",
        en: "Proceed To Final Verdict",
        ja: "最終判定へ進行",
        zh: "进入最终判定",
      });
    }
    if (action === "skip_to_next_round") {
      return pickLang(language, {
        ko: "다음 라운드로 이동",
        en: "Skip to Next Round",
        ja: "次ラウンドへ移動",
        zh: "进入下一轮",
      });
    }
  }

  return `${number}. ${action}`;
}

export function mapWorkflowDecisionItemsRaw(items: DecisionInboxRouteItem[]): DecisionInboxItem[] {
  return items.map((item) => ({
    ...baseWorkflowDecisionItem(item),
    options: item.options.map((option) => mapWorkflowOption(option, option.label ?? option.action)),
  }));
}

export function mapWorkflowDecisionItemsLocalized(
  items: DecisionInboxRouteItem[],
  language: string,
): DecisionInboxItem[] {
  const locale = normalizeLanguage(language);
  return items.map((item) => ({
    ...baseWorkflowDecisionItem(item),
    options: item.options.map((option) =>
      mapWorkflowOption(option, option.label ?? localizedOptionLabel(item.kind, option.action, option.number, locale)),
    ),
  }));
}
