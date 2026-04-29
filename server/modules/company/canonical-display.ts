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
  architect: { ko: "아키텍트", en: "Architect", ja: "アーキテクト", zh: "架构师" },
  backend: { ko: "백엔드", en: "Backend", ja: "バックエンド", zh: "后端" },
  documenter: { ko: "문서화", en: "Documenter", ja: "ドキュメンテーション", zh: "文档" },
  frontend: { ko: "프런트엔드", en: "Frontend", ja: "フロントエンド", zh: "前端" },
  "memory-manager": { ko: "메모리 관리자", en: "Memory Manager", ja: "メモリ管理", zh: "记忆管理" },
  orchestrator: { ko: "오케스트레이터", en: "Orchestrator", ja: "オーケストレーター", zh: "协调者" },
  "product-manager": { ko: "프로덕트 매니저", en: "Product Manager", ja: "プロダクトマネージャー", zh: "产品经理" },
  qa: { ko: "품질 검증", en: "QA", ja: "品質保証", zh: "质量保证" },
  refactor: { ko: "리팩터", en: "Refactor", ja: "リファクタ", zh: "重构" },
  researcher: { ko: "리서처", en: "Researcher", ja: "リサーチャー", zh: "研究员" },
  reviewer: { ko: "리뷰어", en: "Reviewer", ja: "レビュアー", zh: "审查者" },
};

const STAGE_LABELS: Record<string, Record<Lang, string>> = {
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  "advancement-1": { ko: "승급 1", en: "Advancement 1", ja: "昇格 1", zh: "晋升 1" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  "advancement-2": { ko: "승급 2", en: "Advancement 2", ja: "昇格 2", zh: "晋升 2" },
  "pro-senior": { ko: "프로 시니어", en: "Pro Senior", ja: "プロシニア", zh: "资深高级" },
  "advancement-3": { ko: "승급 3", en: "Advancement 3", ja: "昇格 3", zh: "晋升 3" },
  "team-lead": { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "组长" },
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function localize(labels: Record<string, Record<Lang, string>>, key: string, lang: Lang): string {
  return labels[key]?.[lang] ?? labels[key]?.en ?? key;
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
  if (lang === "ja" || lang === "zh") {
    return department ? `${displayName} (${capabilityLabel} / ${department})` : `${displayName} (${capabilityLabel})`;
  }
  return department ? `${displayName}, ${capabilityLabel} of ${department}` : `${displayName}, ${capabilityLabel}`;
}
