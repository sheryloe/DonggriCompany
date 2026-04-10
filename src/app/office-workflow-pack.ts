import type { Agent, AgentRole, CliProvider, Department, RoomTheme, WorkflowPackKey } from "../types";

export type UiLanguageLike = "ko" | "en" | "ja" | "zh";

type Localized = { ko: string; en: string; ja: string; zh: string };
type DeptPreset = {
  name: Localized;
  icon: string;
  agentPrefix: Localized;
  avatarPool: string[];
};

type StaffPreset = {
  nonLeaderDeptCycle: string[];
  planningLeadDeptIds?: string[];
};

type SeedProfile = {
  nameOffset: number;
  tone: Localized;
};

type PackPreset = {
  key: WorkflowPackKey;
  slug: string;
  label: Localized;
  summary: Localized;
  roomThemes: Record<string, RoomTheme>;
  departments: Partial<Record<string, DeptPreset>>;
  staff?: StaffPreset;
};

type OfficePackPresentation = {
  departments: Department[];
  agents: Agent[];
  roomThemes: Record<string, RoomTheme>;
};

export type OfficePackStarterAgentDraft = {
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: string | null;
  seed_order_in_department: number;
  role: AgentRole;
  acts_as_planning_leader: number;
  avatar_emoji: string;
  sprite_number: number;
  personality: string | null;
};

type OfficePackSeedProvider = Extract<CliProvider, "claude" | "codex">;
const OFFICE_SEED_SPRITE_POOL = Array.from({ length: 40 }, (_, idx) => idx + 1);

const DEV_THEMES: Record<string, RoomTheme> = {
  ceoOffice: { floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243, accent: 0xa77d0c },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  breakRoom: { floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83, accent: 0xf0c878 },
};

const DEPARTMENT_PERSON_NAME_POOL: Partial<Record<string, Localized[]>> = {
  planning: [
    { ko: "세이지", en: "Sage", ja: "Sage", zh: "Sage" },
    { ko: "미나", en: "Mina", ja: "Mina", zh: "Mina" },
    { ko: "준", en: "Juno", ja: "Juno", zh: "Juno" },
    { ko: "리안", en: "Rian", ja: "Rian", zh: "Rian" },
    { ko: "하루", en: "Haru", ja: "Haru", zh: "Haru" },
    { ko: "노아", en: "Noa", ja: "Noa", zh: "Noa" },
  ],
  dev: [
    { ko: "아리아", en: "Aria", ja: "Aria", zh: "Aria" },
    { ko: "테오", en: "Theo", ja: "Theo", zh: "Theo" },
    { ko: "카이", en: "Kai", ja: "Kai", zh: "Kai" },
    { ko: "리암", en: "Liam", ja: "Liam", zh: "Liam" },
    { ko: "세나", en: "Sena", ja: "Sena", zh: "Sena" },
    { ko: "로완", en: "Rowan", ja: "Rowan", zh: "Rowan" },
  ],
  design: [
    { ko: "도로", en: "Doro", ja: "Doro", zh: "Doro" },
    { ko: "루나", en: "Luna", ja: "Luna", zh: "Luna" },
    { ko: "픽셀", en: "Pixel", ja: "Pixel", zh: "Pixel" },
    { ko: "유나", en: "Yuna", ja: "Yuna", zh: "Yuna" },
    { ko: "미로", en: "Miro", ja: "Miro", zh: "Miro" },
    { ko: "아이리스", en: "Iris", ja: "Iris", zh: "Iris" },
  ],
  qa: [
    { ko: "호크", en: "Hawk", ja: "Hawk", zh: "Hawk" },
    { ko: "베라", en: "Vera", ja: "Vera", zh: "Vera" },
    { ko: "퀸", en: "Quinn", ja: "Quinn", zh: "Quinn" },
    { ko: "토리", en: "Tori", ja: "Tori", zh: "Tori" },
    { ko: "하윤", en: "Hayoon", ja: "Hayoon", zh: "Hayoon" },
    { ko: "린트", en: "Lint", ja: "Lint", zh: "Lint" },
  ],
  operations: [
    { ko: "아틀라스", en: "Atlas", ja: "Atlas", zh: "Atlas" },
    { ko: "나리", en: "Nari", ja: "Nari", zh: "Nari" },
    { ko: "오웬", en: "Owen", ja: "Owen", zh: "Owen" },
    { ko: "다미", en: "Dami", ja: "Dami", zh: "Dami" },
    { ko: "키라", en: "Kira", ja: "Kira", zh: "Kira" },
    { ko: "솔", en: "Sol", ja: "Sol", zh: "Sol" },
  ],
  devsecops: [
    { ko: "볼트", en: "Volt", ja: "Volt", zh: "Volt" },
    { ko: "시온", en: "Sion", ja: "Sion", zh: "Sion" },
    { ko: "녹스", en: "Knox", ja: "Knox", zh: "Knox" },
    { ko: "레이븐", en: "Raven", ja: "Raven", zh: "Raven" },
    { ko: "미라", en: "Mira", ja: "Mira", zh: "Mira" },
    { ko: "알렉스", en: "Alex", ja: "Alex", zh: "Alex" },
  ],
};

const PACK_SEED_PROFILE: Partial<Record<WorkflowPackKey, SeedProfile>> = {
  report: {
    nameOffset: 0,
    tone: {
      ko: "근거와 문서 완성도를 최우선으로 판단합니다.",
      en: "Prioritizes evidence quality and document completeness.",
      ja: "Prioritizes evidence quality and document completeness.",
      zh: "Prioritizes evidence quality and document completeness.",
    },
  },
  web_research_report: {
    nameOffset: 1,
    tone: {
      ko: "출처 신뢰성과 사실 검증을 최우선으로 판단합니다.",
      en: "Focused on source credibility and fact verification.",
      ja: "Focused on source credibility and fact verification.",
      zh: "Focused on source credibility and fact verification.",
    },
  },
  novel: {
    nameOffset: 2,
    tone: {
      ko: "서사 몰입감과 캐릭터 일관성을 최우선으로 판단합니다.",
      en: "Values narrative immersion and character consistency the most.",
      ja: "Values narrative immersion and character consistency the most.",
      zh: "Values narrative immersion and character consistency the most.",
    },
  },
  video_preprod: {
    nameOffset: 3,
    tone: {
      ko: "콘티 품질, 샷 구성, 제작 효율을 최우선으로 판단합니다.",
      en: "Prioritizes storyboard quality, shot composition, and production efficiency.",
      ja: "Prioritizes storyboard quality, shot composition, and production efficiency.",
      zh: "Prioritizes storyboard quality, shot composition, and production efficiency.",
    },
  },
  roleplay: {
    nameOffset: 4,
    tone: {
      ko: "캐릭터 몰입감과 대사 리듬을 최우선으로 판단합니다.",
      en: "Prioritizes character immersion and dialogue rhythm.",
      ja: "Prioritizes character immersion and dialogue rhythm.",
      zh: "Prioritizes character immersion and dialogue rhythm.",
    },
  },
  donggri: {
    nameOffset: 5,
    tone: {
      ko: "개발 실행력, 리서치 근거, 보고서 구조, 소설 몰입감을 함께 유지합니다.",
      en: "Balances implementation, research rigor, report clarity, and narrative immersion in one flow.",
      ja: "Balances implementation, research rigor, report clarity, and narrative immersion in one flow.",
      zh: "Balances implementation, research rigor, report clarity, and narrative immersion in one flow.",
    },
  },
};

const PACK_PRESETS: Record<WorkflowPackKey, PackPreset> = {
  development: {
    key: "development",
    slug: "DEV",
    label: {
      ko: "개발 오피스",
      en: "Development Office",
      ja: "Development Office",
      zh: "Development Office",
    },
    summary: {
      ko: "기본 개발 조직 구조",
      en: "Default engineering organization",
      ja: "Default engineering organization",
      zh: "Default engineering organization",
    },
    roomThemes: DEV_THEMES,
    departments: {},
  },
  donggri: {
    key: "donggri",
    slug: "DGR",
    label: {
      ko: "동그리 통합 오피스",
      en: "Donggri Unified Office",
      ja: "Donggri Unified Office",
      zh: "Donggri Unified Office",
    },
    summary: {
      ko: "개발, 보고서, 웹 리서치, 소설 워크플로우를 한 번에 처리하는 통합 팩",
      en: "Unified pack for development, report, web research, and novel workflows.",
      ja: "Unified pack for development, report, web research, and novel workflows.",
      zh: "Unified pack for development, report, web research, and novel workflows.",
    },
    roomThemes: {
      ...DEV_THEMES,
      ceoOffice: { floor1: 0xe8e2d6, floor2: 0xe0d7c4, wall: 0x7a6857, accent: 0xa56d36 },
      planning: { floor1: 0xe8edf4, floor2: 0xdfe7f1, wall: 0x596b86, accent: 0x668cc0 },
      dev: { floor1: 0xe2ecf8, floor2: 0xd7e5f4, wall: 0x4f6f9c, accent: 0x5689d1 },
      design: { floor1: 0xf0e7f2, floor2: 0xe7dced, wall: 0x7b5f86, accent: 0xa072b8 },
    },
    departments: {
      planning: {
        name: {
          ko: "통합 기획 허브",
          en: "Unified Planning Hub",
          ja: "Unified Planning Hub",
          zh: "Unified Planning Hub",
        },
        icon: "🧭",
        agentPrefix: {
          ko: "통합 기획 PM",
          en: "Unified PM",
          ja: "Unified PM",
          zh: "Unified PM",
        },
        avatarPool: ["🧭", "🛰️", "📚", "🧠"],
      },
      dev: {
        name: {
          ko: "개발·리서치 엔진",
          en: "Build & Research Engine",
          ja: "Build & Research Engine",
          zh: "Build & Research Engine",
        },
        icon: "🛠️",
        agentPrefix: {
          ko: "통합 엔지니어",
          en: "Fusion Engineer",
          ja: "Fusion Engineer",
          zh: "Fusion Engineer",
        },
        avatarPool: ["🛠️", "🧪", "💻", "🧩"],
      },
      design: {
        name: {
          ko: "콘셉트·캐릭터 디자인",
          en: "Concept & Character Design",
          ja: "Concept & Character Design",
          zh: "Concept & Character Design",
        },
        icon: "🎨",
        agentPrefix: {
          ko: "콘셉트 디자이너",
          en: "Concept Designer",
          ja: "Concept Designer",
          zh: "Concept Designer",
        },
        avatarPool: ["🎨", "🖋️", "🧵", "✨"],
      },
      qa: {
        name: {
          ko: "팩트·문체 검증",
          en: "Fact & Style QA",
          ja: "Fact & Style QA",
          zh: "Fact & Style QA",
        },
        icon: "🔎",
        agentPrefix: {
          ko: "통합 검증 리뷰어",
          en: "Fusion Reviewer",
          ja: "Fusion Reviewer",
          zh: "Fusion Reviewer",
        },
        avatarPool: ["🔎", "📌", "🗂️", "✅"],
      },
    },
    staff: {
      nonLeaderDeptCycle: [
        "planning",
        "dev",
        "design",
        "qa",
        "dev",
        "planning",
        "design",
        "qa",
        "operations",
        "devsecops",
      ],
      planningLeadDeptIds: ["planning", "dev"],
    },
  },
  report: {
    key: "report",
    slug: "RPT",
    label: { ko: "보고서 오피스", en: "Report Office", ja: "Report Office", zh: "Report Office" },
    summary: {
      ko: "리서치 문서화 중심 팀",
      en: "Research and documentation focused crew",
      ja: "Research and documentation focused crew",
      zh: "Research and documentation focused crew",
    },
    roomThemes: DEV_THEMES,
    departments: {
      planning: {
        name: { ko: "편집 기획", en: "Editorial Planning", ja: "Editorial Planning", zh: "Editorial Planning" },
        icon: "📝",
        agentPrefix: { ko: "편집 PM", en: "Editorial PM", ja: "Editorial PM", zh: "Editorial PM" },
        avatarPool: ["📝", "📚", "🧠"],
      },
    },
    staff: { nonLeaderDeptCycle: ["planning", "dev", "qa", "design", "operations"] },
  },
  web_research_report: {
    key: "web_research_report",
    slug: "WEB",
    label: { ko: "웹 리서치 오피스", en: "Web Research Office", ja: "Web Research Office", zh: "Web Research Office" },
    summary: {
      ko: "출처 검증 기반 조사팀",
      en: "Source collection and citation verification",
      ja: "Source collection and citation verification",
      zh: "Source collection and citation verification",
    },
    roomThemes: DEV_THEMES,
    departments: {
      planning: {
        name: { ko: "조사 전략", en: "Research Strategy", ja: "Research Strategy", zh: "Research Strategy" },
        icon: "🔬",
        agentPrefix: { ko: "전략 분석가", en: "Strategy Analyst", ja: "Strategy Analyst", zh: "Strategy Analyst" },
        avatarPool: ["🔬", "🧭", "📡"],
      },
    },
    staff: { nonLeaderDeptCycle: ["planning", "dev", "qa", "dev", "operations"] },
  },
  novel: {
    key: "novel",
    slug: "NOV",
    label: { ko: "소설 스튜디오", en: "Novel Studio", ja: "Novel Studio", zh: "Novel Studio" },
    summary: {
      ko: "세계관/캐릭터/서사 중심",
      en: "Worldbuilding, character and narrative setup",
      ja: "Worldbuilding, character and narrative setup",
      zh: "Worldbuilding, character and narrative setup",
    },
    roomThemes: DEV_THEMES,
    departments: {
      planning: {
        name: { ko: "세계관 팀", en: "Worldbuilding", ja: "Worldbuilding", zh: "Worldbuilding" },
        icon: "📖",
        agentPrefix: { ko: "로어 라이터", en: "Lore Writer", ja: "Lore Writer", zh: "Lore Writer" },
        avatarPool: ["📖", "🗺️", "🧭"],
      },
    },
    staff: { nonLeaderDeptCycle: ["planning", "design", "dev", "design", "qa", "operations"] },
  },
  video_preprod: {
    key: "video_preprod",
    slug: "VID",
    label: { ko: "영상 프리프로덕션", en: "Video Pre-production", ja: "Video Pre-production", zh: "Video Pre-production" },
    summary: {
      ko: "콘티/샷리스트 중심",
      en: "Storyboard and shot-list focused setup",
      ja: "Storyboard and shot-list focused setup",
      zh: "Storyboard and shot-list focused setup",
    },
    roomThemes: DEV_THEMES,
    departments: {
      planning: {
        name: { ko: "프리프로덕션", en: "Pre-production", ja: "Pre-production", zh: "Pre-production" },
        icon: "🎬",
        agentPrefix: { ko: "프로듀서", en: "Producer", ja: "Producer", zh: "Producer" },
        avatarPool: ["🎬", "📷", "🧾"],
      },
    },
    staff: { nonLeaderDeptCycle: ["planning", "design", "dev", "operations", "qa"] },
  },
  roleplay: {
    key: "roleplay",
    slug: "RPG",
    label: { ko: "롤플레이 스튜디오", en: "Roleplay Studio", ja: "Roleplay Studio", zh: "Roleplay Studio" },
    summary: {
      ko: "캐릭터 몰입형 대화 중심",
      en: "Character role and dialogue immersion",
      ja: "Character role and dialogue immersion",
      zh: "Character role and dialogue immersion",
    },
    roomThemes: DEV_THEMES,
    departments: {
      planning: {
        name: { ko: "캐릭터 기획", en: "Character Planning", ja: "Character Planning", zh: "Character Planning" },
        icon: "🗣️",
        agentPrefix: { ko: "캐릭터 플래너", en: "Character Planner", ja: "Character Planner", zh: "Character Planner" },
        avatarPool: ["🗣️", "🎭", "📓"],
      },
    },
    staff: { nonLeaderDeptCycle: ["planning", "design", "dev", "design", "qa", "operations"] },
  },
};

export function normalizeOfficeWorkflowPack(value: unknown): WorkflowPackKey {
  if (typeof value !== "string") return "development";
  return value in PACK_PRESETS ? (value as WorkflowPackKey) : "development";
}

function pickText(locale: UiLanguageLike, text: Localized): string {
  switch (locale) {
    case "ko":
      return text.ko;
    case "ja":
      return text.ja || text.en;
    case "zh":
      return text.zh || text.en;
    case "en":
    default:
      return text.en;
  }
}

function localizedNumberedName(prefix: Localized, order: number): {
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
} {
  return {
    name: `${prefix.en} ${order}`,
    name_ko: `${prefix.ko} ${order}`,
    name_ja: `${prefix.ja} ${order}`,
    name_zh: `${prefix.zh} ${order}`,
  };
}

function localizedStaffDisplayName(params: {
  packKey: WorkflowPackKey;
  deptId: string;
  order: number;
  fallbackPrefix: Localized;
}): { name: string; name_ko: string; name_ja: string; name_zh: string } {
  const { packKey, deptId, order, fallbackPrefix } = params;
  const pool = DEPARTMENT_PERSON_NAME_POOL[deptId];
  if (!pool || pool.length <= 0) return localizedNumberedName(fallbackPrefix, order);

  const seedOffset = PACK_SEED_PROFILE[packKey]?.nameOffset ?? 0;
  const base = pool[(order - 1 + seedOffset) % pool.length] ?? pool[0];
  const cycle = Math.floor((order - 1) / pool.length) + 1;
  const suffix = cycle > 1 ? ` ${cycle}` : "";
  return {
    name: `${base.en}${suffix}`,
    name_ko: `${base.ko}${suffix}`,
    name_ja: `${base.ja}${suffix}`,
    name_zh: `${base.zh}${suffix}`,
  };
}

function resolveSeedSpriteNumber(
  params: {
    packKey: WorkflowPackKey;
    deptId: string;
    role: AgentRole;
    order: number;
  },
  usedSpriteNumbers: Set<number>,
): number {
  const seed = `${params.packKey}:${params.deptId}:${params.role}:${params.order}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const poolSize = OFFICE_SEED_SPRITE_POOL.length;
  const start = hash % poolSize;
  for (let offset = 0; offset < poolSize; offset += 1) {
    const candidate = OFFICE_SEED_SPRITE_POOL[(start + offset) % poolSize];
    if (candidate != null && !usedSpriteNumbers.has(candidate)) return candidate;
  }
  return OFFICE_SEED_SPRITE_POOL[start] ?? 1;
}

function buildSeedPersonality(params: {
  packKey: WorkflowPackKey;
  role: AgentRole;
  locale: UiLanguageLike;
}): string | null {
  if (params.packKey === "development") return null;
  const tone = PACK_SEED_PROFILE[params.packKey]?.tone;
  if (!tone) return null;
  const roleLabelMap: Record<AgentRole, string> = {
    team_leader: "team lead",
    senior: "senior member",
    junior: "junior member",
    intern: "intern",
  };
  const toneText = pickText(params.locale, tone);
  return `${toneText} Serves as a ${roleLabelMap[params.role]}.`;
}

function buildPackDepartmentDescription(params: {
  locale: UiLanguageLike;
  packSummary: Localized;
  departmentName: Localized;
}): string {
  const summary = pickText(params.locale, params.packSummary);
  const deptName = pickText(params.locale, params.departmentName);
  if (params.locale === "ko") return `${deptName} 팀입니다. ${summary} 목표를 위해 작업합니다.`;
  return `${deptName} team. Collaborates to deliver the ${summary.toLowerCase()} goal.`;
}

function buildPackDepartmentPrompt(params: {
  locale: UiLanguageLike;
  packSummary: Localized;
  departmentName: Localized;
}): string {
  const summary = pickText(params.locale, params.packSummary);
  const deptName = pickText(params.locale, params.departmentName);
  if (params.locale === "ko") {
    return `[부서 역할] ${deptName}\n[업무 기준] ${summary}\n요청을 실행 가능한 단계로 나누고 근거와 산출물을 명확히 제시하세요.`;
  }
  return `[Department Role] ${deptName}\n[Execution Standard] ${summary}\nBreak requests into actionable steps and clearly provide rationale and deliverables.`;
}

export function getOfficePackMeta(packKey: WorkflowPackKey): { label: Localized; summary: Localized } {
  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  return { label: preset.label, summary: preset.summary };
}

export function getOfficePackRoomThemes(packKey: WorkflowPackKey): Record<string, RoomTheme> {
  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  return preset.roomThemes;
}

export function listOfficePackOptions(locale: UiLanguageLike): Array<{
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
}> {
  return (Object.keys(PACK_PRESETS) as WorkflowPackKey[]).map((key) => ({
    key,
    label: pickText(locale, PACK_PRESETS[key].label),
    summary: pickText(locale, PACK_PRESETS[key].summary),
    slug: PACK_PRESETS[key].slug,
    accent: PACK_PRESETS[key].roomThemes.ceoOffice?.accent ?? 0x5a9fd4,
  }));
}

export function buildOfficePackPresentation(params: {
  packKey: WorkflowPackKey;
  locale: UiLanguageLike;
  departments: Department[];
  agents: Agent[];
  customRoomThemes: Record<string, RoomTheme>;
}): OfficePackPresentation {
  const { packKey, locale, departments, agents, customRoomThemes } = params;
  if (packKey === "development") return { departments, agents, roomThemes: customRoomThemes };

  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  const transformedDepartments = departments.map((dept) => {
    const deptPreset = preset.departments[dept.id];
    if (!deptPreset) return dept;
    const localizedName: Localized = {
      ko: deptPreset.name.ko || dept.name_ko || dept.name,
      en: deptPreset.name.en || dept.name,
      ja: deptPreset.name.ja || dept.name_ja || dept.name,
      zh: deptPreset.name.zh || dept.name_zh || dept.name,
    };
    return {
      ...dept,
      icon: deptPreset.icon,
      name: deptPreset.name.en,
      name_ko: deptPreset.name.ko,
      name_ja: deptPreset.name.ja,
      name_zh: deptPreset.name.zh,
      description: buildPackDepartmentDescription({ locale, packSummary: preset.summary, departmentName: localizedName }),
      prompt: buildPackDepartmentPrompt({ locale, packSummary: preset.summary, departmentName: localizedName }),
    };
  });

  return {
    departments: transformedDepartments,
    agents,
    roomThemes: {
      ...customRoomThemes,
      ...preset.roomThemes,
    },
  };
}

export function resolveOfficePackSeedProvider(params: {
  packKey: WorkflowPackKey;
  departmentId?: string | null;
  role: AgentRole;
  seedIndex: number;
  seedOrderInDepartment?: number;
}): OfficePackSeedProvider {
  if (params.packKey === "development") return "claude";
  const dept = String(params.departmentId ?? "")
    .trim()
    .toLowerCase();
  if (dept === "planning") {
    const order = params.seedOrderInDepartment ?? params.seedIndex;
    return order % 2 === 0 ? "codex" : "claude";
  }
  if (dept === "dev" || dept === "design") return "claude";
  if (dept === "devsecops" || dept === "operations" || dept === "qa") return "codex";
  return params.seedIndex % 2 === 0 ? "codex" : "claude";
}

export function buildOfficePackStarterAgents(params: {
  packKey: WorkflowPackKey;
  departments: Department[];
  targetCount?: number;
  locale?: UiLanguageLike;
}): OfficePackStarterAgentDraft[] {
  const { packKey, departments } = params;
  const locale = params.locale ?? "en";
  if (packKey === "development") return [];

  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const baseDeptOrder = ["planning", "dev", "design", "qa", "operations", "devsecops"].filter((deptId) =>
    departmentById.has(deptId),
  );
  if (baseDeptOrder.length <= 0) return [];

  const nonLeaderCycle = (preset.staff?.nonLeaderDeptCycle ?? []).filter((deptId) => departmentById.has(deptId));
  const planningLeadDeptIds = (preset.staff?.planningLeadDeptIds ?? ["planning"]).filter((deptId) =>
    departmentById.has(deptId),
  );
  const workerCycle = nonLeaderCycle.length > 0 ? nonLeaderCycle : baseDeptOrder;
  const rolePool: AgentRole[] = ["senior", "junior", "intern"];
  const baseDesiredCount = Math.max(baseDeptOrder.length + 2, params.targetCount ?? Math.min(10, baseDeptOrder.length * 2));
  const desiredCount = packKey === "donggri" ? Math.max(baseDesiredCount, 12) : baseDesiredCount;

  const perDeptCounter = new Map<string, number>();
  const usedSpriteNumbers = new Set<number>();
  const result: OfficePackStarterAgentDraft[] = [];

  const resolveDeptPrefix = (deptId: string): Localized => {
    const presetInfo = preset.departments[deptId];
    if (presetInfo) return presetInfo.agentPrefix;
    const department = departmentById.get(deptId);
    const baseName = department?.name ?? deptId;
    const baseNameKo = department?.name_ko ?? baseName;
    const baseNameJa = department?.name_ja ?? baseName;
    const baseNameZh = department?.name_zh ?? baseName;
    return {
      ko: `${baseNameKo} 담당`,
      en: `${baseName} Member`,
      ja: `${baseNameJa} Member`,
      zh: `${baseNameZh} Member`,
    };
  };

  const resolveAvatar = (deptId: string, order: number): string => {
    const presetInfo = preset.departments[deptId];
    if (presetInfo && presetInfo.avatarPool.length > 0) {
      return presetInfo.avatarPool[(order - 1) % presetInfo.avatarPool.length] ?? presetInfo.icon;
    }
    return departmentById.get(deptId)?.icon ?? "🙂";
  };

  const pushAgent = (deptId: string, role: AgentRole) => {
    const nextOrder = (perDeptCounter.get(deptId) ?? 0) + 1;
    perDeptCounter.set(deptId, nextOrder);
    const prefix = resolveDeptPrefix(deptId);
    const localizedNames = localizedStaffDisplayName({
      packKey,
      deptId,
      order: nextOrder,
      fallbackPrefix: prefix,
    });
    const spriteNumber = resolveSeedSpriteNumber({ packKey, deptId, role, order: nextOrder }, usedSpriteNumbers);
    usedSpriteNumbers.add(spriteNumber);
    result.push({
      ...localizedNames,
      department_id: deptId,
      seed_order_in_department: nextOrder,
      role,
      acts_as_planning_leader: role === "team_leader" && planningLeadDeptIds.includes(deptId) ? 1 : 0,
      avatar_emoji: resolveAvatar(deptId, nextOrder),
      sprite_number: spriteNumber,
      personality: buildSeedPersonality({ packKey, role, locale }),
    });
  };

  for (const deptId of baseDeptOrder) {
    pushAgent(deptId, "team_leader");
  }

  let cursor = 0;
  while (result.length < desiredCount) {
    const deptId = workerCycle[cursor % workerCycle.length];
    const role = rolePool[cursor % rolePool.length] ?? "junior";
    if (!deptId) break;
    pushAgent(deptId, role);
    cursor += 1;
  }

  return result;
}
