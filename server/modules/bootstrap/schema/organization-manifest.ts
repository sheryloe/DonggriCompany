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
    name_ja: "開発",
    name_zh: "开发",
    icon: "DEV",
    color: "#3b82f6",
    sort_order: 1,
  },
  {
    id: "planning-architecture",
    name: "Planning & Architecture",
    name_ko: "기획 및 설계",
    name_ja: "企画・設計",
    name_zh: "企划与设计",
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
    name_ja: "CI/CD・リポジトリ",
    name_zh: "CI/CD 与仓库",
    icon: "CI",
    color: "#f97316",
    sort_order: 4,
  },
  {
    id: "management",
    name: "Management",
    name_ko: "관리",
    name_ja: "管理",
    name_zh: "管理",
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
  {
    id: "qa",
    name: "QA",
    name_ko: "QA",
    name_ja: "QA",
    name_zh: "QA",
    icon: "QA",
    color: "#ef4444",
    sort_order: 7,
  },
  {
    id: "bloggent",
    name: "Bloggent",
    name_ko: "블로그",
    name_ja: "ブログ",
    name_zh: "博客",
    icon: "BLOG",
    color: "#ec4899",
    sort_order: 8,
  },
  {
    id: "api-research",
    name: "API Research",
    name_ko: "API 전문",
    name_ja: "API リサーチ",
    name_zh: "API 研究",
    icon: "API",
    color: "#6366f1",
    sort_order: 9,
  },
  {
    id: "security-approval",
    name: "Security Approval",
    name_ko: "보안/승인",
    name_ja: "セキュリティ承認",
    name_zh: "安全审批",
    icon: "SEC",
    color: "#dc2626",
    sort_order: 10,
  },
  {
    id: "knowledge-docs",
    name: "Knowledge & Docs",
    name_ko: "지식/문서",
    name_ja: "知識・文書",
    name_zh: "知识与文档",
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
  return {
    role,
    review_lenses,
    two_pass_required: true,
    max_review_rounds,
  };
}

export const DEFAULT_DEPARTMENT_SKILL_BUNDLES: Record<OrganizationDepartmentId, string[]> = {
  development: ["typescript", "react-node", "test", "refactor", "review"],
  "planning-architecture": ["spec", "scope", "architecture-review", "roadmap"],
  "ui-ux": ["design-system", "interaction", "accessibility", "handoff"],
  "cicd-repo": ["git-workflow", "deployment", "release-checklist", "repo-bootstrap"],
  management: ["settings-control", "runtime-ops", "monitoring", "program-ops"],
  pmo: ["task-distribution", "milestone-reset", "dependency-map", "rebalance"],
  qa: ["regression", "test-strategy", "release-confidence", "review-consensus"],
  bloggent: ["bloggent-cli", "editorial-calendar", "seo-brief", "content-operations"],
  "api-research": ["docs-research", "citation", "search-specialist", "free-token-ops"],
  "security-approval": ["security-review", "approval-gate", "compliance", "policy-check"],
  "knowledge-docs": ["status-log", "kanban", "gantt", "decisions", "next-actions"],
};

export const ORGANIZATION_AGENT_SEEDS: OrganizationAgentSeed[] = [
  {
    id: "seed-development-lead",
    name: "Aria",
    name_ko: "아리아",
    name_ja: "アリア",
    name_zh: "阿丽娅",
    department_id: "development",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "👩‍💻",
    personality: "Pragmatic development lead",
    family: "architect",
    career_stage: "team-lead",
    specialization_key: "engineering.lead",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["architecture", "correctness", "maintainability"], 2),
  },
  {
    id: "seed-development-fe-senior",
    name: "Nova",
    name_ko: "노바",
    name_ja: "ノヴァ",
    name_zh: "诺瓦",
    department_id: "development",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🎨",
    personality: "Frontend senior specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "frontend.react",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["ux", "consistency", "a11y"], null),
  },
  {
    id: "seed-development-fe-junior",
    name: "Pixel",
    name_ko: "픽셀",
    name_ja: "ピクセル",
    name_zh: "像素",
    department_id: "development",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🧩",
    personality: "Frontend junior implementer",
    family: "frontend",
    career_stage: "junior",
    specialization_key: "frontend.react",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["ux", "consistency", "a11y"], null),
  },
  {
    id: "seed-development-be-senior",
    name: "Bolt",
    name_ko: "볼트",
    name_ja: "ボルト",
    name_zh: "博尔特",
    department_id: "development",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "⚙️",
    personality: "Backend senior implementer",
    family: "backend",
    career_stage: "senior",
    specialization_key: "backend.api",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["correctness", "architecture", "maintainability"], null),
  },
  {
    id: "seed-development-be-junior",
    name: "Orbit",
    name_ko: "오르빗",
    name_ja: "オービット",
    name_zh: "轨道",
    department_id: "development",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🛰️",
    personality: "Backend junior implementer",
    family: "backend",
    career_stage: "junior",
    specialization_key: "backend.api",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["correctness", "architecture", "maintainability"], null),
  },
  {
    id: "seed-planning-architecture-lead",
    name: "Sage",
    name_ko: "세이지",
    name_ja: "セージ",
    name_zh: "赛吉",
    department_id: "planning-architecture",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🧭",
    personality: "Planning and architecture lead",
    family: "product-manager",
    career_stage: "team-lead",
    specialization_key: "planning.scope",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["scope", "risk", "priority"], 2),
  },
  {
    id: "seed-planning-architecture-senior",
    name: "Clio",
    name_ko: "클리오",
    name_ja: "クリオ",
    name_zh: "克利奥",
    department_id: "planning-architecture",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🗺️",
    personality: "System design reviewer",
    family: "architect",
    career_stage: "senior",
    specialization_key: "system.design",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["scope", "architecture", "risk"], null),
  },
  {
    id: "seed-planning-architecture-junior",
    name: "Prism",
    name_ko: "프리즘",
    name_ja: "プリズム",
    name_zh: "棱镜",
    department_id: "planning-architecture",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "📐",
    personality: "Requirement breakdown assistant",
    family: "product-manager",
    career_stage: "junior",
    specialization_key: "requirements.breakdown",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["scope", "clarity", "priority"], null),
  },
  {
    id: "seed-ui-ux-lead",
    name: "Iris",
    name_ko: "아이리스",
    name_ja: "アイリス",
    name_zh: "艾瑞丝",
    department_id: "ui-ux",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🪄",
    personality: "UI system lead",
    family: "frontend",
    career_stage: "team-lead",
    specialization_key: "ui.system",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["ux", "consistency", "a11y"], 2),
  },
  {
    id: "seed-ui-ux-senior",
    name: "Luna",
    name_ko: "루나",
    name_ja: "ルナ",
    name_zh: "露娜",
    department_id: "ui-ux",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🌙",
    personality: "UX flow specialist",
    family: "frontend",
    career_stage: "senior",
    specialization_key: "ux.flow",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["ux", "consistency", "a11y"], null),
  },
  {
    id: "seed-ui-ux-junior",
    name: "Echo",
    name_ko: "에코",
    name_ja: "エコー",
    name_zh: "回声",
    department_id: "ui-ux",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "✨",
    personality: "Prototype implementer",
    family: "frontend",
    career_stage: "junior",
    specialization_key: "ui.prototype",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["ux", "consistency", "a11y"], null),
  },
  {
    id: "seed-cicd-repo-lead",
    name: "Atlas",
    name_ko: "아틀라스",
    name_ja: "アトラス",
    name_zh: "阿特拉斯",
    department_id: "cicd-repo",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🚀",
    personality: "Repository and release lead",
    family: "orchestrator",
    career_stage: "team-lead",
    specialization_key: "release.control",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["security", "operability", "release"], 2),
  },
  {
    id: "seed-cicd-repo-senior",
    name: "Pipe",
    name_ko: "파이프",
    name_ja: "パイプ",
    name_zh: "流水线",
    department_id: "cicd-repo",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🔧",
    personality: "GitHub Actions specialist",
    family: "backend",
    career_stage: "senior",
    specialization_key: "github.actions",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["security", "operability", "release"], null),
  },
  {
    id: "seed-cicd-repo-junior",
    name: "Merge",
    name_ko: "머지",
    name_ja: "マージ",
    name_zh: "合并",
    department_id: "cicd-repo",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🔀",
    personality: "Pull request hygiene operator",
    family: "reviewer",
    career_stage: "junior",
    specialization_key: "pr.hygiene",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["release", "consistency", "traceability"], null),
  },
  {
    id: "seed-management-lead",
    name: "Harbor",
    name_ko: "하버",
    name_ja: "ハーバー",
    name_zh: "港湾",
    department_id: "management",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🗂️",
    personality: "Program operations manager",
    family: "memory-manager",
    career_stage: "team-lead",
    specialization_key: "program.ops",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["operations", "monitoring", "traceability"], 2),
  },
  {
    id: "seed-management-senior",
    name: "Turbo",
    name_ko: "터보",
    name_ja: "ターボ",
    name_zh: "涡轮",
    department_id: "management",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🛠️",
    personality: "Workspace state controller",
    family: "memory-manager",
    career_stage: "senior",
    specialization_key: "workspace.state",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["operations", "monitoring", "traceability"], null),
  },
  {
    id: "seed-management-junior",
    name: "Ledger",
    name_ko: "레저",
    name_ja: "レジャー",
    name_zh: "账本",
    department_id: "management",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "📒",
    personality: "Operations record keeper",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "ops.records",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["operations", "traceability", "documentation"], null),
  },
  {
    id: "seed-pmo-lead",
    name: "Summit",
    name_ko: "서밋",
    name_ja: "サミット",
    name_zh: "峰会",
    department_id: "pmo",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🎯",
    personality: "CEO-direct PMO chair",
    family: "orchestrator",
    career_stage: "team-lead",
    specialization_key: "pmo.command-desk",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["scope", "priority", "dependency"], 2),
  },
  {
    id: "seed-pmo-senior",
    name: "Vector",
    name_ko: "벡터",
    name_ja: "ベクター",
    name_zh: "向量",
    department_id: "pmo",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "📊",
    personality: "Roadmap control specialist",
    family: "product-manager",
    career_stage: "senior",
    specialization_key: "roadmap.control",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["scope", "priority", "timeline"], null),
  },
  {
    id: "seed-pmo-junior",
    name: "Tempo",
    name_ko: "템포",
    name_ja: "テンポ",
    name_zh: "节奏",
    department_id: "pmo",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "📝",
    personality: "Status rollup coordinator",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "status.rollup",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["timeline", "traceability", "clarity"], null),
  },
  {
    id: "seed-qa-lead",
    name: "Hawk",
    name_ko: "호크",
    name_ja: "ホーク",
    name_zh: "鹰眼",
    department_id: "qa",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🦅",
    personality: "Quality lead",
    family: "qa",
    career_stage: "team-lead",
    specialization_key: "release.validation",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["test_coverage", "regression", "reliability"], null),
  },
  {
    id: "seed-qa-senior",
    name: "Lint",
    name_ko: "린트",
    name_ja: "リント",
    name_zh: "检查",
    department_id: "qa",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🧪",
    personality: "Consensus review specialist",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "review.consensus",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["test_coverage", "regression", "reliability"], null),
  },
  {
    id: "seed-qa-junior",
    name: "Doro",
    name_ko: "도로",
    name_ja: "ドロ",
    name_zh: "多罗",
    department_id: "qa",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🔍",
    personality: "Regression verification operator",
    family: "qa",
    career_stage: "junior",
    specialization_key: "regression",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["test_coverage", "regression", "reliability"], null),
  },
  {
    id: "seed-bloggent-lead",
    name: "Quill",
    name_ko: "퀼",
    name_ja: "クイル",
    name_zh: "羽笔",
    department_id: "bloggent",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "✍️",
    personality: "Editorial strategy lead",
    family: "documenter",
    career_stage: "team-lead",
    specialization_key: "blog.strategy",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["clarity", "storytelling", "seo"], 2),
  },
  {
    id: "seed-bloggent-senior",
    name: "Verse",
    name_ko: "버스",
    name_ja: "ヴァース",
    name_zh: "诗句",
    department_id: "bloggent",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "📰",
    personality: "Bloggent CLI operator",
    family: "documenter",
    career_stage: "senior",
    specialization_key: "bloggent.cli",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["clarity", "seo", "consistency"], null),
  },
  {
    id: "seed-bloggent-junior",
    name: "Scout",
    name_ko: "스카우트",
    name_ja: "スカウト",
    name_zh: "侦察",
    department_id: "bloggent",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🔎",
    personality: "Content research assistant",
    family: "researcher",
    career_stage: "junior",
    specialization_key: "content.research",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["research", "citation", "clarity"], null),
  },
  {
    id: "seed-api-research-lead",
    name: "Beacon",
    name_ko: "비컨",
    name_ja: "ビーコン",
    name_zh: "信标",
    department_id: "api-research",
    role: "team_leader",
    cli_provider: "api",
    avatar_emoji: "📡",
    personality: "Source discovery lead",
    family: "researcher",
    career_stage: "team-lead",
    specialization_key: "source.discovery",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["research", "citation", "scope"], 2),
  },
  {
    id: "seed-api-research-senior",
    name: "Query",
    name_ko: "쿼리",
    name_ja: "クエリ",
    name_zh: "查询",
    department_id: "api-research",
    role: "senior",
    cli_provider: "api",
    avatar_emoji: "🌐",
    personality: "Free-token research operator",
    family: "researcher",
    career_stage: "senior",
    specialization_key: "free-token.ops",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["research", "citation", "budget"], null),
  },
  {
    id: "seed-api-research-junior",
    name: "Trace",
    name_ko: "트레이스",
    name_ja: "トレース",
    name_zh: "追踪",
    department_id: "api-research",
    role: "junior",
    cli_provider: "api",
    avatar_emoji: "🧾",
    personality: "Citation brief assistant",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "citation.brief",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["research", "citation", "clarity"], null),
  },
  {
    id: "seed-security-approval-lead",
    name: "Vault",
    name_ko: "볼트",
    name_ja: "ヴォルト",
    name_zh: "保险库",
    department_id: "security-approval",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "🛡️",
    personality: "Security gate lead",
    family: "reviewer",
    career_stage: "team-lead",
    specialization_key: "security.gate",
    authority_level: 7,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["security", "compliance", "approval"], null),
  },
  {
    id: "seed-security-approval-senior",
    name: "Shield",
    name_ko: "쉴드",
    name_ja: "シールド",
    name_zh: "护盾",
    department_id: "security-approval",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🔐",
    personality: "Compliance audit reviewer",
    family: "reviewer",
    career_stage: "senior",
    specialization_key: "compliance.audit",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["security", "compliance", "approval"], null),
  },
  {
    id: "seed-security-approval-junior",
    name: "Guard",
    name_ko: "가드",
    name_ja: "ガード",
    name_zh: "守卫",
    department_id: "security-approval",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "🚨",
    personality: "Policy check operator",
    family: "qa",
    career_stage: "junior",
    specialization_key: "policy.check",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["security", "policy", "traceability"], null),
  },
  {
    id: "seed-knowledge-docs-lead",
    name: "Memo",
    name_ko: "메모",
    name_ja: "メモ",
    name_zh: "备忘",
    department_id: "knowledge-docs",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "📚",
    personality: "Artifact standards lead",
    family: "documenter",
    career_stage: "team-lead",
    specialization_key: "artifact.standards",
    authority_level: 7,
    execution_capability_profile: "primary_author",
    workflow_profile: makeProfile("primary_author", ["documentation", "traceability", "governance"], 2),
  },
  {
    id: "seed-knowledge-docs-senior",
    name: "Archive",
    name_ko: "아카이브",
    name_ja: "アーカイブ",
    name_zh: "档案",
    department_id: "knowledge-docs",
    role: "senior",
    cli_provider: "codex",
    avatar_emoji: "🗃️",
    personality: "Decision log curator",
    family: "memory-manager",
    career_stage: "senior",
    specialization_key: "decision.log",
    authority_level: 3,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["documentation", "traceability", "governance"], null),
  },
  {
    id: "seed-knowledge-docs-junior",
    name: "Note",
    name_ko: "노트",
    name_ja: "ノート",
    name_zh: "笔记",
    department_id: "knowledge-docs",
    role: "junior",
    cli_provider: "codex",
    avatar_emoji: "📌",
    personality: "Daily status recorder",
    family: "documenter",
    career_stage: "junior",
    specialization_key: "daily.status",
    authority_level: 1,
    execution_capability_profile: "reviewer",
    workflow_profile: makeProfile("reviewer", ["documentation", "clarity", "traceability"], null),
  },
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
  "security-approval": { accent: 0xc94a4a, floor1: 0xf2d0d0, floor2: 0xefc4c4, wall: 0x9f5b5b },
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
  const normalized = String(departmentId ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return LEGACY_DEPARTMENT_ID_MAP[normalized] ?? normalized;
}

export function deriveCanonicalFamilyFromDepartment(
  departmentId: string | null | undefined,
  specializationKey?: string | null | undefined,
): OrganizationAgentSeed["family"] {
  const normalized = mapLegacyDepartmentId(departmentId);
  const specialization = String(specializationKey ?? "").trim().toLowerCase();
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
