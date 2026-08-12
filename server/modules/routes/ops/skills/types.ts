export interface SkillEntry {
  rank: number;
  name: string;
  skillId: string;
  repo: string;
  installs: number;
  isRanked?: boolean;
  origin?: "skills_sh" | "donggri" | "custom";
  category?: string;
  description?: string;
  requiredProviders?: string[];
  requiredOAuth?: string[];
  supportedTargets?: Array<"donggri" | "codex" | "agy" | "gemini">;
  codexInstalled?: boolean;
  codexInstallable?: boolean;
  sourceUrl?: string;
}

export interface SkillDetail {
  title: string;
  description: string;
  whenToUse: string[];
  weeklyInstalls: string;
  firstSeen: string;
  installCommand: string;
  platforms: Array<{ name: string; installs: string }>;
  audits: Array<{ name: string; status: string }>;
}

export type SkillLearnProvider = "claude" | "codex" | "agy" | "gemini" | "opencode" | "kimi";
export type SkillHistoryProvider = SkillLearnProvider | "copilot" | "antigravity" | "api";
export type SkillLearnStatus = "queued" | "running" | "succeeded" | "failed";

export interface SkillLearnJob {
  id: string;
  repo: string;
  skillId: string;
  providers: SkillLearnProvider[];
  agents: string[];
  status: SkillLearnStatus;
  command: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  exitCode: number | null;
  logTail: string[];
  error: string | null;
}
