import type {
  AccountPoolView,
  ProviderProbeRunView,
  ProviderProbeView,
  RuntimeProfileView
} from "@workspace/shared";

import type { AgentWorkLoopState, SceneSyncState } from "../board/scene-types";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";
import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";
import { ProbeStateBadge } from "./ProbeStateBadge";

type TopOpsBarProps = {
  providers: ProviderProbeView[];
  pools: AccountPoolView[];
  profiles: RuntimeProfileView[];
  latestProbeRun: ProviderProbeRunView | null;
  latestProbeState: ProbeUiState;
  sceneSync: SceneSyncState;
  isProbeRunning: boolean;
  onRunProbe: () => void;
  onRefreshHistory: () => void;
  onSetSimSpeed: (speed: "1x" | "2x" | "4x") => void;
  onPauseSim: () => void;
  onResumeSim: () => void;
  t?: OfficeTranslator;
};

const getLoopLabel = (state: AgentWorkLoopState): string => {
  switch (state) {
    case "moving_to_task":
      return "Moving to task";
    case "working":
      return "Task in progress";
    case "moving_to_pm":
      return "Moving to PM";
    case "reporting":
      return "Reporting to PM";
    case "waiting_review":
      return "Waiting review";
    case "blocked":
      return "Blocked";
    default:
      return "Idle";
  }
};

export function TopOpsBar({
  providers,
  pools,
  profiles,
  latestProbeRun,
  latestProbeState,
  sceneSync,
  isProbeRunning,
  onRunProbe,
  onRefreshHistory,
  onSetSimSpeed,
  onPauseSim,
  onResumeSim,
  t = createOfficeTranslator("en")
}: TopOpsBarProps): JSX.Element {
  const presentation = mapProbeStateToPresentation(latestProbeState);
  const cliReadyCount = providers.filter((provider) => provider.cliInstalled).length;
  const enabledPoolCount = pools.filter((pool) => pool.isEnabled).length;
  const enabledProfileCount = profiles.filter((profile) => profile.isEnabled).length;
  const loopLabel = getLoopLabel(sceneSync.loopState);
  const queueRatio = Math.min(100, sceneSync.kpi.queueDepth * 5);
  const loadRatio = Math.min(100, Math.round(sceneSync.kpi.avgAgentLoad));
  const throughputRatio = Math.min(100, sceneSync.kpi.throughput * 6);
  const lastLoopEvent = sceneSync.lastLoopEvent;
  const eventCause = lastLoopEvent
    ? `${lastLoopEvent.type}:${lastLoopEvent.phase}${lastLoopEvent.detail ? `:${lastLoopEvent.detail}` : ""}`
    : "none";

  return (
    <section className={`office-top-ops deck-tone-${presentation.copyTone}`} aria-label="Tycoon command topbar">
      <header className="office-top-ops-header">
        <div className="office-topbar-hero">
          <p className="office-topbar-kicker">{t("topbar.kicker")}</p>
          <h2>{t("topbar.title")}</h2>
          <p className="office-topbar-summary">{presentation.hudLabel} | {loopLabel} | {eventCause}</p>
          <div className="office-topbar-meter-row" aria-label="Tycoon meter row">
            <div className="topbar-meter">
              <span>{t("topbar.queue")}</span>
              <div className="topbar-meter-track">
                <i style={{ width: `${queueRatio}%` }} />
              </div>
            </div>
            <div className="topbar-meter">
              <span>{t("topbar.agentLoad")}</span>
              <div className="topbar-meter-track">
                <i style={{ width: `${loadRatio}%` }} />
              </div>
            </div>
            <div className="topbar-meter">
              <span>{t("topbar.throughput")}</span>
              <div className="topbar-meter-track">
                <i style={{ width: `${throughputRatio}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="office-topbar-context">
          <span>provider:{sceneSync.selectedProvider.toUpperCase()}</span>
          <span>pool:{sceneSync.selectedPoolKey || "unassigned"}</span>
          <span>profile:{sceneSync.selectedProfileKey || "none"}</span>
          <span>loop:{loopLabel}</span>
          <span>event:{eventCause}</span>
          <span>action:{sceneSync.lastActionAt}</span>
        </div>
      </header>

      <div className="office-top-ops-grid">
        <article className="card compact office-topbar-card">
          <strong>{t("topbar.providerGrid")}</strong>
          <p>
            {cliReadyCount}/{providers.length} {t("topbar.cliReady")}
          </p>
          <p className="hint">{t("topbar.confidence")}: {presentation.confidenceHint}</p>
        </article>

        <article className="card compact office-topbar-card">
          <strong>{t("topbar.resourceTanks")}</strong>
          <p>
            {t("topbar.pools")} {enabledPoolCount}/{pools.length}
          </p>
          <p>
            {t("topbar.profiles")} {enabledProfileCount}/{profiles.length}
          </p>
        </article>

        <article className="card compact office-topbar-card">
          <strong>{t("topbar.probeSignal")}</strong>
          <p>
            <ProbeStateBadge state={latestProbeState} />
          </p>
          <p className="mono">{latestProbeRun?.finishedAt ?? latestProbeRun?.startedAt ?? "-"}</p>
        </article>

        <article className="card compact office-topbar-card office-topbar-actions">
          <strong>{t("topbar.commandShortcuts")}</strong>
          <div className="row-actions">
            <button type="button" onClick={onRunProbe} disabled={isProbeRunning}>
              {isProbeRunning ? t("topbar.running") : t("topbar.runProbe")}
            </button>
            <button type="button" className="secondary" onClick={onRefreshHistory} disabled={isProbeRunning}>
              {t("topbar.refreshHistory")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={sceneSync.isPaused ? onResumeSim : onPauseSim}
            >
              {sceneSync.isPaused ? t("topbar.resumeSim") : t("topbar.pauseSim")}
            </button>
            <button
              type="button"
              className={`secondary sim-speed-chip${sceneSync.simSpeed === "1x" ? " active" : ""}`}
              onClick={() => onSetSimSpeed("1x")}
            >
              1x
            </button>
            <button
              type="button"
              className={`secondary sim-speed-chip${sceneSync.simSpeed === "2x" ? " active" : ""}`}
              onClick={() => onSetSimSpeed("2x")}
            >
              2x
            </button>
            <button
              type="button"
              className={`secondary sim-speed-chip${sceneSync.simSpeed === "4x" ? " active" : ""}`}
              onClick={() => onSetSimSpeed("4x")}
            >
              4x
            </button>
          </div>
        </article>
      </div>

      <div className="office-kpi-strip" aria-label="Tycoon KPI">
        <span>{t("topbar.kpi.throughput")}: {sceneSync.kpi.throughput}</span>
        <span>{t("topbar.kpi.queue")}: {sceneSync.kpi.queueDepth}</span>
        <span>{t("topbar.kpi.sla")}: {sceneSync.kpi.slaRisk}</span>
        <span>{t("topbar.kpi.load")}: {sceneSync.kpi.avgAgentLoad}%</span>
        <span>{t("topbar.kpi.probe")}: {presentation.confidenceHint}</span>
        <span>{t("topbar.kpi.sim")}: {sceneSync.simSpeed}</span>
        <span>{t("topbar.kpi.event")}: {eventCause}</span>
      </div>
    </section>
  );
}
