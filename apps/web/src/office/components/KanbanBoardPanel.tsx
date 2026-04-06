"use client";

import { useMemo, useState } from "react";

import type {
  CreateOfficeKanbanTaskRequest,
  DepartmentView,
  OfficeTaskStatus,
  TaskSummaryView,
  UpdateOfficeKanbanTaskRequest
} from "@workspace/shared";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type KanbanBoardPanelProps = {
  departments: DepartmentView[];
  tasks: TaskSummaryView[];
  isMutating?: boolean;
  errorMessage?: string | null;
  onCreateTask: (payload: CreateOfficeKanbanTaskRequest) => Promise<TaskSummaryView | null>;
  onUpdateTask: (taskId: string, payload: UpdateOfficeKanbanTaskRequest) => Promise<TaskSummaryView | null>;
  t?: OfficeTranslator;
};

const columnOrder: OfficeTaskStatus[] = [
  "inbox",
  "planned",
  "in_progress",
  "review",
  "done",
  "cancelled"
];

const columnKeyMap: Record<OfficeTaskStatus, Parameters<OfficeTranslator>[0]> = {
  inbox: "widget.kanban.column.inbox",
  planned: "widget.kanban.column.planned",
  in_progress: "widget.kanban.column.inProgress",
  review: "widget.kanban.column.review",
  done: "widget.kanban.column.done",
  cancelled: "widget.kanban.column.cancelled"
};

const priorityLabel = (value: number): string => `P${value}`;

export function KanbanBoardPanel({
  departments,
  tasks,
  isMutating = false,
  errorMessage = null,
  onCreateTask,
  onUpdateTask,
  t = createOfficeTranslator("en")
}: KanbanBoardPanelProps): JSX.Element {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDepartmentId, setNewDepartmentId] = useState<string>("");
  const [newPriority, setNewPriority] = useState<number>(3);

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments]
  );

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return tasks.filter((task) => {
      if (departmentFilter && task.departmentId !== departmentFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        task.title.toLowerCase().includes(normalizedSearch) ||
        (task.description ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [departmentFilter, searchText, tasks]);

  const tasksByStatus = useMemo(() => {
    const grouped = {
      inbox: [] as TaskSummaryView[],
      planned: [] as TaskSummaryView[],
      in_progress: [] as TaskSummaryView[],
      review: [] as TaskSummaryView[],
      done: [] as TaskSummaryView[],
      cancelled: [] as TaskSummaryView[]
    };
    for (const task of filteredTasks) {
      grouped[task.status].push(task);
    }
    return grouped;
  }, [filteredTasks]);

  const createTask = async (): Promise<void> => {
    const title = newTitle.trim();
    if (!title) {
      return;
    }
    const created = await onCreateTask({
      title,
      departmentId: newDepartmentId || null,
      priority: newPriority,
      status: "inbox"
    });
    if (created) {
      setNewTitle("");
    }
  };

  const dropTask = async (status: OfficeTaskStatus): Promise<void> => {
    if (!dragTaskId) {
      return;
    }
    const task = tasks.find((candidate) => candidate.id === dragTaskId);
    if (!task || task.status === status) {
      setDragTaskId(null);
      return;
    }
    setDragTaskId(null);
    await onUpdateTask(task.id, { status });
  };

  return (
    <section className="card office-widget office-kanban-panel" data-testid="kanban-board-panel">
      <header>
        <div>
          <h2>{t("widget.kanban.title")}</h2>
          <p className="hint">{t("widget.kanban.subtitle")}</p>
        </div>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.kanban.search")}</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("widget.kanban.searchPlaceholder")}
          />
        </label>
        <label>
          <span>{t("widget.kanban.filterDepartment")}</span>
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="">{t("widget.kanban.filterAll")}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.kanban.newTitle")}</span>
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={t("widget.kanban.newTitlePlaceholder")}
          />
        </label>
        <label>
          <span>{t("widget.kanban.newDepartment")}</span>
          <select
            value={newDepartmentId}
            onChange={(event) => setNewDepartmentId(event.target.value)}
          >
            <option value="">{t("widget.kanban.filterAll")}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="office-kanban-create-row">
        <label>
          <span>{t("widget.kanban.newPriority")}</span>
          <select
            value={String(newPriority)}
            onChange={(event) => setNewPriority(Number(event.target.value))}
          >
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
            <option value="4">P4</option>
            <option value="5">P5</option>
          </select>
        </label>
        <button type="button" onClick={() => void createTask()} disabled={isMutating}>
          {t("widget.kanban.create")}
        </button>
      </div>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="office-kanban-columns" data-testid="kanban-columns">
        {columnOrder.map((status) => {
          const columnTasks = tasksByStatus[status];
          return (
            <section
              key={status}
              className="office-kanban-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void dropTask(status)}
              data-status={status}
            >
              <header>
                <strong>{t(columnKeyMap[status])}</strong>
                <span>{columnTasks.length}</span>
              </header>
              <div className="office-kanban-task-list">
                {columnTasks.length === 0 ? (
                  <p className="hint">{t("widget.kanban.empty")}</p>
                ) : (
                  columnTasks.map((task) => (
                    <article
                      key={task.id}
                      className="office-kanban-task-card"
                      draggable
                      onDragStart={() => setDragTaskId(task.id)}
                    >
                      <strong>{task.title}</strong>
                      <p>
                        <span>{priorityLabel(task.priority)}</span>
                        <span>
                          {task.departmentId
                            ? (departmentById.get(task.departmentId)?.name ?? task.departmentId)
                            : t("widget.kanban.filterAll")}
                        </span>
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

