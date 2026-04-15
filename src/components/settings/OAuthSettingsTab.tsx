import GitHubOAuthAppConfig from "./GitHubOAuthAppConfig";
import GoogleOAuthAppConfig from "./GoogleOAuthAppConfig";
import OAuthConnectCards from "./OAuthConnectCards";
import OAuthConnectedProvidersSection from "./OAuthConnectedProvidersSection";
import { OAUTH_INFO } from "./constants";
import { getOauthSettingsCopy, getSettingsCommonCopy } from "./settings-copy";
import type { DeviceCodeStart } from "../../api";
import type { OAuthCallbackResultLike, OAuthCommonProps, TFunction } from "./types";

type OAuthSettingsTabProps = Omit<OAuthCommonProps, "oauthStatus"> & {
  t: TFunction;
  oauthLoading: boolean;
  oauthStatus: OAuthCommonProps["oauthStatus"] | null;
  oauthResult?: OAuthCallbackResultLike | null;
  onOauthResultClear?: () => void;
  onRefresh: () => void;
  deviceCode: DeviceCodeStart | null;
  deviceStatus: string | null;
  deviceError: string | null;
  onStartDeviceCodeFlow: () => Promise<void>;
};

export default function OAuthSettingsTab({
  t,
  localeTag,
  form,
  setForm,
  persistSettings,
  oauthLoading,
  oauthStatus,
  oauthResult,
  onOauthResultClear,
  onRefresh,
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
  deviceCode,
  deviceStatus,
  deviceError,
  onStartDeviceCodeFlow,
}: OAuthSettingsTabProps) {
  const common = getSettingsCommonCopy(t);
  const copy = getOauthSettingsCopy(t);

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{copy.title}</h3>
        <button onClick={onRefresh} className="text-xs text-blue-400 transition-colors hover:text-blue-300">
          {common.refresh}
        </button>
      </div>

      {oauthResult && (
        <div
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
            oauthResult.error
              ? "border-red-500/20 bg-red-500/10 text-red-400"
              : "border-green-500/20 bg-green-500/10 text-green-400"
          }`}
        >
          <span>
            {oauthResult.error
              ? `${copy.connectFailed}: ${oauthResult.error}`
              : `${OAUTH_INFO[oauthResult.provider || ""]?.label || oauthResult.provider} ${copy.connected}`}
          </span>
          <button onClick={() => onOauthResultClear?.()} className="ml-2 text-xs opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {oauthStatus && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            oauthStatus.storageReady
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
          }`}
        >
          <span>{oauthStatus.storageReady ? "OK" : "WARN"}</span>
          <span>{oauthStatus.storageReady ? copy.storageReady : copy.storageMissing}</span>
        </div>
      )}

      {oauthLoading ? (
        <div className="py-8 text-center text-sm text-slate-500">{common.loading}</div>
      ) : oauthStatus ? (
        <>
          <OAuthConnectedProvidersSection
            t={t}
            localeTag={localeTag}
            form={form}
            setForm={setForm}
            persistSettings={persistSettings}
            oauthStatus={oauthStatus}
            models={models}
            modelsLoading={modelsLoading}
            refreshing={refreshing}
            disconnecting={disconnecting}
            savingAccountId={savingAccountId}
            accountDrafts={accountDrafts}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onRefreshToken={onRefreshToken}
            onUpdateAccountDraft={onUpdateAccountDraft}
            onActivateAccount={onActivateAccount}
            onSaveAccount={onSaveAccount}
            onToggleAccount={onToggleAccount}
            onDeleteAccount={onDeleteAccount}
          />

          <OAuthConnectCards
            t={t}
            oauthStatus={oauthStatus}
            deviceCode={deviceCode}
            deviceStatus={deviceStatus}
            deviceError={deviceError}
            onConnect={onConnect}
            onStartDeviceCodeFlow={onStartDeviceCodeFlow}
          />

          <GoogleOAuthAppConfig t={t} />
          <GitHubOAuthAppConfig t={t} />
        </>
      ) : null}
    </section>
  );
}
