"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Task, TaskStatus } from "@workspace/shared";
import { KANBAN_COLUMNS } from "@workspace/shared";
import type { Agent, Department } from "@workspace/shared";

interface KanbanBoardProps {
  tasks: Task[];
  agents: Agent[];
  departments: Department[];
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onCreateTask: (data: { title: string; departmentId?: string }) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
}

const TASK_STATUS_COLORS: Record<string, string> = {
  inbox: "#64748b", planned: "#3b82f6", collaborating: "#6366f1",
  in_progress: "#f59e0b", review: "#8b5cf6", done: "#10b981",
  pending: "#f97316", cancelled: "#ef4444",
};

function TaskCard({
  task, agents, onDragStart, onDelete,
}: {
  task: Task; agents: Agent[];
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDelete?: (id: string) => void;
}) {
  const assignee = agents.find((a) => a.id === task.assignedAgentId);
  const color = TASK_STATUS_COLORS[task.status] ?? "#64748b";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="group relative cursor-grab rounded-lg border border-white/10 bg-gray-800/80 p-3 shadow-sm transition hover:border-white/20 hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-white line-clamp-2">{task.title}</p>
        {onDelete && (
          <button
            onClick={() => onDelete(task.id)}
            className="hidden shrink-0 rounded p-0.5 text-gray-500 hover:text-red-400 group-hover:flex"
          >
            ✕
          </button>
        )}
      </div>
      {assignee && (
        <p className="text-xs text-gray-400">👤 {assignee.name}</p>
      )}
      <div
        className="mt-2 h-0.5 w-full rounded-full opacity-60"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function CreateTaskInline({ onSave, onCancel }: { onSave: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <div className="mt-2 space-y-1.5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) onSave(title.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder="태스크 제목..."
        className="w-full rounded-lg border border-indigo-500/50 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
      />
      <div className="flex gap-1.5">
        <button
          onClick={() => title.trim() && onSave(title.trim())}
          className="flex-1 rounded-lg bg-indigo-600 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          disabled={!title.trim()}
        >추가</button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-gray-400 hover:text-white">취소</button>
      </div>
    </div>
  );
}

export default function KanbanBoard({ tasks, agents, departments, onUpdateStatus, onCreateTask, onDeleteTask }: KanbanBoardProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [creatingInCol, setCreatingInCol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (t.hidden) return false;
    if (filterDept && t.departmentId !== filterDept) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, filterDept, search]);

  const tasksByStatus = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const col of KANBAN_COLUMNS) m[col.status] = [];
    for (const t of filteredTasks) {
      if (m[t.status]) m[t.status].push(t);
    }
    return m;
  }, [filteredTasks]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(async (status: string) => {
    if (!dragTaskId || dragTaskId === status) return;
    setDragOverCol(null);
    setDragTaskId(null);
    await onUpdateStatus(dragTaskId, status as TaskStatus);
  }, [dragTaskId, onUpdateStatus]);

  return (
    <div className="flex h-full flex-col gap-3 bg-gray-950 p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-white">📋 Task Board</h1>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {filteredTasks.length}개
        </span>
        <div className="ml-auto flex gap-2">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..." className="rounded-lg border border-white/10 bg-gray-800 px-3 py-1 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 w-32"
          />
          <select
            value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
            className="rounded-lg border border-white/10 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
          >
            <option value="">전체 부서</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
          </select>
        </div>
      </div>

      {/* Columns */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.status] ?? [];
          const isOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.status)}
              className={`flex w-64 shrink-0 flex-col rounded-xl border transition-colors ${
                isOver ? "border-indigo-500/60 bg-indigo-950/30" : "border-white/10 bg-gray-900"
              }`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between rounded-t-xl px-3 py-2.5"
                style={{ backgroundColor: `${col.color}20`, borderBottom: `1px solid ${col.color}30` }}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-sm font-semibold text-white">{col.icon} {col.label}</span>
                </div>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-bold text-white/70">
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
                {colTasks.length === 0 && !isOver && (
                  <div className="flex min-h-20 items-center justify-center text-xs text-gray-600">없음</div>
                )}
                {colTasks.map((t) => (
                  <TaskCard
                    key={t.id} task={t} agents={agents}
                    onDragStart={handleDragStart}
                    onDelete={onDeleteTask}
                  />
                ))}

                {/* Create inline */}
                {creatingInCol === col.status ? (
                  <CreateTaskInline
                    onSave={async (title) => {
                      await onCreateTask({ title });
                      setCreatingInCol(null);
                    }}
                    onCancel={() => setCreatingInCol(null)}
                  />
                ) : (
                  <button
                    onClick={() => setCreatingInCol(col.status)}
                    className="mt-1 rounded-lg border border-dashed border-white/10 py-1.5 text-xs text-gray-600 hover:border-white/20 hover:text-gray-400 transition"
                  >
                    + 추가
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
