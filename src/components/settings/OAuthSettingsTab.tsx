import GitHubOAuthAppConfig from "./GitHubOAuthAppConfig";
import GoogleOAuthAppConfig from "./GoogleOAuthAppConfig";
import OAuthConnectCards from "./OAuthConnectCards";
import OAuthConnectedProvidersSection from "./OAuthConnectedProvidersSection";
import { OAUTH_INFO } from "./constants";
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
  return (
    <section className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {t({ ko: "OAuth 인증 현황", en: "OAuth Status", ja: "OAuth 認証状態", zh: "OAuth 认证状态" })}
        </h3>
        <button onClick={onRefresh} className="text-xs text-blue-400 transition-colors hover:text-blue-300">
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
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
              ? `${t({ ko: "OAuth 연결 실패", en: "OAuth connection failed", ja: "OAuth 接続失敗", zh: "OAuth 连接失败" })}: ${oauthResult.error}`
              : `${OAUTH_INFO[oauthResult.provider || ""]?.label || oauthResult.provider} ${t({ ko: "연결 완료", en: "connected", ja: "接続完了", zh: "连接成功" })}`}
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
          <span>
            {oauthStatus.storageReady
              ? t({
                  ko: "OAuth 저장소 활성화 (암호화 키 설정됨)",
                  en: "OAuth storage is active (encryption key configured)",
                  ja: "OAuth ストレージ有効（暗号化キー設定済み）",
                  zh: "OAuth 存储已启用（已配置加密密钥）",
                })
              : t({
                  ko: "OAUTH_ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다.",
                  en: "OAUTH_ENCRYPTION_SECRET is not set.",
                  ja: "OAUTH_ENCRYPTION_SECRET が設定されていません。",
                  zh: "未设置 OAUTH_ENCRYPTION_SECRET。",
                })}
          </span>
        </div>
      )}

      {oauthLoading ? (
        <div className="py-8 text-center text-sm text-slate-500">
          {t({ ko: "로딩 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
        </div>
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
