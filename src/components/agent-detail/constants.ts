import type { OAuthAccountInfo } from "../../api";
import type { UiLanguage } from "../../i18n";

export type Locale = UiLanguage;
export type TFunction = (messages: Record<Locale, string>) => string;

export function roleLabel(role: string, t: TFunction) {
  switch (role) {
    case "team_leader":
      return t({ ko: "팀 리드", en: "Team Lead", ja: "チームリード", zh: "团队负责人" });
    case "senior":
      return t({ ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" });
    case "junior":
      return t({ ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" });
    case "intern":
      return t({ ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" });
    default:
      return role;
  }
}

function hashSubAgentId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getSubAgentSpriteNum(subAgentId: string): number {
  return (hashSubAgentId(`${subAgentId}:clone`) % 44) + 1;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: "idle", color: "text-green-400", bg: "bg-green-500/20" },
  working: { label: "working", color: "text-blue-400", bg: "bg-blue-500/20" },
  break: { label: "break", color: "text-yellow-400", bg: "bg-yellow-500/20" },
  offline: { label: "offline", color: "text-slate-400", bg: "bg-slate-500/20" },
};

export const CLI_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  agy: "AGY CLI",
  gemini: "AGY CLI",
  jules: "Jules CLI",
  opencode: "OpenCode",
  kimi: "Kimi Code",
  copilot: "GitHub Copilot",
  antigravity: "AGY CLI",
  api: "API Provider",
};

export const SUBTASK_STATUS_ICON: Record<string, string> = {
  pending: "•",
  in_progress: "~",
  done: "OK",
  blocked: "!",
};

export function oauthAccountLabel(account: OAuthAccountInfo): string {
  return account.label || account.email || account.id.slice(0, 8);
}

export function statusLabel(status: string, t: TFunction) {
  switch (status) {
    case "idle":
      return t({ ko: "대기 중", en: "Idle", ja: "待機", zh: "待机" });
    case "working":
      return t({ ko: "작업 중", en: "Working", ja: "作業中", zh: "工作中" });
    case "break":
      return t({ ko: "휴식 중", en: "Break", ja: "休憩", zh: "休息中" });
    case "offline":
      return t({ ko: "오프라인", en: "Offline", ja: "オフライン", zh: "离线" });
    default:
      return status;
  }
}

export function taskStatusLabel(status: string, t: TFunction) {
  switch (status) {
    case "inbox":
      return t({ ko: "수신함", en: "Inbox", ja: "受信箱", zh: "收件箱" });
    case "planned":
      return t({ ko: "계획", en: "Planned", ja: "計画", zh: "计划" });
    case "in_progress":
      return t({ ko: "진행 중", en: "In Progress", ja: "進行中", zh: "进行中" });
    case "review":
      return t({ ko: "리뷰", en: "Review", ja: "レビュー", zh: "审查" });
    case "done":
      return t({ ko: "완료", en: "Done", ja: "完了", zh: "完成" });
    case "pending":
      return t({ ko: "보류", en: "Pending", ja: "保留", zh: "待定" });
    case "cancelled":
      return t({ ko: "취소", en: "Cancelled", ja: "キャンセル", zh: "已取消" });
    default:
      return status;
  }
}

export function taskTypeLabel(type: string, t: TFunction) {
  switch (type) {
    case "general":
      return t({ ko: "일반", en: "General", ja: "一般", zh: "一般" });
    case "development":
      return t({ ko: "개발", en: "Development", ja: "開発", zh: "开发" });
    case "design":
      return t({ ko: "디자인", en: "Design", ja: "デザイン", zh: "设计" });
    case "analysis":
      return t({ ko: "분석", en: "Analysis", ja: "分析", zh: "分析" });
    case "presentation":
      return t({ ko: "발표", en: "Presentation", ja: "発表", zh: "演示" });
    case "documentation":
      return t({ ko: "문서화", en: "Documentation", ja: "ドキュメント", zh: "文档" });
    default:
      return type;
  }
}
