import type { AccountPoolView, ProviderUsageProbeProvider } from "@workspace/shared";

type AccountPoolWidgetProps = {
  pools: AccountPoolView[];
  selectedProvider: ProviderUsageProbeProvider;
  selectedAccountPoolId: string;
  onSelectProvider: (provider: ProviderUsageProbeProvider) => void;
  onSelectAccountPool: (accountPoolId: string) => void;
};

const providers: ProviderUsageProbeProvider[] = ["claude", "codex", "gemini"];

export function AccountPoolWidget({
  pools,
  selectedProvider,
  selectedAccountPoolId,
  onSelectProvider,
  onSelectAccountPool
}: AccountPoolWidgetProps): JSX.Element {
  const filteredPools = pools.filter((pool) => pool.provider === selectedProvider);
  const selectedPool =
    filteredPools.find((pool) => pool.id === selectedAccountPoolId) ??
    filteredPools[0] ??
    null;

  return (
    <section className="card office-widget">
      <header>
        <h2>Account Pools</h2>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>Provider</span>
          <select
            value={selectedProvider}
            onChange={(event) => onSelectProvider(event.target.value as ProviderUsageProbeProvider)}
          >
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Pool</span>
          <select
            value={selectedAccountPoolId}
            onChange={(event) => onSelectAccountPool(event.target.value)}
          >
            <option value="">(none)</option>
            {filteredPools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card compact">
        <strong>Selected Pool Detail</strong>
        {selectedPool ? (
          <>
            <p>key: {selectedPool.key}</p>
            <p>label: {selectedPool.label}</p>
            <p>tier: {selectedPool.planTier ?? "-"}</p>
            <p>fatigue mode: {selectedPool.fatigueMode}</p>
            <p>
              latest fatigue:{" "}
              {selectedPool.latestFatigue
                ? `${selectedPool.latestFatigue.normalizedPercent.toFixed(1)}% (${selectedPool.latestFatigue.fatigueState})`
                : "unknown"}
            </p>
          </>
        ) : (
          <p>No pool is selected. Choose a provider and pool to inspect fatigue details.</p>
        )}
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Fatigue</th>
              <th>State</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {filteredPools.map((pool) => (
              <tr key={pool.id}>
                <td>{pool.key}</td>
                <td>{pool.latestFatigue ? `${pool.latestFatigue.normalizedPercent.toFixed(1)}%` : "-"}</td>
                <td>{pool.latestFatigue?.fatigueState ?? "unknown"}</td>
                <td>{pool.isEnabled ? "enabled" : "disabled"}</td>
              </tr>
            ))}
            {filteredPools.length === 0 ? (
              <tr>
                <td colSpan={4}>No account pools for selected provider. Add one in Admin Account Pools.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
