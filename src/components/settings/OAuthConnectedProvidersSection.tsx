import type { OAuthConnectProvider } from "../../api";
import { OAUTH_INFO } from "./constants";
import { AntigravityLogo, GitHubCopilotLogo } from "./Logos";
import { getOauthSettingsCopy, getSettingsCommonCopy } from "./settings-copy";
import type { OAuthCommonProps } from "./types";

export default function OAuthConnectedProvidersSection({
  t,
  localeTag,
  form,
  setForm,
  persistSettings,
  oauthStatus,
  models,
  modelsLoading,
  refreshing,
  disconnecting,
  savingAccountId,
  accountDrafts,
  onConnect,
  onDisconnect,
  onRefreshToken,
  onUpdateAccountDraft,
  onActivateAccount,
  onSaveAccount,
  onToggleAccount,
  onDeleteAccount,
}: OAuthCommonProps) {
  const common = getSettingsCommonCopy(t);
  const copy = getOauthSettingsCopy(t);
  const detectedProviders = Object.entries(oauthStatus.providers).filter(([, info]) =>
    Boolean(info.detected ?? info.connected),
  );
  if (detectedProviders.length === 0) return null;

  const logoMap: Record<string, ({ className }: { className?: string }) => React.ReactElement> = {
    "github-copilot": GitHubCopilotLogo,
    antigravity: AntigravityLogo,
  };

  return (
    <div className="space-y-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{copy.connectionStatus}</div>

      {detectedProviders.map(([provider, info]) => {
        const oauthInfo = OAUTH_INFO[provider];
        const LogoComp = logoMap[provider];
        const expiresAt = info.expires_at ? new Date(info.expires_at) : null;
        const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
        const isWebOAuth = info.source === "web-oauth";
        const isFileDetected = info.source === "file-detected";
        const isRunnable = Boolean(info.executionReady ?? info.connected);
        const accountList = info.accounts ?? [];
        const modelKey = provider === "github-copilot" ? "copilot" : provider === "antigravity" ? "antigravity" : null;
        const modelList = modelKey ? (models?.[modelKey] ?? []) : [];
        const providerDefaultModel = modelKey ? form.providerModelConfig?.[modelKey]?.model || "" : "";

        return (
          <div key={provider} className="space-y-2 overflow-hidden rounded-lg bg-slate-700/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                {LogoComp ? <LogoComp className="h-5 w-5" /> : null}
                <span className="text-sm font-medium text-white">{oauthInfo?.label ?? provider}</span>
                {info.email && <span className="max-w-full break-all text-xs text-slate-400">{info.email}</span>}
                {isFileDetected && (
                  <span className="rounded bg-slate-600/50 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {copy.cliDetected}
                  </span>
                )}
                {isWebOAuth && (
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">Web OAuth</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {!isRunnable ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                    {copy.detectedNotRunnable}
                  </span>
                ) : !isExpired ? (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                    {info.lastRefreshed ? copy.autoRefreshed : copy.connected}
                  </span>
                ) : info.refreshFailed ? (
                  <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-400">
                    {copy.refreshFailed}
                  </span>
                ) : !info.hasRefreshToken ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                    {copy.expiredReauth}
                  </span>
                ) : (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">{copy.expired}</span>
                )}

                {info.hasRefreshToken && isWebOAuth && (
                  <button
                    onClick={() => void onRefreshToken(provider as OAuthConnectProvider)}
                    disabled={refreshing === provider}
                    className="rounded-lg border border-blue-500/30 bg-blue-600/20 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-600/30 disabled:opacity-50"
                  >
                    {refreshing === provider ? "Refreshing..." : common.refresh}
                  </button>
                )}

                {isExpired && !info.hasRefreshToken && isWebOAuth && (
                  <button
                    onClick={() => onConnect(provider as OAuthConnectProvider)}
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white transition-colors hover:bg-blue-500"
                  >
                    {copy.reconnect}
                  </button>
                )}

                {isWebOAuth && (
                  <button
                    onClick={() => void onDisconnect(provider as OAuthConnectProvider)}
                    disabled={disconnecting === provider}
                    className="rounded-lg border border-red-500/30 bg-red-600/20 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                  >
                    {disconnecting === provider ? copy.disconnecting : copy.disconnect}
                  </button>
                )}
              </div>
            </div>

            {info.requiresWebOAuth && (
              <div className="rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                {copy.cliCredentialWarning}
              </div>
            )}

            {(info.scope || expiresAt || info.created_at > 0) && (
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {info.scope && (
                  <div className="col-span-2">
                    <span className="text-slate-500">{copy.scope}: </span>
                    <span className="break-all font-mono text-[10px] leading-relaxed text-slate-300">{info.scope}</span>
                  </div>
                )}
                {expiresAt && (
                  <div>
                    <span className="text-slate-500">{copy.expires}: </span>
                    <span className={isExpired ? "text-red-400" : "text-slate-300"}>
                      {expiresAt.toLocaleString(localeTag)}
                    </span>
                  </div>
                )}
                {info.created_at > 0 && (
                  <div>
                    <span className="text-slate-500">{copy.created}: </span>
                    <span className="text-slate-300">{new Date(info.created_at).toLocaleString(localeTag)}</span>
                  </div>
                )}
              </div>
            )}

            {modelKey && (
              <div className="flex min-w-0 flex-col items-stretch gap-1.5 pt-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="w-auto shrink-0 text-xs text-slate-400">{copy.providerDefaultModel}</span>
                {modelsLoading ? (
                  <span className="animate-pulse text-xs text-slate-500">{common.loading}</span>
                ) : modelList.length > 0 ? (
                  <select
                    value={providerDefaultModel}
                    onChange={(event) => {
                      const nextForm = {
                        ...form,
                        providerModelConfig: {
                          ...form.providerModelConfig,
                          [modelKey]: { model: event.target.value },
                        },
                      };
                      setForm(nextForm);
                      persistSettings(nextForm);
                    }}
                    className="w-full min-w-0 rounded border border-slate-600 bg-slate-700/50 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none sm:flex-1"
                  >
                    {!providerDefaultModel && <option value="">{copy.selectPlaceholder}</option>}
                    {modelList.map((model, index) => (
                      <option key={`${model}-${index}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{copy.noModelsAvailable}</span>
                    {provider === "github-copilot" && (
                      <span className="text-[11px] text-amber-400/80">{copy.copilotSubscriptionHint}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {accountList.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-600/40 bg-slate-800/40 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {copy.executionAccountPool}
                  </div>
                  <div className="text-right text-[10px] text-slate-500">{copy.accountPoolHint}</div>
                </div>

                {accountList.map((account) => {
                  const draft = accountDrafts[account.id] ?? {
                    label: account.label ?? "",
                    modelOverride: account.modelOverride ?? "",
                    priority: String(account.priority ?? 100),
                  };
                  const hasCustomOverride = Boolean(draft.modelOverride) && !modelList.includes(draft.modelOverride);

                  return (
                    <div
                      key={account.id}
                      className="space-y-2 rounded border border-slate-700/70 bg-slate-900/30 p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${account.active ? "bg-green-500/20 text-green-300" : "bg-slate-700 text-slate-400"}`}
                        >
                          {account.active ? copy.active : copy.standby}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${account.executionReady ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"}`}
                        >
                          {account.executionReady ? copy.runnable : copy.notRunnable}
                        </span>
                        {account.email && <span className="break-all text-[11px] text-slate-300">{account.email}</span>}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="space-y-1">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                            {copy.label}
                          </span>
                          <input
                            value={draft.label}
                            onChange={(event) => onUpdateAccountDraft(account.id, { label: event.target.value })}
                            placeholder={copy.accountAlias}
                            className="w-full rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                            {copy.modelOverride}
                          </span>
                          <select
                            value={draft.modelOverride}
                            onChange={(event) =>
                              onUpdateAccountDraft(account.id, { modelOverride: event.target.value })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">{copy.useProviderDefault}</option>
                            {hasCustomOverride && <option value={draft.modelOverride}>{draft.modelOverride}</option>}
                            {modelList.map((model, index) => (
                              <option key={`${model}-${index}`} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                            {copy.priority}
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.priority}
                            onChange={(event) => onUpdateAccountDraft(account.id, { priority: event.target.value })}
                            placeholder="100"
                            className="w-full rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() =>
                            void onActivateAccount(provider as OAuthConnectProvider, account.id, account.active)
                          }
                          disabled={savingAccountId === account.id || account.status !== "active"}
                          className={`rounded px-2 py-1 text-[11px] disabled:opacity-50 ${
                            account.active
                              ? "bg-orange-600/20 text-orange-200 hover:bg-orange-600/35"
                              : "bg-blue-600/30 text-blue-200 hover:bg-blue-600/45"
                          }`}
                        >
                          {account.active ? copy.poolOff : copy.poolOn}
                        </button>

                        <button
                          onClick={() => void onSaveAccount(account.id)}
                          disabled={savingAccountId === account.id}
                          className="rounded bg-emerald-600/25 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-600/40 disabled:opacity-50"
                        >
                          {copy.save}
                        </button>

                        <button
                          onClick={() =>
                            void onToggleAccount(account.id, account.status === "active" ? "disabled" : "active")
                          }
                          disabled={savingAccountId === account.id}
                          className="rounded bg-amber-600/20 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-600/35 disabled:opacity-50"
                        >
                          {account.status === "active" ? common.disable : common.enable}
                        </button>

                        <button
                          onClick={() => void onDeleteAccount(provider as OAuthConnectProvider, account.id)}
                          disabled={savingAccountId === account.id}
                          className="rounded bg-red-600/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-600/35 disabled:opacity-50"
                        >
                          {common.delete}
                        </button>
                      </div>

                      {account.lastError && (
                        <div className="break-words text-[10px] text-red-300">{account.lastError}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
