import { useState } from "react";
import type {
  Agent,
  CeoOfficeCall,
  CrossDeptDelivery,
  Department,
  GoalCommandPreset,
  MeetingPresence,
  SubTask,
  Task,
  TaskStatus,
} from "../../types";
import { useI18n } from "../../i18n";
import { normalizeSubtaskTitleForUi } from "../../app/subtask-title-normalizer";
import { getTaskStatusBadgeClass } from "../../app/task-status-display";
import AgentAvatar from "../AgentAvatar";
import DiffModal from "./DiffModal";
import { getGoalCommandTeamLabel, getGoalCommandTitle } from "./goal-command-text";
import {
  resolveTaskGoalCommandMeta,
  resolveTaskRecentLogs,
  resolveTaskTimelineEvents,
  resolveTaskVerificationGates,
} from "./task-card-meta";
import {
  getTaskTypeBadge,
  isHideableStatus,
  priorityLabel,
  STATUS_OPTIONS,
  taskStatusLabel,
  timeAgo,
} from "./constants";

interface TaskCardProps {
  task: Task;
  agents: Agent[];
  departments: Department[];
  taskSubtasks: SubTask[];
  meetingPresence?: MeetingPresence[];
  ceoOfficeCalls?: CeoOfficeCall[];
  crossDeptDeliveries?: CrossDeptDelivery[];
  isHiddenTask?: boolean;
  onUpdateTask: (id: string, data: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onAssignTask: (taskId: string, agentId: string) => void;
  onRunTask: (id: string) => void;
  onStopTask: (id: string) => void;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onOpenMeetingMinutes?: (taskId: string) => void;
  onMergeTask?: (id: string) => void;
  onDiscardTask?: (id: string) => void;
  onHideTask?: (id: string) => void;
  onUnhideTask?: (id: string) => void;
}

const SUBTASK_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행",
  done: "완료",
  blocked: "차단",
};

function tKo(labels: { ko?: string; en?: string }): string {
  return labels.ko ?? labels.en ?? "";
}

function resolveAutoRoutingMeta(task: Task): {
  projectConfidence: number;
  agentConfidence: number;
  requiresPmoTriage: boolean;
} | null {
  let parsed: Record<string, unknown> = {};
  try {
    parsed =
      task.workflow_meta_json && typeof task.workflow_meta_json === "string"
        ? (JSON.parse(task.workflow_meta_json) as Record<string, unknown>)
        : {};
  } catch {
    parsed = {};
  }
  if (parsed.auto_routing_version !== "donggri_task_auto_routing_v1") return null;
  return {
    projectConfidence: typeof parsed.project_routing_confidence === "number" ? parsed.project_routing_confidence : 0,
    agentConfidence: typeof parsed.agent_routing_confidence === "number" ? parsed.agent_routing_confidence : 0,
    requiresPmoTriage: Boolean(parsed.requires_pmo_triage),
  };
}

function getProjectName(task: Task): string | null {
  const value = (task as Task & { project_name?: string | null }).project_name;
  return typeof value === "string" && value.trim() ? value : null;
}

export default function TaskCard({
  task,
  agents,
  departments,
  taskSubtasks,
  meetingPresence = [],
  ceoOfficeCalls = [],
  crossDeptDeliveries = [],
  isHiddenTask,
  onUpdateTask,
  onDeleteTask,
  onAssignTask,
  onRunTask,
  onStopTask,
  onPauseTask,
  onResumeTask,
  onOpenTerminal,
  onOpenMeetingMinutes,
  onMergeTask,
  onDiscardTask,
  onHideTask,
  onUnhideTask,
}: TaskCardProps) {
  void onAssignTask;
  void onMergeTask;
  void onDiscardTask;

  const { locale: localeTag, language: locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);

  const assignedAgent = task.assigned_agent ?? agents.find((agent) => agent.id === task.assigned_agent_id);
  const fallbackAssignedName =
    (locale === "ko" ? task.agent_name_ko || task.agent_name : task.agent_name || task.agent_name_ko) ||
    task.assigned_agent_id;
  const assignedLabel = assignedAgent ? assignedAgent.name_ko || assignedAgent.name : fallbackAssignedName || null;
  const department = departments.find((departmentItem) => departmentItem.id === task.department_id);
  const typeBadge = getTaskTypeBadge(task.task_type, tKo);
  const goalCommandMeta = resolveTaskGoalCommandMeta(task);
  const autoRoutingMeta = resolveAutoRoutingMeta(task);
  const projectName = getProjectName(task);
  const verificationGates = resolveTaskVerificationGates(task);
  const recentLogs = resolveTaskRecentLogs(task);
  const timelineEvents = resolveTaskTimelineEvents({
    task,
    agents,
    meetingPresence,
    ceoOfficeCalls,
    crossDeptDeliveries,
  });

  const canRun = task.status === "planned" || task.status === "inbox";
  const canStop = task.status === "in_progress";
  const canPause = task.status === "in_progress" && !!onPauseTask;
  const canResume = (task.status === "pending" || task.status === "cancelled") && !!onResumeTask;
  const canDelete = task.status !== "in_progress";
  const canHideTask = isHideableStatus(task.status);

  return (
    <div
      className={`group rounded-xl border p-3.5 shadow-sm transition hover:shadow-md ${
        isHiddenTask
          ? "border-cyan-700/80 bg-slate-800/80 hover:border-cyan-600"
          : "border-slate-700 bg-slate-800 hover:border-slate-600"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex-1 text-left text-sm font-semibold leading-snug text-white"
        >
          {task.title}
        </button>
        <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200">
          우선순위 {priorityLabel(task.priority, tKo)}
        </span>
      </div>

      {task.description && (
        <p className={`mb-2 text-xs leading-relaxed text-slate-400 ${expanded ? "" : "line-clamp-2"}`}>
          {task.description}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.color}`}>{typeBadge.label}</span>
        {isHiddenTask && <span className="rounded-full bg-cyan-900/60 px-2 py-0.5 text-xs text-cyan-200">숨김</span>}
        {department && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {department.icon} {department.name_ko || department.name}
          </span>
        )}
        {projectName && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">프로젝트 {projectName}</span>
        )}
        {goalCommandMeta && (
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-100">
            {getGoalCommandTitle(goalCommandMeta as GoalCommandPreset, "ko")} ·{" "}
            {getGoalCommandTeamLabel(goalCommandMeta as GoalCommandPreset, "ko")}
          </span>
        )}
      </div>

      {(goalCommandMeta || verificationGates.length > 0 || recentLogs.length > 0 || timelineEvents.length > 0) && (
        <div className="mb-3 space-y-2 rounded-lg border border-slate-700/70 bg-slate-900/45 p-2.5">
          {goalCommandMeta && (
            <div className="grid gap-2 text-[11px] sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-slate-500">goal command</div>
                <div className="mt-0.5 truncate font-mono text-cyan-100" title={goalCommandMeta.slashCommand}>
                  {goalCommandMeta.slashCommand}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-slate-500">담당 부서</div>
                <div className="mt-0.5 truncate text-slate-200" title={goalCommandMeta.requiredDepartments.join(", ")}>
                  {goalCommandMeta.requiredDepartments.length > 0
                    ? goalCommandMeta.requiredDepartments.join(", ")
                    : department?.name_ko || department?.name || "-"}
                </div>
              </div>
            </div>
          )}

          {verificationGates.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] text-slate-500">검증 게이트</div>
              <div className="flex flex-wrap gap-1.5">
                {verificationGates.map((gate) => (
                  <span
                    key={gate.key}
                    className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] ${
                      gate.tone === "blocked"
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                        : gate.tone === "required"
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                          : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    }`}
                    title={gate.key}
                  >
                    {gate.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {timelineEvents.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] text-slate-500">업무 타임라인</div>
              <div className="space-y-1">
                {timelineEvents.map((event) => (
                  <div key={event.key} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[11px]">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-center text-slate-300">{event.label}</span>
                    <span className="truncate text-slate-400" title={event.detail}>
                      {event.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentLogs.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] text-slate-500">최근 로그</div>
              <div className="space-y-1">
                {recentLogs.map((log) => (
                  <div key={`${log.id}-${log.created_at}`} className="flex min-w-0 items-start gap-1.5 text-[11px]">
                    <span className="mt-0.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
                      {log.kind}
                    </span>
                    <span className="line-clamp-1 text-slate-400">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-3">
        <select
          value={task.status}
          onChange={(event) => onUpdateTask(task.id, { status: event.target.value as TaskStatus })}
          className={`w-full rounded-lg border px-2 py-1 text-xs outline-none transition focus:border-blue-500 ${getTaskStatusBadgeClass(
            task.status,
          )}`}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {taskStatusLabel(status as TaskStatus, tKo)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {assignedAgent && assignedLabel ? (
            <>
              <AgentAvatar agent={assignedAgent} agents={agents} size={20} />
              <span className="text-xs text-slate-300">{assignedLabel}</span>
            </>
          ) : assignedLabel ? (
            <span className="text-xs text-slate-300">{assignedLabel}</span>
          ) : (
            <span className="text-xs text-slate-500">자동 배정 대기</span>
          )}
        </div>
        <span className="text-xs text-slate-500">{timeAgo(task.created_at, localeTag)}</span>
      </div>

      <div className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-cyan-50">자동 배정</span>
          {autoRoutingMeta && (
            <span className="font-mono text-[10px] text-cyan-100/70">
              P {Math.round(autoRoutingMeta.projectConfidence * 100)} / A{" "}
              {Math.round(autoRoutingMeta.agentConfidence * 100)}
            </span>
          )}
        </div>
        <p className="mt-1 text-cyan-100/75">
          {autoRoutingMeta?.requiresPmoTriage
            ? "프로젝트 판정 신뢰도가 낮아 PMO 검토 대기 중입니다."
            : assignedLabel
              ? `규칙에 따라 ${assignedLabel}에게 자동 배정되었습니다.`
              : "실행 시점에 규칙 기반으로 담당 직원을 다시 판정합니다."}
        </p>
      </div>

      {(task.subtask_total ?? 0) > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowSubtasks((value) => !value)}
            className="mb-1.5 flex w-full items-center gap-2 text-left"
          >
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                style={{ width: `${Math.round(((task.subtask_done ?? 0) / (task.subtask_total ?? 1)) * 100)}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-slate-400">
              {task.subtask_done ?? 0}/{task.subtask_total ?? 0}
            </span>
            <span className="text-xs text-slate-500">{showSubtasks ? "접기" : "열기"}</span>
          </button>
          {showSubtasks && taskSubtasks.length > 0 && (
            <div className="space-y-1 pl-1">
              {taskSubtasks.map((subtask) => {
                const targetDepartment = subtask.target_department_id
                  ? departments.find((departmentItem) => departmentItem.id === subtask.target_department_id)
                  : null;
                return (
                  <div key={subtask.id} className="flex items-center gap-1.5 text-xs">
                    <span className="rounded bg-slate-700 px-1 py-0.5 text-[10px] text-slate-300">
                      {SUBTASK_STATUS_LABEL[subtask.status] || subtask.status}
                    </span>
                    <span
                      className={`flex-1 truncate ${subtask.status === "done" ? "text-slate-500 line-through" : "text-slate-300"}`}
                    >
                      {normalizeSubtaskTitleForUi(subtask.title)}
                    </span>
                    {targetDepartment && (
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${targetDepartment.color}30`, color: targetDepartment.color }}
                      >
                        {targetDepartment.icon} {targetDepartment.name_ko}
                      </span>
                    )}
                    {subtask.delegated_task_id && subtask.status !== "done" && (
                      <span className="shrink-0 text-blue-400" title="위임됨">
                        위임
                      </span>
                    )}
                    {subtask.status === "blocked" && subtask.blocked_reason && (
                      <span className="max-w-[80px] truncate text-[10px] text-red-400" title={subtask.blocked_reason}>
                        {subtask.blocked_reason}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {canRun && (
          <button
            type="button"
            onClick={() => onRunTask(task.id)}
            title="작업 실행"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-700 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-green-600"
          >
            실행
          </button>
        )}
        {canPause && (
          <button
            type="button"
            onClick={() => onPauseTask?.(task.id)}
            title="작업 일시정지"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-700 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-orange-600"
          >
            일시정지
          </button>
        )}
        {canStop && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`"${task.title}" 작업을 중지할까요?\n\n중지하면 격리 작업 브랜치 변경분이 롤백됩니다.`)) {
                onStopTask(task.id);
              }
            }}
            title="작업 중지"
            className="flex items-center justify-center gap-1 rounded-lg bg-red-800 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
          >
            중지
          </button>
        )}
        {canResume && (
          <button
            type="button"
            onClick={() => onResumeTask?.(task.id)}
            title="작업 재개"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-700 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600"
          >
            재개
          </button>
        )}
        {(task.status === "in_progress" ||
          task.status === "review" ||
          task.status === "done" ||
          task.status === "pending") &&
          onOpenTerminal && (
            <button
              type="button"
              onClick={() => onOpenTerminal(task.id)}
              title="터미널 출력 보기"
              className="flex items-center justify-center rounded-lg bg-slate-700 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-slate-600 hover:text-white"
            >
              로그
            </button>
          )}
        {(task.status === "planned" ||
          task.status === "collaborating" ||
          task.status === "in_progress" ||
          task.status === "review" ||
          task.status === "done" ||
          task.status === "pending") &&
          onOpenMeetingMinutes && (
            <button
              type="button"
              onClick={() => onOpenMeetingMinutes(task.id)}
              title="회의록 보기"
              className="flex items-center justify-center rounded-lg bg-cyan-800/70 px-2 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-700 hover:text-white"
            >
              회의록
            </button>
          )}
        {task.status === "review" && (
          <button
            type="button"
            onClick={() => setShowDiff(true)}
            title="변경사항 보기"
            className="flex items-center justify-center gap-1 rounded-lg bg-purple-800 px-2 py-1.5 text-xs font-medium text-purple-200 transition hover:bg-purple-700"
          >
            Diff
          </button>
        )}
        {canHideTask && !isHiddenTask && onHideTask && (
          <button
            type="button"
            onClick={() => onHideTask(task.id)}
            title="업무 숨기기"
            className="flex items-center justify-center gap-1 rounded-lg bg-slate-700 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-slate-600 hover:text-white"
          >
            숨김
          </button>
        )}
        {canHideTask && !!isHiddenTask && onUnhideTask && (
          <button
            type="button"
            onClick={() => onUnhideTask(task.id)}
            title="숨김 업무 복원"
            className="flex items-center justify-center gap-1 rounded-lg bg-blue-800 px-2 py-1.5 text-xs text-blue-200 transition hover:bg-blue-700 hover:text-white"
          >
            복원
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`"${task.title}" 업무를 삭제할까요?`)) onDeleteTask(task.id);
            }}
            title="업무 삭제"
            className="flex items-center justify-center rounded-lg bg-red-900/60 px-2 py-1.5 text-xs text-red-400 transition hover:bg-red-800 hover:text-red-300"
          >
            삭제
          </button>
        )}
      </div>

      {showDiff && <DiffModal taskId={task.id} onClose={() => setShowDiff(false)} />}
    </div>
  );
}
