import { useEffect, useMemo, useState } from "react";
import { getProjectHealth, recoverProjectOrphanTask, type ProjectHealthResponse } from "../../api";
import type { Project } from "../../types";
import { fmtTime } from "./utils";

interface ProjectHealthPanelProps {
  selectedProject: Project | null;
  onOpenTaskDetail: (taskId: string) => Promise<void>;
  onRecovered?: () => void | Promise<void>;
}

const healthLabels: Record<ProjectHealthResponse["health"], { label: string; className: string }> = {
  empty: { label: "태스크 없음", className: "border-slate-600 bg-slate-900/70 text-slate-200" },
  good: { label: "정상", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" },
  warning: { label: "주의", className: "border-amber-400/40 bg-amber-500/10 text-amber-100" },
  critical: { label: "조치 필요", className: "border-rose-400/40 bg-rose-500/10 text-rose-100" },
};

const reasonLabels: Record<string, string> = {
  orphan_candidate: "고아 태스크",
  orphan_recovered: "복구 완료",
  qa_hold_evidence: "QA Hold 증거 부족",
  review_waiting: "리뷰 대기",
  paused_or_pending: "보류/대기",
  blocked: "차단",
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    inbox: "인입",
    planned: "계획됨",
    collaborating: "협업",
    in_progress: "진행 중",
    pending: "보류",
    review: "리뷰",
    done: "완료",
    cancelled: "취소",
  };
  return labels[status] ?? status;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export default function ProjectHealthPanel({
  selectedProject,
  onOpenTaskDetail,
  onRecovered,
}: ProjectHealthPanelProps) {
  const [health, setHealth] = useState<ProjectHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverBusyId, setRecoverBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function loadHealth(projectId: string) {
    setLoading(true);
    setError(null);
    try {
      setHealth(await getProjectHealth(projectId));
    } catch (err) {
      console.error("Failed to load project health:", err);
      setError("프로젝트 상태를 불러오지 못했습니다.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setActionMessage(null);
    if (!selectedProject?.id) {
      setHealth(null);
      return;
    }
    void loadHealth(selectedProject.id);
  }, [selectedProject?.id]);

  const statusEntries = useMemo(() => Object.entries(health?.status_counts ?? {}), [health?.status_counts]);
  const orphanTasks = health?.orphan_candidates ?? [];
  const blockers = health?.blockers ?? [];
  const healthBadge = healthLabels[health?.health ?? "empty"];

  async function handleRecover(taskId: string) {
    if (!selectedProject?.id) return;
    setRecoverBusyId(taskId);
    setActionMessage(null);
    try {
      const result = await recoverProjectOrphanTask(selectedProject.id, taskId);
      setActionMessage(`복구 완료: ${shortId(taskId)} (${statusLabel(result.previous_status)} -> ${statusLabel(result.status)})`);
      await loadHealth(selectedProject.id);
      await onRecovered?.();
    } catch (err) {
      console.error("Failed to recover orphan task:", err);
      setActionMessage(`복구 실패: ${shortId(taskId)}`);
    } finally {
      setRecoverBusyId(null);
    }
  }

  if (!selectedProject) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <p className="text-xs text-slate-500">프로젝트를 선택하면 health panel이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="project-health-panel">
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-white">프로젝트 Health Panel</h4>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthBadge.className}`}>
                {loading ? "갱신 중" : healthBadge.label}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400" title={selectedProject.project_path}>
              {selectedProject.project_path}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadHealth(selectedProject.id)}
            disabled={loading}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            새로고침
          </button>
        </div>

        {error ? <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="전체" value={health?.summary.total_tasks ?? 0} />
          <Metric label="열린 태스크" value={health?.summary.open_tasks ?? 0} tone="amber" />
          <Metric label="고아 후보" value={health?.summary.orphan_candidates ?? 0} tone="rose" />
          <Metric label="QA Hold" value={health?.summary.qa_hold_items ?? 0} tone="rose" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {statusEntries.length === 0 ? (
            <span className="text-xs text-slate-500">상태 집계 없음</span>
          ) : (
            statusEntries.map(([status, count]) => (
              <span key={status} className="rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300">
                {statusLabel(status)} {count}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">고아 복구 액션</h4>
            <span className="text-xs text-slate-400">{orphanTasks.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {orphanTasks.length === 0 ? (
              <p className="text-xs text-slate-500">복구가 필요한 고아 태스크가 없습니다.</p>
            ) : (
              orphanTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void onOpenTaskDetail(task.id)}
                      className="min-w-0 text-left text-xs font-semibold text-slate-100 hover:text-blue-200"
                    >
                      <span className="block truncate" title={task.title}>
                        {task.title}
                      </span>
                      <span className="mt-1 block text-[11px] font-normal text-slate-400">
                        {statusLabel(task.status)} · {task.department_name_ko || task.department_id || "미지정"} ·{" "}
                        {task.assigned_agent_name_ko || task.assigned_agent_name || "담당자 없음"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRecover(task.id)}
                      disabled={recoverBusyId !== null}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {recoverBusyId === task.id ? "복구 중" : "대기열 복구"}
                    </button>
                  </div>
                  {task.latest_log || task.result_excerpt ? (
                    <p className="mt-2 line-clamp-2 text-[11px] text-slate-400">
                      {task.latest_log || task.result_excerpt}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {actionMessage ? <p className="mt-3 text-[11px] text-cyan-100">{actionMessage}</p> : null}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Hold / Blocker 증거</h4>
            <span className="text-xs text-slate-400">{blockers.length}</span>
          </div>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {blockers.length === 0 ? (
              <p className="text-xs text-slate-500">현재 표시할 blocker가 없습니다.</p>
            ) : (
              blockers.map((task) => (
                <button
                  key={`${task.id}-${task.evidence_reason}`}
                  type="button"
                  onClick={() => void onOpenTaskDetail(task.id)}
                  className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left hover:border-amber-400/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-100">{task.title}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-amber-200">
                      {reasonLabels[task.evidence_reason] ?? task.evidence_reason}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {statusLabel(task.status)} · {fmtTime(task.updated_at)}
                  </p>
                  {task.latest_log || task.result_excerpt ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-300">
                      {task.latest_log || task.result_excerpt}
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "rose" }) {
  const toneClass =
    tone === "rose" ? "text-rose-100" : tone === "amber" ? "text-amber-100" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
