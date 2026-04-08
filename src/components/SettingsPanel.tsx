import { useCallback, useEffect, useRef, useState } from "react";
import type { CliModelInfo, CliStatusMap, CompanySettings } from "../types";
import * as api from "../api";
import type {
  DeviceCodeStart,
  OAuthConnectProvider,
  OAuthStatus,
  OfficeExecutionProvider,
  OfficeOAuthSessionStatus,
  OfficeRunnerQueueItemView,
  OfficeRunnerStatusView,
} from "../api";
import type { OAuthCallbackResult } from "../App";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, useI18n } from "../i18n";
import ApiSettingsTab from "./settings/ApiSettingsTab";
import CliSettingsTab from "./settings/CliSettingsTab";
import GatewaySettingsTab from "./settings/GatewaySettingsTab";
import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import OAuthSettingsTab from "./settings/OAuthSettingsTab";
import SettingsTabNav from "./settings/SettingsTabNav";
import type { AccountDraftMap, AccountDraftPatch, LocalSettings, SettingsTab } from "./settings/types";
import { useApiProvidersState } from "./settings/useApiProvidersState";

const OFFICE_EXECUTION_PROVIDERS: OfficeExecutionProvider[] = ["codex", "gemini", "jules"];

interface SettingsPanelProps {
  settings: CompanySettings;
  cliStatus: CliStatusMap | null;
  onSave: (settings: CompanySettings) => void;
  onRefreshCli: () => void;
  oauthResult?: OAuthCallbackResult | null;
  onOauthResultClear?: () => void;
}

export default function SettingsPanel({
  settings,
  cliStatus,
  onSave,
  onRefreshCli,
  oauthResult,
  onOauthResultClear,
}: SettingsPanelProps) {
  const [form, setForm] = useState<LocalSettings>(settings as LocalSettings);
  const { t, locale: localeTag } = useI18n(form.language);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(oauthResult ? "oauth" : "general");

  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [accountDrafts, setAccountDrafts] = useState<AccountDraftMap>({});

  const [models, setModels] = useState<Record<string, string[]> | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [cliModels, setCliModels] = useState<Record<string, CliModelInfo[]> | null>(null);
  const [cliModelsLoading, setCliModelsLoading] = useState(false);

  const [deviceCode, setDeviceCode] = useState<DeviceCodeStart | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [officeOauthSessions, setOfficeOauthSessions] = useState<OfficeOAuthSessionStatus[]>([]);
  const [officeRunners, setOfficeRunners] = useState<OfficeRunnerStatusView[]>([]);
  const [officeRunnerQueue, setOfficeRunnerQueue] = useState<OfficeRunnerQueueItemView[]>([]);
  const [officeRunnerBusyKey, setOfficeRunnerBusyKey] = useState<string | null>(null);
  const [runnerMeta, setRunnerMeta] = useState<{ maxActive: number; idleTtlMs: number; dockerEnabled: boolean }>({
    maxActive: 5,
    idleTtlMs: 900_000,
    dockerEnabled: false,
  });
  const [runnerPoolDrafts, setRunnerPoolDrafts] = useState<Record<OfficeExecutionProvider, string>>({
    codex: "default",
    gemini: "default",
    jules: "default",
  });

  const persistSettings = useCallback(
    (next: LocalSettings) => {
      onSave(next as unknown as CompanySettings);
    },
    [onSave],
  );

  const apiState = useApiProvidersState({ tab, t, settings });

  const loadOAuthStatus = useCallback(async () => {
    setOauthLoading(true);
    try {
      const next = await api.getOAuthStatus();
      setOauthStatus(next);
      setAccountDrafts((prev) => {
        const merged = { ...prev };
        for (const info of Object.values(next.providers)) {
          for (const account of info.accounts ?? []) {
            if (!merged[account.id]) {
              merged[account.id] = {
                label: account.label ?? "",
                modelOverride: account.modelOverride ?? "",
                priority: String(account.priority ?? 100),
              };
            }
          }
        }
        return merged;
      });
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const loadOfficeRunnerState = useCallback(async () => {
    const [sessions, runners, queue] = await Promise.all([
      api.getOfficeOAuthSessions(),
      api.getOfficeRunners(),
      api.getOfficeRunnerQueue(),
    ]);
    setOfficeOauthSessions(sessions);
    setOfficeRunners(runners.runners ?? []);
    setOfficeRunnerQueue(queue);
    setRunnerMeta({
      maxActive: runners.maxActive ?? 5,
      idleTtlMs: runners.idleTtlMs ?? 900_000,
      dockerEnabled: Boolean(runners.dockerEnabled),
    });
  }, []);

  const refreshOAuthTab = useCallback(() => {
    setOauthStatus(null);
    setOauthLoading(true);
    void loadOAuthStatus().catch(console.error);
    void loadOfficeRunnerState().catch(console.error);
    setModelsLoading(true);
    api
      .getOAuthModels(true)
      .then(setModels)
      .catch(console.error)
      .finally(() => setModelsLoading(false));
  }, [loadOAuthStatus, loadOfficeRunnerState]);

  const refreshCliTab = useCallback(() => {
    onRefreshCli();
    setCliModelsLoading(true);
    api
      .getCliModels(true)
      .then(setCliModels)
      .catch(console.error)
      .finally(() => setCliModelsLoading(false));
  }, [onRefreshCli]);

  useEffect(() => {
    setForm(settings as LocalSettings);
    const syncedLocale = normalizeLanguage((settings as LocalSettings).language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, syncedLocale);
    window.dispatchEvent(new Event("climpire-language-change"));
  }, [settings]);

  useEffect(() => {
    if (oauthResult) {
      setTab("oauth");
      setOauthStatus(null);
      if (!oauthResult.error) {
        setModels(null);
      }
    }
  }, [oauthResult]);

  useEffect(() => {
    if (tab === "oauth" && !oauthStatus) {
      void loadOAuthStatus().catch(console.error);
    }
  }, [tab, oauthStatus, loadOAuthStatus]);

  useEffect(() => {
    if (tab !== "oauth") return;
    void loadOfficeRunnerState().catch(console.error);
    const timer = window.setInterval(() => {
      void loadOfficeRunnerState().catch(console.error);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tab, loadOfficeRunnerState]);

  useEffect(() => {
    if (tab !== "cli" || cliModels) return;
    setCliModelsLoading(true);
    api
      .getCliModels()
      .then(setCliModels)
      .catch(console.error)
      .finally(() => setCliModelsLoading(false));
  }, [tab, cliModels]);

  useEffect(() => {
    if (tab !== "oauth" || !oauthStatus || models) return;
    const hasConnected = Object.values(oauthStatus.providers).some((provider) => provider.connected);
    if (!hasConnected) return;
    setModelsLoading(true);
    api
      .getOAuthModels()
      .then(setModels)
      .catch(console.error)
      .finally(() => setModelsLoading(false));
  }, [tab, oauthStatus, models]);

  useEffect(() => {
    if (oauthResult) {
      const timer = setTimeout(() => onOauthResultClear?.(), 8000);
      return () => clearTimeout(timer);
    }
  }, [oauthResult, onOauthResultClear]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  function handleSave() {
    const nextLocale = normalizeLanguage(form.language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event("climpire-language-change"));
    persistSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleConnect(provider: OAuthConnectProvider) {
    const redirectTo = window.location.origin + window.location.pathname;
    window.location.assign(api.getOAuthStartUrl(provider, redirectTo));
  }

  const startDeviceCodeFlow = useCallback(async () => {
    setDeviceError(null);
    setDeviceStatus(null);
    try {
      const dc = await api.startGitHubDeviceFlow();
      setDeviceCode(dc);
      setDeviceStatus("polling");
      window.open(dc.verificationUri, "_blank");

      let intervalMs = Math.max((dc.interval || 5) * 1000, 5000);
      const expiresAt = Date.now() + (dc.expiresIn || 900) * 1000;
      let stopped = false;

      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

      const poll = () => {
        if (stopped) return;
        pollTimerRef.current = setTimeout(async () => {
          if (stopped) return;
          if (Date.now() > expiresAt) {
            stopped = true;
            pollTimerRef.current = null;
            setDeviceStatus("expired");
            setDeviceCode(null);
            setDeviceError(
              t({
                ko: "코드가 만료되었습니다. 다시 시도하세요.",
                en: "Code expired. Please try again.",
                ja: "コードの有効期限が切れました。再試行してください。",
                zh: "代码已过期，请重试。",
              }),
            );
            return;
          }

          try {
            const result = await api.pollGitHubDevice(dc.stateId);
            if (result.status === "complete") {
              stopped = true;
              pollTimerRef.current = null;
              setDeviceStatus("complete");
              setDeviceCode(null);
              await loadOAuthStatus();
              return;
            } else if (result.status === "expired" || result.status === "denied") {
              stopped = true;
              pollTimerRef.current = null;
              setDeviceStatus(result.status);
              setDeviceError(
                result.status === "expired"
                  ? t({ ko: "코드가 만료되었습니다", en: "Code expired", ja: "コードの期限切れ", zh: "代码已过期" })
                  : t({
                      ko: "인증이 거부되었습니다",
                      en: "Authentication denied",
                      ja: "認証が拒否されました",
                      zh: "认证被拒绝",
                    }),
              );
              return;
            } else if (result.status === "slow_down") {
              intervalMs += 5000;
            } else if (result.status === "error") {
              stopped = true;
              pollTimerRef.current = null;
              setDeviceStatus("error");
              setDeviceError(
                result.error || t({ ko: "알 수 없는 오류", en: "Unknown error", ja: "不明なエラー", zh: "未知错误" }),
              );
              return;
            }
          } catch {
            // Network error — keep polling
          }

          poll();
        }, intervalMs);
      };

      poll();
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error));
      setDeviceStatus("error");
    }
  }, [loadOAuthStatus, t]);

  const handleDisconnect = useCallback(
    async (provider: OAuthConnectProvider) => {
      setDisconnecting(provider);
      try {
        await api.disconnectOAuth(provider);
        await loadOAuthStatus();
        if (provider === "github-copilot") {
          setDeviceCode(null);
          setDeviceStatus(null);
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        }
      } catch (error) {
        console.error("Disconnect failed:", error);
      } finally {
        setDisconnecting(null);
      }
    },
    [loadOAuthStatus],
  );

  const handleRefreshOAuthToken = useCallback(
    async (provider: OAuthConnectProvider) => {
      setRefreshing(provider);
      try {
        await api.refreshOAuthToken(provider);
        await loadOAuthStatus();
      } catch (error) {
        console.error("Manual refresh failed:", error);
      } finally {
        setRefreshing(null);
      }
    },
    [loadOAuthStatus],
  );

  const updateAccountDraft = useCallback((accountId: string, patch: AccountDraftPatch) => {
    setAccountDrafts((prev) => ({
      ...prev,
      [accountId]: {
        label: prev[accountId]?.label ?? "",
        modelOverride: prev[accountId]?.modelOverride ?? "",
        priority: prev[accountId]?.priority ?? "100",
        ...patch,
      },
    }));
  }, []);

  const handleActivateAccount = useCallback(
    async (provider: OAuthConnectProvider, accountId: string, currentlyActive: boolean) => {
      setSavingAccountId(accountId);
      try {
        await api.activateOAuthAccount(provider, accountId, currentlyActive ? "remove" : "add");
        await loadOAuthStatus();
      } catch (error) {
        console.error("Activate account failed:", error);
      } finally {
        setSavingAccountId(null);
      }
    },
    [loadOAuthStatus],
  );

  const handleSaveAccount = useCallback(
    async (accountId: string) => {
      const draft = accountDrafts[accountId];
      if (!draft) return;
      setSavingAccountId(accountId);
      try {
        await api.updateOAuthAccount(accountId, {
          label: draft.label.trim() || null,
          model_override: draft.modelOverride.trim() || null,
          priority: Number.isFinite(Number(draft.priority)) ? Math.max(1, Math.round(Number(draft.priority))) : 100,
        });
        await loadOAuthStatus();
      } catch (error) {
        console.error("Save account failed:", error);
      } finally {
        setSavingAccountId(null);
      }
    },
    [accountDrafts, loadOAuthStatus],
  );

  const handleToggleAccount = useCallback(
    async (accountId: string, nextStatus: "active" | "disabled") => {
      setSavingAccountId(accountId);
      try {
        await api.updateOAuthAccount(accountId, { status: nextStatus });
        await loadOAuthStatus();
      } catch (error) {
        console.error("Toggle account failed:", error);
      } finally {
        setSavingAccountId(null);
      }
    },
    [loadOAuthStatus],
  );

  const handleDeleteAccount = useCallback(
    async (provider: OAuthConnectProvider, accountId: string) => {
      if (
        !window.confirm(
          t({
            ko: "이 OAuth 계정을 삭제하시겠습니까?",
            en: "Delete this OAuth account?",
            ja: "この OAuth アカウントを削除しますか？",
            zh: "要删除此 OAuth 账号吗？",
          }),
        )
      ) {
        return;
      }

      setSavingAccountId(accountId);
      try {
        await api.deleteOAuthAccount(provider, accountId);
        await loadOAuthStatus();
      } catch (error) {
        console.error("Delete account failed:", error);
      } finally {
        setSavingAccountId(null);
      }
    },
    [loadOAuthStatus, t],
  );

  const updateRunnerPoolDraft = useCallback((provider: OfficeExecutionProvider, value: string) => {
    setRunnerPoolDrafts((prev) => ({ ...prev, [provider]: value }));
  }, []);

  const resolveRunnerPoolId = useCallback(
    (provider: OfficeExecutionProvider) => {
      const value = runnerPoolDrafts[provider]?.trim();
      return value && value.length > 0 ? value : "default";
    },
    [runnerPoolDrafts],
  );

  const handleConnectRunnerOAuth = useCallback(
    async (provider: OfficeExecutionProvider) => {
      const accountPoolId = resolveRunnerPoolId(provider);
      const busyKey = `${provider}:${accountPoolId}:connect`;
      setOfficeRunnerBusyKey(busyKey);
      try {
        await api.connectOfficeOAuthSession(provider, accountPoolId);
        await loadOfficeRunnerState();
      } finally {
        setOfficeRunnerBusyKey(null);
      }
    },
    [loadOfficeRunnerState, resolveRunnerPoolId],
  );

  const handleDisconnectRunnerOAuth = useCallback(
    async (provider: OfficeExecutionProvider) => {
      const accountPoolId = resolveRunnerPoolId(provider);
      const busyKey = `${provider}:${accountPoolId}:disconnect`;
      setOfficeRunnerBusyKey(busyKey);
      try {
        await api.disconnectOfficeOAuthSession(provider, accountPoolId);
        await loadOfficeRunnerState();
      } finally {
        setOfficeRunnerBusyKey(null);
      }
    },
    [loadOfficeRunnerState, resolveRunnerPoolId],
  );

  const handleActivateRunner = useCallback(
    async (provider: OfficeExecutionProvider) => {
      const accountPoolId = resolveRunnerPoolId(provider);
      const busyKey = `${provider}:${accountPoolId}:activate`;
      setOfficeRunnerBusyKey(busyKey);
      try {
        await api.activateOfficeRunner(provider, accountPoolId);
        await loadOfficeRunnerState();
      } finally {
        setOfficeRunnerBusyKey(null);
      }
    },
    [loadOfficeRunnerState, resolveRunnerPoolId],
  );

  const handleDeactivateRunner = useCallback(
    async (provider: OfficeExecutionProvider) => {
      const accountPoolId = resolveRunnerPoolId(provider);
      const busyKey = `${provider}:${accountPoolId}:deactivate`;
      setOfficeRunnerBusyKey(busyKey);
      try {
        await api.deactivateOfficeRunner(provider, accountPoolId);
        await loadOfficeRunnerState();
      } finally {
        setOfficeRunnerBusyKey(null);
      }
    },
    [loadOfficeRunnerState, resolveRunnerPoolId],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--th-text-heading)" }}>
        ⚙️ {t({ ko: "설정", en: "Settings", ja: "設定", zh: "设置" })}
      </h2>

      <SettingsTabNav tab={tab} setTab={setTab} t={t} />

      {tab === "general" && (
        <GeneralSettingsTab t={t} form={form} setForm={setForm} saved={saved} onSave={handleSave} />
      )}

      {tab === "cli" && (
        <CliSettingsTab
          t={t}
          cliStatus={cliStatus}
          cliModels={cliModels}
          cliModelsLoading={cliModelsLoading}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
          onRefresh={refreshCliTab}
        />
      )}

      {tab === "oauth" && (
        <OAuthSettingsTab
          t={t}
          localeTag={localeTag}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
          oauthLoading={oauthLoading}
          oauthStatus={oauthStatus}
          oauthResult={oauthResult}
          onOauthResultClear={onOauthResultClear}
          onRefresh={refreshOAuthTab}
          models={models}
          modelsLoading={modelsLoading}
          refreshing={refreshing}
          disconnecting={disconnecting}
          savingAccountId={savingAccountId}
          accountDrafts={accountDrafts}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onRefreshToken={handleRefreshOAuthToken}
          onUpdateAccountDraft={updateAccountDraft}
          onActivateAccount={handleActivateAccount}
          onSaveAccount={handleSaveAccount}
          onToggleAccount={handleToggleAccount}
          onDeleteAccount={handleDeleteAccount}
          deviceCode={deviceCode}
          deviceStatus={deviceStatus}
          deviceError={deviceError}
          onStartDeviceCodeFlow={startDeviceCodeFlow}
          officeExecutionProviders={OFFICE_EXECUTION_PROVIDERS}
          officeOauthSessions={officeOauthSessions}
          officeRunners={officeRunners}
          officeRunnerQueue={officeRunnerQueue}
          officeRunnerBusyKey={officeRunnerBusyKey}
          runnerMeta={runnerMeta}
          runnerPoolDrafts={runnerPoolDrafts}
          onRunnerPoolDraftChange={updateRunnerPoolDraft}
          onConnectRunnerOAuth={handleConnectRunnerOAuth}
          onDisconnectRunnerOAuth={handleDisconnectRunnerOAuth}
          onActivateRunner={handleActivateRunner}
          onDeactivateRunner={handleDeactivateRunner}
        />
      )}

      {tab === "api" && <ApiSettingsTab t={t} localeTag={localeTag} apiState={apiState} />}

      {tab === "gateway" && (
        <GatewaySettingsTab t={t} form={form} setForm={setForm} persistSettings={persistSettings} />
      )}
    </div>
  );
}
