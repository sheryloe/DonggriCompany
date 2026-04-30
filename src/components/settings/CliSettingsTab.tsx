import { useCallback, useMemo, useState } from "react";
import type { OfficeExecutionProvider } from "../../api";
import type { CliSettingsTabProps } from "./types";

type CliPoolStatus = "connected" | "auth_required" | "install_required" | "profile_error";
type RunnerStatus = "active" | "idle" | "stopping" | "error";
type CodexSyncMetaByPool = Record<
  string,
  {
    usageSummary: string | null;
    availability: string;
    riskScore: number;
    waitMs: number;
    isCurrent: boolean;
    lastUsedAt: number | null;
    expiresAt: number | null;
    source: "auth_report" | "storage_fallback";
    accountDetected: boolean;
    usageReady: boolean;
    executionReady: boolean;
    executionIssue: "none" | "profile_sync_required" | "auth_required" | "install_required" | "unknown";
  }
>;

const PROVIDER_INFO: Record<OfficeExecutionProvider, { label: string; icon: string }> = {
  codex: { label: "Codex CLI", icon: "C" },
  gemini: { label: "Gemini CLI", icon: "G" },
  claude: { label: "Claude CLI", icon: "A" },
  jules: { label: "Jules CLI", icon: "J" },
};

function statusChipClass(status: CliPoolStatus): string {
  if (status === "connected") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (status === "auth_required") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  if (status === "install_required") return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
  return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
}

function runnerChipClass(status: RunnerStatus | null): string {
  if (status === "active") return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  if (status === "idle") return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
  if (status === "stopping") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  if (status === "error") return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
  return "bg-slate-600/30 text-slate-300 border border-slate-500/30";
}

function poolStatusLabel(status: CliPoolStatus): string {
  if (status === "connected") return "실행 준비";
  if (status === "auth_required") return "인증 필요";
  if (status === "install_required") return "CLI 설치 필요";
  return "실행 홈 문제";
}

function runnerStatusLabel(status: RunnerStatus | null): string {
  if (status === "active") return "실행 중";
  if (status === "idle") return "대기";
  if (status === "stopping") return "중지 중";
  if (status === "error") return "오류";
  return "러너 없음";
}

function queueStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "queued") return "대기";
  if (normalized === "running") return "실행 중";
  if (normalized === "done") return "완료";
  if (normalized === "failed") return "실패";
  if (normalized === "canceled") return "취소됨";
  return status || "-";
}

function availabilityLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unknown") return "사용량 정보 없음";
  if (normalized === "ready") return "즉시 사용 가능";
  if (normalized === "delayed") return "대기 필요";
  if (normalized === "unavailable") return "사용 불가";
  return normalized;
}

function executionIssueLabel(value: string | null | undefined): string {
  if (value === "none") return "문제 없음";
  if (value === "profile_sync_required") return "실행 프로필 동기화 필요";
  if (value === "auth_required") return "인증 필요";
  if (value === "install_required") return "CLI 설치 필요";
  return "상태 확인 필요";
}

function sourceLabel(value: string | null | undefined): string {
  if (value === "storage_fallback") return "저장소 기준";
  return "사용량 리포트 기준";
}

export default function CliSettingsTab(props: CliSettingsTabProps) {
  const [verifyMessageByKey, setVerifyMessageByKey] = useState<Record<string, string>>({});
  const [labelDraftByKey, setLabelDraftByKey] = useState<Record<string, string>>({});
  const [verifyAllCodexBusy, setVerifyAllCodexBusy] = useState(false);
  const [codexSyncBusy, setCodexSyncBusy] = useState(false);
  const [codexSyncMetaByPool, setCodexSyncMetaByPool] = useState<CodexSyncMetaByPool>({});

  const activeRunnerCount = useMemo(
    () => props.officeRunners.filter((runner) => runner.status === "active").length,
    [props.officeRunners],
  );
  const queueTop = useMemo(
    () => props.officeRunnerQueue.filter((item) => item.status === "queued").slice(0, 5),
    [props.officeRunnerQueue],
  );
  const codexPools = useMemo(
    () => props.cliAccountPools.filter((pool) => pool.provider === "codex"),
    [props.cliAccountPools],
  );

  const applyCodexSyncResponse = useCallback(
    (response: Awaited<ReturnType<NonNullable<CliSettingsTabProps["onSyncCodexPoolsFromMultiAuth"]>>>) => {
      const nextMeta: CodexSyncMetaByPool = {};
      for (const account of response.accounts ?? []) {
        nextMeta[`codex:${account.poolId}`] = {
          usageSummary: account.usageSummary ?? null,
          availability: account.availability,
          riskScore: account.riskScore,
          waitMs: account.waitMs,
          isCurrent: account.isCurrent,
          lastUsedAt: account.lastUsedAt ?? null,
          expiresAt: account.expiresAt ?? null,
          source: account.source,
          accountDetected: account.accountDetected ?? true,
          usageReady: account.usageReady ?? Boolean(account.usageSummary),
          executionReady: account.executionReady ?? false,
          executionIssue: account.executionIssue ?? "unknown",
        };
      }
      setCodexSyncMetaByPool((prev) => ({ ...prev, ...nextMeta }));
      const verifyMessages: Record<string, string> = {};
      for (const pool of response.pools ?? []) {
        verifyMessages[`codex:${pool.accountPoolId}`] = pool.status;
      }
      setVerifyMessageByKey((prev) => ({ ...prev, ...verifyMessages }));
    },
    [],
  );

  const handleSyncCodexPools = useCallback(async () => {
    if (!props.onSyncCodexPoolsFromMultiAuth || codexSyncBusy) return;
    setCodexSyncBusy(true);
    try {
      const response = await props.onSyncCodexPoolsFromMultiAuth(true);
      applyCodexSyncResponse(response);
    } finally {
      setCodexSyncBusy(false);
    }
  }, [applyCodexSyncResponse, codexSyncBusy, props]);

  const handleVerifyAllCodexPools = useCallback(async () => {
    if (verifyAllCodexBusy) return;
    setVerifyAllCodexBusy(true);
    try {
      if (props.onSyncCodexPoolsFromMultiAuth) {
        applyCodexSyncResponse(await props.onSyncCodexPoolsFromMultiAuth(true));
      }
      const poolsToVerify = props.cliAccountPools.filter((pool) => pool.provider === "codex");
      for (const pool of poolsToVerify) {
        const response = await props.onVerifyPool("codex", pool.accountPoolId);
        setVerifyMessageByKey((prev) => ({
          ...prev,
          [`codex:${pool.accountPoolId}`]: response.pool.status,
        }));
      }
    } finally {
      setVerifyAllCodexBusy(false);
    }
  }, [applyCodexSyncResponse, props, verifyAllCodexBusy]);

  return (
    <section
      className="space-y-5 rounded-xl p-5 sm:p-6"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
            CLI 계정 / 실행 상태
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
            계정 감지, 사용량 확인, 실행 준비, 실행 홈 문제를 분리해서 표시합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSyncCodexPools()}
            disabled={codexSyncBusy || !props.onSyncCodexPoolsFromMultiAuth}
            className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 enabled:hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {codexSyncBusy ? "Codex 계정 동기화 중..." : "Codex 계정 동기화"}
          </button>
          <button
            type="button"
            onClick={() => void handleVerifyAllCodexPools()}
            disabled={verifyAllCodexBusy || codexPools.length === 0}
            className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-300 enabled:hover:bg-cyan-500/10 disabled:opacity-40"
          >
            {verifyAllCodexBusy ? "Codex 전체 검증 중..." : "Codex 전체 검증"}
          </button>
          <button type="button" onClick={props.onRefresh} className="text-xs text-blue-400 hover:text-blue-300">
            새로고침
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <div className="text-xs text-slate-400">활성 러너</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">
            {activeRunnerCount}/{props.runnerMeta.maxActive}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <div className="text-xs text-slate-400">대기열</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{props.officeRunnerQueue.length}</div>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <div className="text-xs text-slate-400">Docker 실행</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">
            {props.runnerMeta.dockerEnabled ? "사용" : "미사용"}
          </div>
        </div>
      </div>

      {codexPools.length > 0 ? (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="mb-2 text-xs font-semibold text-cyan-200">Codex 계정 상태</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {codexPools.map((pool) => {
              const key = `codex:${pool.accountPoolId}`;
              const meta = codexSyncMetaByPool[key];
              const runner = props.officeRunners.find(
                (item) => item.provider === "codex" && item.accountPoolId === pool.accountPoolId,
              );
              return (
                <article key={pool.accountPoolId} className="rounded border border-slate-700/70 bg-slate-900/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{pool.label}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{pool.accountPoolId}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusChipClass(pool.status)}`}>
                      {poolStatusLabel(pool.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-slate-300">
                    <div>계정 감지: {meta?.accountDetected ? "감지됨" : "미확인"}</div>
                    <div>사용량 확인: {meta?.usageReady ? "확인됨" : availabilityLabel(meta?.availability)}</div>
                    <div>실행 준비: {meta?.executionReady || pool.status === "connected" ? "준비됨" : "점검 필요"}</div>
                    <div>
                      실행 홈:{" "}
                      {executionIssueLabel(
                        meta?.executionIssue ?? (pool.status === "profile_error" ? "profile_sync_required" : "unknown"),
                      )}
                    </div>
                    <div>사용량: {meta?.usageSummary ?? "-"}</div>
                    <div>
                      리스크/대기: {meta?.riskScore ?? 0}/{meta?.waitMs ?? 0}ms
                    </div>
                    <div>출처: {sourceLabel(meta?.source)}</div>
                    <div>러너: {runnerStatusLabel(runner?.status ?? null)}</div>
                    <div>
                      최근 검증: {pool.lastVerifiedAt ? new Date(pool.lastVerifiedAt).toLocaleString("ko-KR") : "-"}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {props.officeExecutionProviders.map((provider) => {
          const info = PROVIDER_INFO[provider] ?? { label: provider, icon: provider.slice(0, 1).toUpperCase() };
          const pools = props.cliAccountPools.filter((pool) => pool.provider === provider);
          const selectedPoolId = props.selectedPoolByProvider[provider] ?? pools[0]?.accountPoolId ?? "";
          const selectedPool = pools.find((pool) => pool.accountPoolId === selectedPoolId) ?? pools[0] ?? null;
          const runner = selectedPool
            ? props.officeRunners.find(
                (item) => item.provider === provider && item.accountPoolId === selectedPool.accountPoolId,
              )
            : null;
          const poolKey = `${provider}:${selectedPool?.accountPoolId ?? "none"}`;
          const labelDraft = labelDraftByKey[poolKey] ?? selectedPool?.label ?? "";
          const isBusy = props.cliAuthBusyKey?.startsWith(`${provider}:`) ?? false;

          return (
            <article key={provider} className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-100">
                    {info.icon}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{info.label}</div>
                    <div className="text-[11px] text-slate-500">
                      모델 선택은 중앙 provider 정책에서 자동 배정합니다.
                    </div>
                  </div>
                </div>
                {selectedPool ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${runnerChipClass(runner?.status ?? null)}`}>
                    {runnerStatusLabel(runner?.status ?? null)}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedPool?.accountPoolId ?? ""}
                  onChange={(event) => props.onPoolSelect(provider, event.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-white"
                >
                  {pools.length === 0 ? <option value="">계정 없음</option> : null}
                  {pools.map((pool) => (
                    <option key={pool.accountPoolId} value={pool.accountPoolId}>
                      {pool.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void props.onCreatePool(provider)}
                  className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 enabled:hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  추가
                </button>
                <button
                  type="button"
                  disabled={!selectedPool || isBusy}
                  onClick={() => selectedPool && void props.onDeletePool(provider, selectedPool.accountPoolId)}
                  className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 enabled:hover:bg-rose-500/10 disabled:opacity-40"
                >
                  삭제
                </button>
              </div>

              {selectedPool ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={labelDraft}
                      onChange={(event) => setLabelDraftByKey((prev) => ({ ...prev, [poolKey]: event.target.value }))}
                      placeholder="표시 이름"
                      className="rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={isBusy || !labelDraft.trim() || labelDraft.trim() === selectedPool.label}
                      onClick={() =>
                        void props.onUpdatePool(provider, selectedPool.accountPoolId, { label: labelDraft.trim() })
                      }
                      className="rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-300 enabled:hover:bg-blue-500/10 disabled:opacity-40"
                    >
                      이름 저장
                    </button>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded border border-slate-700/50 bg-slate-900/30 p-2">
                      <div className="text-slate-400">계정 상태</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${statusChipClass(selectedPool.status)}`}
                        >
                          {poolStatusLabel(selectedPool.status)}
                        </span>
                        <span className="text-slate-500">
                          {selectedPool.lastVerifiedAt
                            ? new Date(selectedPool.lastVerifiedAt).toLocaleString("ko-KR")
                            : "-"}
                        </span>
                      </div>
                    </div>
                    <div className="rounded border border-slate-700/50 bg-slate-900/30 p-2">
                      <div className="text-slate-400">Runner 상태</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${runnerChipClass(runner?.status ?? null)}`}
                        >
                          {runnerStatusLabel(runner?.status ?? null)}
                        </span>
                        <span className="text-slate-500">
                          Q:
                          {
                            props.officeRunnerQueue.filter(
                              (item) => item.provider === provider && item.accountPoolId === selectedPool.accountPoolId,
                            ).length
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void props.onCopyLoginCommand(provider, selectedPool.accountPoolId)}
                      className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 enabled:hover:bg-slate-700/40 disabled:opacity-40"
                    >
                      로그인 명령 복사
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const response = await props.onVerifyPool(provider, selectedPool.accountPoolId);
                        setVerifyMessageByKey((prev) => ({
                          ...prev,
                          [`${provider}:${selectedPool.accountPoolId}`]: response.pool.status,
                        }));
                      }}
                      className="rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-300 enabled:hover:bg-blue-500/10 disabled:opacity-40"
                    >
                      검증
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || selectedPool.status === "install_required"}
                      onClick={() => void props.onActivateRunner(provider, selectedPool.accountPoolId)}
                      className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 enabled:hover:bg-emerald-500/10 disabled:opacity-40"
                    >
                      Runner 활성화
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void props.onDeactivateRunner(provider, selectedPool.accountPoolId)}
                      className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-300 enabled:hover:bg-amber-500/10 disabled:opacity-40"
                    >
                      Runner 비활성화
                    </button>
                  </div>

                  {verifyMessageByKey[`${provider}:${selectedPool.accountPoolId}`] ? (
                    <p className="text-[11px] text-slate-400">
                      최근 검증 결과:{" "}
                      {poolStatusLabel(
                        verifyMessageByKey[`${provider}:${selectedPool.accountPoolId}`] as CliPoolStatus,
                      )}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="rounded border border-slate-700/50 bg-slate-900/30 p-3 text-xs text-slate-400">
                  등록된 계정 풀이 없습니다. 추가 버튼으로 실행 계정을 먼저 만드세요.
                </div>
              )}
            </article>
          );
        })}
      </div>

      {queueTop.length > 0 ? (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <h4 className="mb-2 text-xs font-semibold text-slate-300">대기열 상위</h4>
          <ul className="space-y-1 text-xs text-slate-300">
            {queueTop.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded bg-slate-800/50 px-2 py-1">
                <span className="truncate">
                  {item.provider}:{item.accountPoolId}
                </span>
                <span className="text-slate-400">{queueStatusLabel(String(item.status ?? ""))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        인증과 실행 홈은 분리됩니다. 사용량은 보이지만 실행 프로필이 없으면 “인증 필요”가 아니라 “실행 프로필 동기화
        필요”로 처리합니다.
      </p>
    </section>
  );
}
