import type { AgentRole, AgentWorkflowRole, AssignmentMode, UiLanguage } from "../types";

type LocalizedText = {
  ko: string;
  en: string;
  ja?: string;
  zh?: string;
};

function resolveLanguage(locale?: string | null): UiLanguage {
  const value = String(locale ?? "").toLowerCase();
  if (value.startsWith("ko")) return "ko";
  if (value.startsWith("ja")) return "ja";
  if (value.startsWith("zh")) return "zh";
  return "en";
}

function pickLocalizedText(text: LocalizedText, locale?: string | null): string {
  const language = resolveLanguage(locale);
  if (language === "ko") return text.ko;
  if (language === "ja") return text.ja ?? text.en;
  if (language === "zh") return text.zh ?? text.en;
  return text.en;
}

const ROLE_TEXT: Record<AgentRole, LocalizedText> = {
  team_leader: { ko: "팀장", en: "Team Leader", ja: "チームリーダー", zh: "组长" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生" },
};

const WORKFLOW_ROLE_TEXT: Record<AgentWorkflowRole, LocalizedText> = {
  primary_author: { ko: "주 작성자", en: "Primary Author", ja: "主担当", zh: "主要作者" },
  reviewer: { ko: "리뷰어", en: "Reviewer", ja: "レビュアー", zh: "审阅者" },
};

const ASSIGNMENT_MODE_TEXT: Record<AssignmentMode, LocalizedText> = {
  auto: { ko: "자동", en: "Auto", ja: "自動", zh: "自动" },
  manual: { ko: "수동", en: "Manual", ja: "手動", zh: "手动" },
};

const PROMOTION_POLICY_TEXT: Record<string, LocalizedText> = {
  default_junior_to_senior: {
    ko: "주니어에서 시니어로 자동 승급 (XP 300 이상)",
    en: "Junior -> Senior auto promotion at XP 300+",
    ja: "XP 300以上でジュニアからシニアへ自動昇格",
    zh: "XP 300 以上时从初级自动晋升为高级",
  },
  team_leader_manual_only: {
    ko: "팀장은 수동 승급만 허용",
    en: "Team leaders require manual promotion",
    ja: "チームリーダーは手動昇格のみ",
    zh: "组长仅允许手动晋升",
  },
};

export function getRoleDisplayLabel(role: AgentRole, locale?: string | null): string {
  return pickLocalizedText(ROLE_TEXT[role], locale);
}

export function getWorkflowRoleDisplayLabel(role: AgentWorkflowRole, locale?: string | null): string {
  return pickLocalizedText(WORKFLOW_ROLE_TEXT[role], locale);
}

export function getAssignmentModeDisplayLabel(mode: AssignmentMode, locale?: string | null): string {
  return pickLocalizedText(ASSIGNMENT_MODE_TEXT[mode], locale);
}

export function getPromotionPolicyDisplayLabel(policyKey: string, locale?: string | null): string {
  return pickLocalizedText(PROMOTION_POLICY_TEXT[policyKey] ?? { ko: policyKey, en: policyKey }, locale);
}

export function normalizeCanonicalText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}
