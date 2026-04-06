import { getCharacterSpritePath } from "../board/pixel-atlas";
import type { AgentMonitorEntry } from "../board/scene-types";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type AgentMonitorGridProps = {
  entries: AgentMonitorEntry[];
  providerLabel: string;
  t?: OfficeTranslator;
};

const formatUsage = (value: number): string => {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
};

const getFatigueTone = (value: number): "fresh" | "warm" | "hot" | "critical" => {
  // Aggressive thresholds tuned to reach hot/critical earlier (claw-empire style).
  if (value >= 65) {
    return "critical";
  }
  if (value >= 45) {
    return "hot";
  }
  if (value >= 25) {
    return "warm";
  }
  return "fresh";
};

const getFatigueLabel = (value: number, t: OfficeTranslator): string => {
  const tone = getFatigueTone(value);
  const keyMap = {
    fresh: "board.fatigue.fresh",
    warm: "board.fatigue.warm",
    hot: "board.fatigue.hot",
    critical: "board.fatigue.critical"
  } as const;
  return t(keyMap[tone]);
};

export function AgentMonitorGrid({
  entries,
  providerLabel,
  t = createOfficeTranslator("en")
}: AgentMonitorGridProps): JSX.Element {
  return (
    <section className="office-monitor-grid-shell card compact" aria-label={t("board.agentMonitorTitle")}>
      <header className="office-monitor-grid-header">
        <div>
          <h2>{t("board.agentMonitorTitle")}</h2>
          <p className="hint">{providerLabel}</p>
        </div>
      </header>
      <div className="office-monitor-grid" data-testid="center-agent-monitor-grid">
        {entries.map((entry) => (
          <article key={entry.id} className="office-monitor-card" data-testid="center-agent-monitor-card">
            <div className="office-monitor-avatar-rail">
              <div
                className={`office-monitor-avatar state-${entry.animState}`}
                style={{ backgroundImage: `url(${getCharacterSpritePath(entry.spriteId)})` }}
                aria-hidden="true"
              />
            </div>
            <div className="office-monitor-body">
              <div className="office-monitor-head">
                <strong className="office-monitor-name">{entry.name}</strong>
                <span className="office-monitor-role-pill">{entry.roleLabel}</span>
              </div>
              <div className="office-monitor-meta-grid">
                <p>
                  <span>{t("board.agentMonitorState")}</span>
                  <strong className={`office-monitor-state tone-${entry.animState}`}>{entry.stateLabel}</strong>
                </p>
                <p>
                  <span>{t("board.agentMonitorUsage")}</span>
                  <strong>{formatUsage(entry.usagePercent)}</strong>
                  <span
                    className="office-monitor-usage-meter"
                    role="progressbar"
                    aria-label={t("board.agentMonitorUsage")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.max(0, Math.min(100, Math.round(entry.usagePercent)))}
                  >
                    <span style={{ width: formatUsage(entry.usagePercent) }} />
                  </span>
                </p>
                <p>
                  <span>{t("board.agentMonitorFatigue")}</span>
                  <strong className={`office-monitor-fatigue tone-${getFatigueTone(entry.fatigue)}`}>
                    {formatUsage(entry.fatigue)} | {getFatigueLabel(entry.fatigue, t)}
                  </strong>
                </p>
                <p>
                  <span>{t("board.agentMonitorModel")}</span>
                  <strong>{entry.modelLabel}</strong>
                </p>
                <p>
                  <span>{t("board.agentMonitorLocation")}</span>
                  <strong>{entry.locationLabel}</strong>
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
