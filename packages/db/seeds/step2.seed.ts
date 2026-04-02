import type { FatiguePrecision, ProviderUsageProbeProvider } from "@workspace/shared";

export type AccountPoolSeed = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  planTier: string | null;
  fatigueMode: FatiguePrecision;
  maxConcurrency: number | null;
  isEnabled: 0 | 1;
  notes: string | null;
};

export type RuntimeCapabilitySeed = {
  id: string;
  key: string;
  label: string;
  description: string | null;
};

export type RuntimeProfileSeed = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  profileName: string;
  profilePath: string;
  status: string;
  capabilitiesJson: string[];
};

export type RuntimeProfileCapabilitySeed = {
  id: string;
  runtimeProfileId: string;
  capabilityId: string;
  strength: number;
};

export type RoutingRuleTargetSeed = {
  id: string;
  runtimeProfileKey: string;
  targetOrder: number;
  minConfidence: number;
  maxFatiguePercent: number | null;
  fallbackOnly: 0 | 1;
};

export type RoutingRuleSeed = {
  id: string;
  key: string;
  label: string;
  taskType: string | null;
  roleKey: string | null;
  workspaceMode: string | null;
  priority: number;
  isEnabled: 0 | 1;
  matchJson: Record<string, unknown>;
  targets: RoutingRuleTargetSeed[];
};

export type Step2SeedData = {
  accountPools: AccountPoolSeed[];
  runtimeCapabilities: RuntimeCapabilitySeed[];
  runtimeProfiles: RuntimeProfileSeed[];
  runtimeProfileCapabilities: RuntimeProfileCapabilitySeed[];
  routingRules: RoutingRuleSeed[];
};

export const STEP2_SEED_DATA: Step2SeedData = {
  accountPools: [
    {
      id: "pool_claude_pro_main",
      key: "claude-pro-main",
      provider: "claude",
      label: "Claude Pro Main",
      planTier: "pro",
      fatigueMode: "derived",
      maxConcurrency: 2,
      isEnabled: 1,
      notes: null
    },
    {
      id: "pool_codex_plus_main",
      key: "codex-plus-main",
      provider: "codex",
      label: "Codex Plus Main",
      planTier: "plus",
      fatigueMode: "derived",
      maxConcurrency: 2,
      isEnabled: 1,
      notes: null
    },
    {
      id: "pool_codex_pro_main",
      key: "codex-pro-main",
      provider: "codex",
      label: "Codex Pro Main",
      planTier: "pro",
      fatigueMode: "derived",
      maxConcurrency: 3,
      isEnabled: 1,
      notes: null
    },
    {
      id: "pool_gemini_ai_pro_main",
      key: "gemini-ai-pro-main",
      provider: "gemini",
      label: "Gemini AI Pro Main",
      planTier: "ai_pro",
      fatigueMode: "official",
      maxConcurrency: 2,
      isEnabled: 1,
      notes: null
    }
  ],
  runtimeCapabilities: [
    { id: "cap_planning", key: "planning", label: "Planning", description: null },
    { id: "cap_coding", key: "coding", label: "Coding", description: null },
    { id: "cap_review", key: "review", label: "Review", description: null },
    { id: "cap_research", key: "research", label: "Research", description: null },
    {
      id: "cap_patch",
      key: "patch_generation",
      label: "Patch Generation",
      description: null
    }
  ],
  runtimeProfiles: [
    {
      id: "rt_claude_planner_a",
      provider: "claude",
      accountPoolId: "pool_claude_pro_main",
      profileName: "claude-planner-a",
      profilePath: ".claude/profiles/planner-a",
      status: "active",
      capabilitiesJson: ["planning", "review", "research"]
    },
    {
      id: "rt_claude_builder_a",
      provider: "claude",
      accountPoolId: "pool_claude_pro_main",
      profileName: "claude-builder-a",
      profilePath: ".claude/profiles/builder-a",
      status: "active",
      capabilitiesJson: ["coding", "review", "patch_generation"]
    },
    {
      id: "rt_codex_builder_pro_a",
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      profileName: "codex-builder-pro-a",
      profilePath: ".codex/profiles/builder-pro-a",
      status: "active",
      capabilitiesJson: ["coding", "patch_generation", "review"]
    },
    {
      id: "rt_codex_builder_plus_a",
      provider: "codex",
      accountPoolId: "pool_codex_plus_main",
      profileName: "codex-builder-plus-a",
      profilePath: ".codex/profiles/builder-plus-a",
      status: "active",
      capabilitiesJson: ["coding", "patch_generation"]
    },
    {
      id: "rt_gemini_research_a",
      provider: "gemini",
      accountPoolId: "pool_gemini_ai_pro_main",
      profileName: "gemini-research-a",
      profilePath: ".config/gemini/profiles/research-a",
      status: "active",
      capabilitiesJson: ["research", "planning"]
    }
  ],
  runtimeProfileCapabilities: [
    {
      id: "rpc_claude_planner_a_planning",
      runtimeProfileId: "rt_claude_planner_a",
      capabilityId: "cap_planning",
      strength: 85
    },
    {
      id: "rpc_claude_planner_a_review",
      runtimeProfileId: "rt_claude_planner_a",
      capabilityId: "cap_review",
      strength: 70
    },
    {
      id: "rpc_claude_planner_a_research",
      runtimeProfileId: "rt_claude_planner_a",
      capabilityId: "cap_research",
      strength: 62
    },
    {
      id: "rpc_claude_builder_a_coding",
      runtimeProfileId: "rt_claude_builder_a",
      capabilityId: "cap_coding",
      strength: 76
    },
    {
      id: "rpc_claude_builder_a_review",
      runtimeProfileId: "rt_claude_builder_a",
      capabilityId: "cap_review",
      strength: 80
    },
    {
      id: "rpc_claude_builder_a_patch",
      runtimeProfileId: "rt_claude_builder_a",
      capabilityId: "cap_patch",
      strength: 72
    },
    {
      id: "rpc_codex_builder_pro_a_coding",
      runtimeProfileId: "rt_codex_builder_pro_a",
      capabilityId: "cap_coding",
      strength: 92
    },
    {
      id: "rpc_codex_builder_pro_a_patch",
      runtimeProfileId: "rt_codex_builder_pro_a",
      capabilityId: "cap_patch",
      strength: 90
    },
    {
      id: "rpc_codex_builder_pro_a_review",
      runtimeProfileId: "rt_codex_builder_pro_a",
      capabilityId: "cap_review",
      strength: 75
    },
    {
      id: "rpc_codex_builder_plus_a_coding",
      runtimeProfileId: "rt_codex_builder_plus_a",
      capabilityId: "cap_coding",
      strength: 84
    },
    {
      id: "rpc_codex_builder_plus_a_patch",
      runtimeProfileId: "rt_codex_builder_plus_a",
      capabilityId: "cap_patch",
      strength: 82
    },
    {
      id: "rpc_gemini_research_a_research",
      runtimeProfileId: "rt_gemini_research_a",
      capabilityId: "cap_research",
      strength: 90
    },
    {
      id: "rpc_gemini_research_a_planning",
      runtimeProfileId: "rt_gemini_research_a",
      capabilityId: "cap_planning",
      strength: 70
    }
  ],
  routingRules: [
    {
      id: "rule_blog_research",
      key: "blog-research",
      label: "Blog Research Routing",
      taskType: "research",
      roleKey: "researcher",
      workspaceMode: null,
      priority: 10,
      isEnabled: 1,
      matchJson: {},
      targets: [
        {
          id: "target_blog_research_primary",
          runtimeProfileKey: "gemini-research-a",
          targetOrder: 1,
          minConfidence: 0,
          maxFatiguePercent: 80,
          fallbackOnly: 0
        },
        {
          id: "target_blog_research_fallback",
          runtimeProfileKey: "claude-planner-a",
          targetOrder: 2,
          minConfidence: 0,
          maxFatiguePercent: 85,
          fallbackOnly: 1
        }
      ]
    },
    {
      id: "rule_code_builder",
      key: "code-builder",
      label: "Code Builder Routing",
      taskType: "coding",
      roleKey: "builder",
      workspaceMode: null,
      priority: 10,
      isEnabled: 1,
      matchJson: {},
      targets: [
        {
          id: "target_code_builder_primary",
          runtimeProfileKey: "codex-builder-pro-a",
          targetOrder: 1,
          minConfidence: 0,
          maxFatiguePercent: 85,
          fallbackOnly: 0
        },
        {
          id: "target_code_builder_fallback",
          runtimeProfileKey: "claude-builder-a",
          targetOrder: 2,
          minConfidence: 0,
          maxFatiguePercent: 75,
          fallbackOnly: 1
        }
      ]
    }
  ]
};
