import type { SkillDetail, SkillEntry } from "../../api";
import { categoryLabel, type TFunction } from "./model";

interface DonggriSkillDisplay {
  title: string;
  description: string;
  whenToUse: string[];
}

const DONGGRI_SKILL_DISPLAY: Record<string, DonggriSkillDisplay> = {
  "donggri-codex-55-agentic-coding": {
    title: "Codex 장기 코딩 실행",
    description:
      "긴 호흡의 코드 분석, 구현, 검증, Git 인계까지 Codex가 안정적으로 수행하게 하는 Donggri 전용 Skill입니다.",
    whenToUse: [
      "복잡한 기능 구현을 한 번에 끝까지 밀어야 할 때 사용합니다.",
      "코드 변경 후 테스트, 빌드, Git 정리까지 같은 루프로 묶고 싶을 때 사용합니다.",
      "Donggri 저장소 규칙과 한국어 보고 형식을 함께 지켜야 할 때 사용합니다.",
    ],
  },
  "donggri-codex-skill-authoring": {
    title: "Codex Skill 작성·검증",
    description: "새 Skill을 설계하고 SKILL.md, 메타데이터, 로컬 Codex 설치 검증까지 정리하는 Skill입니다.",
    whenToUse: [
      "새로운 반복 작업을 Codex Skill로 표준화해야 할 때 사용합니다.",
      "Skill 문서 구조와 검증 기준을 맞춰야 할 때 사용합니다.",
      "Donggri Skill 문서고와 Codex 앱 설치 상태를 같이 관리할 때 사용합니다.",
    ],
  },
  "donggri-codex-oauth-operations": {
    title: "OAuth 실행 계정 운영",
    description:
      "Codex, GitHub Copilot, Google, Gemini 실행 계정 상태를 토큰 노출 없이 점검하고 재연결하는 Skill입니다.",
    whenToUse: [
      "CLI 계정은 감지되지만 실행 준비 상태가 불명확할 때 사용합니다.",
      "OAuth 연결, 재연결, 계정풀 상태를 안전하게 점검해야 할 때 사용합니다.",
      "사용량과 실행 가능 상태를 분리해서 보고해야 할 때 사용합니다.",
    ],
  },
  "donggri-codex-pr-review-release": {
    title: "PR 리뷰·릴리스 운영",
    description: "Git 변경 범위, CI, 리뷰, 릴리스 노트를 안전하게 정리하는 Codex 운영 Skill입니다.",
    whenToUse: [
      "커밋 전 staged diff와 secret 노출 여부를 점검해야 할 때 사용합니다.",
      "CI 실패 원인을 재현하고 수정 후 push까지 관리해야 할 때 사용합니다.",
      "릴리스 인계 문서와 검증 결과를 한 번에 남겨야 할 때 사용합니다.",
    ],
  },
  "donggri-gemini-cli-operations": {
    title: "AGY CLI 운영",
    description: "AGY CLI, Google model selection, MCP, quota, agent mode 작업을 안전하게 점검하는 Skill입니다.",
    whenToUse: [
      "AGY CLI 계정, 사용량, quota 상태를 확인해야 할 때 사용합니다.",
      "AGY 기반 조사나 보조 실행을 Donggri 규칙에 맞춰 연결할 때 사용합니다.",
      "Codex와 AGY 역할을 분리해서 하이브리드 운영해야 할 때 사용합니다.",
    ],
  },
  "donggri-google-stitch-design": {
    title: "Google Stitch 디자인 기획",
    description: "Google Stitch용 화면 기획, DESIGN.md, export 검수 기준을 안전하게 준비하는 Skill입니다.",
    whenToUse: [
      "Stitch에 넣을 화면 단위 프롬프트와 디자인 요구사항을 정리할 때 사용합니다.",
      "Stitch 산출물을 React 구현으로 넘기기 전에 기준 문서를 만들어야 할 때 사용합니다.",
      "디자인 산출물이 Donggri 한국어 UI 규칙을 지키는지 검토할 때 사용합니다.",
    ],
  },
  "donggri-stitch-to-react-review": {
    title: "Stitch 산출물 React 검토",
    description: "Google Stitch 결과물을 React/Tailwind 구현 관점에서 검토하고 전환 계획을 만드는 Skill입니다.",
    whenToUse: [
      "Stitch export를 바로 붙이지 않고 구조, 접근성, 로컬라이제이션을 먼저 검토할 때 사용합니다.",
      "디자인 산출물을 Donggri 컴포넌트와 스타일 토큰에 맞춰 분해해야 할 때 사용합니다.",
      "UI 구현 전 문제 있는 레이아웃이나 영어 문구 노출을 사전에 막아야 할 때 사용합니다.",
    ],
  },
  "donggri-goal-command-orchestration": {
    title: "목표별 에이전트 명령 오케스트레이션",
    description: "/dg-* 목표 명령으로 업무 등록, 팀 프리셋, 검증 게이트를 일관되게 라우팅하는 Skill입니다.",
    whenToUse: [
      "사용자가 어떤 명령을 써야 할지 모를 때 목표별 선택지를 제공해야 할 때 사용합니다.",
      "업무 등록 시 팀 프리셋과 workflow metadata를 자동으로 채워야 할 때 사용합니다.",
      "에이전트 협업 방향과 검증 게이트를 태스크 생성 단계부터 고정할 때 사용합니다.",
    ],
  },
};

const KOREAN_PATTERN = /[가-힣]/;
const MOJIBAKE_PATTERN = /\uFFFD|\?\?\?/;

function hasKoreanText(value?: string | null): value is string {
  return Boolean(value && KOREAN_PATTERN.test(value) && !MOJIBAKE_PATTERN.test(value));
}

function skillKey(skill: Pick<SkillEntry, "skillId" | "name">): string {
  return skill.skillId || skill.name;
}

function displayNameFromId(value: string): string {
  return (
    value
      .replace(/^donggri-/, "")
      .replace(/[-_:]+/g, " ")
      .trim() || value
  );
}

export function getSkillDisplayTitle(skill: Pick<SkillEntry, "skillId" | "name" | "origin">): string {
  const key = skillKey(skill);
  const mapped = DONGGRI_SKILL_DISPLAY[key];
  if (mapped) return mapped.title;
  if (skill.origin === "custom") return `사용자 Skill · ${skill.name}`;
  return skill.name || displayNameFromId(key);
}

export function getSkillDisplayDescription(
  skill: Pick<SkillEntry, "skillId" | "name" | "origin" | "category" | "description" | "repo">,
  t: TFunction,
): string {
  const mapped = DONGGRI_SKILL_DISPLAY[skillKey(skill)];
  if (mapped) return mapped.description;
  if (skill.origin === "custom") {
    return hasKoreanText(skill.description)
      ? skill.description
      : "사용자가 등록한 작업 기법입니다. 선택한 CLI 담당자에게 학습시켜 프로젝트에서 재사용합니다.";
  }
  const category = categoryLabel(skill.category || "external-catalog", t);
  return `${category} 항목입니다. 저장소와 설치 수를 확인한 뒤 필요한 CLI 담당자에게 학습시킬 수 있습니다.`;
}

export function getSkillDetailTitle(detail: SkillDetail, skill: Pick<SkillEntry, "skillId" | "name" | "origin">) {
  const mapped = DONGGRI_SKILL_DISPLAY[skillKey(skill)];
  if (mapped) return mapped.title;
  return hasKoreanText(detail.title) ? detail.title : getSkillDisplayTitle(skill);
}

export function getSkillDetailDescription(
  detail: SkillDetail,
  skill: Pick<SkillEntry, "skillId" | "name" | "origin" | "category" | "description" | "repo">,
  t: TFunction,
): string {
  const mapped = DONGGRI_SKILL_DISPLAY[skillKey(skill)];
  if (mapped) return mapped.description;
  return hasKoreanText(detail.description) ? detail.description : getSkillDisplayDescription(skill, t);
}

export function getSkillDetailWhenToUse(
  detail: SkillDetail,
  skill: Pick<SkillEntry, "skillId" | "name" | "origin" | "category">,
): string[] {
  const mapped = DONGGRI_SKILL_DISPLAY[skillKey(skill)];
  if (mapped) return mapped.whenToUse;
  const koreanItems = detail.whenToUse.filter(hasKoreanText);
  if (koreanItems.length > 0) return koreanItems;
  if (skill.origin === "custom") {
    return [
      "팀이 반복해서 쓰는 내부 절차를 CLI 담당자에게 학습시킬 때 사용합니다.",
      "프로젝트별 규칙이나 검토 기준을 빠르게 재사용해야 할 때 사용합니다.",
    ];
  }
  return [
    "외부 카탈로그에서 유용한 작업 기법 후보를 선별할 때 사용합니다.",
    "비슷한 업무를 처리할 CLI 담당자에게 학습시킬 후보를 고를 때 사용합니다.",
    "설치 수와 저장소 정보를 기준으로 검토 우선순위를 정할 때 사용합니다.",
  ];
}

export function getOAuthProviderDisplayName(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === "github-copilot" || normalized === "copilot") return "GitHub Copilot";
  if (normalized === "google" || normalized === "antigravity") return "AGY OAuth";
  if (normalized === "gemini") return "AGY CLI";
  if (normalized === "codex") return "Codex";
  if (normalized === "github") return "GitHub";
  return provider;
}

export function getSupportedTargetDisplayName(target: string): string {
  if (target === "donggri") return "Donggri";
  if (target === "codex") return "Codex 앱";
  if (target === "gemini") return "AGY";
  return target;
}

export function getPlatformDisplayName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("windows")) return "Windows";
  if (normalized.includes("mac")) return "macOS";
  if (normalized.includes("linux")) return "Linux";
  if (normalized.includes("codex")) return "Codex";
  if (normalized.includes("claude")) return "Claude Code";
  if (normalized.includes("gemini")) return "AGY CLI";
  if (normalized.includes("cursor")) return "Cursor";
  if (normalized.includes("vscode") || normalized.includes("vs code")) return "VS Code";
  if (normalized.includes("web")) return "웹";
  return hasKoreanText(name) ? name : "지원 환경";
}

export function getAuditDisplayName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("license")) return "라이선스";
  if (normalized.includes("security")) return "보안";
  if (normalized.includes("permission")) return "권한";
  if (normalized.includes("metadata")) return "메타데이터";
  if (normalized.includes("dependency")) return "의존성";
  if (normalized.includes("install")) return "설치 검증";
  if (normalized.includes("readme") || normalized.includes("docs")) return "문서";
  if (normalized.includes("quality")) return "품질";
  return hasKoreanText(name) ? name : "검사 항목";
}
