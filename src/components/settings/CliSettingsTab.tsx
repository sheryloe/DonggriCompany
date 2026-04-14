import { useMemo, useState } from "react";
import type { OfficeExecutionProvider } from "../../api";
import { withCliModelFallback } from "../../app/cli-model-fallbacks";
import type { CliSettingsTabProps } from "./types";

type CliPoolStatus = "connected" | "auth_required" | "install_required" | "profile_error";

const PROVIDER_INFO: Record<OfficeExecutionProvider, { label: string; icon: string }> = {
  codex: { label: "Codex CLI", icon: "C" },
  gemini: { label: "Gemini CLI", icon: "G" },
  claude: { label: "Claude CLI", icon: "A" },
  jules: { label: "Jules CLI", icon: "J" },
};

function statusChipClass(status: CliPoolStatus): string {
  if (status === "connected") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (status === "auth_required") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  if (status === "install_required") return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
  return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
}

function runnerChipClass(status: "active" | "idle" | "stopping" | "error"): string {
  if (status === "active") return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  if (status === "idle") return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
  if (status === "stopping") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
}

export default function CliSettingsTab({
  t,
  cliStatus,
  cliModels,
  cliModelsLoading,
  officeExecutionProviders,
  cliAccountPools,
  officeRunners,
  officeRunnerQueue,
  runnerMeta,
  cliAuthBusyKey,
  selectedPoolByProvider,
  form,
  setForm,
  persistSettings,
  onRefresh,
  onPoolSelect,
  onCreatePool,
  onUpdatePool,
  onDeletePool,
  onVerifyPool,
  onCopyLoginCommand,
  onActivateRunner,
  onDeactivateRunner,
}: CliSettingsTabProps) {
  const [verifyMessageByKey, setVerifyMessageByKey] = useState<Record<string, string>>({});
  const [labelDraftByKey, setLabelDraftByKey] = useState<Record<string, string>>({});

  const activeRunnerCount = useMemo(
    () => officeRunners.filter((runner) => runner.status === "active").length,
    [officeRunners],
  );

  const queueTop = useMemo(
    () => officeRunnerQueue.filter((item) => item.status === "queued").slice(0, 5),
    [officeRunnerQueue],
  );

  return (
    <section
      className="space-y-5 rounded-xl p-5 sm:p-6"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          {t({
            ko: "CLI 계정/실행 상태",
            en: "CLI Account & Runner",
            ja: "CLI アカウント/実行状態",
            zh: "CLI 账号/运行状态",
          })}
        </h3>
        <button onClick={onRefresh} className="text-xs text-blue-400 transition-colors hover:text-blue-300">
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
        </button>
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-700/60 bg-slate-900/30 p-3 text-xs sm:grid-cols-3">
        <div>
          <div className="text-slate-400">
            {t({ ko: "활성 Runner", en: "Active runners", ja: "稼働 Runner", zh: "活跃 Runner" })}
          </div>
          <div className="mt-1 text-sm text-white">
            {activeRunnerCount}/{runnerMeta.maxActive}
          </div>
        </div>
        <div>
          <div className="text-slate-400">{t({ ko: "대기열", en: "Queue", ja: "キュー", zh: "队列" })}</div>
          <div className="mt-1 text-sm text-white">{queueTop.length}</div>
        </div>
        <div>
          <div className="text-slate-400">
            {t({ ko: "Docker 실행", en: "Docker mode", ja: "Docker 実行", zh: "Docker 模式" })}
          </div>
          <div className="mt-1 text-sm text-white">{runnerMeta.dockerEnabled ? "ON" : "OFF"}</div>
        </div>
      </div>

      <div className="space-y-3">
        {officeExecutionProviders.map((provider) => {
          const info = PROVIDER_INFO[provider];
          const providerPools = cliAccountPools.filter((pool) => pool.provider === provider);
          const selectedPoolId = selectedPoolByProvider[provider] || providerPools[0]?.accountPoolId || "";
          const selectedPool = providerPools.find((pool) => pool.accountPoolId === selectedPoolId) || null;
          const poolKey = selectedPool ? `${provider}:${selectedPool.accountPoolId}` : `${provider}:none`;
          const labelDraft = selectedPool ? (labelDraftByKey[poolKey] ?? selectedPool.label) : "";
          const runner = officeRunners.find(
            (row) => row.provider === provider && row.accountPoolId === (selectedPool?.accountPoolId ?? ""),
          );
          const queuedCount = officeRunnerQueue.filter(
            (item) =>
              item.provider === provider &&
              item.accountPoolId === (selectedPool?.accountPoolId ?? "") &&
              item.status === "queued",
          ).length;
          const keyPrefix = `${provider}:${selectedPool?.accountPoolId ?? "none"}`;
          const isBusy = Boolean(cliAuthBusyKey && cliAuthBusyKey.startsWith(keyPrefix));
          const cliTool = cliStatus?.[provider];
          const providerModels = withCliModelFallback(provider, cliModels?.[provider] ?? []);
          const selectedModel = form.providerModelConfig?.[provider]?.model || "";

          return (
            <article key={provider} className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
                  {info.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{info.label}</div>
                  <div className="text-xs text-slate-400">
                    {cliTool?.version ||
                      t({ ko: "버전 정보 없음", en: "Version unknown", ja: "バージョン不明", zh: "版本未知" })}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${cliTool?.installed ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-600/40 text-slate-300"}`}
                >
                  {cliTool?.installed
                    ? t({ ko: "설치됨", en: "Installed", ja: "インストール済み", zh: "已安装" })
                    : t({ ko: "미설치", en: "Not installed", ja: "未インストール", zh: "未安装" })}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <select
                  value={selectedPool?.accountPoolId ?? ""}
                  onChange={(event) => onPoolSelect(provider, event.target.value)}
                  className="rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-white"
                >
                  {providerPools.length === 0 ? (
                    <option value="">
                      {t({ ko: "계정풀 없음", en: "No pool", ja: "プールなし", zh: "无账号池" })}
                    </option>
                  ) : (
                    providerPools.map((pool) => (
                      <option key={`${pool.provider}:${pool.accountPoolId}`} value={pool.accountPoolId}>
                        {pool.label && pool.label.trim() && pool.label.trim() !== pool.accountPoolId
                          ? `${pool.label} (${pool.accountPoolId})`
                          : pool.accountPoolId}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => void onCreatePool(provider)}
                  className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
                >
                  + {t({ ko: "추가", en: "Add", ja: "追加", zh: "添加" })}
                </button>
                <button
                  type="button"
                  disabled={!selectedPool || isBusy}
                  onClick={() => selectedPool && void onDeletePool(provider, selectedPool.accountPoolId)}
                  className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 enabled:hover:bg-rose-500/10 disabled:opacity-40"
                >
                  - {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除" })}
                </button>
              </div>

              {selectedPool ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={labelDraft}
                    onChange={(event) =>
                      setLabelDraftByKey((prev) => ({
                        ...prev,
                        [poolKey]: event.target.value,
                      }))
                    }
                    placeholder={t({ ko: "표시 이름", en: "Display name", ja: "表示名", zh: "显示名称" })}
                    className="rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={isBusy || !labelDraft.trim() || labelDraft.trim() === selectedPool.label}
                    onClick={() =>
                      void (async () => {
                        const nextLabel = labelDraft.trim();
                        if (!nextLabel) return;
                        await onUpdatePool(provider, selectedPool.accountPoolId, { label: nextLabel });
                        setLabelDraftByKey((prev) => ({ ...prev, [poolKey]: nextLabel }));
                      })()
                    }
                    className="rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-300 enabled:hover:bg-blue-500/10 disabled:opacity-40"
                  >
                    {t({ ko: "이름 저장", en: "Save name", ja: "保存", zh: "保存" })}
                  </button>
                </div>
              ) : null}

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded border border-slate-700/50 bg-slate-900/30 p-2">
                  <div className="text-slate-400">
                    {t({ ko: "계정 상태", en: "Account status", ja: "アカウント状態", zh: "账号状态" })}
                  </div>
                  {selectedPool ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusChipClass(selectedPool.status)}`}>
                        {selectedPool.status === "connected" &&
                          t({ ko: "연결됨", en: "Connected", ja: "接続済み", zh: "已连接" })}
                        {selectedPool.status === "auth_required" &&
                          t({ ko: "인증 필요", en: "Auth required", ja: "認証必要", zh: "需要认证" })}
                        {selectedPool.status === "install_required" &&
                          t({
                            ko: "CLI 설치 필요",
                            en: "Install required",
                            ja: "CLI インストール必要",
                            zh: "需要安装 CLI",
                          })}
                        {selectedPool.status === "profile_error" &&
                          t({ ko: "프로필 오류", en: "Profile error", ja: "プロファイルエラー", zh: "配置错误" })}
                      </span>
                      {selectedPool.lastVerifiedAt ? (
                        <span className="text-slate-500">{new Date(selectedPool.lastVerifiedAt).toLocaleString()}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 text-slate-500">
                      {t({
                        ko: "선택된 계정풀이 없습니다.",
                        en: "No selected pool.",
                        ja: "選択されたプールがありません。",
                        zh: "未选择账号池。",
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded border border-slate-700/50 bg-slate-900/30 p-2">
                  <div className="text-slate-400">
                    {t({ ko: "Runner 상태", en: "Runner status", ja: "Runner 状態", zh: "Runner 状态" })}
                  </div>
                  {runner ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${runnerChipClass(runner.status)}`}>
                        {runner.status}
                      </span>
                      <span className="text-slate-500">Q:{queuedCount}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-slate-500">
                      {t({ ko: "Runner 없음", en: "No runner", ja: "Runner なし", zh: "无 Runner" })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  disabled={!selectedPool || isBusy}
                  onClick={() => selectedPool && void onCopyLoginCommand(provider, selectedPool.accountPoolId)}
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 enabled:hover:bg-slate-700/40 disabled:opacity-40"
                >
                  {t({ ko: "인증 명령 복사", en: "Copy login", ja: "ログインコマンド", zh: "复制登录命令" })}
                </button>
                <button
                  type="button"
                  disabled={!selectedPool || isBusy}
                  onClick={async () => {
                    if (!selectedPool) return;
                    const response = await onVerifyPool(provider, selectedPool.accountPoolId);
                    const message = response.pool.status;
                    setVerifyMessageByKey((prev) => ({
                      ...prev,
                      [`${provider}:${selectedPool.accountPoolId}`]: message,
                    }));
                  }}
                  className="rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-300 enabled:hover:bg-blue-500/10 disabled:opacity-40"
                >
                  {t({ ko: "검증", en: "Verify", ja: "検証", zh: "验证" })}
                </button>
                <button
                  type="button"
                  disabled={!selectedPool || isBusy || selectedPool.status === "install_required"}
                  onClick={() => selectedPool && void onActivateRunner(provider, selectedPool.accountPoolId)}
                  className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 enabled:hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {t({ ko: "Runner 활성화", en: "Activate", ja: "起動", zh: "激活" })}
                </button>
                <button
                  type="button"
                  disabled={!selectedPool || isBusy}
                  onClick={() => selectedPool && void onDeactivateRunner(provider, selectedPool.accountPoolId)}
                  className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-300 enabled:hover:bg-amber-500/10 disabled:opacity-40"
                >
                  {t({ ko: "Runner 비활성화", en: "Deactivate", ja: "停止", zh: "停用" })}
                </button>
              </div>

              {selectedPool && verifyMessageByKey[`${provider}:${selectedPool.accountPoolId}`] && (
                <p className="text-[11px] text-slate-400">
                  {t({ ko: "최근 검증 결과", en: "Last verify result", ja: "最新検証結果", zh: "最近验证结果" })}:{" "}
                  {verifyMessageByKey[`${provider}:${selectedPool.accountPoolId}`]}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-center">
                <span className="text-xs text-slate-400">
                  {t({ ko: "모델", en: "Model", ja: "モデル", zh: "模型" })}
                </span>
                {providerModels.length > 0 ? (
                  <div className="space-y-1">
                    <select
                      value={selectedModel}
                      onChange={(event) => {
                        const nextConfig = {
                          ...(form.providerModelConfig ?? {}),
                          [provider]: {
                            ...(form.providerModelConfig?.[provider] ?? {}),
                            model: event.target.value,
                          },
                        };
                        const nextForm = {
                          ...form,
                          providerModelConfig: nextConfig,
                        };
                        setForm(nextForm);
                        persistSettings(nextForm);
                      }}
                      className="w-full rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-white"
                    >
                      <option value="">{t({ ko: "기본값", en: "Default", ja: "デフォルト", zh: "默认" })}</option>
                      {providerModels.map((model) => (
                        <option key={model.slug} value={model.slug}>
                          {model.displayName || model.slug}
                        </option>
                      ))}
                    </select>
                    {cliModelsLoading ? (
                      <span className="text-[11px] text-slate-500">
                        {t({ ko: "모델 목록 동기화 중...", en: "Syncing models...", ja: "Syncing models...", zh: "Syncing models..." })}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">
                    {cliModelsLoading
                      ? t({ ko: "모델 로딩 중...", en: "Loading models...", ja: "モデル読込中...", zh: "模型加载中..." })
                      : t({ ko: "모델 목록 없음", en: "No models", ja: "モデルなし", zh: "无模型" })}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {queueTop.length > 0 && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <h4 className="mb-2 text-xs font-semibold text-slate-300">
            {t({ ko: "대기열 상위", en: "Queue top", ja: "キュー上位", zh: "队列前列" })}
          </h4>
          <ul className="space-y-1 text-xs text-slate-300">
            {queueTop.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded bg-slate-800/50 px-2 py-1">
                <span className="truncate">
                  {item.provider}:{item.accountPoolId}
                </span>
                <span className="text-slate-400">{item.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {t({
          ko: "인증은 계정풀 단위로 분리됩니다. 로그인 명령을 실행한 뒤 검증 버튼으로 연결 상태를 갱신하세요.",
          en: "Authentication is isolated per account pool. Run login command, then verify.",
          ja: "認証はアカウントプール単位で分離されます。ログイン後に検証を実行してください。",
          zh: "认证按账号池隔离。执行登录命令后，请点击验证。",
        })}
      </p>
    </section>
  );
}
