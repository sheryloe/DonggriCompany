import type { Lang } from "../../types/lang.ts";
import { resolveCanonicalIdentity } from "./canonical-identity.ts";

type CanonicalAgentLike = {
  name?: unknown;
  name_ko?: unknown;
  family?: unknown;
  career_stage?: unknown;
  specialization_key?: unknown;
  authority_level?: unknown;
  execution_capability_profile?: unknown;
  workflow_profile?: unknown;
  role?: unknown;
  department_id?: unknown;
};

const FAMILY_LABELS: Record<string, Record<Lang, string>> = {
  architect: { ko: "아키텍트", en: "Architect", ja: "Architect", zh: "Architect" },
  backend: { ko: "백엔드", en: "Backend", ja: "Backend", zh: "Backend" },
  documenter: { ko: "문서 담당", en: "Documenter", ja: "Documenter", zh: "Documenter" },
  frontend: { ko: "프론트엔드", en: "Frontend", ja: "Frontend", zh: "Frontend" },
  "memory-manager": { ko: "메모리 관리자", en: "Memory Manager", ja: "Memory Manager", zh: "Memory Manager" },
  orchestrator: { ko: "오케스트레이터", en: "Orchestrator", ja: "Orchestrator", zh: "Orchestrator" },
  "product-manager": { ko: "프로덕트 매니저", en: "Product Manager", ja: "Product Manager", zh: "Product Manager" },
  qa: { ko: "품질 검증", en: "QA", ja: "QA", zh: "QA" },
  refactor: { ko: "리팩터링", en: "Refactor", ja: "Refactor", zh: "Refactor" },
  researcher: { ko: "리서처", en: "Researcher", ja: "Researcher", zh: "Researcher" },
  reviewer: { ko: "리뷰어", en: "Reviewer", ja: "Reviewer", zh: "Reviewer" },
};

const STAGE_LABELS: Record<string, Record<Lang, string>> = {
  junior: { ko: "주니어", en: "Junior", ja: "Junior", zh: "Junior" },
  "advancement-1": { ko: "성장 1단계", en: "Advancement 1", ja: "Advancement 1", zh: "Advancement 1" },
  senior: { ko: "시니어", en: "Senior", ja: "Senior", zh: "Senior" },
  "advancement-2": { ko: "성장 2단계", en: "Advancement 2", ja: "Advancement 2", zh: "Advancement 2" },
  "pro-senior": { ko: "프로 시니어", en: "Pro Senior", ja: "Pro Senior", zh: "Pro Senior" },
  "advancement-3": { ko: "성장 3단계", en: "Advancement 3", ja: "Advancement 3", zh: "Advancement 3" },
  "team-lead": { ko: "팀 리드", en: "Team Lead", ja: "Team Lead", zh: "Team Lead" },
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function localize(labels: Record<string, Record<Lang, string>>, key: string, lang: Lang): string {
  return labels[key]?.[lang] ?? labels[key]?.ko ?? labels[key]?.en ?? key;
}

export function getCanonicalFamilyLabel(key: string, lang: Lang): string {
  return localize(FAMILY_LABELS, key, lang);
}

export function getCanonicalStageLabel(key: string, lang: Lang): string {
  return localize(STAGE_LABELS, key, lang);
}

export function buildCanonicalCapabilityLabel(agent: CanonicalAgentLike, lang: Lang): string {
  const canonical = resolveCanonicalIdentity(agent);
  const familyLabel = getCanonicalFamilyLabel(canonical.family, lang);
  const stageLabel = getCanonicalStageLabel(canonical.career_stage, lang);
  const capability = normalizeText(canonical.execution_capability_profile);
  return capability ? `${familyLabel} · ${stageLabel} · ${capability}` : `${familyLabel} · ${stageLabel}`;
}

export function buildCanonicalActorLabel(
  agent: CanonicalAgentLike,
  lang: Lang,
  departmentName?: string | null,
): string {
  const displayName =
    lang === "ko" ? normalizeText(agent.name_ko) || normalizeText(agent.name) : normalizeText(agent.name);
  const capabilityLabel = buildCanonicalCapabilityLabel(agent, lang);
  const department = normalizeText(departmentName);
  if (lang === "ko") {
    return department ? `${department} ${capabilityLabel} ${displayName}` : `${capabilityLabel} ${displayName}`;
  }
  return department ? `${displayName}, ${capabilityLabel} of ${department}` : `${displayName}, ${capabilityLabel}`;
}
