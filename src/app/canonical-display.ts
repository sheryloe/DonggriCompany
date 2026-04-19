import { normalizeLanguage, pickLang, type LangText } from "../i18n";
import type { AgentRole, AgentWorkflowRole, AssignmentMode } from "../types";

const ROLE_TEXT: Record<AgentRole, LangText> = {
  team_leader: { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" },
};

const WORKFLOW_ROLE_TEXT: Record<AgentWorkflowRole, LangText> = {
  primary_author: {
    ko: "주 작성자",
    en: "Primary Author",
    ja: "主担当",
    zh: "主负责人",
  },
  reviewer: {
    ko: "리뷰어",
    en: "Reviewer",
    ja: "レビュアー",
    zh: "审阅者",
  },
};

const ASSIGNMENT_MODE_TEXT: Record<AssignmentMode, LangText> = {
  auto: { ko: "자동", en: "Auto", ja: "自動", zh: "自动" },
  manual: { ko: "수동", en: "Manual", ja: "手動", zh: "手动" },
};

const PROMOTION_POLICY_TEXT: Record<string, LangText> = {
  default_junior_to_senior: {
    ko: "주니어에서 시니어로 자동 승급",
    en: "Junior to senior auto promotion",
    ja: "ジュニアからシニアへの自動昇格",
    zh: "初级到高级的自动晋升",
  },
  team_leader_manual_only: {
    ko: "팀 리드는 수동 승급만 허용",
    en: "Team leads require manual promotion",
    ja: "チームリードは手動昇格のみ許可",
    zh: "团队负责人仅允许手动晋升",
  },
};

function pick(text: LangText, locale?: string | null): string {
  return pickLang(normalizeLanguage(locale), text);
}

export function getRoleDisplayLabel(role: AgentRole, locale?: string | null): string {
  return pick(ROLE_TEXT[role], locale);
}

export function getWorkflowRoleDisplayLabel(role: AgentWorkflowRole, locale?: string | null): string {
  return pick(WORKFLOW_ROLE_TEXT[role], locale);
}

export function getAssignmentModeDisplayLabel(mode: AssignmentMode, locale?: string | null): string {
  return pick(ASSIGNMENT_MODE_TEXT[mode], locale);
}

export function getPromotionPolicyDisplayLabel(policyKey: string, locale?: string | null): string {
  return pick(
    PROMOTION_POLICY_TEXT[policyKey] ?? { ko: policyKey, en: policyKey, ja: policyKey, zh: policyKey },
    locale,
  );
}

export function normalizeCanonicalText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}
