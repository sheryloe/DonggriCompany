import type {
  AssetJobStatus,
  ProjectModuleBindingStatus,
  ProjectModuleCategoryKey,
  ProjectModuleManifest,
  ProjectModuleRiskLevel,
} from "../types";

export type ProjectModuleCategoryFilter = "all" | ProjectModuleCategoryKey;

export const PROJECT_MODULE_CATEGORY_LABELS: Record<ProjectModuleCategoryFilter, string> = {
  all: "전체",
  "auth-provider": "OAuth / 인증",
  "image-generation": "이미지 생성",
  "game-asset": "게임 자산",
  "project-template": "프로젝트 템플릿",
  operations: "운영 자동화",
};

const PROJECT_MODULE_TEXT: Record<string, { title: string; summary: string }> = {
  "google-oauth": {
    title: "Google OAuth",
    summary: "Google 로그인, 계정 연결, 콜백 경로, 안전한 토큰 저장 규칙을 프로젝트에 적용합니다.",
  },
  "naver-oauth": {
    title: "Naver OAuth",
    summary: "Naver OAuth 2.0 로그인과 재인증 흐름을 재사용 가능한 프로젝트 계약으로 연결합니다.",
  },
  "landscape-image": {
    title: "풍경 이미지",
    summary: "배경, 풍경, 프로젝트용 이미지 생성을 위한 프롬프트 묶음과 검수 기준을 제공합니다.",
  },
  "character-image": {
    title: "캐릭터 이미지",
    summary: "캐릭터 정체성, 포즈, 의상 일관성을 유지하는 이미지 생성 모듈입니다.",
  },
  "sprite-4dir": {
    title: "4방향 스프라이트",
    summary: "앞, 왼쪽, 뒤, 오른쪽 기준 게임 캐릭터 스프라이트 생성 계약입니다.",
  },
  "notebooklm-source-import": {
    title: "NotebookLM 자료 가져오기",
    summary: "URL, PDF, Google Docs/Drive 내보내기, 수동 업로드 중심의 안전한 NotebookLM 자료 정리 흐름입니다.",
  },
};

const CAPABILITY_LABELS: Record<string, string> = {
  account_linking: "계정 연결",
  atlas_review: "아틀라스 검수",
  background_asset_generation: "배경 자산 생성",
  brief_export_review: "요약 내보내기 검토",
  callback_route_contract: "콜백 경로 계약",
  character_prompt_pack: "캐릭터 프롬프트 묶음",
  citation_handoff: "출처 인계",
  four_direction_manifest: "4방향 매니페스트",
  identity_lock: "정체성 고정",
  image_prompt_pack: "이미지 프롬프트 묶음",
  notebooklm_import_checklist: "NotebookLM 가져오기 체크리스트",
  oauth_login: "OAuth 로그인",
  pose_variation: "포즈 변형",
  publish_manifest: "게시 매니페스트",
  reauthentication_hint: "재인증 안내",
  review_contract: "검수 계약",
  source_collection: "자료 수집",
  sprite_prompt_pack: "스프라이트 프롬프트 묶음",
  token_storage_contract: "토큰 저장 계약",
  walk_extension_contract: "걷기 확장 계약",
};

export const PROJECT_MODULE_RISK_LABELS: Record<ProjectModuleRiskLevel, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export const PROJECT_MODULE_BINDING_STATUS_LABELS: Record<ProjectModuleBindingStatus | string, string> = {
  previewed: "미리보기 완료",
  bound: "바인딩됨",
  applied: "적용됨",
  failed: "실패",
  disabled: "비활성",
};

export const ASSET_JOB_STATUS_LABELS: Record<AssetJobStatus | string, string> = {
  draft: "초안",
  generating: "생성 중",
  generated: "생성 완료",
  needs_review: "검수 필요",
  approved: "승인됨",
  published: "게시됨",
  failed: "실패",
};

export function getProjectModuleTitle(moduleOrKey: ProjectModuleManifest | string): string {
  const key = typeof moduleOrKey === "string" ? moduleOrKey : moduleOrKey.module_key;
  if (PROJECT_MODULE_TEXT[key]) return PROJECT_MODULE_TEXT[key].title;
  if (typeof moduleOrKey !== "string" && moduleOrKey.name) return moduleOrKey.name;
  return "사용자 모듈";
}

export function getProjectModuleSummary(module: ProjectModuleManifest): string {
  return PROJECT_MODULE_TEXT[module.module_key]?.summary ?? "프로젝트에 적용 가능한 재사용 기능 모듈입니다.";
}

export function getProjectModuleCapabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? "모듈 기능";
}

export function getProjectModuleCategoryLabel(category: ProjectModuleCategoryFilter): string {
  return PROJECT_MODULE_CATEGORY_LABELS[category] ?? "기타";
}

export function getProjectModuleRiskLabel(riskLevel: ProjectModuleRiskLevel): string {
  return PROJECT_MODULE_RISK_LABELS[riskLevel] ?? "보통";
}

export function getProjectModuleBindingStatusLabel(status: string): string {
  return PROJECT_MODULE_BINDING_STATUS_LABELS[status] ?? "상태 확인 필요";
}

export function getAssetJobStatusLabel(status: string): string {
  return ASSET_JOB_STATUS_LABELS[status] ?? "상태 확인 필요";
}
