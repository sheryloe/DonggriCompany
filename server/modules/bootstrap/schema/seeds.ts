import type { DatabaseSync } from "node:sqlite";
import { seedDefaultWorkflowPacks } from "./workflow-pack-seeds.ts";
import { upsertAgentGuideFile } from "../../routes/core/agents/agent-guide-files.ts";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

type MasterDepartment = {
  id: string;
  name: string;
  name_ko: string;
  icon: string;
  color: string;
  sort_order: number;
  description: string;
};

type MasterAgent = {
  id: string;
  name: string;
  name_ko: string;
  department_id: string;
  cli_provider: "codex" | "api";
  avatar_emoji: string;
  personality: string;
  family: string;
  specialization_key: string;
  execution_capability_profile: "primary_author" | "reviewer";
  authority_level: number;
  sprite_number: number;
  skills: string[];
  recommended_subagents: string[];
  review_lenses: string[];
};

export const DONGRI_MASTER_SEED_VERSION = "dongri-grigri-v1";

const MASTER_DEPARTMENTS: MasterDepartment[] = [
  {
    id: "planning",
    name: "Planning",
    name_ko: "기획",
    icon: "PLAN",
    color: "#2563eb",
    sort_order: 1,
    description: "요구사항, 범위, 구조, 우선순위를 정리하는 마스터 부서입니다.",
  },
  {
    id: "development",
    name: "Development",
    name_ko: "개발",
    icon: "DEV",
    color: "#0f766e",
    sort_order: 2,
    description: "승인된 구현 범위 안에서 API, UI, 데이터 흐름을 구축하는 마스터 부서입니다.",
  },
  {
    id: "design",
    name: "Design",
    name_ko: "디자인",
    icon: "UX",
    color: "#7c3aed",
    sort_order: 3,
    description: "화면 구조, 사용성, 접근성, 시각 시스템을 책임지는 마스터 부서입니다.",
  },
  {
    id: "quality",
    name: "Quality",
    name_ko: "품질",
    icon: "QA",
    color: "#dc2626",
    sort_order: 4,
    description: "테스트, 회귀 검증, 릴리스 품질, 증거 기록을 관리하는 마스터 부서입니다.",
  },
  {
    id: "operations",
    name: "Operations",
    name_ko: "운영",
    icon: "OPS",
    color: "#0891b2",
    sort_order: 5,
    description: "프로젝트 scope 전환, Git/Docker/runtime, 메모리, 배포 승인 게이트를 관리합니다.",
  },
  {
    id: "instructor",
    name: "External Instructor",
    name_ko: "외부강사",
    icon: "EDU",
    color: "#d97706",
    sort_order: 6,
    description: "오픈소스 트렌드와 Skill 후보를 읽기 전용으로 조사해 도입 후보를 제안합니다.",
  },
];

const MASTER_AGENTS: MasterAgent[] = [
  {
    id: "master-planning",
    name: "Planning Master",
    name_ko: "기획 마스터",
    department_id: "planning",
    cli_provider: "codex",
    avatar_emoji: "PL",
    personality: "Root SDD intake, requirements, design, task planning, and approval checklist owner.",
    family: "product-manager",
    specialization_key: "planning.master",
    execution_capability_profile: "primary_author",
    authority_level: 7,
    sprite_number: 6,
    skills: ["requirements", "design", "task-planning", "repo-map", "approval-checklist"],
    recommended_subagents: ["research-analyst", "architect-reviewer", "risk-modeler"],
    review_lenses: ["scope", "risk", "traceability"],
  },
  {
    id: "master-development",
    name: "Development Master",
    name_ko: "개발 마스터",
    department_id: "development",
    cli_provider: "codex",
    avatar_emoji: "DV",
    personality: "Approved implementation owner. Writes only through approved tasks and repo-map paths.",
    family: "backend",
    specialization_key: "development.master",
    execution_capability_profile: "primary_author",
    authority_level: 7,
    sprite_number: 11,
    skills: ["typescript", "react", "node", "database", "refactor", "test"],
    recommended_subagents: ["frontend-developer", "backend-developer", "database-optimizer", "typescript-pro"],
    review_lenses: ["correctness", "maintainability", "contract"],
  },
  {
    id: "master-design",
    name: "Design Master",
    name_ko: "디자인 마스터",
    department_id: "design",
    cli_provider: "codex",
    avatar_emoji: "UX",
    personality: "Office-first UX, Korean readability, theme tokens, visual rhythm, and accessibility owner.",
    family: "frontend",
    specialization_key: "design.master",
    execution_capability_profile: "primary_author",
    authority_level: 7,
    sprite_number: 16,
    skills: ["design-system", "interaction", "accessibility", "visual-qa", "korean-ui-copy"],
    recommended_subagents: ["ui-designer", "ux-researcher", "accessibility-tester"],
    review_lenses: ["ux", "readability", "a11y"],
  },
  {
    id: "master-quality",
    name: "Quality Master",
    name_ko: "품질 마스터",
    department_id: "quality",
    cli_provider: "codex",
    avatar_emoji: "QA",
    personality: "Findings-first review, regression gate, build gate, and evidence owner.",
    family: "qa",
    specialization_key: "quality.master",
    execution_capability_profile: "reviewer",
    authority_level: 7,
    sprite_number: 21,
    skills: ["test-strategy", "regression", "contract-check", "browser-smoke", "evidence"],
    recommended_subagents: ["test-automator", "reviewer", "performance-monitor"],
    review_lenses: ["test_coverage", "regression", "evidence"],
  },
  {
    id: "master-operations",
    name: "Operations Master",
    name_ko: "운영 마스터",
    department_id: "operations",
    cli_provider: "codex",
    avatar_emoji: "OP",
    personality: "Single persistent project operations agent for project scopes, runtime, Git, Docker, AgentMemory, and Gemini review.",
    family: "memory-manager",
    specialization_key: "operations.master",
    execution_capability_profile: "primary_author",
    authority_level: 7,
    sprite_number: 31,
    skills: ["runtime-ops", "git-safety", "agentmemory", "gemini-review", "handoff", "status-log"],
    recommended_subagents: ["sre-engineer", "documentation-engineer", "security-auditor"],
    review_lenses: ["operability", "approval", "traceability"],
  },
  {
    id: "master-instructor",
    name: "External Instructor Master",
    name_ko: "외부강사 마스터",
    department_id: "instructor",
    cli_provider: "codex",
    avatar_emoji: "ED",
    personality: "Read-only open-source trend scout for high-star repositories and Skill candidate lessons.",
    family: "researcher",
    specialization_key: "instructor.opensource",
    execution_capability_profile: "reviewer",
    authority_level: 4,
    sprite_number: 33,
    skills: ["open-source-scout", "skill-candidate", "trend-analysis", "license-check"],
    recommended_subagents: ["research-analyst", "documentation-engineer", "security-auditor"],
    review_lenses: ["source_quality", "license", "adoption_fit"],
  },
];

const MASTER_ROOM_THEMES: Record<string, { accent: number; floor1: number; floor2: number; wall: number }> = {
  ceoOffice: { accent: 0x0ea5e9, floor1: 0xe7f5fb, floor2: 0xdff0f8, wall: 0x6aa4bf },
  planning: { accent: 0x2563eb, floor1: 0xdbeafe, floor2: 0xc7dcfb, wall: 0x6b8ac3 },
  development: { accent: 0x0f766e, floor1: 0xd9f2ee, floor2: 0xc7ebe4, wall: 0x5c9990 },
  dev: { accent: 0x0f766e, floor1: 0xd9f2ee, floor2: 0xc7ebe4, wall: 0x5c9990 },
  design: { accent: 0x7c3aed, floor1: 0xe9ddff, floor2: 0xddcff8, wall: 0x8a73b8 },
  quality: { accent: 0xdc2626, floor1: 0xf8dada, floor2: 0xf0caca, wall: 0xb56d6d },
  qa: { accent: 0xdc2626, floor1: 0xf8dada, floor2: 0xf0caca, wall: 0xb56d6d },
  operations: { accent: 0x0891b2, floor1: 0xd8f0f5, floor2: 0xc9e7ee, wall: 0x669aaa },
  instructor: { accent: 0xd97706, floor1: 0xf7e4c7, floor2: 0xf1d7ad, wall: 0xac8451 },
  breakRoom: { accent: 0xf0c878, floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83 },
  studyRoom: { accent: 0x6aa6d8, floor1: 0xdbeaf6, floor2: 0xd0e2f1, wall: 0x6e8da8 },
  afterHoursRoom: { accent: 0x8192c8, floor1: 0xdce1f2, floor2: 0xd2d9ee, wall: 0x687399 },
};

const OPERATIONS_REVIEW_DEFAULT_SETTINGS = {
  enabled: false,
  cadence: "weekly",
  dayOfWeek: 1,
  hour: 9,
  timezone: "Asia/Seoul",
  createTasks: true,
  maxTasksPerRun: 5,
  emailEnabled: false,
  emailTo: [],
  emailCc: [],
};

function buildWorkflowProfile(seed: MasterAgent): string {
  return JSON.stringify({
    role: seed.execution_capability_profile,
    review_lenses: seed.review_lenses,
    two_pass_required: true,
    max_review_rounds: seed.execution_capability_profile === "primary_author" ? 2 : null,
  });
}

function buildMasterAgentProfile(seed: MasterAgent): Record<string, unknown> {
  return {
    model: "dongri-grigri-master-agent",
    role_label: "마스터 에이전트",
    can_spawn_subagents: true,
    subagent_policy: {
      lifecycle: "single-task",
      max_recreate_attempts: 2,
      parent_accepts_or_rejects: true,
      subagents_cannot_spawn_subagents: true,
    },
    class_path: ["department-master", seed.department_id, seed.specialization_key],
    promotion_policy: "master_agent fixed role; no junior/senior ladder",
    project_scope_policy:
      seed.department_id === "operations"
        ? "OPS is the single persistent project operations agent; projects are scoped runs."
        : "Project operations are routed through OPS; implementation work still requires approved tasks.",
    capabilities: {
      execution: seed.execution_capability_profile === "primary_author" ? 5 : 3,
      review: 5,
      research: seed.family === "researcher" ? 5 : 3,
      memory: seed.department_id === "operations" ? 5 : 3,
      leadership: 5,
    },
    specialties: [seed.specialization_key, ...seed.recommended_subagents],
    preferred_subagents: seed.recommended_subagents,
    visual_profile_key: `agent-visual-${String(seed.sprite_number).padStart(2, "0")}`,
    sprite_number: seed.sprite_number,
  };
}

function ensureSkillBundleHistory(db: DbLike, agentId: string, provider: string, seed: MasterAgent): void {
  const now = Date.now();
  for (const skillId of seed.skills) {
    db.prepare(
      `
      INSERT INTO skill_learning_history (
        id, job_id, provider, repo, skill_id, skill_label, status, command, run_started_at, run_completed_at, created_at, updated_at
      )
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, provider) DO UPDATE SET
        repo = excluded.repo,
        skill_label = excluded.skill_label,
        status = 'succeeded',
        command = excluded.command,
        run_started_at = excluded.run_started_at,
        run_completed_at = excluded.run_completed_at,
        updated_at = excluded.updated_at
    `,
    ).run(
      `seed-skill:${agentId}:${skillId}`,
      provider,
      `builtin://${DONGRI_MASTER_SEED_VERSION}/${seed.department_id}`,
      skillId,
      skillId.replace(/[-_.]+/g, " "),
      `dongri-master-seed-sync ${DONGRI_MASTER_SEED_VERSION}`,
      now,
      now,
      now,
      now,
    );
  }
}

function syncSeedGuideFiles(db: DbLike, seed: MasterAgent, workflowProfile: string): void {
  const row = db.prepare("SELECT stats_tasks_done, stats_xp FROM agents WHERE id = ? LIMIT 1").get(seed.id) as
    | { stats_tasks_done?: number; stats_xp?: number }
    | undefined;
  upsertAgentGuideFile({
    id: seed.id,
    name: seed.name,
    role: "team_leader",
    departmentId: seed.department_id,
    workflowProfileJson: workflowProfile,
    agentProfileJson: JSON.stringify(buildMasterAgentProfile(seed)),
    statsTasksDone: Number(row?.stats_tasks_done ?? 0),
    statsXp: Number(row?.stats_xp ?? 0),
    skillBundle: seed.skills,
  });
}

function insertMissingMasterDepartment(db: DbLike, department: MasterDepartment): boolean {
  const result = db
    .prepare(
      `
      INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, description, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        name_ko = excluded.name_ko,
        icon = excluded.icon,
        color = excluded.color,
        description = excluded.description,
        sort_order = excluded.sort_order
    `,
    )
    .run(
      department.id,
      department.name,
      department.name_ko,
      department.name,
      department.name,
      department.icon,
      department.color,
      department.description,
      department.sort_order,
    ) as { changes?: number };
  return Number(result.changes ?? 0) > 0;
}

function insertMissingMasterAgent(db: DbLike, seed: MasterAgent): boolean {
  const workflowProfileJson = buildWorkflowProfile(seed);
  const result = db
    .prepare(
      `
      INSERT INTO agents (
        id, name, name_ko, name_ja, name_zh, department_id, workflow_pack_key, role, cli_provider,
        family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile,
        agent_profile_json, avatar_emoji, sprite_number, personality
      )
      VALUES (?, ?, ?, ?, ?, ?, 'development', 'team_leader', ?, ?, 'team-lead', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        name_ko = excluded.name_ko,
        department_id = excluded.department_id,
        cli_provider = excluded.cli_provider,
        family = excluded.family,
        career_stage = excluded.career_stage,
        specialization_key = excluded.specialization_key,
        authority_level = excluded.authority_level,
        execution_capability_profile = excluded.execution_capability_profile,
        workflow_profile = excluded.workflow_profile,
        agent_profile_json = excluded.agent_profile_json,
        avatar_emoji = excluded.avatar_emoji,
        sprite_number = excluded.sprite_number,
        personality = excluded.personality
    `,
    )
    .run(
      seed.id,
      seed.name,
      seed.name_ko,
      seed.name,
      seed.name,
      seed.department_id,
      seed.cli_provider,
      seed.family,
      seed.specialization_key,
      seed.authority_level,
      seed.execution_capability_profile,
      workflowProfileJson,
      JSON.stringify(buildMasterAgentProfile(seed)),
      seed.avatar_emoji,
      seed.sprite_number,
      seed.personality,
    ) as { changes?: number };
  ensureSkillBundleHistory(db, seed.id, seed.cli_provider, seed);
  syncSeedGuideFiles(db, seed, workflowProfileJson);
  return Number(result.changes ?? 0) > 0;
}

function syncDongriMasterOrganizationSeeds(db: DbLike): void {
  let touchedDepartments = 0;
  let touchedAgents = 0;
  for (const department of MASTER_DEPARTMENTS) {
    if (insertMissingMasterDepartment(db, department)) touchedDepartments++;
  }
  for (const seed of MASTER_AGENTS) {
    if (insertMissingMasterAgent(db, seed)) touchedAgents++;
  }
  if (touchedDepartments > 0 || touchedAgents > 0) {
    console.log(
      `[Dongri-grigri] Synced ${touchedDepartments} master department(s), ${touchedAgents} master agent(s) for ${DONGRI_MASTER_SEED_VERSION}`,
    );
  }
}

function upsertSetting(db: DbLike, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function insertMissingSetting(db: DbLike, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING").run(key, value);
}

export function applyDefaultSeeds(db: DbLike): void {
  seedDefaultWorkflowPacks(db);
  syncDongriMasterOrganizationSeeds(db);

  upsertSetting(db, "companyName", "Dongri-grigri");
  upsertSetting(db, "language", "ko");
  upsertSetting(db, "roomThemes", JSON.stringify(MASTER_ROOM_THEMES));
  upsertSetting(db, "organizationSeedVersion", DONGRI_MASTER_SEED_VERSION);
  insertMissingSetting(db, "ceoName", "CEO");
  insertMissingSetting(db, "autoAssign", "true");
  insertMissingSetting(db, "yoloMode", "false");
  insertMissingSetting(db, "autoUpdateEnabled", "false");
  insertMissingSetting(db, "autoUpdateNoticePending", "false");
  insertMissingSetting(db, "oauthAutoSwap", "true");
  insertMissingSetting(db, "defaultProvider", "codex");
  insertMissingSetting(
    db,
    "providerModelConfig",
    JSON.stringify({
      claude: { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
      codex: {
        model: "gpt-5.3-codex",
        reasoningLevel: "high",
        subModel: "gpt-5.3-codex",
        subModelReasoningLevel: "high",
      },
      gemini: { model: "gemini-3-pro-preview" },
      opencode: { model: "github-copilot/claude-sonnet-4.6" },
      copilot: { model: "github-copilot/claude-sonnet-4.6" },
      antigravity: { model: "google/antigravity-gemini-3-pro" },
    }),
  );
  insertMissingSetting(db, "strategicMaintenance", JSON.stringify(OPERATIONS_REVIEW_DEFAULT_SETTINGS));
}
