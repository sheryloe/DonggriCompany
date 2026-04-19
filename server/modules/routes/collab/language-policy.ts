import type { DatabaseSync } from "node:sqlite";
import { isLang, type Lang } from "../../../types/lang.ts";

export type L10n = Record<Lang, string[]>;

export type DirectivePolicy = {
  skipDelegation: boolean;
  skipDelegationReason: "no_task" | "lightweight" | null;
  skipPlannedMeeting: boolean;
  skipPlanSubtasks: boolean;
};

interface LanguagePolicyDeps {
  db: Pick<DatabaseSync, "prepare">;
}

const ROLE_LABEL_L10N: Record<string, Record<Lang, string>> = {
  team_leader: { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" },
  "team-lead": { ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" },
  orchestrator: { ko: "오케스트레이터", en: "Orchestrator", ja: "オーケストレーター", zh: "协调者" },
  reviewer: { ko: "리뷰어", en: "Reviewer", ja: "レビュアー", zh: "审阅者" },
  backend: { ko: "백엔드", en: "Backend", ja: "バックエンド", zh: "后端" },
  frontend: { ko: "프론트엔드", en: "Frontend", ja: "フロントエンド", zh: "前端" },
  qa: { ko: "품질 검증", en: "QA", ja: "品質検証", zh: "质量验证" },
  "memory-manager": { ko: "메모리 매니저", en: "Memory Manager", ja: "メモリーマネージャー", zh: "记忆管理者" },
  "product-manager": { ko: "프로덕트 매니저", en: "Product Manager", ja: "プロダクトマネージャー", zh: "产品经理" },
};

const DEPT_KEYWORDS: Record<string, string[]> = {
  dev: ["개발", "구현", "backend", "server", "api", "bug", "build", "refactor", "code", "scene engine"],
  design: ["디자인", "ui", "ux", "layout", "mockup", "screen", "visual", "스토리보드"],
  planning: ["기획", "plan", "planning", "spec", "requirement", "roadmap", "report", "pre-production", "프리프로덕션"],
  operations: ["운영", "deploy", "deployment", "infra", "monitor", "runtime", "ops"],
  qa: ["qa", "test", "testing", "validation", "regression", "quality", "리뷰", "검증"],
  devsecops: ["security", "devsecops", "auth", "permission", "vulnerability", "compliance", "보안"],
};

function normalizeForSearch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactForSearch(value: unknown): string {
  return normalizeForSearch(value).replace(/[\s_-]+/g, "");
}

function includesAnyTerm(content: string, terms: string[]): boolean {
  const normalized = normalizeForSearch(content);
  const compact = compactForSearch(content);
  return terms.some((term) => {
    const termNorm = normalizeForSearch(term);
    const termCompact = compactForSearch(term);
    return normalized.includes(termNorm) || compact.includes(termCompact);
  });
}

function collectDepartmentAliases(input: unknown): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) return [];

  const candidates = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeForSearch(value);
    if (normalized.length >= 2) candidates.add(normalized);
    const compact = compactForSearch(value);
    if (compact.length >= 2) candidates.add(compact);
  };

  push(raw);
  push(raw.replace(/\s*(부서|department|dept|team)$/i, ""));
  push(raw.replace(/[\s_-]+/g, ""));
  return [...candidates];
}

function normalizeRoleKey(value: string): string {
  const key = normalizeForSearch(value).replace(/\s+/g, "_");
  if (key === "teamlead" || key === "team-lead" || key === "team_lead" || key === "teamleader") {
    return "team_leader";
  }
  return key;
}

export function initializeCollabLanguagePolicy(deps: LanguagePolicyDeps) {
  const { db } = deps;

  function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function readSettingString(key: string): string | undefined {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
    if (!row?.value) return undefined;
    try {
      const parsed = JSON.parse(row.value);
      return typeof parsed === "string" ? parsed : row.value;
    } catch {
      return row.value;
    }
  }

  function getPreferredLanguage(): Lang {
    const settingLang = readSettingString("language");
    return isLang(settingLang) ? settingLang : "en";
  }

  function detectLang(text: string): Lang {
    const ko = text.match(/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g)?.length ?? 0;
    const ja = text.match(/[\u3040-\u309f\u30a0-\u30ff]/g)?.length ?? 0;
    const zh = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const total = text.replace(/\s/g, "").length || 1;
    if (ko / total > 0.15) return "ko";
    if (ja / total > 0.15) return "ja";
    if (zh / total > 0.25) return "zh";
    return "en";
  }

  function resolveLang(text?: string, fallback?: Lang): Lang {
    const settingLang = readSettingString("language");
    if (isLang(settingLang)) return settingLang;
    const trimmed = String(text ?? "").trim();
    if (trimmed) return detectLang(trimmed);
    return fallback ?? getPreferredLanguage();
  }

  function l(ko: string[], en: string[], ja?: string[], zh?: string[]): L10n {
    return {
      ko,
      en,
      ja: ja ?? en,
      zh: zh ?? en,
    };
  }

  function pickL(pool: L10n, lang: Lang): string {
    const list = pool[lang] ?? pool.en;
    return list[Math.floor(Math.random() * list.length)] ?? "";
  }

  function getFlairs(agentName: string, lang: Lang): string[] {
    const defaults: Record<Lang, string[]> = {
      ko: ["작업 진행 중", "진행 상황 정리 중", "결과 검증 중"],
      en: ["working through tasks", "organizing progress", "verifying outcomes"],
      ja: ["作業を進行中", "進捗を整理中", "結果を検証中"],
      zh: ["正在推进任务", "正在整理进度", "正在验证结果"],
    };

    const named: Record<string, Record<Lang, string[]>> = {
      Aria: {
        ko: ["리뷰 기준 점검 중", "리팩터링 방향 정리 중", "변경 영향 확인 중"],
        en: ["reviewing code quality", "planning a refactor", "checking change impact"],
        ja: ["コード品質をレビュー中", "リファクタリング方針を整理中", "変更影響を確認中"],
        zh: ["正在审查代码质量", "正在规划重构方向", "正在检查变更影响"],
      },
      Bolt: {
        ko: ["API 작업 중", "구현 마무리 중", "성능 병목 확인 중"],
        en: ["working on APIs", "shipping implementation", "checking performance bottlenecks"],
        ja: ["API 作業中", "実装の仕上げ中", "性能ボトルネック確認中"],
        zh: ["正在处理 API", "正在收尾实现", "正在检查性能瓶颈"],
      },
    };

    return named[agentName]?.[lang] ?? defaults[lang];
  }

  function getRoleLabel(role: string, lang: Lang): string {
    const normalized = normalizeRoleKey(role);
    return ROLE_LABEL_L10N[normalized]?.[lang] ?? ROLE_LABEL_L10N[normalized]?.en ?? role;
  }

  function classifyIntent(msg: string, lang: Lang): Record<string, boolean> {
    const normalized = normalizeForSearch(msg);
    const isKo = lang === "ko";
    return {
      greeting: isKo
        ? /(안녕|반가|좋은\s*(아침|오후|저녁|밤))/i.test(msg)
        : /(hello|hi|hey|good\s*(morning|afternoon|evening))/i.test(normalized),
      presence: isKo
        ? /(있어|자리|응답|보여|어디)/i.test(msg)
        : /(are you there|available|around|present)/i.test(normalized),
      whatDoing: isKo
        ? /(뭐\s*해|무엇\s*하고|진행\s*중|바빠)/i.test(msg)
        : /(what are you doing|working on|busy|what'?s up)/i.test(normalized),
      report: isKo
        ? /(상황|보고|진행|어떻게)/i.test(msg)
        : /(report|status|progress|how is it going)/i.test(normalized),
      complaint: isKo
        ? /(왜\s*이렇게\s*느려|응답\s*없|문제)/i.test(msg)
        : /(why so slow|late|no response|problem)/i.test(normalized),
      canDo: isKo ? /(할\s*수\s*있어|가능해)/i.test(msg) : /(can you do|possible|available to handle)/i.test(normalized),
    };
  }

  function analyzeDirectivePolicy(message: string): DirectivePolicy {
    const normalized = normalizeForSearch(message);
    const hasTaskVerb =
      /(fix|build|implement|write|create|update|design|analyze|research|review|ship|배포|구현|수정|작성|분석|리뷰|조사|개발|테스트|설계)/i.test(
        normalized,
      );
    const lightweight =
      /(hello|thanks|고마워|감사|안녕|what'?s up|ping|status only|인사만)/i.test(normalized) || normalized.length < 24;

    if (!hasTaskVerb) {
      return {
        skipDelegation: true,
        skipDelegationReason: "no_task",
        skipPlannedMeeting: false,
        skipPlanSubtasks: true,
      };
    }

    if (lightweight) {
      return {
        skipDelegation: true,
        skipDelegationReason: "lightweight",
        skipPlannedMeeting: false,
        skipPlanSubtasks: true,
      };
    }

    return {
      skipDelegation: false,
      skipDelegationReason: null,
      skipPlannedMeeting: false,
      skipPlanSubtasks: false,
    };
  }

  function shouldExecuteDirectiveDelegation(message: string): boolean {
    return !analyzeDirectivePolicy(message).skipDelegation;
  }

  function detectTargetDepartments(message: string): string[] {
    const normalized = normalizeForSearch(message);
    const compact = compactForSearch(message);
    const out = new Set<string>();

    for (const [deptId, keywords] of Object.entries(DEPT_KEYWORDS)) {
      if (includesAnyTerm(message, keywords)) out.add(deptId);
    }

    try {
      const rows = db
        .prepare("SELECT id, name, name_ko, name_ja, name_zh FROM departments")
        .all() as Array<Record<string, unknown>>;

      for (const row of rows) {
        const deptId = String(row.id ?? "").trim();
        if (!deptId) continue;
        const aliases = [
          ...collectDepartmentAliases(row.id),
          ...collectDepartmentAliases(row.name),
          ...collectDepartmentAliases(row.name_ko),
          ...collectDepartmentAliases(row.name_ja),
          ...collectDepartmentAliases(row.name_zh),
        ];

        if (
          aliases.some((alias) => {
            const aliasCompact = compactForSearch(alias);
            return normalized.includes(alias) || compact.includes(aliasCompact);
          })
        ) {
          out.add(deptId);
        }
      }
    } catch {
      // ignore alias lookup failures
    }

    return [...out];
  }

  return {
    DEPT_KEYWORDS,
    pickRandom,
    getPreferredLanguage,
    resolveLang,
    detectLang,
    l,
    pickL,
    getFlairs,
    getRoleLabel,
    classifyIntent,
    analyzeDirectivePolicy,
    shouldExecuteDirectiveDelegation,
    detectTargetDepartments,
  };
}
