import GitHubOAuthAppConfig from "./GitHubOAuthAppConfig";
import OAuthConnectCards from "./OAuthConnectCards";
import OAuthConnectedProvidersSection from "./OAuthConnectedProvidersSection";
import { OAUTH_INFO } from "./constants";
import type {
  DeviceCodeStart,
  OfficeExecutionProvider,
  OfficeOAuthSessionStatus,
  OfficeRunnerQueueItemView,
  OfficeRunnerStatusView,
} from "../../api";
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
  officeExecutionProviders: OfficeExecutionProvider[];
  officeOauthSessions: OfficeOAuthSessionStatus[];
  officeRunners: OfficeRunnerStatusView[];
  officeRunnerQueue: OfficeRunnerQueueItemView[];
  officeRunnerBusyKey: string | null;
  runnerMeta: { maxActive: number; idleTtlMs: number; dockerEnabled: boolean };
  runnerPoolDrafts: Record<OfficeExecutionProvider, string>;
  onRunnerPoolDraftChange: (provider: OfficeExecutionProvider, value: string) => void;
  onConnectRunnerOAuth: (provider: OfficeExecutionProvider) => Promise<void>;
  onDisconnectRunnerOAuth: (provider: OfficeExecutionProvider) => Promise<void>;
  onActivateRunner: (provider: OfficeExecutionProvider) => Promise<void>;
  onDeactivateRunner: (provider: OfficeExecutionProvider) => Promise<void>;
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
  officeExecutionProviders,
  officeOauthSessions,
  officeRunners,
  officeRunnerQueue,
  officeRunnerBusyKey,
  runnerMeta,
  runnerPoolDrafts,
  onRunnerPoolDraftChange,
  onConnectRunnerOAuth,
  onDisconnectRunnerOAuth,
  onActivateRunner,
  onDeactivateRunner,
}: OAuthSettingsTabProps) {
  const queueTopFive = officeRunnerQueue.slice(0, 5);

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {t({ ko: "OAuth 인증 현황", en: "OAuth Status", ja: "OAuth 認証状態", zh: "OAuth 认证状态" })}
        </h3>
        <button onClick={onRefresh} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          🔄 {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
        </button>
      </div>

      {oauthResult && (
        <div
          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
            oauthResult.error
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-green-500/10 text-green-400 border border-green-500/20"
          }`}
        >
          <span>
            {oauthResult.error
              ? `${t({ ko: "OAuth 연결 실패", en: "OAuth connection failed", ja: "OAuth 接続失敗", zh: "OAuth 连接失败" })}: ${oauthResult.error}`
              : `${OAUTH_INFO[oauthResult.provider || ""]?.label || oauthResult.provider} ${t({ ko: "연결 완료!", en: "connected!", ja: "接続完了!", zh: "连接成功!" })}`}
          </span>
          <button onClick={() => onOauthResultClear?.()} className="text-xs opacity-60 hover:opacity-100 ml-2">
            ✕
          </button>
        </div>
      )}

      {oauthStatus && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            oauthStatus.storageReady
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
          }`}
        >
          <span>{oauthStatus.storageReady ? "🔒" : "⚠️"}</span>
          <span>
            {oauthStatus.storageReady
              ? t({
                  ko: "OAuth 저장소 활성화됨 (암호화 키 설정됨)",
                  en: "OAuth storage is active (encryption key configured)",
                  ja: "OAuth ストレージ有効（暗号化キー設定済み）",
                  zh: "OAuth 存储已启用（已配置加密密钥）",
                })
              : t({
                  ko: "OAUTH_ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다",
                  en: "OAUTH_ENCRYPTION_SECRET environment variable is not set",
                  ja: "OAUTH_ENCRYPTION_SECRET 環境変数が設定されていません",
                  zh: "未设置 OAUTH_ENCRYPTION_SECRET 环境变量",
                })}
          </span>
        </div>
      )}

      {oauthLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">
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

          <GitHubOAuthAppConfig t={t} />
        </>
      ) : null}

      <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            {t({ ko: "Runner/OAuth(??)", en: "Runner OAuth Gate", ja: "Runner OAuth Gate", zh: "Runner OAuth 閹?" })}
          </h4>
          <span className="text-[11px] text-slate-400">
            {t({ ko: "Active", en: "Active", ja: "Active", zh: "Active" })}:{" "}
            {officeRunners.filter((row) => row.status === "active").length}/{runnerMeta.maxActive}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          {t({ ko: "Idle TTL", en: "Idle TTL", ja: "Idle TTL", zh: "Idle TTL" })}:{" "}
          {Math.round(runnerMeta.idleTtlMs / 1000)}s / Docker {runnerMeta.dockerEnabled ? "on" : "off"}
        </div>

        <div className="space-y-2">
          {officeExecutionProviders.map((provider) => {
            const accountPoolId = (runnerPoolDrafts[provider] || "default").trim() || "default";
            const session = officeOauthSessions.find(
              (row) => row.provider === provider && row.account_pool_id === accountPoolId,
            );
            const runner = officeRunners.find(
              (row) => row.provider === provider && row.accountPoolId === accountPoolId,
            );
            const busyPrefix = `${provider}:${accountPoolId}`;
            const isBusy = typeof officeRunnerBusyKey === "string" && officeRunnerBusyKey.startsWith(busyPrefix);
            const queuedCount = officeRunnerQueue.filter(
              (item) => item.provider === provider && item.accountPoolId === accountPoolId && item.status === "queued",
            ).length;

            return (
              <div key={provider} className="rounded border border-slate-700/70 bg-slate-950/40 p-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
                  <div className="text-xs font-medium text-slate-200">{provider}</div>
                  <input
                    value={runnerPoolDrafts[provider] ?? "default"}
                    onChange={(event) => onRunnerPoolDraftChange(provider, event.target.value)}
                    placeholder="default"
                    className="w-full rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    OAuth:{" "}
                    <strong className={session?.status === "connected" ? "text-emerald-300" : "text-amber-300"}>
                      {session?.status ?? "disconnected"}
                    </strong>
                  </span>
                  <span>
                    Runner: <strong className="text-slate-200">{runner?.status ?? "none"}</strong>
                  </span>
                  <span>
                    Queue: <strong className="text-slate-200">{queuedCount}</strong>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    disabled={isBusy}
                    onClick={() => void onConnectRunnerOAuth(provider)}
                    className="text-[11px] px-2 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 disabled:opacity-50"
                  >
                    Connect
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => void onDisconnectRunnerOAuth(provider)}
                    className="text-[11px] px-2 py-1 rounded bg-slate-700/70 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => void onActivateRunner(provider)}
                    className="text-[11px] px-2 py-1 rounded bg-blue-600/25 hover:bg-blue-600/40 text-blue-200 disabled:opacity-50"
                  >
                    Activate
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => void onDeactivateRunner(provider)}
                    className="text-[11px] px-2 py-1 rounded bg-orange-600/25 hover:bg-orange-600/40 text-orange-200 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded border border-slate-700/70 bg-slate-900/40 p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
            Queue Top 5
          </div>
          {queueTopFive.length === 0 ? (
            <div className="text-[11px] text-slate-500">No queued jobs</div>
          ) : (
            <div className="space-y-1">
              {queueTopFive.map((item) => (
                <div key={item.id} className="text-[11px] text-slate-300 flex items-center justify-between gap-2">
                  <span className="truncate">
                    {item.provider}:{item.accountPoolId}
                  </span>
                  <span className="text-slate-400">{item.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
