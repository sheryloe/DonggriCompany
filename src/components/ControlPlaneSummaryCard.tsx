import { useEffect, useState } from "react";
import { Brain, FolderKanban, Network, ShieldCheck } from "lucide-react";
import { getControlPlaneState, type ControlPlaneState } from "../api/control-plane";

interface ControlPlaneSummaryCardProps {
  onOpen?: () => void;
}

function formatStatus(value: string | null | undefined): string {
  return value && value.trim() ? value : "확인 필요";
}

export default function ControlPlaneSummaryCard({ onOpen }: ControlPlaneSummaryCardProps) {
  const [state, setState] = useState<ControlPlaneState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getControlPlaneState()
      .then((nextState) => {
        if (!cancelled) {
          setState(nextState);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledScopes = state?.dongri_grigri.project_operators.filter((scope) => scope.enabled).length ?? 0;
  const masterCount = state?.dongri_grigri.master_departments?.length ?? 6;

  return (
    <section className="game-panel p-3" aria-label="Dongri-grigri 운영 요약">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">
            <ShieldCheck className="h-4 w-4" />
            Root Control
          </div>
          <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text-primary)" }}>
            Dongri-grigri 운영 상태
          </h2>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-400/20 dark:text-cyan-100"
          >
            프로젝트 scope 보기
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
          운영 상태를 불러오지 못했습니다. {error}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>
              <FolderKanban className="h-3.5 w-3.5" />
              Repos root
            </div>
            <div className="mt-1 truncate font-mono text-xs" style={{ color: "var(--th-text-primary)" }}>
              {state?.root.repo_estate_root.path ?? "loading"}
            </div>
          </div>
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>Active Spec</div>
            <div className="mt-1 truncate font-mono text-xs" style={{ color: "var(--th-text-primary)" }}>{state?.active_spec.id ?? "loading"}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>{formatStatus(state?.active_spec.phase)}</div>
          </div>
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>
              <Network className="h-3.5 w-3.5" />
              마스터 에이전트
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
              {state ? `${masterCount}개 부서` : "loading"}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>서브에이전트는 작업마다 생성</div>
          </div>
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>
              <Brain className="h-3.5 w-3.5" />
              Memory / Scope
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
              {state ? `${enabledScopes}개 프로젝트` : "loading"}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
              {state?.memory.health.available ? "AgentMemory online" : "AgentMemory 대기"}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
