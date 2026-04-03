import type {
  AccountPoolView,
  ProviderProbeRunView,
  ProviderProbeView,
  RuntimeProfileView
} from "@workspace/shared";

import type { ProbeUiState } from "../lib/probe-ui-state";
import { ProbeStateBadge } from "./ProbeStateBadge";

type TopOpsBarProps = {
  providers: ProviderProbeView[];
  pools: AccountPoolView[];
  profiles: RuntimeProfileView[];
  latestProbeRun: ProviderProbeRunView | null;
  latestProbeState: ProbeUiState;
};

export function TopOpsBar({
  providers,
  pools,
  profiles,
  latestProbeRun,
  latestProbeState
}: TopOpsBarProps): JSX.Element {
  const cliReadyCount = providers.filter((provider) => provider.cliInstalled).length;
  const enabledPoolCount = pools.filter((pool) => pool.isEnabled).length;
  const enabledProfileCount = profiles.filter((profile) => profile.isEnabled).length;

  return (
    <section className="office-top-ops">
      <article className="card compact">
        <strong>Providers</strong>
        <p>
          {cliReadyCount}/{providers.length} CLI ready
        </p>
      </article>

      <article className="card compact">
        <strong>Account Pools</strong>
        <p>
          {enabledPoolCount}/{pools.length} enabled
        </p>
      </article>

      <article className="card compact">
        <strong>Runtime Profiles</strong>
        <p>
          {enabledProfileCount}/{profiles.length} enabled
        </p>
      </article>

      <article className="card compact">
        <strong>Latest Probe</strong>
        <p>
          <ProbeStateBadge state={latestProbeState} />
        </p>
        <p className="mono">{latestProbeRun?.finishedAt ?? latestProbeRun?.startedAt ?? "-"}</p>
      </article>
    </section>
  );
}
