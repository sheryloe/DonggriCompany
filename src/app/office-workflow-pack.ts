import type { Agent, AgentRole, Department, RoomTheme, WorkflowPackKey } from "../types";

export type UiLanguageLike = "ko" | "en" | "ja" | "zh";

type Localized = {
  ko: string;
  en: string;
  ja: string;
  zh: string;
};

type PackMeta = {
  label: Localized;
  summary: Localized;
  slug: string;
  accent: number;
};

type DepartmentCopy = {
  description: Localized;
  promptTitle: Localized;
  promptBody: Localized;
};

export type OfficePackStarterAgentDraft = Agent & {
  seed_order_in_department: number;
};

const WORKFLOW_PACK_KEYS: WorkflowPackKey[] = [
  "development",
  "donggri",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
];

const PACK_META: Record<WorkflowPackKey, PackMeta> = {
  development: {
    label: { ko: "개발", en: "Development", ja: "Development", zh: "Development" },
    summary: {
      ko: "기본 엔지니어링 실행 팩",
      en: "Default engineering execution pack",
      ja: "Default engineering execution pack",
      zh: "Default engineering execution pack",
    },
    slug: "dev",
    accent: 2,
  },
  donggri: {
    label: { ko: "동그리", en: "Donggri", ja: "Donggri", zh: "Donggri" },
    summary: {
      ko: "회사 전체 구조를 포함하는 기준 팩",
      en: "Base pack that spans the full company structure",
      ja: "Base pack that spans the full company structure",
      zh: "Base pack that spans the full company structure",
    },
    slug: "core",
    accent: 9,
  },
  novel: {
    label: { ko: "소설", en: "Novel", ja: "Novel", zh: "Novel" },
    summary: {
      ko: "서사와 장면 구성 중심 팩",
      en: "Narrative-focused pack for story and scene construction",
      ja: "Narrative-focused pack for story and scene construction",
      zh: "Narrative-focused pack for story and scene construction",
    },
    slug: "novel",
    accent: 11,
  },
  report: {
    label: { ko: "리포트", en: "Report", ja: "Report", zh: "Report" },
    summary: {
      ko: "리서치, 검증, 문서화 중심 팩",
      en: "Research, validation, and documentation team pack",
      ja: "Research, validation, and documentation team pack",
      zh: "Research, validation, and documentation team pack",
    },
    slug: "report",
    accent: 6,
  },
  video_preprod: {
    label: {
      ko: "영상 프리프로덕션",
      en: "Video Pre-production",
      ja: "Video Pre-production",
      zh: "Video Pre-production",
    },
    summary: {
      ko: "기획/디자인/운영 조율 팩",
      en: "Planning, design, and operations coordination pack",
      ja: "Planning, design, and operations coordination pack",
      zh: "Planning, design, and operations coordination pack",
    },
    slug: "video",
    accent: 12,
  },
  web_research_report: {
    label: { ko: "웹 리서치 리포트", en: "Web Research Report", ja: "Web Research Report", zh: "Web Research Report" },
    summary: {
      ko: "웹 조사/리포트 산출 팩",
      en: "Web investigation and report-output focused pack",
      ja: "Web investigation and report-output focused pack",
      zh: "Web investigation and report-output focused pack",
    },
    slug: "web-research",
    accent: 8,
  },
  roleplay: {
    label: { ko: "롤플레이", en: "Roleplay", ja: "Roleplay", zh: "Roleplay" },
    summary: {
      ko: "시나리오/캐릭터 상호작용 중심 팩",
      en: "Scenario and character-interaction focused pack",
      ja: "Scenario and character-interaction focused pack",
      zh: "Scenario and character-interaction focused pack",
    },
    slug: "roleplay",
    accent: 14,
  },
};

const DEPARTMENT_COPY: Record<string, DepartmentCopy> = {
  planning: {
    description: {
      ko: "작업 범위를 정리하고 실행 순서를 설계합니다.",
      en: "The planning team defines scope and sequences the work.",
      ja: "The planning team defines scope and sequences the work.",
      zh: "The planning team defines scope and sequences the work.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "목표를 분해하고 팀 간 조율 기준을 명확히 합니다.",
      en: "Break down the objective and clarify cross-team coordination criteria.",
      ja: "Break down the objective and clarify cross-team coordination criteria.",
      zh: "Break down the objective and clarify cross-team coordination criteria.",
    },
  },
  dev: {
    description: {
      ko: "실행 가능한 코드와 통합 결과를 책임집니다.",
      en: "The development team owns implementation and integration work.",
      ja: "The development team owns implementation and integration work.",
      zh: "The development team owns implementation and integration work.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "동작하는 코드를 만들고 실행 결과를 검증합니다.",
      en: "Produce working code and verify the execution outcome.",
      ja: "Produce working code and verify the execution outcome.",
      zh: "Produce working code and verify the execution outcome.",
    },
  },
  design: {
    description: {
      ko: "화면, 흐름, 시각 언어를 설계합니다.",
      en: "The design team shapes screens, flows, and visual language.",
      ja: "The design team shapes screens, flows, and visual language.",
      zh: "The design team shapes screens, flows, and visual language.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "사용자 경험을 유지하는 명확한 인터페이스를 설계합니다.",
      en: "Design clear interfaces that preserve user experience quality.",
      ja: "Design clear interfaces that preserve user experience quality.",
      zh: "Design clear interfaces that preserve user experience quality.",
    },
  },
  qa: {
    description: {
      ko: "검증 기준과 품질 리스크를 관리합니다.",
      en: "The QA team manages validation criteria and quality risk.",
      ja: "The QA team manages validation criteria and quality risk.",
      zh: "The QA team manages validation criteria and quality risk.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "테스트와 증거로 릴리스 안정성을 확보합니다.",
      en: "Use tests and evidence to protect release stability.",
      ja: "Use tests and evidence to protect release stability.",
      zh: "Use tests and evidence to protect release stability.",
    },
  },
  operations: {
    description: {
      ko: "배포, 환경, 관측 가능성을 관리합니다.",
      en: "The operations team manages deployment, environments, and observability.",
      ja: "The operations team manages deployment, environments, and observability.",
      zh: "The operations team manages deployment, environments, and observability.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "실행 환경과 운영 리스크를 안정적으로 통제합니다.",
      en: "Control runtime environments and operational risk.",
      ja: "Control runtime environments and operational risk.",
      zh: "Control runtime environments and operational risk.",
    },
  },
  devsecops: {
    description: {
      ko: "보안과 운영 통제 레이어를 점검합니다.",
      en: "The security platform team audits policy and protection layers.",
      ja: "The security platform team audits policy and protection layers.",
      zh: "The security platform team audits policy and protection layers.",
    },
    promptTitle: { ko: "[부서 역할]", en: "[Department Role]", ja: "[Department Role]", zh: "[Department Role]" },
    promptBody: {
      ko: "보안, 권한, 운영 통제가 기준에 맞는지 확인합니다.",
      en: "Ensure security, permissions, and operational controls are aligned.",
      ja: "Ensure security, permissions, and operational controls are aligned.",
      zh: "Ensure security, permissions, and operational controls are aligned.",
    },
  },
};

const PACK_ROOM_THEMES: Record<WorkflowPackKey, Record<string, RoomTheme>> = {
  development: {},
  donggri: {},
  novel: {},
  report: {},
  video_preprod: {},
  web_research_report: {},
  roleplay: {},
};

function normalizeLocale(locale: unknown): UiLanguageLike {
  const value = String(locale ?? "")
    .trim()
    .toLowerCase();
  if (value.startsWith("ko")) return "ko";
  return "en";
}

function pickLocalized(locale: UiLanguageLike, text: Localized): string {
  return locale === "ko" ? text.ko : text.en;
}

function roleName(role: AgentRole, locale: UiLanguageLike): string {
  const labels: Record<AgentRole, Localized> = {
    team_leader: { ko: "팀 리드", en: "Team Lead", ja: "Team Lead", zh: "Team Lead" },
    senior: { ko: "시니어", en: "Senior", ja: "Senior", zh: "Senior" },
    junior: { ko: "주니어", en: "Junior", ja: "Junior", zh: "Junior" },
    intern: { ko: "인턴", en: "Intern", ja: "Intern", zh: "Intern" },
  };
  return pickLocalized(locale, labels[role]);
}

function makeTheme(seed: number): RoomTheme {
  return {
    floor1: ((seed + 0) % 16) + 1,
    floor2: ((seed + 3) % 16) + 1,
    wall: ((seed + 6) % 16) + 1,
    accent: ((seed + 9) % 16) + 1,
  };
}

function normalizeDepartmentText(department: Department, locale: UiLanguageLike): string {
  if (locale === "ko") return department.name_ko || department.name;
  return department.name;
}

function buildSeedPlan(
  packKey: WorkflowPackKey,
  departments: Department[],
  targetCount: number,
): Array<{ department: Department; role: AgentRole }> {
  if (packKey === "development") return [];
  if (departments.length === 0 || targetCount <= 0) return [];

  const orderedDepartments = [...departments].sort((a, b) => a.sort_order - b.sort_order);
  const result: Array<{ department: Department; role: AgentRole }> = [];

  for (const department of orderedDepartments) {
    if (result.length >= targetCount) break;
    result.push({ department, role: "team_leader" });
  }

  const roleCycle: AgentRole[] = ["senior", "junior", "intern"];
  let cycleIndex = 0;
  while (result.length < targetCount) {
    for (const department of orderedDepartments) {
      if (result.length >= targetCount) break;
      result.push({ department, role: roleCycle[cycleIndex % roleCycle.length] });
    }
    cycleIndex += 1;
  }

  return result;
}

function makeLocalizedPersonality(
  packKey: WorkflowPackKey,
  departmentId: string,
  role: AgentRole,
  locale: UiLanguageLike,
): string {
  if (locale === "ko") {
    return `증거 품질을 우선하고 ${departmentId} 작업을 ${roleName(role, locale)} 기준으로 정리합니다. (${packKey})`;
  }
  return `Prioritizes evidence quality and aligns ${departmentId} work to ${roleName(role, locale)} standards. (${packKey})`;
}

export function normalizeOfficeWorkflowPack(value: unknown): WorkflowPackKey {
  const normalized = String(value ?? "").trim();
  if (WORKFLOW_PACK_KEYS.includes(normalized as WorkflowPackKey)) {
    return normalized as WorkflowPackKey;
  }
  return "development";
}

export function getOfficePackMeta(packKey: WorkflowPackKey): PackMeta {
  return PACK_META[normalizeOfficeWorkflowPack(packKey)];
}

export function getOfficePackRoomThemes(packKey: WorkflowPackKey): Record<string, RoomTheme> {
  return { ...(PACK_ROOM_THEMES[normalizeOfficeWorkflowPack(packKey)] ?? {}) };
}

export function listOfficePackOptions(locale: UiLanguageLike): Array<{
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
}> {
  const normalizedLocale = normalizeLocale(locale);
  return WORKFLOW_PACK_KEYS.map((packKey) => {
    const meta = getOfficePackMeta(packKey);
    return {
      key: packKey,
      label: pickLocalized(normalizedLocale, meta.label),
      summary: pickLocalized(normalizedLocale, meta.summary),
      slug: meta.slug,
      accent: meta.accent,
    };
  });
}

export function buildOfficePackPresentation(params: {
  packKey: WorkflowPackKey;
  locale: UiLanguageLike;
  departments: Department[];
  agents: Agent[];
  customRoomThemes: Record<string, RoomTheme>;
}): {
  departments: Department[];
  agents: Agent[];
  roomThemes: Record<string, RoomTheme>;
} {
  const packKey = normalizeOfficeWorkflowPack(params.packKey);
  const locale = normalizeLocale(params.locale);
  const roomThemes = { ...params.customRoomThemes };

  const departments = params.departments.map((department) => {
    const copy = DEPARTMENT_COPY[department.id];
    const nextDepartment: Department = {
      ...department,
      description: copy ? pickLocalized(locale, copy.description) : department.description,
      prompt: copy
        ? `${pickLocalized(locale, copy.promptTitle)}\n${pickLocalized(locale, copy.promptBody)}`
        : department.prompt,
    };
    roomThemes[department.id] =
      roomThemes[department.id] ?? getOfficePackRoomThemes(packKey)[department.id] ?? makeTheme(department.sort_order);
    return nextDepartment;
  });

  return {
    departments,
    agents: params.agents,
    roomThemes,
  };
}

export function resolveOfficePackSeedProvider(params: {
  packKey: WorkflowPackKey;
  departmentId: string;
  role: AgentRole;
  seedIndex: number;
  seedOrderInDepartment?: number;
}): Agent["cli_provider"] {
  const departmentId = String(params.departmentId ?? "")
    .trim()
    .toLowerCase();
  const order = Number(params.seedOrderInDepartment ?? params.seedIndex ?? 1);

  if (departmentId === "planning") {
    return order % 2 === 1 ? "claude" : "codex";
  }
  if (departmentId === "dev" || departmentId === "design") {
    return "claude";
  }
  return "codex";
}

export function buildOfficePackStarterAgents(params: {
  packKey: WorkflowPackKey;
  departments: Department[];
  targetCount?: number;
  locale?: UiLanguageLike;
}): OfficePackStarterAgentDraft[] {
  const packKey = normalizeOfficeWorkflowPack(params.packKey);
  const locale = normalizeLocale(params.locale);
  const targetCount =
    typeof params.targetCount === "number" && params.targetCount > 0
      ? Math.trunc(params.targetCount)
      : packKey === "donggri"
        ? 12
        : packKey === "report"
          ? 8
          : 10;

  const plan = buildSeedPlan(packKey, params.departments, targetCount);
  const seedOrderByDepartment = new Map<string, number>();

  return plan.map(({ department, role }, index) => {
    const seedOrderInDepartment = (seedOrderByDepartment.get(department.id) ?? 0) + 1;
    seedOrderByDepartment.set(department.id, seedOrderInDepartment);

    const cliProvider = resolveOfficePackSeedProvider({
      packKey,
      departmentId: department.id,
      role,
      seedIndex: index + 1,
      seedOrderInDepartment,
    });

    const localizedDepartmentName = normalizeDepartmentText(department, locale);
    const localizedRoleName = roleName(role, locale);
    const baseName = `${department.name} ${role === "team_leader" ? "Lead" : role === "senior" ? "Core" : "Runner"}`;

    return {
      id: `${packKey}-seed-${index + 1}`,
      name: `${baseName} ${index + 1}`,
      name_ko: `${department.name_ko || department.name} ${localizedRoleName} ${index + 1}`,
      name_ja: `${department.name_ja || department.name} ${localizedRoleName} ${index + 1}`,
      name_zh: `${department.name_zh || department.name} ${localizedRoleName} ${index + 1}`,
      department_id: department.id,
      workflow_pack_key: packKey,
      role,
      acts_as_planning_leader: 0,
      cli_provider: cliProvider,
      cli_model: null,
      cli_reasoning_level: null,
      run_mode: "standard",
      cli_account_pool_id: null,
      workflow_profile: null,
      family:
        department.id === "planning"
          ? "orchestrator"
          : department.id === "qa"
            ? "qa"
            : department.id === "design"
              ? "frontend"
              : "backend",
      career_stage: role === "team_leader" ? "team-lead" : role === "senior" ? "senior" : "junior",
      specialization_key: null,
      authority_level: role === "team_leader" ? 3 : role === "senior" ? 2 : 1,
      execution_capability_profile: packKey,
      canonical_identity_source: "derived",
      avatar_emoji: localizedDepartmentName.slice(0, 2).toUpperCase(),
      sprite_number: index + 1,
      personality: makeLocalizedPersonality(packKey, department.id, role, locale),
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: role === "team_leader" ? 240 : role === "senior" ? 120 : 40,
      created_at: Date.now(),
      seed_order_in_department: seedOrderInDepartment,
    };
  });
}
