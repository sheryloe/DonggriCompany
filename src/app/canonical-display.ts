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
  team_leader: { ko: "팀장", en: "Team Leader" },
  senior: { ko: "시니어", en: "Senior" },
  junior: { ko: "주니어", en: "Junior" },
  intern: { ko: "인턴", en: "Intern" },
};

const WORKFLOW_ROLE_TEXT: Record<AgentWorkflowRole, LocalizedText> = {
  primary_author: { ko: "주 작성자", en: "Primary Author" },
  reviewer: { ko: "리뷰어", en: "Reviewer" },
};

const ASSIGNMENT_MODE_TEXT: Record<AssignmentMode, LocalizedText> = {
  auto: { ko: "자동", en: "Auto" },
  manual: { ko: "수동", en: "Manual" },
};

const PROMOTION_POLICY_TEXT: Record<string, LocalizedText> = {
  default_junior_to_senior: {
    ko: "주니어에서 시니어로 자동 승급 (XP 300 이상)",
    en: "Junior -> Senior auto promotion at XP 300+",
  },
  team_leader_manual_only: {
    ko: "팀장은 수동 승급만 허용",
    en: "Team leaders require manual promotion",
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
