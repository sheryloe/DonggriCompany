export const CANONICAL_PACK_KEYS = [
  "development",
  "donggri",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
] as const;

export type CanonicalPackKey = (typeof CANONICAL_PACK_KEYS)[number];
export type CanonicalPackTierPreference = "tier-1" | "tier-2" | "tier-3" | "tier-4";

export type CanonicalPackSource = {
  key: CanonicalPackKey;
  name: string;
  baseKey: CanonicalPackKey | null;
  derivedFrom: CanonicalPackKey | null;
  description: string;
  inputSchema: Record<string, unknown>;
  promptPreset: Record<string, unknown>;
  qaRules: Record<string, unknown>;
  outputTemplate: Record<string, unknown>;
  routingKeywords: string[];
  costProfile: Record<string, unknown>;
  requiredArtifacts: string[];
  outputContract: string[];
  modelTierPreference: CanonicalPackTierPreference;
};

const COMMON_REQUIRED_ARTIFACTS = ["STATUS.md", "KANBAN.md", "GANTT.md", "NEXT_ACTIONS.md", "DAILY/YYYY-MM-DD.md"];

const COMMON_COST_PROFILE = {
  maxInputTokens: 12000,
  maxOutputTokens: 6000,
  maxRounds: 3,
};

export const CANONICAL_PACK_SOURCES: CanonicalPackSource[] = [
  {
    key: "donggri",
    name: "Donggri Unified Pack",
    baseKey: null,
    derivedFrom: null,
    description: "Base canonical pack for multi-domain execution, review, reporting, and delivery.",
    inputSchema: {
      required: ["goal", "instruction"],
      optional: ["project", "target_audience", "format", "deadline", "source_policy", "story_tone", "character_roster"],
    },
    promptPreset: {
      mode: "donggri_unified",
      style: "pragmatic_and_structured",
      enforceImplementationEvidence: true,
      enforceNarrativeConsistency: true,
      enforceCitationsForResearch: true,
      includeExecutiveSummary: true,
    },
    qaRules: {
      requireSections: [
        "implementation_plan",
        "report_summary",
        "research_citations",
        "narrative_fragment",
        "next_actions",
      ],
      requireTestEvidenceWhenCodeIncluded: true,
      failWithoutCitationsOnResearchClaims: true,
      checkCharacterDrift: true,
      maxAutoFixPasses: 1,
    },
    outputTemplate: {
      sections: [
        "summary",
        "implementation_plan",
        "report_summary",
        "research_citations",
        "narrative_fragment",
        "next_actions",
      ],
    },
    routingKeywords: [
      "donggri",
      "unified pack",
      "hybrid workflow",
      "multi workflow",
      "implementation",
      "report",
      "research",
      "story",
    ],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxInputTokens: 16000,
      maxOutputTokens: 8000,
      defaultReasoning: "high",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: [
      "summary",
      "implementation_plan",
      "report_summary",
      "research_citations",
      "narrative_fragment",
      "next_actions",
    ],
    modelTierPreference: "tier-2",
  },
  {
    key: "development",
    name: "Development",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived engineering profile for implementation-heavy delivery.",
    inputSchema: {
      required: ["project", "instruction"],
      optional: ["constraints", "acceptance_criteria", "deadline"],
    },
    promptPreset: {
      mode: "engineering",
      style: "pragmatic",
      enforceTests: true,
    },
    qaRules: {
      requireTestEvidence: true,
      requireRiskNotes: true,
      maxAutoFixPasses: 1,
    },
    outputTemplate: {
      sections: ["summary", "changes", "verification", "next_steps"],
    },
    routingKeywords: ["fix", "bug", "refactor", "build", "api", "test", "implementation", "engineering"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["summary", "changes", "verification", "next_steps"],
    modelTierPreference: "tier-2",
  },
  {
    key: "novel",
    name: "Novel Writing",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived narrative profile for fiction, scenes, and chapter drafting.",
    inputSchema: {
      required: ["genre", "tone", "length"],
      optional: ["characters", "world_setting", "point_of_view"],
    },
    promptPreset: {
      mode: "creative_writing",
      keepCharacterConsistency: true,
    },
    qaRules: {
      checkToneConsistency: true,
      checkCharacterDrift: true,
    },
    outputTemplate: {
      sections: ["synopsis", "chapter_or_scene"],
    },
    routingKeywords: ["novel", "story", "chapter", "scene", "narrative", "fiction"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["synopsis", "chapter_or_scene"],
    modelTierPreference: "tier-4",
  },
  {
    key: "report",
    name: "Structured Report",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived reporting profile for structured summaries and action-oriented briefs.",
    inputSchema: {
      required: ["goal", "audience", "format"],
      optional: ["length", "tone", "deadline"],
    },
    promptPreset: {
      mode: "reporting",
      includeExecutiveSummary: true,
    },
    qaRules: {
      requireSections: ["summary", "body", "action_items"],
      failOnMissingSections: true,
    },
    outputTemplate: {
      sections: ["summary", "body", "action_items"],
    },
    routingKeywords: ["report", "analysis", "brief", "summary", "recommendation"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["summary", "body", "action_items"],
    modelTierPreference: "tier-4",
  },
  {
    key: "video_preprod",
    name: "Video Pre-production",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived planning profile for scripts, concepts, and shot lists.",
    inputSchema: {
      required: ["platform", "duration", "goal"],
      optional: ["target_audience", "style", "cta"],
    },
    promptPreset: {
      mode: "video_planning",
      includeShotList: true,
    },
    qaRules: {
      requireShotList: true,
      requireScript: true,
      requireRenderedVideo: true,
    },
    outputTemplate: {
      sections: ["concept", "script", "shot_list", "editing_notes", "video_file"],
    },
    routingKeywords: ["video", "shorts", "reel", "storyboard", "shot list", "script"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["concept", "script", "shot_list", "editing_notes", "video_file"],
    modelTierPreference: "tier-2",
  },
  {
    key: "web_research_report",
    name: "Web Research Report",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived research profile for citation-backed investigation and reporting.",
    inputSchema: {
      required: ["topic", "time_range"],
      optional: ["source_policy", "language", "depth"],
    },
    promptPreset: {
      mode: "web_research",
      requireCitations: true,
    },
    qaRules: {
      failWithoutCitations: true,
      citationStyle: "inline_links",
    },
    outputTemplate: {
      sections: ["summary", "findings", "citations", "recommendations"],
    },
    routingKeywords: ["research", "web search", "investigate", "source", "citation", "evidence"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 3,
      defaultReasoning: "high",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["summary", "findings", "citations", "recommendations"],
    modelTierPreference: "tier-4",
  },
  {
    key: "roleplay",
    name: "Roleplay",
    baseKey: "donggri",
    derivedFrom: "donggri",
    description: "Derived conversational profile for character-locked roleplay flows.",
    inputSchema: {
      required: ["character", "tone"],
      optional: ["setting", "constraints", "safety_rules"],
    },
    promptPreset: {
      mode: "roleplay",
      stayInCharacter: true,
    },
    qaRules: {
      keepCharacterVoice: true,
      enforceSafetyPolicy: true,
    },
    outputTemplate: {
      sections: ["dialogue"],
    },
    routingKeywords: ["roleplay", "rp", "character chat", "persona", "in character"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 1,
      defaultReasoning: "low",
    },
    requiredArtifacts: COMMON_REQUIRED_ARTIFACTS,
    outputContract: ["dialogue"],
    modelTierPreference: "tier-4",
  },
];
