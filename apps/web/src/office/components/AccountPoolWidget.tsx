import type {
  AccountPoolView,
  OAuthProvider,
  OfficeRunnerQueueItemView,
  OfficeRunnerStatusView,
  OAuthSessionStatusView,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type AccountPoolWidgetProps = {
  pools: AccountPoolView[];
  selectedProvider: ProviderUsageProbeProvider;
  selectedOAuthProvider: OAuthProvider;
  selectedAccountPoolId: string;
  oauthSessionByPoolId?: Record<string, OAuthSessionStatusView>;
  runnerByPoolId?: Record<string, OfficeRunnerStatusView>;
  runnerQueueByPoolId?: Record<string, OfficeRunnerQueueItemView[]>;
  isOAuthProviderConfigured?: boolean;
  isOAuthMutating?: boolean;
  onSelectProvider: (provider: ProviderUsageProbeProvider) => void;
  onSelectOAuthProvider: (provider: OAuthProvider) => void;
  onSelectAccountPool: (accountPoolId: string) => void;
  onConnectOAuth?: (accountPoolId: string) => void;
  onDisconnectOAuth?: (accountPoolId: string) => void;
  onActivateRunner?: (provider: ProviderUsageProbeProvider, accountPoolId: string) => void;
  onDeactivateRunner?: (provider: ProviderUsageProbeProvider, accountPoolId: string) => void;
  t?: OfficeTranslator;
};

const providers: ProviderUsageProbeProvider[] = ["claude", "codex", "gemini"];
const oauthProviders: OAuthProvider[] = ["claude", "codex", "gemini", "github", "google"];

export function AccountPoolWidget({
  pools,
  selectedProvider,
  selectedOAuthProvider,
  selectedAccountPoolId,
  oauthSessionByPoolId = {},
  runnerByPoolId = {},
  runnerQueueByPoolId = {},
  isOAuthProviderConfigured = true,
  isOAuthMutating = false,
  onSelectProvider,
  onSelectOAuthProvider,
  onSelectAccountPool,
  onConnectOAuth,
  onDisconnectOAuth,
  onActivateRunner,
  onDeactivateRunner,
  t = createOfficeTranslator("en")
}: AccountPoolWidgetProps): JSX.Element {
  const filteredPools = pools.filter((pool) => pool.provider === selectedProvider);
  const selectedPool =
    filteredPools.find((pool) => pool.id === selectedAccountPoolId) ??
    filteredPools[0] ??
    null;

  return (
    <section className="card office-widget">
      <header>
        <h2>{t("widget.account.title")}</h2>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.account.provider")}</span>
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
          <span>{t("widget.account.pool")}</span>
          <select
            value={selectedAccountPoolId}
            onChange={(event) => onSelectAccountPool(event.target.value)}
          >
            <option value="">{t("widget.account.none")}</option>
            {filteredPools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.key}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid one-col">
        <label>
          <span>{t("widget.account.oauthProvider")}</span>
          <select
            value={selectedOAuthProvider}
            onChange={(event) => onSelectOAuthProvider(event.target.value as OAuthProvider)}
          >
            {oauthProviders.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card compact">
        <strong>{t("widget.account.detail")}</strong>
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
            <p>
              oauth:{" "}
              {oauthSessionByPoolId[selectedPool.id]?.status ?? "disconnected"}
            </p>
            <p>
              runner: {runnerByPoolId[selectedPool.id]?.status ?? "stopped"}
            </p>
            <p>
              queue: {runnerQueueByPoolId[selectedPool.id]?.length ?? 0}
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="secondary"
                disabled={isOAuthMutating || !isOAuthProviderConfigured}
                onClick={() => onConnectOAuth?.(selectedPool.id)}
              >
                {t("widget.account.oauthConnect")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={isOAuthMutating || !isOAuthProviderConfigured}
                onClick={() => onDisconnectOAuth?.(selectedPool.id)}
              >
                {t("widget.account.oauthDisconnect")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={isOAuthMutating || !isOAuthProviderConfigured}
                onClick={() => onActivateRunner?.(selectedProvider, selectedPool.id)}
              >
                {t("widget.account.runnerActivate")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={isOAuthMutating}
                onClick={() => onDeactivateRunner?.(selectedProvider, selectedPool.id)}
              >
                {t("widget.account.runnerDeactivate")}
              </button>
            </div>
            {isOAuthProviderConfigured ? null : (
              <p className="hint">{t("widget.account.oauthUnavailable")}</p>
            )}
          </>
        ) : (
          <p>{t("widget.account.noSelection")}</p>
        )}
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("widget.account.table.key")}</th>
              <th>{t("widget.account.table.fatigue")}</th>
              <th>{t("widget.account.table.state")}</th>
              <th>{t("widget.account.oauthStatus")}</th>
              <th>{t("widget.account.runnerStatus")}</th>
              <th>{t("widget.account.queueStatus")}</th>
              <th>{t("widget.account.table.enabled")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredPools.map((pool) => (
              <tr key={pool.id}>
                <td>{pool.key}</td>
                <td>{pool.latestFatigue ? `${pool.latestFatigue.normalizedPercent.toFixed(1)}%` : "-"}</td>
                <td>{pool.latestFatigue?.fatigueState ?? "unknown"}</td>
                <td>{oauthSessionByPoolId[pool.id]?.status ?? "disconnected"}</td>
                <td>{runnerByPoolId[pool.id]?.status ?? "stopped"}</td>
                <td>{runnerQueueByPoolId[pool.id]?.length ?? 0}</td>
                <td>{pool.isEnabled ? t("widget.account.enabled") : t("widget.account.disabled")}</td>
              </tr>
            ))}
            {filteredPools.length === 0 ? (
              <tr>
                <td colSpan={7}>{t("widget.account.empty")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
