import { ArrowRightLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  createContinuityCheckpoint,
  getTaskContinuityCheckpoints,
  resumeContinuityCheckpoint,
  validateContinuityCheckpoint,
  type ContinuityTransitProjectionView,
  type ContinuityProvider,
} from "../../api/continuity";
import { getCliAccountPools, type CliAccountPoolView } from "../../api/messaging-runtime-oauth";
import type { Agent, Task } from "../../types";

type Props = { task: Task; agents: Agent[] };

const ACTION_LABEL: Partial<Record<ContinuityTransitProjectionView["checkpoint_status"], string>> = {
  ready_for_transfer: "대상 환경 검증",
  accepted: "재개 상태 확인",
};

const TRANSFER_STATIONS = ["소스 정지", "체크포인트", "대상 검증", "승인", "실행 예약", "재개 확인"] as const;

const STATUS_LABEL: Record<ContinuityTransitProjectionView["checkpoint_status"], string> = {
  ready_for_transfer: "환승 준비",
  target_validating: "대상 검증 중",
  approval_required: "승인 대기",
  accepted: "실행 예약 완료",
  resuming: "재개 확인 중",
  running: "대상 실행 중",
  completed: "환승 완료",
  checkpoint_conflict: "작업공간 충돌",
  provider_unavailable: "제공자 사용 불가",
  auth_required: "인증 필요",
  dispatch_uncertain: "실행 확인 필요",
  stale: "상태 갱신 지연",
  failed: "실행 실패",
  canceled: "환승 취소",
};

function latestCheckpoint(checkpoints: ContinuityTransitProjectionView[]): ContinuityTransitProjectionView | null {
  return checkpoints.reduce<ContinuityTransitProjectionView | null>(
    (latest, checkpoint) =>
      !latest || checkpoint.checkpoint_sequence > latest.checkpoint_sequence ? checkpoint : latest,
    null,
  );
}

export default function ContinuityTransferPanel({ task, agents }: Props) {
  const assignedProvider = agents.find((agent) => agent.id === task.assigned_agent_id)?.cli_provider;
  const initialSource: ContinuityProvider = assignedProvider === "claude" ? "claude" : "codex";
  const [sourceProvider, setSourceProvider] = useState<ContinuityProvider>(initialSource);
  const [targetProvider, setTargetProvider] = useState<ContinuityProvider>(
    initialSource === "codex" ? "claude" : "codex",
  );
  const [sourceAccountPoolId, setSourceAccountPoolId] = useState("");
  const [targetAccountPoolId, setTargetAccountPoolId] = useState("");
  const [accountPools, setAccountPools] = useState<CliAccountPoolView[]>([]);
  const [checkpoints, setCheckpoints] = useState<ContinuityTransitProjectionView[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  const [message, setMessage] = useState("환승 준비 상태 확인 중");
  const taskIdRef = useRef(task.id);
  taskIdRef.current = task.id;
  const current = latestCheckpoint(checkpoints.filter((checkpoint) => checkpoint.task_id === task.id));
  const sourceRunId = task.continuity_source_run_id?.trim() ?? "";
  const connectedPools = accountPools.filter((pool) => pool.status === "connected");
  const sourcePools = connectedPools.filter((pool) => pool.provider === sourceProvider);
  const targetPools = connectedPools.filter((pool) => pool.provider === targetProvider);
  const sourcePool = sourcePools.find((pool) => pool.accountPoolId === sourceAccountPoolId) ?? null;
  const targetPool = targetPools.find((pool) => pool.accountPoolId === targetAccountPoolId) ?? null;
  const canCreate = Boolean(
    task.project_path &&
    sourceRunId &&
    sourcePool &&
    targetPool &&
    !historyLoading &&
    !poolsLoading &&
    !historyError &&
    !poolsError,
  );

  useEffect(() => {
    setCheckpoints([]);
    setBusy(false);
    setSourceProvider(initialSource);
    setTargetProvider(initialSource === "codex" ? "claude" : "codex");
    setSourceAccountPoolId("");
    setTargetAccountPoolId("");
    if (!task.project_path) {
      setCheckpoints([]);
      setHistoryLoading(false);
      setHistoryError(null);
      setMessage("프로젝트 경로를 확인하세요.");
      return;
    }
    const controller = new AbortController();
    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    getTaskContinuityCheckpoints(task.id, controller.signal)
      .then((items) => {
        if (!active) return;
        setCheckpoints(items);
        setMessage(items.length > 0 ? "저장된 체크포인트를 불러왔습니다." : "새 환승 체크포인트를 만들 수 있습니다.");
      })
      .catch((error: unknown) => {
        if (active && (error as { name?: string })?.name !== "AbortError") {
          setHistoryError("체크포인트 이력을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 여세요.");
          setMessage("체크포인트 이력 조회 실패");
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [initialSource, task.id, task.project_id, task.project_path]);

  useEffect(() => {
    let active = true;
    setPoolsLoading(true);
    setPoolsError(null);
    getCliAccountPools()
      .then((items) => {
        if (active) setAccountPools(items);
      })
      .catch(() => {
        if (active) setPoolsError("연결된 CLI 계정 목록을 불러오지 못했습니다. 설정에서 계정 상태를 확인하세요.");
      })
      .finally(() => {
        if (active) setPoolsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const replaceCurrent = (checkpoint: ContinuityTransitProjectionView) => {
    if (checkpoint.task_id !== taskIdRef.current) return;
    setCheckpoints((items) => [checkpoint, ...items.filter((item) => item.task_id !== checkpoint.task_id)]);
    setMessage(`환승 상태: ${STATUS_LABEL[checkpoint.checkpoint_status]}`);
  };

  const create = async () => {
    if (!canCreate || !task.project_path || !sourcePool || !targetPool) return;
    setBusy(true);
    try {
      replaceCurrent(
        await createContinuityCheckpoint({
          project_id: task.project_id || task.project_path,
          project_path: task.project_path,
          task_id: task.id,
          source_run_id: sourceRunId,
          source_provider: sourceProvider,
          source_account_pool_id: sourcePool.accountPoolId,
          source_account_label: sourcePool.label,
          target_provider: targetProvider,
          target_account_pool_id: targetPool.accountPoolId,
          target_account_label: targetPool.label,
          objective: task.title,
          acceptance_criteria: [task.description?.trim() || "기존 업무 목표와 검증 근거를 보존한다."],
          completed: task.result?.trim() ? [task.result.trim()] : [],
          pending: ["대상 제공자에서 남은 업무를 이어서 수행한다."],
          next_safe_action: "대상 환경과 Git 작업공간을 검증한다.",
          created_by: "dongri-grigri-ui",
        }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "체크포인트를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!current || current.task_id !== task.id || !task.project_path || historyLoading) return;
    setBusy(true);
    try {
      const next =
        current.checkpoint_status === "ready_for_transfer"
          ? await validateContinuityCheckpoint(current.checkpoint_id, task.project_path)
          : current.checkpoint_status === "accepted"
            ? await resumeContinuityCheckpoint(current.checkpoint_id)
            : null;
      if (next) replaceCurrent(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "환승 단계를 진행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cc-transfer-panel" aria-labelledby={`transfer-${task.id}`}>
      <header>
        <span aria-hidden="true">
          <ArrowRightLeft size={18} />
        </span>
        <div>
          <strong id={`transfer-${task.id}`}>Codex ↔ Claude 이어하기</strong>
          <small>같은 제공자 재개 또는 제공자 전환 시 비밀정보 없이 Git 지문과 업무 체크포인트만 넘깁니다.</small>
        </div>
      </header>
      {!current ? (
        <div className="cc-transfer-form">
          <label>
            현재 제공자
            <select
              value={sourceProvider}
              onChange={(event) => {
                setSourceProvider(event.target.value as ContinuityProvider);
                setSourceAccountPoolId("");
              }}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label>
            현재 {sourceProvider === "codex" ? "Codex" : "Claude"} 계정
            <select value={sourceAccountPoolId} onChange={(event) => setSourceAccountPoolId(event.target.value)}>
              <option value="">연결된 계정 선택</option>
              {sourcePools.map((pool) => (
                <option key={`${pool.provider}:${pool.accountPoolId}`} value={pool.accountPoolId}>
                  {pool.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            대상 제공자
            <select
              value={targetProvider}
              onChange={(event) => {
                setTargetProvider(event.target.value as ContinuityProvider);
                setTargetAccountPoolId("");
              }}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label>
            대상 {targetProvider === "codex" ? "Codex" : "Claude"} 계정
            <select value={targetAccountPoolId} onChange={(event) => setTargetAccountPoolId(event.target.value)}>
              <option value="">연결된 계정 선택</option>
              {targetPools.map((pool) => (
                <option key={`${pool.provider}:${pool.accountPoolId}`} value={pool.accountPoolId}>
                  {pool.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !canCreate} onClick={() => void create()}>
            체크포인트 만들기
          </button>
          {!task.project_path && <small className="is-blocked">프로젝트 경로가 있는 업무만 환승할 수 있습니다.</small>}
          {!sourceRunId && (
            <small className="is-blocked">
              실제 실행 Run ID가 아직 연결되지 않았습니다. Runner가 실행 기록을 저장한 뒤 다시 여세요.
            </small>
          )}
          {!poolsLoading && !poolsError && sourcePools.length === 0 && (
            <small className="is-blocked">
              연결된 {sourceProvider} 계정이 없습니다. 설정에서 CLI 계정을 연결하세요.
            </small>
          )}
          {!poolsLoading && !poolsError && targetPools.length === 0 && (
            <small className="is-blocked">
              연결된 {targetProvider} 계정이 없습니다. 설정에서 CLI 계정을 연결하세요.
            </small>
          )}
          {sourceRunId && <small>Source Run · {sourceRunId}</small>}
          {poolsLoading && <small>연결된 CLI 계정을 확인하는 중입니다.</small>}
          {poolsError && <small className="is-blocked">{poolsError}</small>}
          {historyError && <small className="is-blocked">{historyError}</small>}
        </div>
      ) : (
        <div className="cc-transfer-current">
          <div>
            <span>{current.source_provider}</span>
            <ArrowRightLeft aria-hidden="true" size={16} />
            <span>{current.target_provider}</span>
          </div>
          <strong>{STATUS_LABEL[current.checkpoint_status]}</strong>
          <small>
            checkpoint #{current.checkpoint_sequence} · event #{current.event_sequence} · {current.next_safe_action}
          </small>
          <div
            className="cc-transfer-mini-rail"
            aria-label={`환승 정류장 ${TRANSFER_STATIONS[current.phase_index]} 단계`}
          >
            {TRANSFER_STATIONS.map((station, index) => (
              <span className={index <= current.phase_index ? "is-passed" : ""} key={station}>
                <i aria-hidden="true" />
                <b>{station}</b>
              </span>
            ))}
          </div>
          <small>
            대상 실행 · {current.target_run_status ?? "아직 없음"} · heartbeat {current.heartbeat_freshness}
          </small>
          {current.blockers.length > 0 && <small className="is-blocked">{current.blockers.join(" · ")}</small>}
          {current.checkpoint_status === "approval_required" && (
            <small className="is-blocked">
              Control Plane 승인함에서 승인된 뒤 서버가 실행을 예약합니다. 화면에서 승인값을 만들지 않습니다.
            </small>
          )}
          {ACTION_LABEL[current.checkpoint_status] &&
            !(current.checkpoint_status === "accepted" && current.target_run_status === "running") && (
              <button type="button" disabled={busy || historyLoading} onClick={() => void advance()}>
                {current.checkpoint_status === "accepted" ? (
                  <ShieldCheck aria-hidden="true" size={16} />
                ) : (
                  <CheckCircle2 aria-hidden="true" size={16} />
                )}
                {ACTION_LABEL[current.checkpoint_status]}
              </button>
            )}
        </div>
      )}
      <p aria-live="polite">
        {busy ? "환승 상태를 안전하게 기록하는 중입니다." : historyLoading ? "체크포인트 이력 확인 중" : message}
      </p>
    </section>
  );
}
