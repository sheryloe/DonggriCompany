import type { SkillEntry, SkillHistoryProvider, SkillLearnJob, SkillLearnProvider } from "../../api";
import type { UiLanguage } from "../../i18n";
import type { Agent, AgentRole } from "../../types";
import { skillText } from "./skillLibraryText";

export interface CategorizedSkill extends SkillEntry {
  category: string;
  installsDisplay: string;
}

export type Locale = UiLanguage;
export type TFunction = (messages: Record<Locale, string>) => string;

export const SKILL_CATEGORY_KEYS = [
  "all",
  "codex-specialist",
  "provider-oauth",
  "google-gemini",
  "google-stitch",
  "donggri-operations",
  "external-catalog",
  "custom",
] as const;

export type SkillCategoryKey = (typeof SKILL_CATEGORY_KEYS)[number];

export const CATEGORIES: SkillCategoryKey[] = [...SKILL_CATEGORY_KEYS];

const CATEGORY_SET = new Set<string>(SKILL_CATEGORY_KEYS);

export const CATEGORY_BADGES: Record<SkillCategoryKey, string> = {
  all: "ALL",
  "codex-specialist": "CX",
  "provider-oauth": "AUTH",
  "google-gemini": "GM",
  "google-stitch": "ST",
  "donggri-operations": "DG",
  "external-catalog": "EXT",
  custom: "USR",
};

export const CATEGORY_COLORS: Record<string, string> = {
  all: "text-slate-300 bg-slate-500/15 border-slate-500/30",
  "codex-specialist": "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  "provider-oauth": "text-blue-300 bg-blue-500/15 border-blue-500/30",
  "google-gemini": "text-indigo-300 bg-indigo-500/15 border-indigo-500/30",
  "google-stitch": "text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30",
  "donggri-operations": "text-amber-300 bg-amber-500/15 border-amber-500/30",
  "external-catalog": "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
  custom: "text-violet-300 bg-violet-500/15 border-violet-500/30",
};

export function categorize(skill: Pick<SkillEntry, "name" | "repo" | "category" | "origin">): SkillCategoryKey {
  if (skill.category && CATEGORY_SET.has(skill.category)) {
    return skill.category as SkillCategoryKey;
  }
  if (skill.origin === "custom") return "custom";
  if (skill.origin === "donggri") return "donggri-operations";

  const text = `${skill.name} ${skill.repo}`.toLowerCase();
  if (text.includes("stitch")) return "google-stitch";
  if (text.includes("gemini") || text.includes("google")) return "google-gemini";
  if (text.includes("oauth") || text.includes("auth") || text.includes("copilot") || text.includes("antigravity")) {
    return "provider-oauth";
  }
  if (text.includes("codex") || text.includes("openai") || text.includes("skill-creator")) return "codex-specialist";
  if (text.includes("donggri") || text.includes("climpire") || text.includes("company")) return "donggri-operations";
  return "external-catalog";
}

export function formatInstalls(n: number, localeTag: string): string {
  return new Intl.NumberFormat(localeTag, {
    notation: n >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function isRankedSkill(skill: Pick<SkillEntry, "isRanked">): boolean {
  return skill.isRanked !== false;
}

function compareSkillNames(
  left: Pick<SkillEntry, "name" | "repo" | "skillId">,
  right: Pick<SkillEntry, "name" | "repo" | "skillId">,
  localeTag: string,
): number {
  return (
    left.name.localeCompare(right.name, localeTag) ||
    left.repo.localeCompare(right.repo, localeTag) ||
    left.skillId.localeCompare(right.skillId, localeTag)
  );
}

export function compareSkillsByRank(
  left: Pick<SkillEntry, "name" | "repo" | "skillId" | "rank" | "isRanked" | "installs" | "origin">,
  right: Pick<SkillEntry, "name" | "repo" | "skillId" | "rank" | "isRanked" | "installs" | "origin">,
  localeTag: string,
): number {
  if (left.origin === "donggri" && right.origin !== "donggri") return -1;
  if (left.origin !== "donggri" && right.origin === "donggri") return 1;

  const leftRanked = isRankedSkill(left);
  const rightRanked = isRankedSkill(right);
  if (leftRanked !== rightRanked) {
    return leftRanked ? -1 : 1;
  }
  if (leftRanked && rightRanked) {
    return left.rank - right.rank || right.installs - left.installs || compareSkillNames(left, right, localeTag);
  }
  return compareSkillNames(left, right, localeTag);
}

export function compareSkillsByInstalls(
  left: Pick<SkillEntry, "name" | "repo" | "skillId" | "rank" | "isRanked" | "installs" | "origin">,
  right: Pick<SkillEntry, "name" | "repo" | "skillId" | "rank" | "isRanked" | "installs" | "origin">,
  localeTag: string,
): number {
  if (left.origin === "donggri" && right.origin !== "donggri") return -1;
  if (left.origin !== "donggri" && right.origin === "donggri") return 1;
  return right.installs - left.installs || compareSkillsByRank(left, right, localeTag);
}

export function categoryLabel(category: string, t: TFunction): string {
  switch (category) {
    case "all":
      return skillText(t, "category.all");
    case "codex-specialist":
      return skillText(t, "category.codex-specialist");
    case "provider-oauth":
      return skillText(t, "category.provider-oauth");
    case "google-gemini":
      return skillText(t, "category.google-gemini");
    case "google-stitch":
      return skillText(t, "category.google-stitch");
    case "donggri-operations":
      return skillText(t, "category.donggri-operations");
    case "external-catalog":
      return skillText(t, "category.external-catalog");
    case "custom":
      return skillText(t, "category.custom");
    default:
      return category;
  }
}

export function getRankBadge(rank: number) {
  if (rank <= 0) return { text: "CAT", color: "text-slate-400" };
  if (rank <= 3) return { text: `#${rank}`, color: "text-amber-300" };
  if (rank <= 10) return { text: `#${rank}`, color: "text-blue-300" };
  return { text: `#${rank}`, color: "text-slate-400" };
}

export function formatFirstSeen(value: string, localeTag: string): string {
  if (!value) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function localizeAuditStatus(status: string, t: TFunction): string {
  const normalized = status.toLowerCase();
  if (normalized === "pass") return skillText(t, "audit.pass");
  if (normalized === "warn") return skillText(t, "audit.warn");
  if (normalized === "pending") return skillText(t, "audit.pending");
  if (normalized === "fail") return skillText(t, "audit.fail");
  return status;
}

export const LEARN_PROVIDER_ORDER: SkillLearnProvider[] = ["claude", "codex", "agy", "opencode", "kimi"];
export const LEARNED_PROVIDER_ORDER: SkillHistoryProvider[] = [
  "claude",
  "codex",
  "agy",
  "opencode",
  "copilot",
  "api",
];

export type UnlearnEffect = "pot" | "hammer";

const ROLE_ORDER: Record<AgentRole, number> = {
  team_leader: 0,
  senior: 1,
  junior: 2,
  intern: 3,
};

export function roleLabel(role: AgentRole, t: TFunction): string {
  if (role === "team_leader") return skillText(t, "role.team_leader");
  if (role === "senior") return skillText(t, "role.senior");
  if (role === "junior") return skillText(t, "role.junior");
  return skillText(t, "role.intern");
}

export function providerLabel(provider: SkillLearnProvider): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  if (provider === "agy" || provider === "gemini") return "AGY CLI";
  if (provider === "kimi") return "Kimi Code";
  return "OpenCode";
}

export function learnedProviderLabel(provider: SkillHistoryProvider): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex CLI";
  if (provider === "agy" || provider === "gemini" || provider === "antigravity") return "AGY CLI";
  if (provider === "opencode") return "OpenCode";
  if (provider === "kimi") return "Kimi Code";
  if (provider === "copilot") return "GitHub Copilot";
  return "API Provider";
}

export function cliProviderIcon(provider: SkillHistoryProvider) {
  const label =
    provider === "claude"
      ? "CL"
      : provider === "codex"
        ? "CX"
        : provider === "agy" || provider === "gemini" || provider === "antigravity"
          ? "AG"
          : provider === "opencode"
            ? "OC"
            : provider === "kimi"
              ? "KM"
              : provider === "copilot"
                ? "GH"
                : "API";
  return <span className="text-[9px] font-semibold text-slate-200">{label}</span>;
}

export function learningStatusLabel(status: SkillLearnJob["status"] | null, t: TFunction): string {
  if (status === "queued") return skillText(t, "learnStatus.queued");
  if (status === "running") return skillText(t, "learnStatus.running");
  if (status === "succeeded") return skillText(t, "learnStatus.succeeded");
  if (status === "failed") return skillText(t, "learnStatus.failed");
  return "-";
}

export function pickRepresentativeForProvider(agents: Agent[], provider: Agent["cli_provider"]): Agent | null {
  const candidates = agents.filter((agent) => agent.cli_provider === provider);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const roleGap = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleGap !== 0) return roleGap;
    if (b.stats_xp !== a.stats_xp) return b.stats_xp - a.stats_xp;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}
