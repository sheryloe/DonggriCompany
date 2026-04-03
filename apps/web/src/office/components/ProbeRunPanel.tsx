import type { ProviderProbeRunView } from "@workspace/shared";

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
  onRun
}: ProbeRunPanelProps): JSX.Element {
  return (
    <section className="card office-widget">
      <header>
        <h2>Provider Probe</h2>
      </header>

      <p>provider: {provider}</p>
      <p>account pool: {accountPoolId || "-"}</p>
      <p>runtime profile: {runtimeProfileId || "-"}</p>

      <div className="row-actions">
        <button type="button" onClick={onRun} disabled={isRunning}>
          {isRunning ? "Running..." : "Run Probe"}
        </button>
        <button type="button" className="secondary" onClick={onRun} disabled={isRunning}>
          {isRunning ? "Running..." : "Retry Probe"}
        </button>
      </div>

      {errorMessage ? (
        <p className="error">{errorMessage} Retry probe after checking provider/pool/profile selection.</p>
      ) : null}
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}

      <div className="card compact">
        <strong>Latest Result</strong>
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
