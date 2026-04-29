import type { GoalCommandKey, GoalCommandPreset, UiLanguage } from "../../types";
import type { TFunction } from "./constants";

type GoalCommandCopy = {
  title: Record<UiLanguage, string>;
  description: Record<UiLanguage, string>;
};

const GOAL_COMMAND_COPY: Record<GoalCommandKey, GoalCommandCopy> = {
  feature: {
    title: { ko: "완전 개발", en: "Full feature", ja: "完全開発", zh: "完整开发" },
    description: {
      ko: "기능 구현, 검증, 리뷰, 인수인계까지 한 번에 진행합니다.",
      en: "Run implementation, validation, review, and handoff together.",
      ja: "実装、検証、レビュー、引き継ぎまで一括で進めます。",
      zh: "一次性推进实现、验证、评审和交接。",
    },
  },
  fix: {
    title: { ko: "버그 수정", en: "Bug fix", ja: "バグ修正", zh: "缺陷修复" },
    description: {
      ko: "재현, 원인 분석, 수정, 회귀 테스트를 묶어서 진행합니다.",
      en: "Bundle reproduction, root cause analysis, fix, and regression testing.",
      ja: "再現、原因分析、修正、回帰テストをまとめて進めます。",
      zh: "合并处理复现、根因分析、修复和回归测试。",
    },
  },
  review: {
    title: { ko: "코드/품질 리뷰", en: "Code review", ja: "コードレビュー", zh: "代码评审" },
    description: {
      ko: "품질, 리스크, 테스트 공백을 여러 관점으로 검토합니다.",
      en: "Review quality, risks, and test gaps from multiple perspectives.",
      ja: "品質、リスク、テスト不足を複数の観点で確認します。",
      zh: "从多个角度检查质量、风险和测试缺口。",
    },
  },
  debug: {
    title: { ko: "디버깅", en: "Debug", ja: "デバッグ", zh: "调试" },
    description: {
      ko: "증상과 로그를 기준으로 원인을 좁히고 다음 조치를 정합니다.",
      en: "Narrow causes from symptoms and logs, then define the next action.",
      ja: "症状とログから原因を絞り込み、次の対応を決めます。",
      zh: "根据症状和日志缩小原因范围，并确定下一步动作。",
    },
  },
  refactor: {
    title: { ko: "리팩터링", en: "Refactor", ja: "リファクタリング", zh: "重构" },
    description: {
      ko: "동작은 보존하면서 구조, 중복, 유지보수성을 개선합니다.",
      en: "Improve structure, duplication, and maintainability while preserving behavior.",
      ja: "挙動を保ったまま構造、重複、保守性を改善します。",
      zh: "在保持行为不变的前提下改进结构、重复和可维护性。",
    },
  },
  design: {
    title: { ko: "디자인/UI", en: "Design/UI", ja: "デザイン/UI", zh: "设计/UI" },
    description: {
      ko: "화면 흐름, 사용성, 접근성, 구현 인계 기준을 정리합니다.",
      en: "Define screen flow, usability, accessibility, and implementation handoff.",
      ja: "画面フロー、使いやすさ、アクセシビリティ、実装引き継ぎ基準を整理します。",
      zh: "整理页面流程、可用性、可访问性和实现交接标准。",
    },
  },
  research: {
    title: { ko: "조사/분석", en: "Research", ja: "調査/分析", zh: "调研/分析" },
    description: {
      ko: "근거 자료를 수집하고 요약, 판단, 추천안을 만듭니다.",
      en: "Collect evidence and produce findings, judgement, and recommendations.",
      ja: "根拠資料を集め、要約、判断、推奨案を作成します。",
      zh: "收集依据资料，并产出摘要、判断和建议。",
    },
  },
  security: {
    title: { ko: "보안 점검", en: "Security check", ja: "セキュリティ確認", zh: "安全检查" },
    description: {
      ko: "권한, 인증, 비밀값, 외부 전송 리스크를 점검합니다.",
      en: "Check permissions, auth, secrets, and external transfer risks.",
      ja: "権限、認証、秘密情報、外部送信リスクを確認します。",
      zh: "检查权限、认证、密钥和外部传输风险。",
    },
  },
  docs: {
    title: { ko: "문서/보고", en: "Docs/report", ja: "文書/報告", zh: "文档/报告" },
    description: {
      ko: "결정사항, 사용법, 검증 기준, 보고서를 정리합니다.",
      en: "Organize decisions, usage, verification criteria, and reports.",
      ja: "決定事項、使い方、検証基準、報告を整理します。",
      zh: "整理决策、使用方法、验证标准和报告。",
    },
  },
  release: {
    title: { ko: "릴리스/PR/CI", en: "Release/PR/CI", ja: "リリース/PR/CI", zh: "发布/PR/CI" },
    description: {
      ko: "Git 상태, 테스트, CI, 릴리스 노트를 확인합니다.",
      en: "Check Git state, tests, CI readiness, and release notes.",
      ja: "Git 状態、テスト、CI、リリースノートを確認します。",
      zh: "检查 Git 状态、测试、CI 准备情况和发布说明。",
    },
  },
};

const TEAM_PRESET_LABELS: Record<string, Record<UiLanguage, string>> = {
  full_delivery: { ko: "전체 개발 작업", en: "Full delivery", ja: "全体開発", zh: "完整交付" },
  bugfix_response: { ko: "버그 대응", en: "Bugfix response", ja: "バグ対応", zh: "缺陷响应" },
  multi_review: { ko: "다중 리뷰", en: "Multi-review", ja: "複数観点レビュー", zh: "多维评审" },
  incident_debug: { ko: "장애 디버깅", en: "Incident debug", ja: "障害デバッグ", zh: "故障调试" },
  refactor_lane: { ko: "리팩터링", en: "Refactor lane", ja: "リファクタリング", zh: "重构通道" },
  design_delivery: { ko: "디자인 인계", en: "Design delivery", ja: "デザイン引き継ぎ", zh: "设计交付" },
  research_report: { ko: "조사 보고", en: "Research report", ja: "調査報告", zh: "调研报告" },
  security_gate: { ko: "보안 승인", en: "Security gate", ja: "セキュリティゲート", zh: "安全关卡" },
  documentation: { ko: "문서화", en: "Documentation", ja: "文書化", zh: "文档化" },
  release_gate: { ko: "릴리스 게이트", en: "Release gate", ja: "リリースゲート", zh: "发布关卡" },
};

export function goalCommandModalText(t: TFunction) {
  return {
    title: t({
      ko: "목표별로 선택하세요",
      en: "Choose by goal",
      ja: "目的別に選択してください",
      zh: "按目标选择",
    }),
    description: t({
      ko: "어떤 명령을 써야 할지 모르겠다면 목표를 먼저 고르세요. 제목과 설명은 그대로 유지됩니다.",
      en: "If you are not sure which command to use, pick the goal first. Title and description stay unchanged.",
      ja: "どのコマンドを使うべきか迷う場合は、先に目的を選んでください。タイトルと説明は維持されます。",
      zh: "如果不确定该使用哪个命令，请先选择目标。标题和说明会保持不变。",
    }),
    loading: t({
      ko: "목표 명령을 불러오는 중입니다.",
      en: "Loading goal commands.",
      ja: "目的コマンドを読み込んでいます。",
      zh: "正在加载目标命令。",
    }),
    selected: t({
      ko: "선택됨",
      en: "Selected",
      ja: "選択済み",
      zh: "已选择",
    }),
    clear: t({
      ko: "선택 해제",
      en: "Clear",
      ja: "選択解除",
      zh: "清除选择",
    }),
  };
}

function pickLocale<T>(values: Record<UiLanguage, T>, locale: string): T {
  const key = locale === "ko" || locale === "ja" || locale === "zh" ? locale : "en";
  return values[key];
}

export function getGoalCommandTitle(command: GoalCommandPreset, locale: string): string {
  return GOAL_COMMAND_COPY[command.key] ? pickLocale(GOAL_COMMAND_COPY[command.key].title, locale) : command.key;
}

export function getGoalCommandDescription(command: GoalCommandPreset, locale: string): string {
  return GOAL_COMMAND_COPY[command.key]
    ? pickLocale(GOAL_COMMAND_COPY[command.key].description, locale)
    : command.routingTags.join(" · ");
}

export function getGoalCommandTeamLabel(command: GoalCommandPreset, locale: string): string {
  return TEAM_PRESET_LABELS[command.teamPreset] ? pickLocale(TEAM_PRESET_LABELS[command.teamPreset], locale) : command.teamPreset;
}
