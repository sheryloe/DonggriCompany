import { useCallback, useMemo, useState } from "react";
import { bulkHideTasks } from "../api";
import { useI18n } from "../i18n";
import type {
  Agent,
  CeoOfficeCall,
  CrossDeptDelivery,
  Department,
  MeetingPresence,
  SubTask,
  Task,
  WorkflowPackKey,
} from "../types";
import ProjectManagerModal from "./ProjectManagerModal";
import BulkHideModal from "./taskboard/BulkHideModal";
import CreateTaskModal from "./taskboard/CreateTaskModal";
import FilterBar from "./taskboard/FilterBar";
import TaskCard from "./taskboard/TaskCard";
import { COLUMNS, isHideableStatus, taskStatusLabel, type HideableStatus } from "./taskboard/constants";

interface TaskBoardProps {
  tasks: Task[];
  agents: Agent[];
  departments: Department[];
  subtasks: SubTask[];
  meetingPresence?: MeetingPresence[];
  ceoOfficeCalls?: CeoOfficeCall[];
  crossDeptDeliveries?: CrossDeptDelivery[];
  onCreateTask: (input: {
    title: string;
    description?: string;
    department_id?: string;
    task_type?: string;
    priority?: number;
    project_id?: string;
    project_path?: string;
    project_hint?: string;
    assigned_agent_id?: string;
    workflow_pack_key?: WorkflowPackKey;
    workflow_meta_json?: Record<string, unknown> | string;
  }) => void;
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
}

export function TaskBoard({
  tasks,
  agents,
  departments,
  subtasks,
  meetingPresence = [],
  ceoOfficeCalls = [],
  crossDeptDeliveries = [],
  onCreateTask,
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
}: TaskBoardProps) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showBulkHideModal, setShowBulkHideModal] = useState(false);
  const [filterDept, setFilterDept] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);

  const hiddenTaskIds = useMemo(
    () => new Set(tasks.filter((task) => task.hidden === 1).map((task) => task.id)),
    [tasks],
  );

  const hideTask = useCallback((taskId: string) => onUpdateTask(taskId, { hidden: 1 }), [onUpdateTask]);
  const unhideTask = useCallback((taskId: string) => onUpdateTask(taskId, { hidden: 0 }), [onUpdateTask]);

  const hideByStatuses = useCallback((statuses: HideableStatus[]) => {
    if (statuses.length === 0) return;
    void bulkHideTasks(statuses, 1);
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterDept && task.department_id !== filterDept) return false;
      if (filterAgent && task.assigned_agent_id !== filterAgent) return false;
      if (filterType && task.task_type !== filterType) return false;
      if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
      const isHidden = hiddenTaskIds.has(task.id);
      if (!showAllTasks && isHidden) return false;
      return true;
    });
  }, [tasks, filterDept, filterAgent, filterType, search, hiddenTaskIds, showAllTasks]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const column of COLUMNS) {
      grouped[column.status] = filteredTasks
        .filter((task) => task.status === column.status)
        .sort((a, b) => b.priority - a.priority || b.created_at - a.created_at);
    }
    return grouped;
  }, [filteredTasks]);

  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);

  const activeFilterCount = [filterDept, filterAgent, filterType, search].filter(Boolean).length;
  const hiddenTaskCount = useMemo(
    () => tasks.filter((task) => isHideableStatus(task.status) && hiddenTaskIds.has(task.id)).length,
    [tasks, hiddenTaskIds],
  );

  return (
    <div className="taskboard-shell flex h-full flex-col gap-4 p-3 sm:p-4">
      <div className="game-panel p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">Control Plane Flow</div>
            <h1 className="mt-1 text-xl font-bold tracking-normal" style={{ color: "var(--th-text-primary)" }}>업무 관리</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
              접수, 라우팅, 마스터 실행, 서브에이전트 타임라인, evidence/handoff 순서로 업무를 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAllTasks((prev) => !prev)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                showAllTasks
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100"
                  : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              {showAllTasks ? "전체 보기" : "진행 업무"} · 숨김 {hiddenTaskCount}
            </button>
            <button
              type="button"
              onClick={() => setShowBulkHideModal(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              완료 업무 숨김
            </button>
            <button
              type="button"
              onClick={() => setShowProjectManager(true)}
              className="taskboard-project-manage-btn rounded-lg border px-3 py-2 text-sm font-semibold transition"
            >
              프로젝트 연결
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-500 active:scale-95"
            >
              새 업무
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
            표시 {filteredTasks.length}건
          </span>
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
            필터 {activeFilterCount}개
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterDept("");
                setFilterAgent("");
                setFilterType("");
                setSearch("");
              }}
              className="rounded-full border px-2.5 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      <FilterBar
        agents={agents}
        departments={departments}
        filterDept={filterDept}
        filterAgent={filterAgent}
        filterType={filterType}
        search={search}
        onFilterDept={setFilterDept}
        onFilterAgent={setFilterAgent}
        onFilterType={setFilterType}
        onSearch={setSearch}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 sm:flex-row sm:overflow-x-auto sm:overflow-y-hidden">
        {COLUMNS.map((column) => {
          const columnTasks = tasksByStatus[column.status] ?? [];
          return (
            <div
              key={column.status}
              className={`taskboard-column flex w-full flex-col rounded-xl border sm:w-72 sm:flex-shrink-0 ${column.borderColor} bg-slate-900`}
            >
              <div className={`flex items-center justify-between rounded-t-xl ${column.headerBg} px-3.5 py-2.5`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${column.dotColor}`} />
                  <span className="text-sm font-semibold text-white">
                    <span className="mr-1 font-mono text-[10px]">{column.icon}</span>
                    {taskStatusLabel(column.status, t)}
                  </span>
                </div>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-bold text-white/80">
                  {columnTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 p-2.5 sm:flex-1 sm:overflow-y-auto">
                {columnTasks.length === 0 ? (
                  <div className="flex min-h-24 items-center justify-center py-8 text-xs text-slate-600 sm:flex-1">
                    업무 없음
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agents={agents}
                      departments={departments}
                      taskSubtasks={subtasksByTask[task.id] ?? []}
                      meetingPresence={meetingPresence}
                      ceoOfficeCalls={ceoOfficeCalls}
                      crossDeptDeliveries={crossDeptDeliveries}
                      isHiddenTask={hiddenTaskIds.has(task.id)}
                      onUpdateTask={onUpdateTask}
                      onDeleteTask={onDeleteTask}
                      onAssignTask={onAssignTask}
                      onRunTask={onRunTask}
                      onStopTask={onStopTask}
                      onPauseTask={onPauseTask}
                      onResumeTask={onResumeTask}
                      onOpenTerminal={onOpenTerminal}
                      onOpenMeetingMinutes={onOpenMeetingMinutes}
                      onMergeTask={onMergeTask}
                      onDiscardTask={onDiscardTask}
                      onHideTask={hideTask}
                      onUnhideTask={unhideTask}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateTaskModal
          agents={agents}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreate={onCreateTask}
          onAssign={onAssignTask}
        />
      )}

      {showProjectManager && (
        <ProjectManagerModal agents={agents} departments={departments} onClose={() => setShowProjectManager(false)} />
      )}

      {showBulkHideModal && (
        <BulkHideModal
          tasks={tasks}
          hiddenTaskIds={hiddenTaskIds}
          onClose={() => setShowBulkHideModal(false)}
          onApply={(statuses) => {
            hideByStatuses(statuses);
            setShowBulkHideModal(false);
          }}
        />
      )}
    </div>
  );
}

export default TaskBoard;
