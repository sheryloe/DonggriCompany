import { useEffect, useState } from "react";
import type { Master95Status } from "../../api/control-plane";
import {
  readDurableControlTowerState,
  runDurableControlTowerAction,
  runDurableControlTowerJourney,
  subscribeDurableControlTowerState,
  type ControlTowerActionId,
  type ControlTowerJourneyId,
  type ControlTowerStreamStatus,
  type DurableControlTowerSnapshot,
} from "../../api/control-tower";

interface Master95OperationsPanelProps {
  master95: Master95Status | undefined;
  projectOptions?: Array<{ project_id: string; project_key: string }>;
  initialProjectId?: string;
}

interface ControlTowerJourney {
  id: ControlTowerJourneyId;
  title: string;
  evidence: string;
  remaining: string;
  executeLabel: string;
}

export interface ControlTowerLaneOperations {
  laneId: string;
  roleAgent: string;
  sharedRoleAgent: boolean;
  totalTasks: number;
  activeTasks: number;
  blockedTasks: number;
  activeRuns: number;
  failedRuns: number;
  pendingApprovals: number;
  status: "idle" | "active" | "attention";
}

export function deriveControlTowerLaneOperations(snapshot: DurableControlTowerSnapshot): ControlTowerLaneOperations[] {
  const roleLaneCounts = snapshot.root_project.lanes.reduce<Map<string, number>>((counts, lane) => {
    counts.set(lane.role_agent, (counts.get(lane.role_agent) ?? 0) + 1);
    return counts;
  }, new Map());

  return snapshot.root_project.lanes.map((lane) => {
    const tasks = snapshot.tasks.filter((task) => task.recommended_agent === lane.role_agent);
    const taskIds = new Set(tasks.map((task) => task.task_id));
    const runs = snapshot.runs.filter((run) => taskIds.has(run.task_id));
    const blockedTasks = tasks.filter((task) =>
      ["WAITING_APPROVAL", "FAILED", "CANCELED"].includes(task.status),
    ).length;
    const activeTasks = tasks.filter((task) =>
      ["SUBMITTED", "WORKING", "WAITING_APPROVAL"].includes(task.status),
    ).length;
    const activeRuns = runs.filter((run) => ["running", "paused"].includes(run.status)).length;
    const failedRuns = runs.filter((run) => ["failed", "canceled"].includes(run.status)).length;
    const pendingApprovals = snapshot.approvals.filter(
      (approval) => taskIds.has(approval.task_id) && approval.status === "pending",
    ).length;
    const status =
      blockedTasks > 0 || failedRuns > 0 || pendingApprovals > 0
        ? "attention"
        : activeTasks > 0 || activeRuns > 0
          ? "active"
          : "idle";

    return {
      laneId: lane.lane_id,
      roleAgent: lane.role_agent,
      sharedRoleAgent: (roleLaneCounts.get(lane.role_agent) ?? 0) > 1,
      totalTasks: tasks.length,
      activeTasks,
      blockedTasks,
      activeRuns,
      failedRuns,
      pendingApprovals,
      status,
    };
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return "시간 정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function statusTone(status: string, critical: boolean): string {
  if (critical || status === "failed") return "border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-100";
  if (status === "completed" || status === "passed") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
  }
  return "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-100";
}

function ValueList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--th-text-muted)" }}>
        {label}
      </div>
      {values.length > 0 ? (
        <div className="mt-1 space-y-1 font-mono text-[11px]" style={{ color: "var(--th-text-secondary)" }}>
          {values.map((value) => (
            <div key={value} className="break-all">
              {value}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
          없음
        </div>
      )}
    </div>
  );
}

export default function Master95OperationsPanel({
  master95,
  projectOptions = [],
  initialProjectId,
}: Master95OperationsPanelProps) {
  const [actionPreview, setActionPreview] = useState<{ runId: string; action: "retry" | "escalate" } | null>(null);
  const [journeyPreview, setJourneyPreview] = useState<ControlTowerJourneyId | null>(null);
  const [durableState, setDurableState] = useState<DurableControlTowerSnapshot | null>(null);
  const [durableLoading, setDurableLoading] = useState<ControlTowerJourneyId | ControlTowerActionId | "state" | null>(
    null,
  );
  const [durableError, setDurableError] = useState<string | null>(null);
  const [durableNotice, setDurableNotice] = useState<string | null>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<ControlTowerStreamStatus>("connecting");
  const [streamLastAt, setStreamLastAt] = useState<string | null>(null);
  const [streamReason, setStreamReason] = useState<"connected" | "journey" | "action" | null>(null);
  const allRuns = master95?.run_summaries ?? [];
  const fallbackProjectId = master95?.bloggergent_ops.project_id ?? "project:BloggerGent";
  const derivedProjectOptions: Array<{ project_id: string; project_key: string }> = Array.from(
    new Map(
      [
        ...projectOptions,
        ...allRuns.flatMap((run) =>
          run.project_id
            ? [{ project_id: run.project_id as string, project_key: run.project_id.replace(/^project:/, "") }]
            : [],
        ),
        { project_id: fallbackProjectId, project_key: fallbackProjectId.replace(/^project:/, "") },
      ].map((project) => [project.project_id, project]),
    ).values(),
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(
    initialProjectId && derivedProjectOptions.some((project) => project.project_id === initialProjectId)
      ? (initialProjectId as string)
      : fallbackProjectId,
  );

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    setStreamStatus("connecting");
    setStreamLastAt(null);
    setStreamReason(null);
    void subscribeDurableControlTowerState(activeProjectId, {
      onStatus(status) {
        if (!disposed) setStreamStatus(status);
      },
      onSnapshot(event) {
        if (disposed) return;
        setDurableState(event.snapshot);
        setStreamStatus("connected");
        setStreamLastAt(event.emitted_at);
        setStreamReason(event.reason);
      },
      onError(message) {
        if (!disposed) setDurableError(message);
      },
    })
      .then((close) => {
        if (disposed) close?.();
        else unsubscribe = close;
      })
      .catch((error) => {
        if (disposed) return;
        setStreamStatus("reconnecting");
        setDurableError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [activeProjectId]);

  const runs = allRuns.filter((run) => run.project_id === activeProjectId);
  const agentVersions = master95?.agent_versions ?? [];
  const projection = master95?.live_pilot_projection;
  const criticalFailures = runs.filter((run) => run.critical || run.status === "failed").length;
  const lineageCount = runs.filter(
    (run) => run.run_id && run.trace_id && (run.artifact_refs.length > 0 || run.evidence_refs.length > 0),
  ).length;
  const latestRun = runs[0];
  const failedRun = runs.find((run) => run.critical || run.status === "failed");
  const artifactRun = runs.find((run) => run.artifact_refs.length > 0 || run.evidence_refs.length > 0);
  const projectId = activeProjectId;
  const durableProjectId = activeProjectId;
  const journeys: ControlTowerJourney[] = [
    {
      id: "project-agent",
      title: "1. 프로젝트 생성 및 Agent 배치",
      evidence: `${projectId} scope와 Agent 버전 ${agentVersions.length}개를 읽기 전용으로 확인했습니다.`,
      remaining: "실제 Project 생성·Agent 활성화·배포는 CONTROL 승인과 durable API가 필요합니다.",
      executeLabel: "Sandbox Project·Agent 레코드 생성",
    },
    {
      id: "task-progress",
      title: "2. 작업 요청과 진행 확인",
      evidence: latestRun
        ? `${latestRun.task_id ?? "Task 미기록"} · ${latestRun.run_id} · ${latestRun.status}`
        : "표시할 Task/Run이 없습니다.",
      remaining: "새 작업 생성과 상태 변경은 승인된 실행 API 연결 후 검증해야 합니다.",
      executeLabel: "작업 생성 및 진행 시작",
    },
    {
      id: "approval",
      title: "3. 승인 처리",
      evidence: `CONTROL 승인 경계와 대기 항목 ${master95?.approvals_required.length ?? 0}개를 확인했습니다.`,
      remaining: "승인·거절 mutation과 durable audit 결과는 이 read-only 리허설에서 실행하지 않습니다.",
      executeLabel: "승인 작업 생성",
    },
    {
      id: "failure-retry",
      title: "4. 실패 원인 확인과 재실행",
      evidence: failedRun
        ? `${failedRun.run_id}의 실패 원인·다음 행동·Trace를 확인할 수 있습니다.`
        : "현재 투영에 실패 Run이 없어 정상 Run으로 retry lineage 형식만 확인합니다.",
      remaining: "재시도는 새 Run/Trace ID를 발급하는 승인된 API가 연결될 때까지 dry-run 계획만 제공합니다.",
      executeLabel: "실패·재시도 lineage 생성",
    },
    {
      id: "artifact-close",
      title: "5. 결과 Artifact 확인 및 종료",
      evidence: artifactRun
        ? `${artifactRun.artifact_refs[0] ?? artifactRun.evidence_refs[0]}와 연결 Evidence를 확인했습니다.`
        : "표시할 Artifact/Evidence가 없습니다.",
      remaining: "Artifact 내용 검증과 Task 종료 mutation은 승인된 durable close API가 필요합니다.",
      executeLabel: "Artifact 검증 및 Task 종료",
    },
  ];
  const selectedJourney = journeys.find((journey) => journey.id === journeyPreview) ?? null;
  const durableJourneyIds = new Set(durableState?.journeys.map((journey) => journey.journey_id) ?? []);
  const durableJourneyCount = durableJourneyIds.size;
  const pendingApprovals = durableState?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const durableIncidents =
    durableState?.runs.filter((run) => run.status === "failed" || run.status === "canceled") ?? [];
  const blockedTasks =
    durableState?.tasks.filter((task) => ["WAITING_APPROVAL", "FAILED", "CANCELED"].includes(task.status)) ?? [];
  const laneOperations = durableState ? deriveControlTowerLaneOperations(durableState) : [];
  const laneOperationsById = new Map(laneOperations.map((summary) => [summary.laneId, summary]));

  function switchProject(projectIdToSelect: string) {
    setActiveProjectId(projectIdToSelect);
    setDurableState(null);
    setDurableError(null);
    setDurableNotice(`Project 범위를 ${projectIdToSelect}(으)로 전환했습니다. 로컬 상태를 불러오세요.`);
    setJourneyPreview(null);
    setOpenArtifactId(null);
  }

  async function refreshDurableState() {
    setDurableLoading("state");
    setDurableError(null);
    try {
      const state = await readDurableControlTowerState(durableProjectId);
      setDurableState(state);
      setDurableNotice(
        `재시작 복구 상태를 불러왔습니다. Artifact ${state.artifacts.length}개 · event ${state.event_count}개`,
      );
    } catch (error) {
      setDurableError(error instanceof Error ? error.message : String(error));
    } finally {
      setDurableLoading(null);
    }
  }

  async function executeDurableJourney(journeyId: ControlTowerJourneyId) {
    setDurableLoading(journeyId);
    setDurableError(null);
    setJourneyPreview(journeyId);
    try {
      const response = await runDurableControlTowerJourney(durableProjectId, journeyId);
      setDurableState(response.snapshot);
      setDurableNotice(
        `${journeys.find((journey) => journey.id === journeyId)?.title ?? journeyId} 완료 · 외부 효과 없음 · event ${response.snapshot.event_count}개`,
      );
    } catch (error) {
      setDurableError(error instanceof Error ? error.message : String(error));
    } finally {
      setDurableLoading(null);
    }
  }

  async function executeDurableAction(actionId: ControlTowerActionId, targetId: string, label: string, value?: string) {
    setDurableLoading(actionId);
    setDurableError(null);
    try {
      const response = await runDurableControlTowerAction(durableProjectId, actionId, targetId, value);
      setDurableState(response.snapshot);
      setDurableNotice(`${label} 완료 · 외부 효과 없음 · event ${response.snapshot.event_count}개`);
    } catch (error) {
      setDurableError(error instanceof Error ? error.message : String(error));
    } finally {
      setDurableLoading(null);
    }
  }

  const controlButtonClass =
    "rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="command-panel p-4" data-testid="master95-operations-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">
            Master95 · live pilot + durable local operations
          </div>
          <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text-primary)" }}>
            운영 관제 · Run / Trace / Artifact
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
            live-pilot은 읽기 전용으로 투영하고, 명시 버튼은 승인된 E: 로컬 journal에만 운영 증거를 기록합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-semibold ${
              streamStatus === "connected"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100"
                : streamStatus === "reconnecting"
                  ? "border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-100"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-100"
            }`}
            aria-live="polite"
            data-testid="control-tower-stream-status"
          >
            {streamStatus === "connected"
              ? `실시간 연결됨 · event ${durableState?.event_count ?? 0}${streamReason ? ` · ${streamReason}` : ""}`
              : streamStatus === "reconnecting"
                ? "실시간 재연결 중"
                : streamStatus === "unsupported"
                  ? "실시간 stream 미지원"
                  : "실시간 연결 중"}
          </span>
          <span
            className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-semibold ${
              projection?.available
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100"
                : "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-100"
            }`}
          >
            {projection?.available ? "collector connected" : "collector unavailable"}
          </span>
          <button
            type="button"
            onClick={() => void refreshDurableState()}
            disabled={durableLoading !== null}
            className="rounded-lg border px-3 py-2 text-xs font-semibold transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            data-testid="control-tower-recover-state"
          >
            {durableLoading === "state" ? "복구 상태 확인 중" : "재시작 상태 불러오기"}
          </button>
        </div>
      </div>
      {streamLastAt ? (
        <p className="mt-2 text-right text-[11px]" style={{ color: "var(--th-text-muted)" }}>
          마지막 실시간 갱신 {formatTimestamp(streamLastAt)}
        </p>
      ) : null}

      <section
        className="mt-4 rounded-lg border p-3"
        style={{ borderColor: "var(--th-border)" }}
        aria-labelledby="control-tower-project-dashboard"
        data-testid="control-tower-project-dashboard"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)] md:items-end">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-600">
              project dashboard · isolated context
            </div>
            <h3 id="control-tower-project-dashboard" className="mt-1 text-sm font-bold">
              {durableState?.root_project.display_name ?? activeProjectId.replace(/^project:/, "")} 운영 범위
            </h3>
            <p className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
              Owner OPS · 구현 위임 IMPLEMENT · Project 전환 시 이전 durable 화면 상태를 즉시 폐기합니다.
            </p>
          </div>
          <label className="text-xs font-semibold" htmlFor="control-tower-project-switcher">
            Project 전환
            <select
              id="control-tower-project-switcher"
              value={activeProjectId}
              onChange={(event) => switchProject(event.target.value)}
              disabled={durableLoading !== null}
              className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
            >
              {derivedProjectOptions.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_key}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border p-2" style={{ borderColor: "var(--th-border)" }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
              Project ID
            </div>
            <div className="mt-1 break-all font-mono text-xs">{activeProjectId}</div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: "var(--th-border)" }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
              Role Agents
            </div>
            <div className="mt-1 text-xs">
              {durableState?.root_project.role_agents.length ??
                (activeProjectId === "project:BloggerGent" ? master95?.bloggergent_ops.role_agents.length : 0)}
              개
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: "var(--th-border)" }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
              Lanes
            </div>
            <div className="mt-1 text-xs">
              {durableState?.root_project.lanes.length ??
                (activeProjectId === "project:BloggerGent" ? master95?.bloggergent_ops.lanes.length : 0)}
              개
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: "var(--th-border)" }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
              Local Events
            </div>
            <div className="mt-1 text-xs">{durableState?.event_count ?? "불러오기 전"}</div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ["최근 Run", String(runs.length)],
          ["현재 Owner", runs[0]?.owner_department ?? "-"],
          ["위험/실패", String(criticalFailures)],
          ["Lineage 완성", `${lineageCount}/${runs.length}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)" }}>
            <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
              {label}
            </div>
            <div
              className="mt-1 text-lg font-bold"
              style={{ color: "var(--th-text-primary)" }}
              data-testid={label === "현재 Owner" ? "current-owner" : undefined}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {durableError ? (
        <div
          className="mt-4 rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-800 dark:text-rose-100"
          role="alert"
          data-testid="control-tower-durable-error"
        >
          <div className="font-semibold">로컬 운영 증거를 처리하지 못했습니다.</div>
          <div className="mt-1">원인: {durableError}</div>
          <div className="mt-1">다음 행동: Project 범위와 승인된 로컬 runtime 상태를 확인한 뒤 다시 실행하세요.</div>
        </div>
      ) : null}

      {durableNotice ? (
        <div
          className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-800 dark:text-emerald-100"
          role="status"
          data-testid="control-tower-durable-notice"
        >
          {durableNotice}
        </div>
      ) : null}

      {durableLoading ? (
        <div className="mt-4 space-y-2" aria-label="내구 운영 상태 처리 중" role="status">
          <div className="h-3 w-48 animate-pulse rounded bg-slate-300/50" />
          <div className="h-16 animate-pulse rounded-lg bg-slate-300/30" />
        </div>
      ) : null}

      {durableState ? (
        <section
          className="mt-4 border-t pt-4"
          style={{ borderColor: "var(--th-border)" }}
          aria-labelledby="durable-control-tower-heading"
          data-testid="durable-control-tower-state"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-200">
                append-only restart recovery
              </div>
              <h3 id="durable-control-tower-heading" className="mt-1 text-sm font-bold">
                로컬 운영 증거 · {durableState.root_project_id}
              </h3>
            </div>
            <span className="w-fit rounded-md border border-emerald-400/40 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-100">
              {durableState.journeys.length}/5 실행 · event {durableState.event_count}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["현재 Owner", durableState.runs.at(-1)?.owner_department ?? "-"],
              ["Task / Run", `${durableState.tasks.length} / ${durableState.runs.length}`],
              ["승인 / Handoff", `${durableState.approvals.length} / ${durableState.handoffs.length}`],
              [
                "Token / Cost",
                `${durableState.runs.reduce((sum, run) => sum + run.token_count, 0)} / $${durableState.runs.reduce((sum, run) => sum + run.cost_usd, 0).toFixed(4)}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="border-t pt-2" style={{ borderColor: "var(--th-border)" }}>
                <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
                  {label}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {durableState.journeys.length === 0 ? (
            <div className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--th-border)" }}>
              <div className="font-semibold">아직 내구 여정 증거가 없습니다.</div>
              <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                아래 여정별 실행 버튼을 선택하면 외부 효과 없이 append-only 기록을 만듭니다.
              </div>
            </div>
          ) : null}

          <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }} open>
            <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
              Agent 조직·운영 레인 {durableState.root_project.role_agents.length}명 /{" "}
              {durableState.root_project.lanes.length}개
            </summary>
            {durableState.root_project.lanes.length > 0 ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {durableState.root_project.lanes.map((lane) => {
                  const summary = laneOperationsById.get(lane.lane_id);
                  return (
                    <div
                      key={lane.lane_id}
                      className="rounded-lg border p-2 text-xs"
                      style={{ borderColor: "var(--th-border)" }}
                      data-testid={`lane-operations-${lane.lane_id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">{lane.role_agent}</div>
                        <span
                          className={
                            statusTone(summary?.status ?? "idle", summary?.status === "attention") +
                            " rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                          }
                        >
                          {summary?.status === "attention"
                            ? "확인 필요"
                            : summary?.status === "active"
                              ? "진행 중"
                              : "대기"}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px]">{lane.lane_id}</div>
                      <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                        {lane.group_id} · {lane.operating_mode}
                      </div>
                      {summary ? (
                        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--th-border)" }}>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                            <span>
                              Task {summary.activeTasks}/{summary.totalTasks}
                            </span>
                            <span>차단 {summary.blockedTasks}</span>
                            <span>Run {summary.activeRuns}</span>
                            <span>실패 {summary.failedRuns}</span>
                            <span className="col-span-2">승인 대기 {summary.pendingApprovals}</span>
                          </div>
                          {summary.sharedRoleAgent ? (
                            <div className="mt-2 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                              동일 role agent의 공유 집계 · lane별 분리 수치 아님
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--th-border)" }}>
                등록된 project-specific lane이 없습니다. 기본 Owner OPS가 운영합니다.
              </div>
            )}
          </details>

          <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }} open>
            <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
              Skill·Memory·Agent 버전 상태 {durableState.runs.length}개 Run
            </summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {durableState.runs.map((run) => {
                const task = durableState.tasks.find((item) => item.task_id === run.task_id);
                return (
                  <div
                    key={`runtime-status:${run.run_id}`}
                    className="rounded-lg border p-2 text-xs"
                    style={{ borderColor: "var(--th-border)" }}
                  >
                    <div className="break-all font-mono">{run.run_id}</div>
                    <div className="mt-1">Agent {run.agent_version ?? "버전 미기록"}</div>
                    <div className="mt-1">Skill {run.skill_version ?? "버전 미기록"}</div>
                    <div className="mt-1">
                      Memory {run.memory_version ?? "버전 미기록"} · 저장 {task?.memory_status ?? "확인 불가"}
                    </div>
                    <div className="mt-1">
                      token {run.token_count} · cost ${run.cost_usd.toFixed(4)}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          {durableState.deployments.length > 0 ? (
            <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
              <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
                Project 생성·Agent 배치 {durableState.deployments.length}건
              </summary>
              <div className="mt-2 space-y-2 text-xs">
                {durableState.deployments.map((deployment) => (
                  <div
                    key={deployment.deployment_id}
                    className="rounded-lg border p-2"
                    style={{ borderColor: "var(--th-border)" }}
                  >
                    <div className="font-mono">
                      {deployment.agent_id}@{deployment.version}
                    </div>
                    <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                      {deployment.project_id} · {deployment.lifecycle} · process_started=false
                    </div>
                    {deployment.rollback_from_version ? (
                      <div className="mt-1">rollback from {deployment.rollback_from_version}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={controlButtonClass}
                        disabled={durableLoading !== null || deployment.lifecycle === "revoked"}
                        onClick={() =>
                          void executeDurableAction(
                            "agent-rollback",
                            deployment.deployment_id,
                            `${deployment.agent_id} Agent 롤백`,
                            "0.9.0",
                          )
                        }
                        aria-label={`${deployment.agent_id} Agent 롤백`}
                      >
                        Agent 롤백
                      </button>
                      <button
                        type="button"
                        className={controlButtonClass}
                        disabled={durableLoading !== null || deployment.lifecycle === "revoked"}
                        onClick={() =>
                          void executeDurableAction(
                            "agent-revoke",
                            deployment.deployment_id,
                            `${deployment.agent_id} Agent 회수`,
                          )
                        }
                        aria-label={`${deployment.agent_id} Agent 회수`}
                      >
                        Agent 회수
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {durableState.approvals.length > 0 ? (
            <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }} open>
              <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
                승인 대기함 {pendingApprovals.length}건 · 전체 이력 {durableState.approvals.length}건
              </summary>
              <div className="mt-2 space-y-2">
                {durableState.approvals.map((approval) => (
                  <div
                    key={approval.approval_id}
                    className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs"
                  >
                    <dl className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]">
                      <dt className="font-semibold">작업</dt>
                      <dd className="break-all">{approval.operation}</dd>
                      <dt className="font-semibold">상태</dt>
                      <dd>{approval.status}</dd>
                      <dt className="font-semibold">범위</dt>
                      <dd className="break-all">{approval.scope}</dd>
                      <dt className="font-semibold">이유</dt>
                      <dd>{approval.reason}</dd>
                      <dt className="font-semibold">만료</dt>
                      <dd>{formatTimestamp(approval.expires_at)}</dd>
                      <dt className="font-semibold">다음 행동</dt>
                      <dd>{approval.next_action}</dd>
                    </dl>
                    {approval.status === "pending" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={controlButtonClass}
                          disabled={durableLoading !== null}
                          onClick={() =>
                            void executeDurableAction(
                              "approval-approve",
                              approval.approval_id,
                              `${approval.operation} 승인`,
                            )
                          }
                          aria-label={`${approval.operation} 승인`}
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          className={controlButtonClass}
                          disabled={durableLoading !== null}
                          onClick={() =>
                            void executeDurableAction(
                              "approval-reject",
                              approval.approval_id,
                              `${approval.operation} 거절`,
                            )
                          }
                          aria-label={`${approval.operation} 거절`}
                        >
                          거절
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {durableState.runs.length > 0 ? (
            <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
              <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
                Task·Run·Trace 상세 {durableState.runs.length}건
              </summary>
              <div className="mt-2 space-y-2">
                {durableState.runs.map((run) => {
                  const task = durableState.tasks.find((item) => item.task_id === run.task_id);
                  return (
                    <div
                      key={run.run_id}
                      className="rounded-lg border p-3 text-xs"
                      style={{ borderColor: "var(--th-border)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{task?.title ?? run.task_id}</div>
                        <span
                          className={`rounded-md border px-2 py-1 ${statusTone(run.status, run.status === "failed")}`}
                        >
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-2 break-all font-mono">{run.run_id}</div>
                      <div className="mt-1 break-all font-mono">Trace {run.trace_id}</div>
                      <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                        Owner {run.owner_department} · parent {run.parent_run_id ?? "없음"} · child{" "}
                        {run.child_run_ids.join(", ") || "없음"}
                      </div>
                      <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                        추천 Agent {task?.recommended_agent ?? "미기록"} · Agent {run.agent_version ?? "버전 미기록"} ·
                        Skill {run.skill_version ?? "버전 미기록"}
                      </div>
                      <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                        Memory {task?.memory_status ?? "-"} · token {run.token_count} · cost ${run.cost_usd.toFixed(4)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2" aria-label={`${run.run_id} 조작`}>
                        <button
                          type="button"
                          className={controlButtonClass}
                          disabled={durableLoading !== null || run.status === "completed" || run.status === "canceled"}
                          onClick={() =>
                            void executeDurableAction(
                              "agent-recommend",
                              run.task_id,
                              "Agent 추천",
                              task?.recommended_agent ?? "OPS",
                            )
                          }
                          aria-label={`${run.run_id} Agent 추천`}
                        >
                          Agent 추천
                        </button>
                        <button
                          type="button"
                          className={controlButtonClass}
                          disabled={durableLoading !== null || run.status === "completed" || run.status === "canceled"}
                          onClick={() => void executeDurableAction("owner-change", run.task_id, "Owner 변경", "REVIEW")}
                          aria-label={`${run.run_id} Owner 변경`}
                        >
                          Owner 변경
                        </button>
                        {run.status === "running" ? (
                          <button
                            type="button"
                            className={controlButtonClass}
                            disabled={durableLoading !== null}
                            onClick={() => void executeDurableAction("run-pause", run.run_id, "Run 일시정지")}
                            aria-label={`${run.run_id} 일시정지`}
                          >
                            일시정지
                          </button>
                        ) : null}
                        {run.status === "paused" ? (
                          <button
                            type="button"
                            className={controlButtonClass}
                            disabled={durableLoading !== null}
                            onClick={() => void executeDurableAction("run-resume", run.run_id, "Run 재개")}
                            aria-label={`${run.run_id} 재개`}
                          >
                            재개
                          </button>
                        ) : null}
                        {run.status === "running" || run.status === "paused" ? (
                          <button
                            type="button"
                            className={controlButtonClass}
                            disabled={durableLoading !== null}
                            onClick={() => void executeDurableAction("run-cancel", run.run_id, "Run 취소")}
                            aria-label={`${run.run_id} 취소`}
                          >
                            취소
                          </button>
                        ) : null}
                        {run.status === "failed" ? (
                          <>
                            <button
                              type="button"
                              className={controlButtonClass}
                              disabled={durableLoading !== null}
                              onClick={() => void executeDurableAction("run-retry", run.run_id, "새 lineage 재시도")}
                              aria-label={`${run.run_id} 재시도`}
                            >
                              재시도
                            </button>
                            <button
                              type="button"
                              className={controlButtonClass}
                              disabled={durableLoading !== null}
                              onClick={() =>
                                void executeDurableAction("run-escalate", run.run_id, "CONTROL 에스컬레이션")
                              }
                              aria-label={`${run.run_id} 에스컬레이션`}
                            >
                              에스컬레이션
                            </button>
                          </>
                        ) : null}
                      </div>
                      {run.failure_reason ? (
                        <div className="mt-2 rounded-md border border-rose-400/40 bg-rose-400/10 p-2">
                          <div>원인: {run.failure_reason}</div>
                          <div className="mt-1 font-semibold">다음 행동: {run.next_action}</div>
                        </div>
                      ) : null}
                      <ol
                        className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3"
                        aria-label={`${run.run_id} Trace spans`}
                      >
                        {run.spans.map((span) => (
                          <li
                            key={span.span_id}
                            className="rounded-md border p-2"
                            style={{ borderColor: "var(--th-border)" }}
                          >
                            <span className="font-mono">{span.name}</span> · {span.status}
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          <section
            className="mt-3 border-t pt-3"
            style={{ borderColor: "var(--th-border)" }}
            aria-labelledby="control-tower-incidents-heading"
            data-testid="control-tower-incidents"
          >
            <h4 id="control-tower-incidents-heading" className="text-xs font-semibold">
              장애·차단 업무 {durableIncidents.length + blockedTasks.length}건
            </h4>
            {durableIncidents.length === 0 && blockedTasks.length === 0 ? (
              <div className="mt-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--th-border)" }}>
                현재 실패·취소 Run 또는 승인 대기·차단 Task가 없습니다.
              </div>
            ) : (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {durableIncidents.map((run) => (
                  <div
                    key={`incident:${run.run_id}`}
                    className="rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-xs"
                  >
                    <div className="font-semibold">Run {run.status}</div>
                    <div className="mt-1 break-all font-mono">{run.run_id}</div>
                    <div className="mt-1">원인: {run.failure_reason ?? "운영자 취소"}</div>
                    <div className="mt-1 font-semibold">
                      다음 행동: {run.next_action ?? "Task 상태를 확인하고 재요청하세요."}
                    </div>
                  </div>
                ))}
                {blockedTasks.map((task) => (
                  <div
                    key={`blocked:${task.task_id}`}
                    className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs"
                  >
                    <div className="font-semibold">Task {task.status}</div>
                    <div className="mt-1 break-all font-mono">{task.task_id}</div>
                    <div className="mt-1">
                      Owner {task.owner_department} · 추천 Agent {task.recommended_agent ?? "미기록"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {durableState.handoffs.length > 0 ? (
            <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
              <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
                Handoff 흐름 {durableState.handoffs.length}건
              </summary>
              {durableState.handoffs.map((handoff) => (
                <div
                  key={handoff.handoff_id}
                  className="mt-2 rounded-lg border p-3 text-xs"
                  style={{ borderColor: "var(--th-border)" }}
                >
                  <div className="font-semibold">
                    {handoff.from_department} → {handoff.to_department} · {handoff.status}
                  </div>
                  <div className="mt-1">목적: {handoff.purpose}</div>
                  <div className="mt-1 break-all">범위: {handoff.scope}</div>
                  <div className="mt-1">완료 기준: {handoff.acceptance_criteria.join(" · ")}</div>
                </div>
              ))}
            </details>
          ) : null}

          {durableState.artifacts.length > 0 ? (
            <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }} open>
              <summary className="cursor-pointer text-xs font-semibold" tabIndex={0}>
                검증된 Artifact {durableState.artifacts.length}건
              </summary>
              {durableState.artifacts.map((artifact) => (
                <div
                  key={artifact.artifact_id}
                  className="mt-2 rounded-lg border p-3 text-xs"
                  style={{ borderColor: "var(--th-border)" }}
                >
                  <div className="font-semibold">
                    {artifact.artifact_id} · verified={String(artifact.verified)}
                  </div>
                  <div className="mt-1 break-all font-mono">sha256 {artifact.sha256}</div>
                  <button
                    type="button"
                    className={`${controlButtonClass} mt-2`}
                    aria-expanded={openArtifactId === artifact.artifact_id}
                    aria-controls={`artifact-content-${artifact.artifact_id}`}
                    onClick={() =>
                      setOpenArtifactId(openArtifactId === artifact.artifact_id ? null : artifact.artifact_id)
                    }
                  >
                    {openArtifactId === artifact.artifact_id ? "Artifact 닫기" : "Artifact 열기"}
                  </button>
                  {openArtifactId === artifact.artifact_id ? (
                    <pre
                      id={`artifact-content-${artifact.artifact_id}`}
                      className="mt-2 overflow-x-auto rounded-md border p-2 text-[11px]"
                      style={{ borderColor: "var(--th-border)" }}
                    >
                      {artifact.content_preview}
                    </pre>
                  ) : null}
                </div>
              ))}
            </details>
          ) : null}
        </section>
      ) : null}

      <details className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--th-border)" }}>
        <summary
          className="cursor-pointer text-sm font-semibold"
          style={{ color: "var(--th-text-primary)" }}
          tabIndex={0}
        >
          Agent 버전 인벤토리 {agentVersions.length}개 · read-only
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {agentVersions.map((agent) => (
            <div
              key={`${agent.agent_id}:${agent.version}`}
              className="rounded-lg border p-3 text-xs"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    {agent.display_name}
                  </div>
                  <div className="mt-1 font-mono" style={{ color: "var(--th-text-secondary)" }}>
                    {agent.agent_id}@{agent.version}
                  </div>
                </div>
                <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-700 dark:text-emerald-100">
                  {agent.lifecycle}
                </span>
              </div>
              <div className="mt-2 break-all font-mono text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                {agent.manifest_id ?? "manifest 없음"}
              </div>
              <div className="mt-2" style={{ color: "var(--th-text-secondary)" }}>
                rollback target: {agent.rollback_target_version ?? "없음"}
              </div>
              <div className="mt-1 font-semibold text-amber-700 dark:text-amber-100">
                deploy/rollback mutation 미연결
              </div>
            </div>
          ))}
        </div>
      </details>

      {projection &&
        (!projection.available || projection.parse_error_count > 0 || projection.event_parse_error_count > 0) && (
          <div
            className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-100"
            role="status"
          >
            {projection.message}
          </div>
        )}

      {runs.length === 0 ? (
        <div
          className="mt-4 rounded-lg border p-4 text-sm"
          style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
        >
          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
            표시할 live-pilot Run이 없습니다.
          </div>
          <div className="mt-1">
            원인: collector 파일이 없거나 아직 실행 기록이 없습니다. 다음 조치: collector 상태와 source path를
            확인하세요.
          </div>
          {projection?.source_path && (
            <div className="mt-2 break-all font-mono text-[11px]">{projection.source_path}</div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {runs.map((run) => (
            <article
              key={run.run_id}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone(run.status, run.critical)}`}
                    >
                      {run.status}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                      {run.project_id ?? "project 미지정"} · Owner {run.owner_department}
                    </span>
                  </div>
                  <div className="mt-2 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {run.work_type ?? "work type 미지정"} / {run.scenario_type ?? "scenario 미지정"} ·{" "}
                    {formatTimestamp(run.completed_at ?? run.started_at)}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    agent {run.agent_version ?? "-"} · skill {run.skill_version ?? "-"} · memory{" "}
                    {run.memory_version ?? "-"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActionPreview({ runId: run.run_id, action: "retry" })}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    title="실행하지 않고 필요한 승인과 새 lineage 계획만 표시합니다."
                  >
                    재시도 계획
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionPreview({ runId: run.run_id, action: "escalate" })}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    title="실행하지 않고 CONTROL 전달 계획만 표시합니다."
                  >
                    에스컬레이션 계획
                  </button>
                </div>
              </div>

              {actionPreview?.runId === run.run_id && (
                <div
                  className="mt-3 rounded-lg border border-cyan-400/40 bg-cyan-400/10 p-3 text-xs"
                  role="status"
                  data-testid={`action-preview-${run.run_id}`}
                >
                  <div className="font-semibold text-cyan-800 dark:text-cyan-100">
                    {actionPreview.action === "retry" ? "재시도" : "에스컬레이션"} dry-run 계획
                  </div>
                  <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                    {actionPreview.action === "retry"
                      ? `원 Run ${run.run_id}을 보존하고 CONTROL 승인 후 새 Run ID와 Trace ID를 발급해야 합니다.`
                      : `${run.owner_department}에서 CONTROL로 원인·Trace·Artifact·Evidence를 전달해야 합니다.`}
                  </div>
                  <div className="mt-1 font-semibold text-amber-700 dark:text-amber-100">
                    실행되지 않음 · DB write 없음 · 승인 API 미연결
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-4" style={{ borderColor: "var(--th-border)" }}>
                <ValueList label="Task" values={run.task_id ? [run.task_id] : []} />
                <ValueList label="Run" values={[run.run_id]} />
                <ValueList
                  label={`Trace · ${run.trace_span_count} spans`}
                  values={run.trace_id ? [run.trace_id] : []}
                />
                <ValueList label="Artifact" values={run.artifact_refs} />
              </div>
              <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2" style={{ borderColor: "var(--th-border)" }}>
                <ValueList label="Handoff flow" values={run.handoff_departments} />
                <ValueList label="Evidence" values={run.evidence_refs} />
              </div>
              {run.events.some((event) => event.reason) && (
                <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-xs text-rose-800 dark:text-rose-100">
                  <div>원인: {run.events.find((event) => event.reason)?.reason}</div>
                  <div className="mt-1">
                    다음 조치:{" "}
                    {run.events.find((event) => event.escalation_department)?.escalation_department ?? "CONTROL"}에서
                    승인 범위를 검토한 뒤 새 Run lineage로 재실행하세요.
                  </div>
                </div>
              )}
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
                <details>
                  <summary
                    className="cursor-pointer text-xs font-semibold"
                    style={{ color: "var(--th-text-primary)" }}
                    tabIndex={0}
                  >
                    Trace event {run.events.length}개 보기
                  </summary>
                  {run.events.length > 0 ? (
                    <ol className="mt-2 space-y-2">
                      {run.events.map((event) => (
                        <li
                          key={event.event_id}
                          className="grid gap-1 rounded-lg border p-2 text-[11px] md:grid-cols-[42px_1fr_1fr]"
                          style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
                        >
                          <span className="font-mono">#{event.sequence}</span>
                          <span className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                            {event.event_type}
                          </span>
                          <span className="break-all">
                            {event.department ?? (event.routing.length > 0 ? event.routing.join(" → ") : "-")}
                            {event.reason_code ? ` · ${event.reason_code}` : ""}
                            {event.decision ? ` · ${event.decision}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="mt-2 text-xs" style={{ color: "var(--th-text-muted)" }}>
                      이벤트 원본이 없거나 아직 수집되지 않았습니다.
                    </div>
                  )}
                </details>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--th-border)" }}>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-600">
              five-journey operations · append-only local proof
            </div>
            <h3 className="mt-1 text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
              5개 핵심 사용자 여정 리허설
            </h3>
            <p className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
              리허설을 확인하거나 승인된 로컬 journal에 재시작 가능한 여정 증거를 기록합니다. 외부 실행은 없습니다.
            </p>
          </div>
          <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-100">
            {durableJourneyCount}/5 durable · 5/5 previewable
          </span>
        </div>
        <ol className="mt-3 grid gap-2 lg:grid-cols-5">
          {journeys.map((journey) => (
            <li key={journey.id} className="rounded-lg border p-2" style={{ borderColor: "var(--th-border)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                {journey.title}
              </div>
              {durableJourneyIds.has(journey.id) ? (
                <div className="mt-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-100">
                  durable proof recorded
                </div>
              ) : null}
              <button
                type="button"
                aria-pressed={journeyPreview === journey.id}
                onClick={() => setJourneyPreview(journey.id)}
                className="mt-2 w-full rounded-md border px-2 py-1.5 text-[11px] font-semibold"
                style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
              >
                여정 {journeys.indexOf(journey) + 1} 리허설 확인
              </button>
              <button
                type="button"
                onClick={() => void executeDurableJourney(journey.id)}
                disabled={durableLoading !== null}
                className="mt-2 w-full rounded-md border border-emerald-500/50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 dark:text-emerald-100"
                data-testid={`execute-journey-${journey.id}`}
              >
                {durableLoading === journey.id ? "로컬 증거 기록 중" : journey.executeLabel}
              </button>
            </li>
          ))}
        </ol>
        {selectedJourney ? (
          <div
            className="mt-3 rounded-lg border border-cyan-400/40 bg-cyan-400/10 p-3 text-xs"
            role="status"
            data-testid="journey-readiness-preview"
          >
            <div className="font-semibold text-cyan-800 dark:text-cyan-100">
              {selectedJourney.title} ·{" "}
              {durableJourneyIds.has(selectedJourney.id) ? "durable proof recorded" : "preview only"}
            </div>
            <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
              증거: {selectedJourney.evidence}
            </div>
            {durableJourneyIds.has(selectedJourney.id) ? (
              <div className="mt-1 font-semibold text-emerald-700 dark:text-emerald-100">
                외부 효과 없이 Project-scoped append-only 증거로 기록되었습니다.
              </div>
            ) : (
              <div className="mt-1 font-semibold text-amber-700 dark:text-amber-100">
                남은 조건: {selectedJourney.remaining}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </section>
  );
}
