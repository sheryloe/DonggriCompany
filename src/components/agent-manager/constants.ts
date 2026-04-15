import { createPresetAgentProfile } from "../../agent-profile";
import type { AgentRole, CliProvider } from "../../types";
import type { DeptForm, FormData } from "./types";

export const ROLES: AgentRole[] = ["team_leader", "senior", "junior"];

export const CLI_PROVIDERS: CliProvider[] = [
  "claude",
  "codex",
  "gemini",
  "jules",
  "opencode",
  "kimi",
  "copilot",
  "antigravity",
  "api",
];

export const ROLE_LABEL: Record<string, { ko: string; en: string }> = {
  team_leader: { ko: "팀장", en: "Team Leader" },
  senior: { ko: "시니어", en: "Senior" },
  junior: { ko: "주니어", en: "Junior" },
  intern: { ko: "인턴", en: "Intern" },
};

export const ROLE_BADGE: Record<string, string> = {
  team_leader: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  senior: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  junior: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  intern: "bg-slate-500/15 text-slate-400 border-slate-500/25",
};

export const STATUS_DOT: Record<string, string> = {
  working: "bg-emerald-400 shadow-emerald-400/50 shadow-sm",
  break: "bg-amber-400",
  offline: "bg-red-400",
  idle: "bg-slate-500",
};

export const ICON_SPRITE_POOL = Array.from({ length: 44 }, (_, index) => index + 1);

export const EMOJI_GROUPS: { label: string; labelEn: string; emojis: string[] }[] = [
  { label: "업무", labelEn: "Work", emojis: ["💼", "🧠", "🛠️", "📋", "🧪", "📦", "📈", "🔍"] },
  { label: "사람", labelEn: "People", emojis: ["🙂", "🧑", "👩", "👨", "🧑‍💻", "👩‍💻", "👨‍💻", "🫡"] },
  { label: "도구", labelEn: "Tools", emojis: ["⚙️", "🖥️", "⌨️", "🗂️", "🔧", "🛰️", "📡", "🧰"] },
  { label: "기타", labelEn: "Misc", emojis: ["⭐", "🚀", "🌐", "📚", "🧭", "🗃️", "🛡️", "🎯"] },
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
  avatar_emoji: "💼",
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
  icon: "🏢",
  color: "#3b82f6",
  description: "",
  prompt: "",
};
