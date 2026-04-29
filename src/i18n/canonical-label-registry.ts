import type { UiLanguage } from "../i18n";

type CanonicalLabelMessages = {
  ko: string;
  en: string;
  ja: string;
  zh: string;
};

export type CanonicalLabelValidationIssue = {
  key: string;
  severity: "warning" | "error";
  message: string;
};

const FAMILY_LABELS: Record<string, CanonicalLabelMessages> = {
  architect: { ko: "아키텍트", en: "Architect", ja: "アーキテクト", zh: "架构师" },
  backend: { ko: "백엔드", en: "Backend", ja: "バックエンド", zh: "后端" },
  documenter: { ko: "문서화", en: "Documenter", ja: "ドキュメンター", zh: "文档工程" },
  frontend: { ko: "프런트엔드", en: "Frontend", ja: "フロントエンド", zh: "前端" },
  "memory-manager": { ko: "메모리 관리자", en: "Memory Manager", ja: "メモリマネージャー", zh: "记忆管理" },
  orchestrator: { ko: "오케스트레이터", en: "Orchestrator", ja: "オーケストレーター", zh: "编排器" },
  "product-manager": { ko: "프로덕트 매니저", en: "Product Manager", ja: "プロダクトマネージャー", zh: "产品经理" },
  qa: { ko: "QA", en: "QA", ja: "QA", zh: "QA" },
  refactor: { ko: "리팩터", en: "Refactor", ja: "リファクター", zh: "重构" },
  researcher: { ko: "리서처", en: "Researcher", ja: "リサーチャー", zh: "研究员" },
  reviewer: { ko: "리뷰어", en: "Reviewer", ja: "レビュアー", zh: "审阅者" },
};

const STAGE_LABELS: Record<string, CanonicalLabelMessages> = {
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  "advancement-1": { ko: "성장 1단계", en: "Advancement 1", ja: "成長 1段階", zh: "成长 1 阶段" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  "advancement-2": { ko: "성장 2단계", en: "Advancement 2", ja: "成長 2段階", zh: "成长 2 阶段" },
  "pro-senior": { ko: "프로 시니어", en: "Pro Senior", ja: "プロシニア", zh: "资深专家" },
  "advancement-3": { ko: "성장 3단계", en: "Advancement 3", ja: "成長 3段階", zh: "成长 3 阶段" },
  "team-lead": { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" },
};

const BADGE_LABELS: Record<"source" | "derived" | "projection" | "localized", CanonicalLabelMessages> = {
  source: { ko: "원본", en: "Source", ja: "ソース", zh: "来源" },
  derived: { ko: "파생", en: "Derived", ja: "派生", zh: "派生" },
  projection: { ko: "프로젝션", en: "Projection", ja: "プロジェクション", zh: "投影" },
  localized: { ko: "현지화", en: "Localized", ja: "ローカライズ", zh: "本地化" },
};

function pickLocalized(messages: CanonicalLabelMessages | undefined, locale: UiLanguage, fallback: string): string {
  if (!messages) return fallback;
  return messages[locale] ?? messages.en ?? fallback;
}

export function getCanonicalFamilyLabel(key: string, locale: UiLanguage): string {
  return pickLocalized(FAMILY_LABELS[key], locale, key);
}

export function getCanonicalStageLabel(key: string, locale: UiLanguage): string {
  return pickLocalized(STAGE_LABELS[key], locale, key);
}

export function getCanonicalBadgeLabel(
  key: keyof typeof BADGE_LABELS | "Source" | "Derived" | "Projection" | "Localized",
  locale: UiLanguage,
): string {
  const normalized = String(key ?? "")
    .trim()
    .toLowerCase() as keyof typeof BADGE_LABELS;
  return pickLocalized(BADGE_LABELS[normalized], locale, normalized);
}

export function validateCanonicalLabels(locale: UiLanguage): CanonicalLabelValidationIssue[] {
  const issues: CanonicalLabelValidationIssue[] = [];
  const registries = [
    { prefix: "family", labels: FAMILY_LABELS },
    { prefix: "stage", labels: STAGE_LABELS },
    { prefix: "badge", labels: BADGE_LABELS },
  ] as const;

  for (const registry of registries) {
    for (const [key, labels] of Object.entries(registry.labels)) {
      const localized = labels[locale];
      if (!localized || !localized.trim()) {
        issues.push({
          key: `${registry.prefix}:${key}`,
          severity: "error",
          message: `Missing localized label for ${locale}.`,
        });
        continue;
      }
      if (localized.length > 48) {
        issues.push({
          key: `${registry.prefix}:${key}`,
          severity: "warning",
          message: `Localized label is longer than 48 characters for ${locale}.`,
        });
      }
    }
  }

  return issues;
}
