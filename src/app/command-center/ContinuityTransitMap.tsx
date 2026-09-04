import { useEffect, useState, type CSSProperties } from "react";
import type { ControlPlaneDashboardProject } from "../../api/control-plane-dashboard";
import type {
  ContinuityCheckpointStatus,
  ContinuityLiveProjection,
  ContinuityProvider,
  ContinuitySyncState,
} from "../../api/continuity";
import AgentAvatar, { buildSpriteMap } from "../../components/AgentAvatar";
import type { Agent, Task, WebSocketConnectionState } from "../../types";

const STATIONS = ["소스 정지", "체크포인트", "대상 검증", "승인", "실행 예약", "재개 확인"] as const;

type TransitTone = "active" | "blocked" | "uncertain" | "failed" | "completed" | "ready" | "untracked";
type TransitProvider = ContinuityProvider | "unassigned";

const BLOCKED_CHECKPOINT_STATUSES = new Set<ContinuityCheckpointStatus>([
  "approval_required",
  "checkpoint_conflict",
  "provider_unavailable",
  "auth_required",
]);
const FAILED_CHECKPOINT_STATUSES = new Set<ContinuityCheckpointStatus>(["failed", "canceled"]);
const UNSYNCED_STATES = new Set<ContinuitySyncState>(["gap", "run_changed", "offline", "error"]);
const CLIENT_PROJECTION_FRESH_MS = 15_000;
const CLIENT_HEARTBEAT_FRESH_MS = 30_000;

function projectionFreshAt(projection: ContinuityLiveProjection, nowMs: number): boolean {
  const observedAt = Date.parse(projection.observed_at);
  const heartbeatAt = projection.heartbeat_at ? Date.parse(projection.heartbeat_at) : Number.NaN;
  if (!Number.isFinite(observedAt) || !Number.isFinite(heartbeatAt)) return false;
  const observedAge = nowMs - observedAt;
  const heartbeatAge = nowMs - heartbeatAt;
  return (
    observedAge >= -5_000 &&
    observedAge <= CLIENT_PROJECTION_FRESH_MS &&
    heartbeatAge >= -5_000 &&
    heartbeatAge <= CLIENT_HEARTBEAT_FRESH_MS
  );
}

function clientProjectionExpired(projection: ContinuityLiveProjection, nowMs: number): boolean {
  return (
    projection.sync_state === "exact" &&
    projection.target_run_status === "running" &&
    projection.heartbeat_freshness === "fresh" &&
    !projectionFreshAt(projection, nowMs)
  );
}

function projectionTone(
  projection: ContinuityLiveProjection,
  nowMs: number,
  connectionState: WebSocketConnectionState,
): TransitTone {
  if (
    connectionState !== "connected" ||
    UNSYNCED_STATES.has(projection.sync_state) ||
    projection.reconcile_state === "reconcile_required" ||
    clientProjectionExpired(projection, nowMs)
  ) {
    return "uncertain";
  }
  if (BLOCKED_CHECKPOINT_STATUSES.has(projection.checkpoint_status)) return "blocked";
  if (
    FAILED_CHECKPOINT_STATUSES.has(projection.checkpoint_status) ||
    projection.target_run_status === "failed" ||
    projection.target_run_status === "canceled"
  ) {
    return "failed";
  }
  if (projection.checkpoint_status === "completed" || projection.target_run_status === "completed") {
    return "completed";
  }
  if (
    projection.motion_eligible &&
    projection.sync_state === "exact" &&
    projection.target_run_status === "running" &&
    projection.heartbeat_freshness === "fresh" &&
    projectionFreshAt(projection, nowMs)
  ) {
    return "active";
  }
  return "ready";
}

function toneLabel(tone: TransitTone): string {
  const labels: Record<TransitTone, string> = {
    active: "실시간 운행",
    blocked: "운행 차단",
    uncertain: "이동 정지·재검증",
    failed: "운행 실패",
    completed: "환승 완료",
    ready: "단계 확인",
    untracked: "기록 미연결",
  };
  return labels[tone];
}

function syncLabel(
  projection: ContinuityLiveProjection,
  nowMs: number,
  connectionState: WebSocketConnectionState,
): string {
  if (connectionState !== "connected") {
    return {
      connecting: "실시간 연결 준비 중",
      reconnecting: "실시간 재연결 중",
      auth_recovering: "실시간 인증 복구 중",
    }[connectionState];
  }
  if (clientProjectionExpired(projection, nowMs)) return "실시간 확인 만료·재검증 대기";
  const labels: Record<ContinuitySyncState, string> = {
    exact: "실시간 순서 검증됨",
    snapshot: "서버 스냅샷",
    gap: "이벤트 누락 재검증 중",
    run_changed: "실행 전환 재검증 중",
    offline: "실시간 연결 끊김",
    error: "동기화 오류",
  };
  return labels[projection.sync_state];
}

function latestProjectionForTask(
  taskId: string,
  projections: ContinuityLiveProjection[],
): ContinuityLiveProjection | undefined {
  return projections.reduce<ContinuityLiveProjection | undefined>((latest, candidate) => {
    if (candidate.task_id !== taskId) return latest;
    if (!latest || candidate.checkpoint_sequence > latest.checkpoint_sequence) return candidate;
    if (
      candidate.checkpoint_sequence === latest.checkpoint_sequence &&
      candidate.event_sequence > latest.event_sequence
    ) {
      return candidate;
    }
    return latest;
  }, undefined);
}

function transitProvider(projection: ContinuityLiveProjection | undefined): TransitProvider {
  if (!projection) return "unassigned";
  return projection.target_run_id ? projection.target_provider : projection.source_provider;
}

function displayAgentForProvider(
  task: Task,
  projection: ContinuityLiveProjection | undefined,
  agents: Agent[],
): Agent | undefined {
  if (!projection) return undefined;
  const provider = projection.target_run_id ? projection.target_provider : projection.source_provider;
  return agents.find((candidate) => candidate.current_task_id === task.id && candidate.cli_provider === provider);
}

function projectForTask(task: Task, projects: ControlPlaneDashboardProject[]) {
  const normalizedPath = task.project_path?.replace(/\\/g, "/").toLowerCase();
  return projects.find((project) => {
    if (task.project_id === project.key) return true;
    return normalizedPath?.endsWith(`/repos/${project.key.toLowerCase()}`);
  });
}

type Props = {
  connectionState?: WebSocketConnectionState;
  tasks: Task[];
  agents: Agent[];
  projects: ControlPlaneDashboardProject[];
  continuity?: ContinuityLiveProjection[];
  continuityUnavailable?: boolean;
  onOpenTask: (taskId: string) => void;
};

function checkpointCopy(projection: ContinuityLiveProjection): string {
  if (projection.target_run_status === "running") return "대상 실행 중";
  if (projection.target_run_status === "starting") return "대상 시작 확인 중";
  if (projection.target_run_status === "reserved") return "실행 예약 저장됨";
  if (projection.target_run_status === "dispatch_uncertain") return "실행 결과 불확실";
  if (projection.target_run_status === "stale") return "heartbeat 지연";
  const labels: Record<ContinuityCheckpointStatus, string> = {
    ready_for_transfer: "체크포인트 저장됨",
    target_validating: "대상 검증 중",
    approval_required: "승인 대기",
    accepted: "환승 승인 기록됨",
    resuming: "재개 확인 중",
    running: "대상 실행 중",
    completed: "대상 재개 확인",
    checkpoint_conflict: "작업공간 충돌",
    provider_unavailable: "제공자 사용 불가",
    auth_required: "인증 필요",
    dispatch_uncertain: "실행 결과 불확실",
    stale: "heartbeat 지연",
    failed: "실행 실패",
    canceled: "운행 취소",
  };
  return labels[projection.checkpoint_status];
}

function taskProgressCopy(task: Task): string {
  const total = task.subtask_total;
  const done = task.subtask_done;
  if (typeof total === "number" && total > 0 && typeof done === "number") {
    return `업무 상태 ${task.status} · 하위업무 ${Math.min(done, total)}/${total}`;
  }
  return `업무 상태 ${task.status} · 작업 총량 미정`;
}

export default function ContinuityTransitMap({
  connectionState = "connected",
  tasks,
  agents,
  projects,
  continuity = [],
  continuityUnavailable = false,
  onOpenTask,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);
  const spriteMap = buildSpriteMap(agents);
  const prioritizedTasks = [...tasks]
    .filter((task) => task.status !== "cancelled")
    .sort((a, b) => {
      const toneRank: Record<TransitTone, number> = {
        uncertain: 7,
        failed: 6,
        blocked: 5,
        active: 4,
        ready: 3,
        completed: 2,
        untracked: 1,
      };
      const projectionA = latestProjectionForTask(a.id, continuity);
      const projectionB = latestProjectionForTask(b.id, continuity);
      const rankA = projectionA ? toneRank[projectionTone(projectionA, nowMs, connectionState)] : toneRank.untracked;
      const rankB = projectionB ? toneRank[projectionTone(projectionB, nowMs, connectionState)] : toneRank.untracked;
      return rankB - rankA || b.updated_at - a.updated_at;
    });
  const liveTasks = prioritizedTasks.slice(0, 6);
  const hiddenRiskCount = prioritizedTasks.slice(6).filter((task) => {
    const projection = latestProjectionForTask(task.id, continuity);
    if (!projection) return false;
    const tone = projectionTone(projection, nowMs, connectionState);
    return tone === "uncertain" || tone === "failed" || tone === "blocked";
  }).length;

  return (
    <section className="cc-continuity-board" aria-labelledby="cc-continuity-title">
      <header>
        <div>
          <span className="cc-eyebrow">PROVIDER CONTINUITY</span>
          <h2 id="cc-continuity-title">Codex ↔ Claude 환승 관제</h2>
          <p>업무 진행도와 제공자 환승 단계를 분리해, 저장된 실행 기록만 움직입니다.</p>
        </div>
        <div className="cc-provider-key" aria-label="실행 제공자 범례">
          <span className="is-codex">Codex</span>
          <span className="is-claude">Claude</span>
        </div>
      </header>

      {continuityUnavailable && (
        <p className="cc-continuity-unavailable" role="alert">
          연속성 실행 기록을 불러오지 못했습니다. 일반 업무 상태를 운행 상태로 대신 표시하지 않습니다.
        </p>
      )}

      {connectionState !== "connected" && (
        <p className={`cc-continuity-connection is-${connectionState}`} role="status">
          {
            {
              connecting: "실시간 연결 준비 중 · 실행 상태 확인 전까지 캐릭터 이동을 보류합니다.",
              reconnecting: "실시간 재연결 중 · 최신 스냅샷 확인 전까지 캐릭터 이동을 보류합니다.",
              auth_recovering: "실시간 인증 복구 중 · 세션 확인 전까지 캐릭터 이동을 보류합니다.",
            }[connectionState]
          }
        </p>
      )}

      {hiddenRiskCount > 0 && (
        <p className="cc-continuity-hidden-risk" role="status">
          우선 표시 6건 밖에 위험 운행 {hiddenRiskCount}건이 더 있습니다. 업무 화면에서 전체 상태를 확인하세요.
        </p>
      )}

      {liveTasks.length === 0 ? (
        <div className="cc-transit-empty">
          <img src="/sprites/13-D-1.png" alt="대기 중인 운영 캐릭터" />
          <div>
            <strong>첫 운행을 기다리고 있습니다.</strong>
            <span>실제 Runner가 체크포인트를 저장하면 여섯 정류장 노선이 나타납니다.</span>
          </div>
        </div>
      ) : (
        <div className="cc-transit-lines">
          {liveTasks.map((task, lineIndex) => {
            const project = projectForTask(task, projects);
            const projection = latestProjectionForTask(task.id, continuity);
            const currentPhase = projection?.phase_index ?? -1;
            const provider = transitProvider(projection);
            const displayAgent = displayAgentForProvider(task, projection, agents);
            const tone = projection ? projectionTone(projection, nowMs, connectionState) : "untracked";
            const projectionExpired = projection ? clientProjectionExpired(projection, nowMs) : false;
            const liveMotion = tone === "active" && Boolean(displayAgent);
            const stationCopy = currentPhase >= 0 ? STATIONS[currentPhase] : "운행 기록 없음";
            return (
              <button
                className={`cc-transit-line is-${provider} is-${task.status} is-continuity-${tone}${displayAgent ? "" : " is-agent-unassigned"}${liveMotion ? " is-live-motion" : ""}`}
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task.id)}
                style={{ "--line-index": lineIndex, "--phase": Math.max(0, currentPhase) } as CSSProperties}
                data-continuity-status={projection?.checkpoint_status ?? "untracked"}
                data-sync-state={projection?.sync_state ?? "untracked"}
              >
                <span className="cc-line-identity">
                  <span className={`cc-continuity-state is-${tone}`}>{toneLabel(tone)}</span>
                  <small>{project?.key ?? task.project_id ?? "프로젝트 미지정"}</small>
                  <strong>{task.title}</strong>
                  <span className="cc-task-lifecycle">{taskProgressCopy(task)}</span>
                  <em>
                    {projection
                      ? `${projection.source_provider} → ${projection.target_provider} · ${checkpointCopy(projection)}`
                      : "실행 제공자 미확인 · 연속성 실행 기록 없음"}
                  </em>
                  {projection && <span className="cc-sync-state">{syncLabel(projection, nowMs, connectionState)}</span>}
                  {projection?.blockers[0] && (
                    <span className="cc-continuity-blocker">차단 사유 · {projection.blockers[0]}</span>
                  )}
                  {projectionExpired && projection && projection.blockers.length === 0 && (
                    <span className="cc-continuity-blocker">차단 사유 · client_projection_stale</span>
                  )}
                </span>
                <span
                  className="cc-station-track"
                  aria-label={`현재 환승 정류장 ${stationCopy} · ${projection ? checkpointCopy(projection) : "연속성 실행 기록 없음"}`}
                >
                  {STATIONS.map((station, index) => (
                    <span className={currentPhase >= 0 && index <= currentPhase ? "is-passed" : ""} key={station}>
                      <i aria-hidden="true" />
                      <b>{station}</b>
                    </span>
                  ))}
                  <span className="cc-running-agent" aria-hidden="true">
                    {displayAgent ? (
                      <AgentAvatar
                        agent={displayAgent}
                        spriteMap={spriteMap}
                        size={42}
                        rounded="xl"
                        imageFit="contain"
                      />
                    ) : (
                      <img className="cc-neutral-agent" src="/sprites/13-D-1.png" alt="" />
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
