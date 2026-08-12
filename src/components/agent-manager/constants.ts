import { createPresetAgentProfile } from "../../agent-profile";
import { normalizeLanguage, pickLang, type LangText } from "../../i18n";
import type { AgentRole, CliProvider } from "../../types";
import type { DeptForm, FormData } from "./types";

export const ROLES: AgentRole[] = ["team_leader", "senior", "junior"];

export const CLI_PROVIDERS: CliProvider[] = [
  "claude",
  "codex",
  "agy",
  "jules",
  "opencode",
  "kimi",
  "copilot",
  "api",
];

export const ROLE_LABEL: Record<string, LangText> = {
  team_leader: { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" },
};

export const ROLE_BADGE: Record<string, string> = {
  team_leader: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  senior: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  junior: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  intern: "bg-slate-500/15 text-slate-400 border-slate-500/25",
};

export function getLegacyRoleLabel(role: string, locale: string): string {
  const label = ROLE_LABEL[role];
  return label ? pickLang(normalizeLanguage(locale), label) : role;
}

export const STATUS_DOT: Record<string, string> = {
  working: "bg-emerald-400 shadow-emerald-400/50 shadow-sm",
  break: "bg-amber-400",
  offline: "bg-red-400",
  idle: "bg-slate-500",
};

export const ICON_SPRITE_POOL = Array.from({ length: 44 }, (_, index) => index + 1);

export const EMOJI_GROUPS: { label: string; labelEn: string; emojis: string[] }[] = [
  { label: "업무", labelEn: "Work", emojis: ["BOT", "DEV", "QA", "PM", "OPS", "DOC", "ENG", "LAB"] },
  { label: "인물", labelEn: "People", emojis: ["LEAD", "SEN", "JUN", "INT", "ARC", "REV", "RES", "MEM"] },
  { label: "도구", labelEn: "Tools", emojis: ["CLI", "API", "DB", "APP", "WEB", "SYS", "NET", "CICD"] },
  { label: "기타", labelEn: "Misc", emojis: ["NODE", "TASK", "FLOW", "ROOM", "PACK", "SYNC", "LOG", "CHAT"] },
];

export const BLANK: FormData = {
  name: "",
  name_ko: "",
  name_ja: "",
  name_zh: "",
  department_id: "",
  role: "junior",
  cli_provider: "claude",
  cli_account_pool_id: "",
  workflow_role: "reviewer",
  review_lenses_text: "general",
  two_pass_required: true,
  max_review_rounds: null,
  family: "backend",
  career_stage: "junior",
  specialization_key: "",
  authority_level: 1,
  execution_capability_profile: "reviewer",
  canonical_identity_source: "derived",
  avatar_emoji: "BOT",
  sprite_number: null,
  personality: "",
  specialties_text: "",
  agent_profile: createPresetAgentProfile("junior"),
};

export const DEPT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#6b7280",
];

export const DEPT_BLANK: DeptForm = {
  id: "",
  name: "",
  name_ko: "",
  name_ja: "",
  name_zh: "",
  icon: "ORG",
  color: "#3b82f6",
  description: "",
  prompt: "",
};
