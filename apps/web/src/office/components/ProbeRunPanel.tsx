import type { ProviderProbeRunView } from "@workspace/shared";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";
import type { ProbeUiState } from "../lib/probe-ui-state";
import { ProbeStateBadge } from "./ProbeStateBadge";

type ProbeRunPanelProps = {
  provider: string;
  accountPoolId: string;
  runtimeProfileId: string;
  latestProbeRun: ProviderProbeRunView | null;
  latestProbeState: ProbeUiState;
  isRunning: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  onRun: () => void;
  t?: OfficeTranslator;
};

export function ProbeRunPanel({
  provider,
  accountPoolId,
  runtimeProfileId,
  latestProbeRun,
  latestProbeState,
  isRunning,
  errorMessage,
  actionMessage,
  onRun,
  t = createOfficeTranslator("en")
}: ProbeRunPanelProps): JSX.Element {
  return (
    <section className="card office-widget">
      <header>
        <h2>{t("widget.probe.title")}</h2>
      </header>

      <p>{t("widget.probe.provider")}: {provider}</p>
      <p>{t("widget.probe.pool")}: {accountPoolId || "-"}</p>
      <p>{t("widget.probe.profile")}: {runtimeProfileId || "-"}</p>

      <div className="row-actions">
        <button type="button" onClick={onRun} disabled={isRunning}>
          {isRunning ? t("topbar.running") : t("topbar.runProbe")}
        </button>
        <button type="button" className="secondary" onClick={onRun} disabled={isRunning}>
          {isRunning ? t("topbar.running") : t("widget.probe.retry")}
        </button>
      </div>

      {errorMessage ? (
        <p className="error">{errorMessage} Retry probe after checking provider/pool/profile selection.</p>
      ) : null}
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}

      <div className="card compact">
        <strong>{t("widget.probe.latest")}</strong>
        <p>
          <ProbeStateBadge state={latestProbeState} />
        </p>
        <p>status: {latestProbeRun?.status ?? "-"}</p>
        <p>precision: {latestProbeRun?.precision ?? "-"}</p>
        <p>degraded: {latestProbeRun?.degraded ? "true" : "false"}</p>
        <p className="mono">at: {latestProbeRun?.finishedAt ?? latestProbeRun?.startedAt ?? "-"}</p>
      </div>
    </section>
  );
}
