import { useEffect, useMemo, useState } from "react";
import {
  approveProjectReviewTask,
  cleanupProjectStaleAssignments,
  getProjectHealth,
  recoverProjectOrphanTask,
  type ProjectHealthResponse,
  type ProjectHealthTaskItem,
} from "../../api";
import type { Project } from "../../types";
import { fmtTime } from "./utils";

interface ProjectHealthPanelProps {
  selectedProject: Project | null;
  onOpenTaskDetail: (taskId: string) => Promise<void>;
  onRecovered?: () => void | Promise<void>;
}

type EvidenceDraft = { commit: string; note: string };

const healthLabels: Record<ProjectHealthResponse["health"], { label: string; className: string }> = {
  empty: { label: "태스크 없음", className: "border-slate-600 bg-slate-900/70 text-slate-200" },
  good: { label: "정상", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" },
  warning: { label: "주의", className: "border-amber-400/40 bg-amber-500/10 text-amber-100" },
  critical: { label: "조치 필요", className: "border-rose-400/40 bg-rose-500/10 text-rose-100" },
};

const reasonLabels: Record<string, string> = {
  orphan_candidate: "Orphan 후보",
  orphan_recovered: "복구 완료",
  superseded_by_evidence: "대체 증거로 종료",
  qa_hold_evidence: "QA Hold 증거 부족",
  review_waiting: "리뷰 승인 대기",
  project_path_not_allowed: "실행 경로 차단",
  provider_account_unavailable: "실행 계정 확인 필요",
  paused_or_pending: "보류/대기",
  blocked: "차단",
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    inbox: "인입",
    planned: "계획됨",
    collaborating: "협업 중",
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, EvidenceDraft>>({});

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
    setEvidenceDrafts({});
    if (!selectedProject?.id) {
      setHealth(null);
      return;
    }
    void loadHealth(selectedProject.id);
  }, [selectedProject?.id]);

  const statusEntries = useMemo(() => Object.entries(health?.status_counts ?? {}), [health?.status_counts]);
  const orphanTasks = health?.orphan_candidates ?? [];
  const blockers = health?.blockers ?? [];
  const staleAssignments = health?.stale_assignments ?? [];
  const healthBadge = healthLabels[health?.health ?? "empty"];

  async function runAction(actionKey: string, action: () => Promise<string>) {
    if (!selectedProject?.id) return;
    setBusyAction(actionKey);
    setActionMessage(null);
    try {
      const message = await action();
      setActionMessage(message);
      await loadHealth(selectedProject.id);
      await onRecovered?.();
    } catch (err) {
      console.error("Project health action failed:", err);
      setActionMessage(`조치 실패: ${actionKey}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRequeue(task: ProjectHealthTaskItem) {
    if (!selectedProject?.id) return;
    await runAction(`requeue:${task.id}`, async () => {
      const result = await recoverProjectOrphanTask(selectedProject.id, task.id, { mode: "requeue" });
      return `대기열 복구 완료: ${shortId(task.id)} (${statusLabel(result.previous_status)} -> ${statusLabel(
        result.status,
      )})`;
    });
  }

  async function handleSupersede(task: ProjectHealthTaskItem) {
    if (!selectedProject?.id) return;
    await runAction(`supersede:${task.id}`, async () => {
      const result = await recoverProjectOrphanTask(selectedProject.id, task.id, {
        mode: "supersede",
        evidence: buildEvidence(task.id, "Superseded by later verified project evidence."),
      });
      clearEvidenceDraft(task.id);
      return `대체 증거로 종료: ${shortId(task.id)} (${statusLabel(result.previous_status)} -> ${statusLabel(
        result.status,
      )})`;
    });
  }

  async function handleApproveReview(task: ProjectHealthTaskItem) {
    if (!selectedProject?.id) return;
    await runAction(`approve:${task.id}`, async () => {
      const result = await approveProjectReviewTask(selectedProject.id, task.id, {
        evidence: buildEvidence(task.id, "Approved from Project Health after evidence review."),
      });
      clearEvidenceDraft(task.id);
      return `리뷰 승인 완료: ${shortId(task.id)} (${statusLabel(result.previous_status)} -> ${statusLabel(
        result.status,
      )})`;
    });
  }

  async function handleCleanupStaleAssignments() {
    if (!selectedProject?.id) return;
    await runAction("cleanup-stale", async () => {
      const result = await cleanupProjectStaleAssignments(selectedProject.id);
      return `stale 담당 정리 완료: ${result.cleared_count}명`;
    });
  }

  function updateEvidenceDraft(taskId: string, patch: Partial<EvidenceDraft>) {
    setEvidenceDrafts((current) => {
      const existing = current[taskId] ?? { commit: "", note: "" };
      return { ...current, [taskId]: { ...existing, ...patch } };
    });
  }

  function clearEvidenceDraft(taskId: string) {
    setEvidenceDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function buildEvidence(taskId: string, defaultNote: string): { commit?: string; note?: string } {
    const draft = evidenceDrafts[taskId];
    const commit = draft?.commit.trim() ?? "";
    const note = draft?.note.trim() || defaultNote;
    return {
      ...(commit ? { commit } : {}),
      note,
    };
  }

  if (!selectedProject) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <p className="text-xs text-slate-500">프로젝트를 선택하면 health panel을 표시합니다.</p>
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
        {health?.path_gate && !health.path_gate.project_path_allowed ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            프로젝트 경로가 현재 허용 루트에 포함되지 않습니다.
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="전체" value={health?.summary.total_tasks ?? 0} />
          <Metric label="열린 태스크" value={health?.summary.open_tasks ?? 0} tone="amber" />
          <Metric label="Orphan 후보" value={health?.summary.orphan_candidates ?? 0} tone="rose" />
          <Metric label="리뷰 대기" value={health?.summary.review_waiting ?? 0} tone="amber" />
          <Metric label="QA Hold" value={health?.summary.qa_hold_items ?? 0} tone="rose" />
          <Metric label="계정 문제" value={health?.summary.provider_account_unavailable ?? 0} tone="rose" />
          <Metric label="stale 담당" value={health?.summary.stale_assignments ?? 0} tone="rose" />
          <Metric label="실행 중" value={health?.summary.active_running ?? 0} />
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

      {staleAssignments.length > 0 ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-rose-50">stale 담당 상태</h4>
              <p className="mt-1 text-xs text-rose-100/80">
                완료/취소된 태스크를 아직 들고 있는 직원 {staleAssignments.length}명이 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCleanupStaleAssignments()}
              disabled={busyAction !== null}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              stale 담당 정리
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Orphan 복구 액션</h4>
            <span className="text-xs text-slate-400">{orphanTasks.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {orphanTasks.length === 0 ? (
              <p className="text-xs text-slate-500">복구가 필요한 orphan 태스크가 없습니다.</p>
            ) : (
              orphanTasks.map((task) => (
                <HealthTaskCard
                  key={task.id}
                  task={task}
                  busyAction={busyAction}
                  onOpenTaskDetail={onOpenTaskDetail}
                  onRequeue={handleRequeue}
                  onSupersede={handleSupersede}
                  evidenceDraft={evidenceDrafts[task.id] ?? { commit: "", note: "" }}
                  onEvidenceDraftChange={updateEvidenceDraft}
                />
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
                <HealthTaskCard
                  key={`${task.id}-${task.evidence_reason}`}
                  task={task}
                  busyAction={busyAction}
                  onOpenTaskDetail={onOpenTaskDetail}
                  onRequeue={task.evidence_reason === "orphan_candidate" ? handleRequeue : undefined}
                  onSupersede={
                    task.evidence_reason === "orphan_candidate" || task.evidence_reason === "project_path_not_allowed"
                      ? handleSupersede
                      : undefined
                  }
                  onApproveReview={task.evidence_reason === "review_waiting" ? handleApproveReview : undefined}
                  evidenceDraft={evidenceDrafts[task.id] ?? { commit: "", note: "" }}
                  onEvidenceDraftChange={updateEvidenceDraft}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthTaskCard({
  task,
  busyAction,
  onOpenTaskDetail,
  onRequeue,
  onSupersede,
  onApproveReview,
  evidenceDraft,
  onEvidenceDraftChange,
}: {
  task: ProjectHealthTaskItem;
  busyAction: string | null;
  onOpenTaskDetail: (taskId: string) => Promise<void>;
  onRequeue?: (task: ProjectHealthTaskItem) => Promise<void>;
  onSupersede?: (task: ProjectHealthTaskItem) => Promise<void>;
  onApproveReview?: (task: ProjectHealthTaskItem) => Promise<void>;
  evidenceDraft: EvidenceDraft;
  onEvidenceDraftChange: (taskId: string, patch: Partial<EvidenceDraft>) => void;
}) {
  const needsEvidence = Boolean(onSupersede || onApproveReview);

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => void onOpenTaskDetail(task.id)}
          className="min-w-0 flex-1 text-left text-xs font-semibold text-slate-100 hover:text-blue-200"
        >
          <span className="block truncate" title={task.title}>
            {task.title}
          </span>
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            {statusLabel(task.status)} - {task.department_name_ko || task.department_id || "미지정"} -{" "}
            {task.assigned_agent_name_ko || task.assigned_agent_name || "담당자 없음"}
          </span>
        </button>
        <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-amber-200">
          {reasonLabels[task.evidence_reason] ?? task.evidence_reason}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{fmtTime(task.updated_at)}</p>
      {task.latest_log || task.result_excerpt ? (
        <p className="mt-2 line-clamp-2 text-[11px] text-slate-300">{task.latest_log || task.result_excerpt}</p>
      ) : null}
      {needsEvidence ? (
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <label className="text-[11px] font-semibold text-slate-300">
            증거 commit
            <input
              value={evidenceDraft.commit}
              onChange={(event) => onEvidenceDraftChange(task.id, { commit: event.target.value })}
              placeholder="예: 557b3ec"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-300">
            증거 메모
            <input
              value={evidenceDraft.note}
              onChange={(event) => onEvidenceDraftChange(task.id, { note: event.target.value })}
              placeholder="승인/대체 종료 근거"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
            />
          </label>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onRequeue ? (
          <button
            type="button"
            onClick={() => void onRequeue(task)}
            disabled={busyAction !== null}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === `requeue:${task.id}` ? "복구 중" : "대기열 복구"}
          </button>
        ) : null}
        {onSupersede ? (
          <button
            type="button"
            onClick={() => void onSupersede(task)}
            disabled={busyAction !== null}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === `supersede:${task.id}` ? "종료 중" : "대체 증거로 종료"}
          </button>
        ) : null}
        {onApproveReview ? (
          <button
            type="button"
            onClick={() => void onApproveReview(task)}
            disabled={busyAction !== null}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === `approve:${task.id}` ? "승인 중" : "리뷰 승인"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "rose" }) {
  const toneClass = tone === "rose" ? "text-rose-100" : tone === "amber" ? "text-amber-100" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
