export type OrganizationSeedVersion = "org-v5";
export const ORGANIZATION_SEED_VERSION: OrganizationSeedVersion = "org-v5";

export type OrganizationDepartmentId =
  | "pmo"
  | "planning"
  | "dev"
  | "design"
  | "qa"
  | "devsecops"
  | "operations"
  | "strategic_maintenance";

export type OrganizationDepartmentLegacyId =
  | "development"
  | "planning-architecture"
  | "ui-ux"
  | "cicd-repo"
  | "management"
  | "bloggent"
  | "api-research"
  | "security-approval"
  | "knowledge-docs";

export interface OrganizationDepartmentManifest {
  id: OrganizationDepartmentId;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface AgentVisualProfileSeed {
  agent_visual_profile_key: string;
  label_ko: string;
  style_prompt_en: string;
  character_bible_en: string;
  sprite_profile: {
    directions: Array<"front" | "left" | "back" | "right">;
    supports_walk: boolean;
    canvas_size: string;
  };
  preferred_asset_modules: string[];
  status: "active" | "reserve";
}

export interface OrganizationAgentSeed {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: OrganizationDepartmentId | OrganizationDepartmentLegacyId;
  role: "team_leader" | "senior" | "junior";
  cli_provider: "codex" | "api";
  avatar_emoji: string;
  personality: string;
  family:
    | "architect"
    | "backend"
    | "documenter"
    | "frontend"
    | "memory-manager"
    | "orchestrator"
    | "product-manager"
    | "qa"
    | "researcher"
    | "reviewer";
  career_stage: "junior" | "senior" | "team-lead";
  specialization_key: string;
  authority_level: number;
  execution_capability_profile: "primary_author" | "reviewer";
  sprite_number: number;
  visual_profile_key: string;
  recommended_subagents: string[];
  workflow_profile: {
    role: "primary_author" | "reviewer";
    review_lenses: string[];
    two_pass_required: boolean;
    max_review_rounds: number | null;
  };
}

export interface LegacyBuiltinAgentSignature {
  seed_agent_id: string;
  name: string;
  department_id: string;
  role: string;
  cli_provider: string;
  personality: string;
}

export const LEGACY_DEPARTMENT_ID_MAP: Record<string, OrganizationDepartmentId> = {
  pmo: "pmo",
  planning: "planning",
  dev: "dev",
  design: "design",
  qa: "qa",
  devsecops: "devsecops",
  operations: "operations",
  strategic_maintenance: "strategic_maintenance",
  development: "dev",
  "planning-architecture": "planning",
  "ui-ux": "design",
  "cicd-repo": "devsecops",
  "security-approval": "devsecops",
  management: "operations",
  "knowledge-docs": "operations",
  "api-research": "operations",
  bloggent: "operations",
};

export const ORGANIZATION_DEPARTMENTS: OrganizationDepartmentManifest[] = [
  {
    id: "pmo",
    name: "PMO",
    name_ko: "PMO",
    name_ja: "PMO",
    name_zh: "PMO",
    icon: "PMO",
    color: "#0f766e",
    sort_order: 1,
  },
  {
    id: "planning",
    name: "Planning",
    name_ko: "기획",
    name_ja: "Planning",
    name_zh: "Planning",
    icon: "PLAN",
    color: "#f59e0b",
    sort_order: 2,
  },
  {
    id: "dev",
    name: "Development",
    name_ko: "개발",
    name_ja: "Development",
    name_zh: "Development",
    icon: "DEV",
    color: "#3b82f6",
    sort_order: 3,
  },
  {
    id: "design",
    name: "Design",
    name_ko: "디자인",
    name_ja: "Design",
    name_zh: "Design",
    icon: "UI",
    color: "#8b5cf6",
    sort_order: 4,
  },
  {
    id: "qa",
    name: "QA",
    name_ko: "QA",
    name_ja: "QA",
    name_zh: "QA",
    icon: "QA",
    color: "#ef4444",
    sort_order: 5,
  },
  {
    id: "devsecops",
    name: "DevSecOps",
    name_ko: "DevSecOps",
    name_ja: "DevSecOps",
    name_zh: "DevSecOps",
    icon: "SEC",
    color: "#dc2626",
    sort_order: 6,
  },
  {
    id: "operations",
    name: "Operations",
    name_ko: "운영",
    name_ja: "Operations",
    name_zh: "Operations",
    icon: "OPS",
    color: "#10b981",
    sort_order: 7,
  },
  {
    id: "strategic_maintenance",
    name: "Strategic Maintenance",
    name_ko: "전략보수팀",
    name_ja: "Strategic Maintenance",
    name_zh: "Strategic Maintenance",
    icon: "SM",
    color: "#14b8a6",
    sort_order: 8,
  },
];

export const DEPARTMENT_SUBAGENT_RECOMMENDATIONS: Record<OrganizationDepartmentId, string[]> = {
  pmo: ["task-distributor", "project-manager", "risk-manager"],
  planning: ["product-manager", "architect-reviewer", "research-analyst"],
  dev: ["backend-developer", "frontend-developer", "typescript-pro", "database-optimizer"],
  design: ["ui-designer", "ux-researcher", "accessibility-tester"],
  qa: ["test-automator", "reviewer", "performance-monitor"],
  devsecops: ["security-auditor", "devops-engineer", "github:gh-fix-ci"],
  operations: ["documentation-engineer", "customer-success-manager", "sre-engineer"],
  strategic_maintenance: ["architect-reviewer", "security-auditor", "sre-engineer", "documentation-engineer"],
};

function makeProfile(
  role: "primary_author" | "reviewer",
  review_lenses: string[],
  max_review_rounds: number | null,
): OrganizationAgentSeed["workflow_profile"] {
  return { role, review_lenses, two_pass_required: true, max_review_rounds };
}

function seed(
  params: Omit<OrganizationAgentSeed, "name_ja" | "name_zh" | "workflow_profile"> & {
    review_lenses: string[];
    max_review_rounds: number | null;
  },
): OrganizationAgentSeed {
  return {
    ...params,
    name_ja: params.name,
    name_zh: params.name,
    workflow_profile: makeProfile(params.execution_capability_profile, params.review_lenses, params.max_review_rounds),
  };
}

const ACTIVE_VISUAL_PROFILE_NUMBERS = new Set([
  1, 2, 3, 4, 6, 7, 8, 11, 12, 13, 16, 17, 18, 21, 22, 23, 26, 27, 28, 31, 32, 33,
]);

function visualProfile(index: number): AgentVisualProfileSeed {
  const key = `agent-visual-${String(index).padStart(2, "0")}`;
  return {
    agent_visual_profile_key: key,
    label_ko: `비주얼 프로필 ${index}`,
    style_prompt_en:
      "Clean anime office character, readable silhouette, developer-console palette, consistent four-direction sprite identity.",
    character_bible_en:
      "Compact professional game-office avatar with distinct hair, outfit accent, and role-readable accessories. Keep proportions consistent for front, left, back, and right views.",
    sprite_profile: {
      directions: ["front", "left", "back", "right"],
      supports_walk: true,
      canvas_size: "512x512 contact-sheet-cell",
    },
    preferred_asset_modules: ["character-image", "sprite-4dir"],
    status: ACTIVE_VISUAL_PROFILE_NUMBERS.has(index) ? "active" : "reserve",
  };
}

export const AGENT_VISUAL_PROFILE_SEEDS: AgentVisualProfileSeed[] = Array.from({ length: 35 }, (_, index) =>
  visualProfile(index + 1),
);

export const RESERVE_VISUAL_PROFILE_POLICY = {
  status: "reserve_until_approved",
  activation_sources: ["new_hire", "project_pack", "staff_replacement"],
  approval_gate: "ceo_or_pmo",
  required_actions: ["update_seed_profile", "regenerate_agent_guides", "verify_sprite_manifest"],
  active_staff_profile_limit: 22,
} as const;

export const DEFAULT_DEPARTMENT_SKILL_BUNDLES: Record<OrganizationDepartmentId, string[]> = {
  pmo: [
    "task-distribution",
    "prd-brief",
    "rice-prioritization",
    "kano-moscow",
    "north-star-metrics",
    "experiment-design",
    "roadmap-planning",
    "stakeholder-brief",
    "decision-log",
  ],
  planning: [
    "prd-writing",
    "user-discovery",
    "impact-mapping",
    "scope",
    "architecture-review",
    "roadmap-planning",
    "acceptance-criteria",
  ],
  dev: ["typescript", "react-node", "test", "refactor", "review"],
  design: ["design-system", "interaction", "accessibility", "handoff"],
  qa: ["regression", "test-strategy", "release-confidence", "review-consensus"],
  devsecops: ["git-workflow", "deployment", "release-checklist", "repo-bootstrap", "security-review", "approval-gate"],
  operations: [
    "settings-control",
    "runtime-ops",
    "monitoring",
    "program-ops",
    "status-log",
    "kanban",
    "gantt",
    "decisions",
    "docs-research",
    "citation",
  ],
  strategic_maintenance: [
    "system-review",
    "architecture-review",
    "security-review",
    "monitoring",
    "status-log",
    "release-checklist",
    "docs-research",
  ],
};

export const ORGANIZATION_AGENT_SEEDS: OrganizationAgentSeed[] = [
  seed({
    id: "seed-pmo-lead",
    name: "Summit",
    name_ko: "서밋",
    department_id: "pmo",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "PMO",
    personality: "CEO-direct PMO chair",
    family: "orchestrator",
    career_stage: "team-lead",
    specialization_key: "pmo.command-desk",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 1,
    visual_profile_key: "agent-visual-01",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.pmo,
    review_lenses: ["scope", "priority", "dependency", "metrics", "risk"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-planning-lead",
    name: "Sage",
    name_ko: "세이지",
    department_id: "planning",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "PLAN",
    personality: "Planning lead for scope, architecture, and acceptance criteria",
    family: "product-manager",
    career_stage: "team-lead",
    specialization_key: "planning.scope",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 6,
    visual_profile_key: "agent-visual-06",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.planning,
    review_lenses: ["scope", "risk", "priority"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-planning-architecture-senior",
    name: "Clio",
    name_ko: "클리오",
    department_id: "planning",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "ARCH",
    personality: "System architecture reviewer",
    family: "architect",
    career_stage: "senior",
    specialization_key: "planning.architecture",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 7,
    visual_profile_key: "agent-visual-07",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.planning,
    review_lenses: ["scope", "architecture", "risk"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-planning-research-senior",
    name: "Prism",
    name_ko: "프리즘",
    department_id: "planning",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "REQ",
    personality: "Research and requirement breakdown specialist",
    family: "researcher",
    career_stage: "senior",
    specialization_key: "planning.research",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 8,
    visual_profile_key: "agent-visual-08",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.planning,
    review_lenses: ["research", "scope", "clarity"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-dev-lead",
    name: "Aria",
    name_ko: "아리아",
    department_id: "dev",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "DEV",
    personality: "Pragmatic development lead",
    family: "architect",
    career_stage: "team-lead",
    specialization_key: "engineering.lead",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 11,
    visual_profile_key: "agent-visual-11",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.dev,
    review_lenses: ["architecture", "correctness", "maintainability"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-dev-backend-senior",
    name: "Bolt",
    name_ko: "볼트",
    department_id: "dev",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "BE",
    personality: "Backend senior implementer",
    family: "backend",
    career_stage: "senior",
    specialization_key: "backend.api",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 12,
    visual_profile_key: "agent-visual-12",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.dev,
    review_lenses: ["correctness", "architecture", "maintainability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-dev-frontend-senior",
    name: "Nova",
    name_ko: "노바",
    department_id: "dev",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "FE",
    personality: "Frontend senior implementer",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "frontend.react",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 13,
    visual_profile_key: "agent-visual-13",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.dev,
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-design-lead",
    name: "Iris",
    name_ko: "아이리스",
    department_id: "design",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "UI",
    personality: "Design system lead",
    family: "frontend",
    career_stage: "team-lead",
    specialization_key: "design.system",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 16,
    visual_profile_key: "agent-visual-16",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.design,
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-design-ux-senior",
    name: "Luna",
    name_ko: "루나",
    department_id: "design",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "UX",
    personality: "UX flow and research specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "ux.flow",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 17,
    visual_profile_key: "agent-visual-17",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.design,
    review_lenses: ["ux", "clarity", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-design-ui-system-senior",
    name: "Pixel",
    name_ko: "픽셀",
    department_id: "design",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "UI",
    personality: "UI system and component consistency specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "ui.system",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 18,
    visual_profile_key: "agent-visual-18",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.design,
    review_lenses: ["consistency", "design-system", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-qa-lead",
    name: "Hawk",
    name_ko: "호크",
    department_id: "qa",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "QA",
    personality: "Quality release gate lead",
    family: "qa",
    career_stage: "team-lead",
    specialization_key: "quality.release-gate",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    sprite_number: 21,
    visual_profile_key: "agent-visual-21",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.qa,
    review_lenses: ["test_coverage", "regression", "reliability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-qa-regression-senior",
    name: "Lint",
    name_ko: "린트",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "TEST",
    personality: "Regression verification specialist",
    family: "qa",
    career_stage: "senior",
    specialization_key: "quality.regression",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 22,
    visual_profile_key: "agent-visual-22",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.qa,
    review_lenses: ["test_coverage", "regression", "reliability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-qa-release-senior",
    name: "Doro",
    name_ko: "도로",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "REL",
    personality: "Release validation and evidence specialist",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "quality.release-validation",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 23,
    visual_profile_key: "agent-visual-23",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.qa,
    review_lenses: ["release", "traceability", "reliability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-devsecops-lead",
    name: "Vault",
    name_ko: "볼트",
    department_id: "devsecops",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "SEC",
    personality: "Security and approval gate lead",
    family: "reviewer",
    career_stage: "team-lead",
    specialization_key: "security.gate",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    sprite_number: 26,
    visual_profile_key: "agent-visual-26",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.devsecops,
    review_lenses: ["security", "compliance", "approval"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-devsecops-platform-senior",
    name: "Atlas",
    name_ko: "아틀라스",
    department_id: "devsecops",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "CI",
    personality: "Platform and CI/CD reliability specialist",
    family: "backend",
    career_stage: "senior",
    specialization_key: "platform.cicd",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 27,
    visual_profile_key: "agent-visual-27",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.devsecops,
    review_lenses: ["operability", "release", "security"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-devsecops-security-senior",
    name: "Shield",
    name_ko: "실드",
    department_id: "devsecops",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "AUDIT",
    personality: "Security audit and compliance specialist",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "security.audit",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 28,
    visual_profile_key: "agent-visual-28",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.devsecops,
    review_lenses: ["security", "compliance", "traceability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-operations-lead",
    name: "Harbor",
    name_ko: "하버",
    department_id: "operations",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "OPS",
    personality: "Operations control and knowledge governance lead",
    family: "memory-manager",
    career_stage: "team-lead",
    specialization_key: "operations.control",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 31,
    visual_profile_key: "agent-visual-31",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.operations,
    review_lenses: ["operations", "monitoring", "traceability"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-operations-docs-senior",
    name: "Memo",
    name_ko: "메모",
    department_id: "operations",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "DOC",
    personality: "Documentation and decision-log specialist",
    family: "documenter",
    career_stage: "senior",
    specialization_key: "operations.documentation",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 32,
    visual_profile_key: "agent-visual-32",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.operations,
    review_lenses: ["documentation", "traceability", "governance"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-operations-runtime-senior",
    name: "Turbo",
    name_ko: "터보",
    department_id: "operations",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "RUN",
    personality: "Runtime, settings, and workspace state specialist",
    family: "memory-manager",
    career_stage: "senior",
    specialization_key: "operations.runtime",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 33,
    visual_profile_key: "agent-visual-33",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.operations,
    review_lenses: ["operations", "monitoring", "traceability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-strategic-maintenance-lead",
    name: "Beacon",
    name_ko: "비컨",
    department_id: "strategic_maintenance",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "SM",
    personality: "Strategic maintenance lead for recurring system review, improvement triage, and executive reporting",
    family: "orchestrator",
    career_stage: "team-lead",
    specialization_key: "strategic-maintenance.lead",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    sprite_number: 2,
    visual_profile_key: "agent-visual-02",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.strategic_maintenance,
    review_lenses: ["system_health", "priority", "risk", "maintainability", "traceability"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-strategic-maintenance-system-senior",
    name: "Kairo",
    name_ko: "카이로",
    department_id: "strategic_maintenance",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "REV",
    personality: "System review senior for architecture drift, reliability gaps, and maintenance backlog analysis",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "strategic-maintenance.system-review",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 3,
    visual_profile_key: "agent-visual-03",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.strategic_maintenance,
    review_lenses: ["architecture", "reliability", "security", "maintainability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-strategic-maintenance-automation-senior",
    name: "Orbit",
    name_ko: "오빗",
    department_id: "strategic_maintenance",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "AUTO",
    personality: "Automation and reporting senior for scheduled reviews, task creation, and Gmail status reporting",
    family: "documenter",
    career_stage: "senior",
    specialization_key: "strategic-maintenance.automation",
    authority_level: 4,
    execution_capability_profile: "reviewer",
    sprite_number: 4,
    visual_profile_key: "agent-visual-04",
    recommended_subagents: DEPARTMENT_SUBAGENT_RECOMMENDATIONS.strategic_maintenance,
    review_lenses: ["automation", "documentation", "traceability", "operations"],
    max_review_rounds: null,
  }),
];

export const LEGACY_BUILTIN_AGENT_SIGNATURES: LegacyBuiltinAgentSignature[] = [
  {
    seed_agent_id: "seed-dev-lead",
    name: "Aria",
    department_id: "dev",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Pragmatic dev lead",
  },
  {
    seed_agent_id: "seed-dev-backend-senior",
    name: "Bolt",
    department_id: "dev",
    role: "senior",
    cli_provider: "codex",
    personality: "Fast senior coder",
  },
  {
    seed_agent_id: "seed-dev-frontend-senior",
    name: "Nova",
    department_id: "dev",
    role: "junior",
    cli_provider: "copilot",
    personality: "Creative junior",
  },
  {
    seed_agent_id: "seed-design-lead",
    name: "Pixel",
    department_id: "design",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Design lead",
  },
  {
    seed_agent_id: "seed-design-ux-senior",
    name: "Luna",
    department_id: "design",
    role: "junior",
    cli_provider: "gemini",
    personality: "UI designer",
  },
  {
    seed_agent_id: "seed-planning-lead",
    name: "Sage",
    department_id: "planning",
    role: "team_leader",
    cli_provider: "codex",
    personality: "Strategy planner",
  },
  {
    seed_agent_id: "seed-planning-architecture-senior",
    name: "Clio",
    department_id: "planning",
    role: "senior",
    cli_provider: "claude",
    personality: "Data-oriented planner",
  },
  {
    seed_agent_id: "seed-operations-lead",
    name: "Atlas",
    department_id: "operations",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Ops coordinator",
  },
  {
    seed_agent_id: "seed-operations-runtime-senior",
    name: "Turbo",
    department_id: "operations",
    role: "senior",
    cli_provider: "codex",
    personality: "Automation expert",
  },
  {
    seed_agent_id: "seed-qa-lead",
    name: "Hawk",
    department_id: "qa",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Quality lead",
  },
  {
    seed_agent_id: "seed-qa-regression-senior",
    name: "Lint",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    personality: "QA specialist",
  },
  {
    seed_agent_id: "seed-devsecops-lead",
    name: "Vault",
    department_id: "devsecops",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Security architect",
  },
  {
    seed_agent_id: "seed-devsecops-platform-senior",
    name: "Pipe",
    department_id: "devsecops",
    role: "senior",
    cli_provider: "codex",
    personality: "CI/CD specialist",
  },
];

export const DEFAULT_ROOM_THEMES: Record<string, { accent: number; floor1: number; floor2: number; wall: number }> = {
  ceoOffice: { accent: 0xa77d0c, floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243 },
  pmo: { accent: 0x4cc3b2, floor1: 0xd5f1ed, floor2: 0xc5ebe6, wall: 0x4b9388 },
  planning: { accent: 0xd4a85a, floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871 },
  dev: { accent: 0x5a9fd4, floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7 },
  design: { accent: 0x9a6fc4, floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad },
  qa: { accent: 0xd46a6a, floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979 },
  devsecops: { accent: 0xc94a4a, floor1: 0xf2d0d0, floor2: 0xefc4c4, wall: 0x9f5b5 },
  operations: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  strategic_maintenance: { accent: 0x45b9aa, floor1: 0xd3f0ec, floor2: 0xc6ebe6, wall: 0x629e96 },
  development: { accent: 0x5a9fd4, floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7 },
  "planning-architecture": { accent: 0xd4a85a, floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871 },
  "ui-ux": { accent: 0x9a6fc4, floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad },
  "cicd-repo": { accent: 0xc94a4a, floor1: 0xf2d0d0, floor2: 0xefc4c4, wall: 0x9f5b5 },
  management: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  bloggent: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  "api-research": { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  "security-approval": { accent: 0xc94a4a, floor1: 0xf2d0d0, floor2: 0xefc4c4, wall: 0x9f5b5 },
  "knowledge-docs": { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  breakRoom: { accent: 0xf0c878, floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83 },
  studyRoom: { accent: 0x6aa6d8, floor1: 0xdbeaf6, floor2: 0xd0e2f1, wall: 0x6e8da8 },
  afterHoursRoom: { accent: 0x8192c8, floor1: 0xdce1f2, floor2: 0xd2d9ee, wall: 0x687399 },
};

export function getOrganizationAgentSeedById(id: string): OrganizationAgentSeed | null {
  return ORGANIZATION_AGENT_SEEDS.find((seed) => seed.id === id) ?? null;
}

export function getOrganizationDepartmentById(id: string): OrganizationDepartmentManifest | null {
  return ORGANIZATION_DEPARTMENTS.find((dept) => dept.id === id) ?? null;
}

export function getDefaultSkillBundleForDepartment(departmentId: string | null | undefined): string[] {
  const normalized = mapLegacyDepartmentId(departmentId) as OrganizationDepartmentId | null;
  if (!normalized) return [];
  return [...(DEFAULT_DEPARTMENT_SKILL_BUNDLES[normalized] ?? [])];
}

export function mapLegacyDepartmentId(departmentId: string | null | undefined): string | null {
  const normalized = String(departmentId ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return LEGACY_DEPARTMENT_ID_MAP[normalized] ?? normalized;
}

export function deriveCanonicalFamilyFromDepartment(
  departmentId: string | null | undefined,
  specializationKey?: string | null | undefined,
): OrganizationAgentSeed["family"] {
  const normalized = mapLegacyDepartmentId(departmentId);
  const specialization = String(specializationKey ?? "")
    .trim()
    .toLowerCase();
  switch (normalized) {
    case "dev":
      return specialization.startsWith("frontend.") ? "frontend" : "backend";
    case "planning":
      return specialization.includes("architecture") ? "architect" : "product-manager";
    case "design":
      return "frontend";
    case "pmo":
      return "orchestrator";
    case "qa":
      return "qa";
    case "devsecops":
      return specialization.startsWith("platform.") ? "backend" : "reviewer";
    case "operations":
      return specialization.includes("runtime") ? "memory-manager" : "documenter";
    case "strategic_maintenance":
      return specialization.includes("automation") ? "documenter" : "reviewer";
    default:
      return "backend";
  }
}

export function getDefaultReviewLensesForDepartment(departmentId: string | null | undefined): string[] {
  const normalized = mapLegacyDepartmentId(departmentId);
  switch (normalized) {
    case "dev":
      return ["correctness", "architecture", "maintainability"];
    case "planning":
      return ["scope", "risk", "priority"];
    case "design":
      return ["ux", "consistency", "a11y"];
    case "pmo":
      return ["scope", "priority", "timeline"];
    case "qa":
      return ["test_coverage", "regression", "reliability"];
    case "devsecops":
      return ["security", "compliance", "approval"];
    case "operations":
      return ["documentation", "traceability", "governance"];
    case "strategic_maintenance":
      return ["system_health", "risk", "maintainability", "traceability"];
    default:
      return ["general_quality"];
  }
}

export function getDepartmentResponsibilityText(departmentId: string | null | undefined): string {
  const normalized = mapLegacyDepartmentId(departmentId);
  switch (normalized) {
    case "dev":
      return "implementation, bug fixes, refactors, API and UI coding";
    case "planning":
      return "requirements, scope, architecture, specification, roadmap";
    case "design":
      return "interface design, UX flow, accessibility, prototyping";
    case "pmo":
      return "CEO directive triage, planning chair, milestone reset, resource rebalance";
    case "qa":
      return "regression, validation, release confidence, quality review";
    case "devsecops":
      return "security gate, compliance, approval checks for auth/release/billing/production";
    case "operations":
      return "program operations, settings control, monitoring, documentation governance, weekly skill and module reports";
    case "strategic_maintenance":
      return "recurring system review, strategic maintenance planning, improvement task creation, and Gmail status reports";
    default:
      return "department-specific work within assigned capability";
  }
}

export function buildSeedAgentProfile(seed: OrganizationAgentSeed): Record<string, unknown> {
  const departmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;
  const promotionPolicy =
    seed.role === "team_leader"
      ? { mode: "manual", from_role: "senior", to_role: "team_leader", notes: "team_leader manual only" }
      : { mode: "manual", notes: "default seed is senior; junior growth remains available for non-seed agents" };
  return {
    role_template: seed.role,
    growth_tier: seed.role === "team_leader" ? 5 : 4,
    capabilities: {
      execution: seed.execution_capability_profile === "primary_author" ? 5 : 4,
      architecture: seed.family === "architect" || seed.role === "team_leader" ? 5 : 3,
      review: 5,
      research: seed.family === "researcher" ? 5 : 3,
      communication: seed.role === "team_leader" ? 5 : 4,
      leadership: seed.role === "team_leader" ? 5 : 3,
    },
    prompt_style: {
      tone: 4,
      autonomy: 4,
      strictness: 5,
      collaboration: 5,
    },
    specialties: [seed.specialization_key, ...seed.recommended_subagents],
    custom_prompt_override: null,
    class_path: {
      class_stage_1: departmentId,
      class_stage_2: seed.family,
      class_stage_3: seed.specialization_key,
    },
    promotion_policy: promotionPolicy,
    visual_profile_key: seed.visual_profile_key,
    sprite_number: seed.sprite_number,
    preferred_subagents: seed.recommended_subagents,
    subagent_supervision_rule:
      "Active staff members supervise specialized subagents instead of owning every specialty directly.",
  };
}
