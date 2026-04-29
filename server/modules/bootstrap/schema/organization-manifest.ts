export type OrganizationSeedVersion = "org-v2";
export const ORGANIZATION_SEED_VERSION: OrganizationSeedVersion = "org-v2";

export type OrganizationDepartmentId =
  | "development"
  | "planning-architecture"
  | "ui-ux"
  | "cicd-repo"
  | "management"
  | "pmo"
  | "qa"
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

export interface OrganizationAgentSeed {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: OrganizationDepartmentId;
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
  dev: "development",
  planning: "planning-architecture",
  design: "ui-ux",
  qa: "qa",
  devsecops: "cicd-repo",
  operations: "management",
};

export const ORGANIZATION_DEPARTMENTS: OrganizationDepartmentManifest[] = [
  {
    id: "development",
    name: "Development",
    name_ko: "개발",
    name_ja: "Development",
    name_zh: "Development",
    icon: "DEV",
    color: "#3b82f6",
    sort_order: 1,
  },
  {
    id: "planning-architecture",
    name: "Planning & Architecture",
    name_ko: "기획 및 설계",
    name_ja: "Planning & Architecture",
    name_zh: "Planning & Architecture",
    icon: "PLAN",
    color: "#f59e0b",
    sort_order: 2,
  },
  {
    id: "ui-ux",
    name: "UI/UX",
    name_ko: "UI/UX",
    name_ja: "UI/UX",
    name_zh: "UI/UX",
    icon: "UI",
    color: "#8b5cf6",
    sort_order: 3,
  },
  {
    id: "cicd-repo",
    name: "CI/CD & Repo",
    name_ko: "CI/CD 병합",
    name_ja: "CI/CD & Repo",
    name_zh: "CI/CD & Repo",
    icon: "CI",
    color: "#f97316",
    sort_order: 4,
  },
  {
    id: "management",
    name: "Management",
    name_ko: "관리",
    name_ja: "Management",
    name_zh: "Management",
    icon: "OPS",
    color: "#10b981",
    sort_order: 5,
  },
  {
    id: "pmo",
    name: "PMO",
    name_ko: "PMO",
    name_ja: "PMO",
    name_zh: "PMO",
    icon: "PMO",
    color: "#0f766e",
    sort_order: 6,
  },
  { id: "qa", name: "QA", name_ko: "QA", name_ja: "QA", name_zh: "QA", icon: "QA", color: "#ef4444", sort_order: 7 },
  {
    id: "bloggent",
    name: "Bloggent",
    name_ko: "블로그",
    name_ja: "Bloggent",
    name_zh: "Bloggent",
    icon: "BLOG",
    color: "#ec4899",
    sort_order: 8,
  },
  {
    id: "api-research",
    name: "API Research",
    name_ko: "API 전문",
    name_ja: "API Research",
    name_zh: "API Research",
    icon: "API",
    color: "#6366f1",
    sort_order: 9,
  },
  {
    id: "security-approval",
    name: "Security Approval",
    name_ko: "보안/승인",
    name_ja: "Security Approval",
    name_zh: "Security Approval",
    icon: "SEC",
    color: "#dc2626",
    sort_order: 10,
  },
  {
    id: "knowledge-docs",
    name: "Knowledge & Docs",
    name_ko: "지식/문서",
    name_ja: "Knowledge & Docs",
    name_zh: "Knowledge & Docs",
    icon: "DOCS",
    color: "#7c3aed",
    sort_order: 11,
  },
];

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

export const DEFAULT_DEPARTMENT_SKILL_BUNDLES: Record<OrganizationDepartmentId, string[]> = {
  development: ["typescript", "react-node", "test", "refactor", "review"],
  "planning-architecture": [
    "prd-writing",
    "user-discovery",
    "impact-mapping",
    "scope",
    "architecture-review",
    "roadmap-planning",
    "acceptance-criteria",
  ],
  "ui-ux": ["design-system", "interaction", "accessibility", "handoff"],
  "cicd-repo": ["git-workflow", "deployment", "release-checklist", "repo-bootstrap"],
  management: ["settings-control", "runtime-ops", "monitoring", "program-ops"],
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
  qa: ["regression", "test-strategy", "release-confidence", "review-consensus"],
  bloggent: ["bloggent-cli", "editorial-calendar", "seo-brief", "content-operations"],
  "api-research": ["docs-research", "citation", "search-specialist", "free-token-ops"],
  "security-approval": ["security-review", "approval-gate", "compliance", "policy-check"],
  "knowledge-docs": ["status-log", "kanban", "gantt", "decisions", "next-actions"],
};

export const ORGANIZATION_AGENT_SEEDS: OrganizationAgentSeed[] = [
  seed({
    id: "seed-development-lead",
    name: "Aria",
    name_ko: "아리아",
    department_id: "development",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "DEV",
    personality: "Pragmatic development lead",
    family: "architect",
    career_stage: "team-lead",
    specialization_key: "engineering.lead",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["architecture", "correctness", "maintainability"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-development-fe-senior",
    name: "Nova",
    name_ko: "노바",
    department_id: "development",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "FE",
    personality: "Frontend senior specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "frontend.react",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-development-fe-junior",
    name: "Pixel",
    name_ko: "픽셀",
    department_id: "development",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "FE",
    personality: "Frontend junior implementer",
    family: "frontend",
    career_stage: "junior",
    specialization_key: "frontend.react",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-development-be-senior",
    name: "Bolt",
    name_ko: "볼트",
    department_id: "development",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "BE",
    personality: "Backend senior implementer",
    family: "backend",
    career_stage: "senior",
    specialization_key: "backend.api",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["correctness", "architecture", "maintainability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-development-be-junior",
    name: "Orbit",
    name_ko: "오르빗",
    department_id: "development",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "BE",
    personality: "Backend junior implementer",
    family: "backend",
    career_stage: "junior",
    specialization_key: "backend.api",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["correctness", "architecture", "maintainability"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-planning-architecture-lead",
    name: "Sage",
    name_ko: "세이지",
    department_id: "planning-architecture",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "PLAN",
    personality: "Planning and architecture lead",
    family: "product-manager",
    career_stage: "team-lead",
    specialization_key: "planning.scope",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["scope", "risk", "priority"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-planning-architecture-senior",
    name: "Clio",
    name_ko: "클리오",
    department_id: "planning-architecture",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "ARCH",
    personality: "System design reviewer",
    family: "architect",
    career_stage: "senior",
    specialization_key: "system.design",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["scope", "architecture", "risk"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-planning-architecture-junior",
    name: "Prism",
    name_ko: "프리즘",
    department_id: "planning-architecture",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "REQ",
    personality: "Requirement breakdown assistant",
    family: "product-manager",
    career_stage: "junior",
    specialization_key: "requirements.breakdown",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["scope", "clarity", "priority"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-ui-ux-lead",
    name: "Iris",
    name_ko: "아이리스",
    department_id: "ui-ux",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "UI",
    personality: "UI system lead",
    family: "frontend",
    career_stage: "team-lead",
    specialization_key: "ui.system",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-ui-ux-senior",
    name: "Luna",
    name_ko: "루나",
    department_id: "ui-ux",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "UX",
    personality: "UX flow specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "ux.flow",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-ui-ux-junior",
    name: "Echo",
    name_ko: "에코",
    department_id: "ui-ux",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "PROTO",
    personality: "Prototype implementer",
    family: "frontend",
    career_stage: "junior",
    specialization_key: "ui.prototype",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["ux", "consistency", "a11y"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-cicd-repo-lead",
    name: "Atlas",
    name_ko: "아틀라스",
    department_id: "cicd-repo",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "REL",
    personality: "Repository and release lead",
    family: "orchestrator",
    career_stage: "team-lead",
    specialization_key: "release.control",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["security", "operability", "release"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-cicd-repo-senior",
    name: "Pipe",
    name_ko: "파이프",
    department_id: "cicd-repo",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "CI",
    personality: "GitHub Actions specialist",
    family: "backend",
    career_stage: "senior",
    specialization_key: "github.actions",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["security", "operability", "release"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-cicd-repo-junior",
    name: "Merge",
    name_ko: "머지",
    department_id: "cicd-repo",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "PR",
    personality: "Pull request hygiene operator",
    family: "reviewer",
    career_stage: "junior",
    specialization_key: "pr.hygiene",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["release", "consistency", "traceability"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-management-lead",
    name: "Harbor",
    name_ko: "하버",
    department_id: "management",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "OPS",
    personality: "Program operations manager",
    family: "memory-manager",
    career_stage: "team-lead",
    specialization_key: "program.ops",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["operations", "monitoring", "traceability"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-management-senior",
    name: "Turbo",
    name_ko: "터보",
    department_id: "management",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "RUN",
    personality: "Workspace state controller",
    family: "memory-manager",
    career_stage: "senior",
    specialization_key: "workspace.state",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["operations", "monitoring", "traceability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-management-junior",
    name: "Ledger",
    name_ko: "레저",
    department_id: "management",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "LOG",
    personality: "Operations record keeper",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "ops.records",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["operations", "traceability", "documentation"],
    max_review_rounds: null,
  }),

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
    review_lenses: ["scope", "priority", "dependency", "metrics", "risk"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-pmo-senior",
    name: "Vector",
    name_ko: "벡터",
    department_id: "pmo",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "ROAD",
    personality: "Roadmap control specialist",
    family: "product-manager",
    career_stage: "senior",
    specialization_key: "roadmap.control",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["scope", "priority", "timeline", "metrics"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-pmo-junior",
    name: "Tempo",
    name_ko: "템포",
    department_id: "pmo",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "STAT",
    personality: "Status rollup coordinator",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "status.rollup",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["timeline", "traceability", "clarity"],
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
    personality: "Quality lead",
    family: "qa",
    career_stage: "team-lead",
    specialization_key: "release.validation",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    review_lenses: ["test_coverage", "regression", "reliability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-qa-senior",
    name: "Lint",
    name_ko: "린트",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "TEST",
    personality: "Consensus review specialist",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "review.consensus",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["test_coverage", "regression", "reliability"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-qa-junior",
    name: "Doro",
    name_ko: "도로",
    department_id: "qa",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "BUG",
    personality: "Regression verification operator",
    family: "qa",
    career_stage: "junior",
    specialization_key: "regression",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["test_coverage", "regression", "reliability"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-bloggent-lead",
    name: "Quill",
    name_ko: "퀼",
    department_id: "bloggent",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "BLOG",
    personality: "Editorial strategy lead",
    family: "documenter",
    career_stage: "team-lead",
    specialization_key: "blog.strategy",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["clarity", "storytelling", "seo"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-bloggent-senior",
    name: "Verse",
    name_ko: "벌스",
    department_id: "bloggent",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "POST",
    personality: "Bloggent CLI operator",
    family: "documenter",
    career_stage: "senior",
    specialization_key: "bloggent.cli",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["clarity", "seo", "consistency"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-bloggent-junior",
    name: "Scout",
    name_ko: "스카우트",
    department_id: "bloggent",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "SRC",
    personality: "Content research assistant",
    family: "researcher",
    career_stage: "junior",
    specialization_key: "content.research",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["research", "citation", "clarity"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-api-research-lead",
    name: "Beacon",
    name_ko: "비컨",
    department_id: "api-research",
    role: "team_leader",
    cli_provider: "api",
    avatar_emoji: "API",
    personality: "Source discovery lead",
    family: "researcher",
    career_stage: "team-lead",
    specialization_key: "source.discovery",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["research", "citation", "scope"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-api-research-senior",
    name: "Query",
    name_ko: "쿼리",
    department_id: "api-research",
    role: "senior",
    cli_provider: "api",
    avatar_emoji: "DATA",
    personality: "Free-token research operator",
    family: "researcher",
    career_stage: "senior",
    specialization_key: "free-token.ops",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["research", "citation", "budget"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-api-research-junior",
    name: "Trace",
    name_ko: "트레이스",
    department_id: "api-research",
    role: "junior",
    cli_provider: "api",
    avatar_emoji: "CITE",
    personality: "Citation brief assistant",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "citation.brief",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["research", "citation", "clarity"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-security-approval-lead",
    name: "Vault",
    name_ko: "볼트",
    department_id: "security-approval",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "SEC",
    personality: "Security gate lead",
    family: "reviewer",
    career_stage: "team-lead",
    specialization_key: "security.gate",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    review_lenses: ["security", "compliance", "approval"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-security-approval-senior",
    name: "Shield",
    name_ko: "실드",
    department_id: "security-approval",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "AUDIT",
    personality: "Compliance audit reviewer",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "compliance.audit",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["security", "compliance", "approval"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-security-approval-junior",
    name: "Guard",
    name_ko: "가드",
    department_id: "security-approval",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "POL",
    personality: "Policy check operator",
    family: "qa",
    career_stage: "junior",
    specialization_key: "policy.check",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["security", "policy", "traceability"],
    max_review_rounds: null,
  }),

  seed({
    id: "seed-knowledge-docs-lead",
    name: "Memo",
    name_ko: "메모",
    department_id: "knowledge-docs",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "DOC",
    personality: "Artifact standards lead",
    family: "documenter",
    career_stage: "team-lead",
    specialization_key: "artifact.standards",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    review_lenses: ["documentation", "traceability", "governance"],
    max_review_rounds: 2,
  }),
  seed({
    id: "seed-knowledge-docs-senior",
    name: "Archive",
    name_ko: "아카이브",
    department_id: "knowledge-docs",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "DEC",
    personality: "Decision log curator",
    family: "memory-manager",
    career_stage: "senior",
    specialization_key: "decision.log",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    review_lenses: ["documentation", "traceability", "governance"],
    max_review_rounds: null,
  }),
  seed({
    id: "seed-knowledge-docs-junior",
    name: "Note",
    name_ko: "노트",
    department_id: "knowledge-docs",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "NOTE",
    personality: "Daily status recorder",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "daily.status",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    review_lenses: ["documentation", "clarity", "traceability"],
    max_review_rounds: null,
  }),
];

export const LEGACY_BUILTIN_AGENT_SIGNATURES: LegacyBuiltinAgentSignature[] = [
  {
    seed_agent_id: "seed-development-lead",
    name: "Aria",
    department_id: "dev",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Pragmatic dev lead",
  },
  {
    seed_agent_id: "seed-development-be-senior",
    name: "Bolt",
    department_id: "dev",
    role: "senior",
    cli_provider: "codex",
    personality: "Fast senior coder",
  },
  {
    seed_agent_id: "seed-development-fe-junior",
    name: "Nova",
    department_id: "dev",
    role: "junior",
    cli_provider: "copilot",
    personality: "Creative junior",
  },
  {
    seed_agent_id: "seed-ui-ux-lead",
    name: "Pixel",
    department_id: "design",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Design lead",
  },
  {
    seed_agent_id: "seed-ui-ux-senior",
    name: "Luna",
    department_id: "design",
    role: "junior",
    cli_provider: "gemini",
    personality: "UI designer",
  },
  {
    seed_agent_id: "seed-planning-architecture-lead",
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
    seed_agent_id: "seed-management-lead",
    name: "Atlas",
    department_id: "operations",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Ops coordinator",
  },
  {
    seed_agent_id: "seed-management-senior",
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
    seed_agent_id: "seed-qa-senior",
    name: "Lint",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    personality: "QA specialist",
  },
  {
    seed_agent_id: "seed-security-approval-lead",
    name: "Vault",
    department_id: "devsecops",
    role: "team_leader",
    cli_provider: "claude",
    personality: "Security architect",
  },
  {
    seed_agent_id: "seed-cicd-repo-senior",
    name: "Pipe",
    department_id: "devsecops",
    role: "senior",
    cli_provider: "codex",
    personality: "CI/CD specialist",
  },
  {
    seed_agent_id: "seed-qa-junior",
    name: "DORO",
    department_id: "qa",
    role: "junior",
    cli_provider: "gemini",
    personality: "QA junior",
  },
];

export const DEFAULT_ROOM_THEMES: Record<string, { accent: number; floor1: number; floor2: number; wall: number }> = {
  ceoOffice: { accent: 0xa77d0c, floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243 },
  development: { accent: 0x5a9fd4, floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7 },
  "planning-architecture": { accent: 0xd4a85a, floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871 },
  "ui-ux": { accent: 0x9a6fc4, floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad },
  "cicd-repo": { accent: 0xd4885a, floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871 },
  management: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
  pmo: { accent: 0x4cc3b2, floor1: 0xd5f1ed, floor2: 0xc5ebe6, wall: 0x4b9388 },
  qa: { accent: 0xd46a6a, floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979 },
  bloggent: { accent: 0xd46ab2, floor1: 0xf4d4e8, floor2: 0xf0c8e2, wall: 0xad7c9b },
  "api-research": { accent: 0x7376f2, floor1: 0xd8dcfb, floor2: 0xcfd4fa, wall: 0x6a73b8 },
  "security-approval": { accent: 0xc94a4a, floor1: 0xf2d0d0, floor2: 0xefc4c4, wall: 0x9f5b5 },
  "knowledge-docs": { accent: 0x8b63d2, floor1: 0xe4dbf7, floor2: 0xdccff3, wall: 0x7865a5 },
  breakRoom: { accent: 0xf0c878, floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83 },
};

export function getOrganizationAgentSeedById(id: string): OrganizationAgentSeed | null {
  return ORGANIZATION_AGENT_SEEDS.find((seed) => seed.id === id) ?? null;
}

export function getOrganizationDepartmentById(id: string): OrganizationDepartmentManifest | null {
  return ORGANIZATION_DEPARTMENTS.find((dept) => dept.id === id) ?? null;
}

export function getDefaultSkillBundleForDepartment(departmentId: string | null | undefined): string[] {
  const normalized = String(departmentId ?? "").trim() as OrganizationDepartmentId;
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
    case "development":
      return specialization.startsWith("frontend.") ? "frontend" : "backend";
    case "planning-architecture":
      return specialization.startsWith("system.") ? "architect" : "product-manager";
    case "ui-ux":
      return "frontend";
    case "cicd-repo":
      return specialization.startsWith("github.") ? "backend" : "orchestrator";
    case "management":
      return "memory-manager";
    case "pmo":
      return "orchestrator";
    case "qa":
      return "qa";
    case "bloggent":
      return specialization.startsWith("content.") ? "researcher" : "documenter";
    case "api-research":
      return specialization.startsWith("citation.") ? "documenter" : "researcher";
    case "security-approval":
      return specialization.startsWith("policy.") ? "qa" : "reviewer";
    case "knowledge-docs":
      return specialization.startsWith("decision.") ? "memory-manager" : "documenter";
    default:
      return "backend";
  }
}

export function getDefaultReviewLensesForDepartment(departmentId: string | null | undefined): string[] {
  const normalized = mapLegacyDepartmentId(departmentId);
  switch (normalized) {
    case "development":
      return ["correctness", "architecture", "maintainability"];
    case "planning-architecture":
      return ["scope", "risk", "priority"];
    case "ui-ux":
      return ["ux", "consistency", "a11y"];
    case "cicd-repo":
      return ["release", "security", "operability"];
    case "management":
      return ["operations", "monitoring", "traceability"];
    case "pmo":
      return ["scope", "priority", "timeline"];
    case "qa":
      return ["test_coverage", "regression", "reliability"];
    case "bloggent":
      return ["clarity", "seo", "storytelling"];
    case "api-research":
      return ["research", "citation", "budget"];
    case "security-approval":
      return ["security", "compliance", "approval"];
    case "knowledge-docs":
      return ["documentation", "traceability", "governance"];
    default:
      return ["general_quality"];
  }
}

export function getDepartmentResponsibilityText(departmentId: string | null | undefined): string {
  const normalized = mapLegacyDepartmentId(departmentId);
  switch (normalized) {
    case "development":
      return "implementation, bug fixes, refactors, API and UI coding";
    case "planning-architecture":
      return "requirements, scope, architecture, specification, roadmap";
    case "ui-ux":
      return "interface design, UX flow, accessibility, prototyping";
    case "cicd-repo":
      return "repository bootstrap, branch policy, PR, merge, release, CI/CD";
    case "management":
      return "program operations, settings control, monitoring, runtime administration";
    case "pmo":
      return "CEO directive triage, planning chair, milestone reset, resource rebalance";
    case "qa":
      return "regression, validation, release confidence, quality review";
    case "bloggent":
      return "Bloggent CLI operations, editorial planning, article production";
    case "api-research":
      return "research, source discovery, citation, free-token API usage";
    case "security-approval":
      return "security gate, compliance, approval checks for auth/release/billing/production";
    case "knowledge-docs":
      return "status, kanban, gantt, decisions, documentation governance";
    default:
      return "department-specific work within assigned capability";
  }
}
