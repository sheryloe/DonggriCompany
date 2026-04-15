import { useCallback, useEffect, useRef, useState } from "react";
import type { CliModelInfo, CliStatusMap, CompanySettings } from "../types";
import * as api from "../api";
import type {
  DeviceCodeStart,
  CliAccountPoolView,
  CliAccountVerifyResponse,
  OAuthConnectProvider,
  OAuthStatus,
  OfficeExecutionProvider,
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
import WorkflowPacksTab from "./settings/WorkflowPacksTab";
import type { AccountDraftMap, AccountDraftPatch, LocalSettings, SettingsTab } from "./settings/types";
import { useApiProvidersState } from "./settings/useApiProvidersState";

const OFFICE_EXECUTION_PROVIDERS: OfficeExecutionProvider[] = ["codex", "gemini", "claude", "jules"];

type RunnerMeta = {
  maxActive: number;
  idleTtlMs: number;
  dockerEnabled: boolean;
};

interface SettingsPanelProps {
  settings: CompanySettings;
  cliStatus: CliStatusMap | null;
  onSave: (settings: CompanySettings) => void;
  onRefreshCli: () => void;
  oauthResult?: OAuthCallbackResult | null;
  onOauthResultClear?: () => void;
}

function buildDefaultPoolSelection(): Record<OfficeExecutionProvider, string> {
  return {
    codex: "codex-main",
    gemini: "gemini-main",
    claude: "claude-main",
    jules: "jules-main",
  };
}

function pickNextPoolId(provider: OfficeExecutionProvider, pools: CliAccountPoolView[]): string {
  const base = `${provider}-main`;
  const poolIds = new Set(
    pools
      .filter((pool) => pool.provider === provider)
      .map((pool) => pool.accountPoolId.trim())
      .filter(Boolean),
  );
  if (!poolIds.has(base)) return base;
  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${base}-${index}`;
    if (!poolIds.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function providerLabel(provider: OfficeExecutionProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  if (provider === "claude") return "Claude";
  return "Jules";
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
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
  const [deviceCode, setDeviceCode] = useState<DeviceCodeStart | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [cliModels, setCliModels] = useState<Record<string, CliModelInfo[]> | null>(null);
  const [cliModelsLoading, setCliModelsLoading] = useState(false);

  const [cliAccountPools, setCliAccountPools] = useState<CliAccountPoolView[]>([]);
  const [officeRunners, setOfficeRunners] = useState<OfficeRunnerStatusView[]>([]);
  const [officeRunnerQueue, setOfficeRunnerQueue] = useState<OfficeRunnerQueueItemView[]>([]);
  const [runnerMeta, setRunnerMeta] = useState<RunnerMeta>({
    maxActive: 5,
    idleTtlMs: 900_000,
    dockerEnabled: false,
  });
  const [cliAuthBusyKey, setCliAuthBusyKey] = useState<string | null>(null);
  const [selectedPoolByProvider, setSelectedPoolByProvider] =
    useState<Record<OfficeExecutionProvider, string>>(buildDefaultPoolSelection());

  const cliPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const devicePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const refreshOAuthTab = useCallback(() => {
    setOauthStatus(null);
    setOauthLoading(true);
    void loadOAuthStatus().catch((error) => {
      console.error("Failed to refresh OAuth status:", error);
    });
    setModelsLoading(true);
    api
      .getOAuthModels(true)
      .then(setModels)
      .catch((error) => {
        console.error("Failed to refresh OAuth models:", error);
      })
      .finally(() => setModelsLoading(false));
  }, [loadOAuthStatus]);

  const loadCliAccountLayer = useCallback(async () => {
    const [pools, runners, queue] = await Promise.all([
      api.getCliAccountPools(),
      api.getOfficeRunners(),
      api.getOfficeRunnerQueue(),
    ]);
    setCliAccountPools(pools);
    setOfficeRunners(runners.runners ?? []);
    setOfficeRunnerQueue(queue);
    setRunnerMeta({
      maxActive: runners.maxActive ?? 5,
      idleTtlMs: runners.idleTtlMs ?? 900_000,
      dockerEnabled: Boolean(runners.dockerEnabled),
    });
    setSelectedPoolByProvider((prev) => {
      const next = { ...prev };
      for (const provider of OFFICE_EXECUTION_PROVIDERS) {
        const poolIds = pools
          .filter((row) => row.provider === provider)
          .map((row) => row.accountPoolId)
          .filter(Boolean);
        if (poolIds.length === 0) {
          next[provider] = `${provider}-main`;
          continue;
        }
        const selected = prev[provider];
        next[provider] = selected && poolIds.includes(selected) ? selected : poolIds[0];
      }
      return next;
    });
  }, []);

  const refreshCliTab = useCallback(() => {
    onRefreshCli();
    setCliModelsLoading(true);
    api
      .getCliModels(true)
      .then(setCliModels)
      .catch((error) => {
        console.error("Failed to load CLI models:", error);
      })
      .finally(() => setCliModelsLoading(false));
    void loadCliAccountLayer().catch((error) => {
      console.error("Failed to load CLI account layer:", error);
    });
  }, [loadCliAccountLayer, onRefreshCli]);

  useEffect(() => {
    setForm(settings as LocalSettings);
    const syncedLocale = normalizeLanguage((settings as LocalSettings).language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, syncedLocale);
    window.dispatchEvent(new Event("climpire-language-change"));
  }, [settings]);

  useEffect(() => {
    if (!oauthResult) return;
    setTab("oauth");
    setOauthStatus(null);
    if (!oauthResult.error) {
      setModels(null);
    }
  }, [oauthResult]);

  useEffect(() => {
    if (tab === "oauth" && !oauthStatus) {
      void loadOAuthStatus().catch((error) => {
        console.error("Failed to load OAuth status:", error);
      });
    }
  }, [tab, oauthStatus, loadOAuthStatus]);

  useEffect(() => {
    if (tab !== "oauth" || !oauthStatus || models) return;
    const hasConnected = Object.values(oauthStatus.providers).some((provider) => provider.connected);
    if (!hasConnected) return;
    setModelsLoading(true);
    api
      .getOAuthModels()
      .then(setModels)
      .catch((error) => {
        console.error("Failed to load OAuth models:", error);
      })
      .finally(() => setModelsLoading(false));
  }, [tab, oauthStatus, models]);

  useEffect(() => {
    if (!oauthResult) return;
    const timer = setTimeout(() => onOauthResultClear?.(), 8000);
    return () => clearTimeout(timer);
  }, [oauthResult, onOauthResultClear]);

  useEffect(() => {
    if (tab !== "cli") return;

    if (!cliModels) {
      setCliModelsLoading(true);
      api
        .getCliModels()
        .then(setCliModels)
        .catch((error) => {
          console.error("Failed to load CLI models:", error);
        })
        .finally(() => setCliModelsLoading(false));
    }

    void loadCliAccountLayer().catch((error) => {
      console.error("Failed to load CLI account layer:", error);
    });

    if (cliPollTimerRef.current) {
      clearInterval(cliPollTimerRef.current);
    }
    cliPollTimerRef.current = setInterval(() => {
      void loadCliAccountLayer().catch((error) => {
        console.error("Failed to refresh CLI account layer:", error);
      });
    }, 5000);

    return () => {
      if (cliPollTimerRef.current) {
        clearInterval(cliPollTimerRef.current);
        cliPollTimerRef.current = null;
      }
    };
  }, [tab, cliModels, loadCliAccountLayer]);

  useEffect(() => {
    return () => {
      if (cliPollTimerRef.current) {
        clearInterval(cliPollTimerRef.current);
        cliPollTimerRef.current = null;
      }
      if (devicePollTimerRef.current) {
        clearTimeout(devicePollTimerRef.current);
        devicePollTimerRef.current = null;
      }
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

      if (devicePollTimerRef.current) clearTimeout(devicePollTimerRef.current);

      const poll = () => {
        if (stopped) return;
        devicePollTimerRef.current = setTimeout(async () => {
          if (stopped) return;
          if (Date.now() > expiresAt) {
            stopped = true;
            devicePollTimerRef.current = null;
            setDeviceStatus("expired");
            setDeviceCode(null);
            setDeviceError(
              t({
                ko: "코드가 만료되었습니다. 다시 시도하세요.",
                en: "Code expired. Please try again.",
                ja: "コードが期限切れです。再試行してください。",
                zh: "验证码已过期，请重试。",
              }),
            );
            return;
          }

          try {
            const result = await api.pollGitHubDevice(dc.stateId);
            if (result.status === "complete") {
              stopped = true;
              devicePollTimerRef.current = null;
              setDeviceStatus("complete");
              setDeviceCode(null);
              await loadOAuthStatus();
              return;
            }
            if (result.status === "expired" || result.status === "denied") {
              stopped = true;
              devicePollTimerRef.current = null;
              setDeviceStatus(result.status);
              setDeviceError(
                result.status === "expired"
                  ? t({
                      ko: "코드가 만료되었습니다.",
                      en: "Code expired.",
                      ja: "コードが期限切れです。",
                      zh: "验证码已过期。",
                    })
                  : t({
                      ko: "인증이 거부되었습니다.",
                      en: "Authentication denied.",
                      ja: "認証が拒否されました。",
                      zh: "认证被拒绝。",
                    }),
              );
              return;
            }
            if (result.status === "slow_down") {
              intervalMs += 5000;
            }
            if (result.status === "error") {
              stopped = true;
              devicePollTimerRef.current = null;
              setDeviceStatus("error");
              setDeviceError(
                result.error || t({ ko: "알 수 없는 오류", en: "Unknown error", ja: "不明なエラー", zh: "未知错误" }),
              );
              return;
            }
          } catch {
            // ignore transient polling failure
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
          if (devicePollTimerRef.current) {
            clearTimeout(devicePollTimerRef.current);
            devicePollTimerRef.current = null;
          }
        }
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
      } finally {
        setSavingAccountId(null);
      }
    },
    [loadOAuthStatus, t],
  );

  const handlePoolSelect = useCallback((provider: OfficeExecutionProvider, accountPoolId: string) => {
    setSelectedPoolByProvider((prev) => ({
      ...prev,
      [provider]: accountPoolId,
    }));
  }, []);

  const handleCreatePool = useCallback(
    async (provider: OfficeExecutionProvider) => {
      const nextPoolId = pickNextPoolId(provider, cliAccountPools);
      const label = `${providerLabel(provider)} ${nextPoolId}`;
      const busyKey = `${provider}:${nextPoolId}:create`;
      setCliAuthBusyKey(busyKey);
      try {
        await api.createCliAccountPool(provider, nextPoolId, label);
        await loadCliAccountLayer();
        setSelectedPoolByProvider((prev) => ({ ...prev, [provider]: nextPoolId }));
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [cliAccountPools, loadCliAccountLayer],
  );

  const handleUpdatePool = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string, patch: { label?: string }) => {
      const busyKey = `${provider}:${accountPoolId}:update`;
      setCliAuthBusyKey(busyKey);
      try {
        await api.updateCliAccountPool(provider, accountPoolId, patch);
        await loadCliAccountLayer();
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [loadCliAccountLayer],
  );

  const handleDeletePool = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string) => {
      const confirmed = window.confirm(
        t({
          ko: `계정풀 ${provider}:${accountPoolId} 를 삭제할까요?`,
          en: `Delete account pool ${provider}:${accountPoolId}?`,
          ja: `アカウントプール ${provider}:${accountPoolId} を削除しますか？`,
          zh: `要删除账号池 ${provider}:${accountPoolId} 吗？`,
        }),
      );
      if (!confirmed) return;

      const busyKey = `${provider}:${accountPoolId}:delete`;
      setCliAuthBusyKey(busyKey);
      try {
        await api.deleteCliAccountPool(provider, accountPoolId);
        await loadCliAccountLayer();
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [loadCliAccountLayer, t],
  );

  const handleVerifyPool = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string): Promise<CliAccountVerifyResponse> => {
      const busyKey = `${provider}:${accountPoolId}:verify`;
      setCliAuthBusyKey(busyKey);
      try {
        const result = await api.verifyCliAccountPool(provider, accountPoolId);
        await loadCliAccountLayer();
        return result;
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [loadCliAccountLayer],
  );

  const handleCopyLoginCommand = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string) => {
      const busyKey = `${provider}:${accountPoolId}:login`;
      setCliAuthBusyKey(busyKey);
      try {
        const result = await api.getCliAccountLoginCommand(provider, accountPoolId);
        await copyToClipboard(result.command);
        window.alert(
          t({
            ko: "인증 명령을 클립보드에 복사했습니다.",
            en: "Copied login command to clipboard.",
            ja: "ログインコマンドをクリップボードにコピーしました。",
            zh: "已将登录命令复制到剪贴板。",
          }),
        );
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [t],
  );

  const handleActivateRunner = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string) => {
      const busyKey = `${provider}:${accountPoolId}:activate`;
      setCliAuthBusyKey(busyKey);
      try {
        await api.activateOfficeRunner(provider, accountPoolId);
        await loadCliAccountLayer();
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [loadCliAccountLayer],
  );

  const handleDeactivateRunner = useCallback(
    async (provider: OfficeExecutionProvider, accountPoolId: string) => {
      const busyKey = `${provider}:${accountPoolId}:deactivate`;
      setCliAuthBusyKey(busyKey);
      try {
        await api.deactivateOfficeRunner(provider, accountPoolId);
        await loadCliAccountLayer();
      } finally {
        setCliAuthBusyKey(null);
      }
    },
    [loadCliAccountLayer],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <h2 className="flex items-center gap-2 text-xl font-bold" style={{ color: "var(--th-text-heading)" }}>
        설정
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
          officeExecutionProviders={OFFICE_EXECUTION_PROVIDERS}
          cliAccountPools={cliAccountPools}
          officeRunners={officeRunners}
          officeRunnerQueue={officeRunnerQueue}
          cliAuthBusyKey={cliAuthBusyKey}
          selectedPoolByProvider={selectedPoolByProvider}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
          onRefresh={refreshCliTab}
          onPoolSelect={handlePoolSelect}
          onCreatePool={handleCreatePool}
          onUpdatePool={handleUpdatePool}
          onDeletePool={handleDeletePool}
          onVerifyPool={handleVerifyPool}
          onCopyLoginCommand={handleCopyLoginCommand}
          onActivateRunner={handleActivateRunner}
          onDeactivateRunner={handleDeactivateRunner}
          runnerMeta={runnerMeta}
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
        />
      )}

      {tab === "api" && <ApiSettingsTab t={t} localeTag={localeTag} apiState={apiState} />}

      {tab === "workflow-packs" && <WorkflowPacksTab t={t} />}

      {tab === "gateway" && (
        <GatewaySettingsTab t={t} form={form} setForm={setForm} persistSettings={persistSettings} />
      )}
    </div>
  );
}
