import { DEFAULT_WORKFLOW_PACK_KEY, type WorkflowPackKey } from "./definitions.ts";

export type WorkflowPackRouteCandidate = {
  packKey: WorkflowPackKey;
  confidence: number;
  reason: string;
};

export type WorkflowPackRouteDecision = {
  packKey: WorkflowPackKey;
  confidence: number;
  reason: string;
  candidates: WorkflowPackRouteCandidate[];
  requiresConfirmation: boolean;
};

function scoreKeywords(text: string, keywords: readonly string[]): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

export function classifyWorkflowPackText(text: string): WorkflowPackRouteDecision {
  const normalized = String(text ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return {
      packKey: DEFAULT_WORKFLOW_PACK_KEY,
      confidence: 0.35,
      reason: "empty_text",
      candidates: [{ packKey: DEFAULT_WORKFLOW_PACK_KEY, confidence: 0.35, reason: "empty_text" }],
      requiresConfirmation: true,
    };
  }

  const scores = new Map<WorkflowPackKey, number>();
  const addScore = (packKey: WorkflowPackKey, score: number) => {
    if (score <= 0) return;
    scores.set(packKey, Math.min(0.98, (scores.get(packKey) ?? 0) + score));
  };

  const donggriKeywords = [
    "donggri",
    "dongri",
    "\uB3D9\uADF8\uB9AC",
    "\uB3D9\uADF8\uB9AC\uD329",
    "\uD1B5\uD569 \uD329",
    "unified pack",
    "hybrid pack",
    "instagram",
    "\uC778\uC2A4\uD0C0",
    "\uCE74\uB4DC\uB274\uC2A4",
    "card news",
    "brand visual",
  ] as const;
  const webResearchKeywords = [
    "web search",
    "research",
    "fact check",
    "market research",
    "\uB9AC\uC11C\uCE58",
    "\uC790\uB8CC \uC870\uC0AC",
  ] as const;
  const reportKeywords = [
    "report",
    "summary",
    "brief",
    "executive summary",
    "\uBCF4\uACE0\uC11C",
    "\uC694\uC57D",
    "\uBE0C\uB9AC\uD504",
  ] as const;
  const novelKeywords = [
    "novel",
    "fiction",
    "chapter",
    "\uC18C\uC124",
    "\uCC55\uD130",
    "\uC138\uACC4\uAD00",
    "\uC2A4\uD1A0\uB9AC",
  ] as const;
  const videoKeywords = [
    "video",
    "storyboard",
    "shot list",
    "\uC601\uC0C1",
    "\uCF58\uD2F0",
    "\uC2A4\uD1A0\uB9AC\uBCF4\uB4DC",
    "\uC1FC\uD2B8",
  ] as const;
  const roleplayKeywords = [
    "roleplay",
    "in character",
    "rp",
    "\uB864\uD50C\uB808\uC789",
    "\uCE90\uB9AD\uD130 \uC5F0\uAE30",
    "\uCE90\uB9AD\uD130 \uB300\uD654",
  ] as const;
  const developmentKeywords = [
    "code",
    "bug",
    "fix",
    "refactor",
    "build",
    "api",
    "feature",
    "deploy",
    "\uAC1C\uBC1C",
    "\uBC84\uADF8",
    "\uD14C\uC2A4\uD2B8",
    "\uB9AC\uD329\uD130",
  ] as const;

  addScore("donggri", scoreKeywords(normalized, donggriKeywords) * 0.34);
  addScore("web_research_report", scoreKeywords(normalized, webResearchKeywords) * 0.3);
  addScore("report", scoreKeywords(normalized, reportKeywords) * 0.26);
  addScore("novel", scoreKeywords(normalized, novelKeywords) * 0.3);
  addScore("video_preprod", scoreKeywords(normalized, videoKeywords) * 0.31);
  addScore("roleplay", scoreKeywords(normalized, roleplayKeywords) * 0.34);
  addScore("development", scoreKeywords(normalized, developmentKeywords) * 0.24);

  if (scores.size <= 0) addScore(DEFAULT_WORKFLOW_PACK_KEY, 0.5);

  const sorted = Array.from(scores.entries())
    .map(([packKey, confidence]) => ({ packKey, confidence, reason: "keyword_match" }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = sorted[0]!;
  const requiresConfirmation = top.confidence < 0.72 || top.confidence - (sorted[1]?.confidence ?? 0) < 0.08;

  return {
    packKey: top.packKey,
    confidence: top.confidence,
    reason: top.reason,
    candidates: sorted.slice(0, 3),
    requiresConfirmation,
  };
}
