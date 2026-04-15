import { CONNECTABLE_PROVIDERS } from "./constants";
import { getOauthSettingsCopy } from "./settings-copy";
import type { OAuthConnectCardProps } from "./types";

export default function OAuthConnectCards({
  t,
  oauthStatus,
  deviceCode,
  deviceStatus,
  deviceError,
  onConnect,
  onStartDeviceCodeFlow,
}: OAuthConnectCardProps) {
  const copy = getOauthSettingsCopy(t);

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{copy.executionAccounts}</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CONNECTABLE_PROVIDERS.map(({ id, label, Logo, description }) => {
          const providerInfo = oauthStatus.providers[id];
          const state = providerInfo?.executionReady ? "execution_ready" : providerInfo?.detected ? "reauth_required" : "connectable";
          const storageOk = oauthStatus.storageReady;
          const isGitHub = id === "github-copilot";

          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                state === "execution_ready"
                  ? "border-green-500/30 bg-green-500/5"
                  : state === "reauth_required"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : storageOk
                      ? "border-slate-600/50 bg-slate-700/30 hover:border-blue-400/50 hover:bg-slate-700/50"
                      : "border-slate-700/30 bg-slate-800/30 opacity-50"
              }`}
            >
              <Logo className="h-8 w-8" />
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="text-center text-[10px] leading-tight text-slate-400">{description}</span>

              {!storageOk ? (
                <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] text-yellow-500">
                  {copy.encryptionKeyRequired}
                </span>
              ) : (
                <>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                      state === "execution_ready"
                        ? "bg-green-500/20 text-green-400"
                        : state === "reauth_required"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-700 text-slate-200"
                    }`}
                  >
                    {state === "execution_ready"
                      ? copy.executionReady
                      : state === "reauth_required"
                        ? copy.reauthRequired
                        : copy.connectable}
                  </span>

                  {isGitHub && deviceCode && deviceStatus === "polling" ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="select-all rounded-lg bg-slate-700/60 px-3 py-1.5 font-mono text-xs tracking-widest text-slate-100">
                        {deviceCode.userCode}
                      </div>
                      <span className="animate-pulse text-[10px] text-blue-400">{copy.waitingDeviceCode}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => (isGitHub ? void onStartDeviceCodeFlow() : onConnect(id))}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
                    >
                      {state === "connectable" ? copy.connect : copy.addAccount}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {deviceStatus === "complete" && (
        <div className="space-y-1.5">
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
            {copy.githubAccountConnected}
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-400">
            {copy.githubAccountConnectedHelp}
          </div>
        </div>
      )}

      {deviceError && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{deviceError}</div>}
    </div>
  );
}
