import type { TaskStatus } from "../types";

export const LIVE_TASK_STATUSES = new Set<TaskStatus>(["planned", "collaborating", "in_progress", "review"]);

export const TASK_STATUS_KO_LABELS: Record<TaskStatus, string> = {
  inbox: "수신함",
  planned: "계획됨",
  collaborating: "협업 중",
  in_progress: "진행 중",
  review: "검토",
  done: "완료",
  pending: "보류",
  cancelled: "취소",
};

export const TASK_STATUS_DOT_CLASS: Record<TaskStatus, string> = {
  inbox: "bg-slate-400",
  planned: "bg-blue-400",
  collaborating: "bg-indigo-400",
  in_progress: "bg-amber-400",
  review: "bg-purple-400",
  done: "bg-emerald-400",
  pending: "bg-orange-400",
  cancelled: "bg-rose-400",
};

export const TASK_STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  inbox: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  planned: "border-blue-400/40 bg-blue-500/10 text-blue-100",
  collaborating: "border-indigo-400/40 bg-indigo-500/10 text-indigo-100",
  in_progress: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  review: "border-purple-400/40 bg-purple-500/10 text-purple-100",
  done: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  pending: "border-orange-400/40 bg-orange-500/10 text-orange-100",
  cancelled: "border-rose-400/40 bg-rose-500/10 text-rose-100",
};

export function isLiveTaskStatus(status: TaskStatus): boolean {
  return LIVE_TASK_STATUSES.has(status);
}

export function getTaskStatusKoLabel(status: TaskStatus): string {
  return TASK_STATUS_KO_LABELS[status] ?? status;
}

export function getTaskStatusDotClass(status: TaskStatus): string {
  return TASK_STATUS_DOT_CLASS[status] ?? "bg-slate-500";
}

export function getTaskStatusBadgeClass(status: TaskStatus): string {
  return TASK_STATUS_BADGE_CLASS[status] ?? TASK_STATUS_BADGE_CLASS.inbox;
}
