import { useCallback, useEffect, useRef, useState } from "react";
import { disconnectOAuth, pollGitHubDevice, startGitHubDeviceFlow } from "../../api";
import { useI18n } from "../../i18n";

interface GitHubDeviceConnectProps {
  reason: "not_connected" | "missing_repo_scope";
  onConnected: () => void;
  onCancel: () => void;
}

export default function GitHubDeviceConnect({ reason, onConnected, onCancel }: GitHubDeviceConnectProps) {
  const { t } = useI18n();
  const [deviceUserCode, setDeviceUserCode] = useState<string | null>(null);
  const [deviceVerifyUrl, setDeviceVerifyUrl] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "waiting" | "complete" | "error">("idle");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const startFlow = useCallback(async () => {
    setDeviceError(null);
    setDeviceStatus("idle");

    if (reason === "missing_repo_scope") {
      setDisconnecting(true);
      try {
        await disconnectOAuth("github-copilot");
      } catch {
        // ignore disconnect failure before reconnect
      } finally {
        setDisconnecting(false);
      }
    }

    try {
      const deviceCode = await startGitHubDeviceFlow();
      setDeviceUserCode(deviceCode.userCode);
      setDeviceVerifyUrl(deviceCode.verificationUri);
      setDeviceStatus("waiting");

      window.open(deviceCode.verificationUri, "_blank");

      let intervalMs = (deviceCode.interval || 5) * 1000;
      let stopped = false;

      const poll = () => {
        if (stopped) return;
        pollTimer.current = setTimeout(async () => {
          if (stopped) return;
          try {
            const result = await pollGitHubDevice(deviceCode.stateId);
            if (result.status === "complete") {
              stopped = true;
              setDeviceStatus("complete");
              setTimeout(onConnected, 500);
              return;
            }
            if (result.status === "expired" || result.status === "denied") {
              stopped = true;
              setDeviceStatus("error");
              setDeviceError(result.status === "expired" ? "Code expired" : "Access denied");
              return;
            }
            if (result.status === "slow_down") {
              intervalMs += 5000;
            }
          } catch (pollError) {
            console.error("[GitHubImport] poll error:", pollError);
          }
          poll();
        }, intervalMs);
      };

      poll();
    } catch (error) {
      setDeviceStatus("error");
      setDeviceError(error instanceof Error ? error.message : String(error));
    }
  }, [onConnected, reason]);

  const description =
    reason === "not_connected"
      ? t({
          ko: "저장소를 가져오려면 GitHub 계정을 먼저 연결해야 합니다.",
          en: "Connect your GitHub account to import repositories.",
          ja: "Connect your GitHub account to import repositories.",
          zh: "Connect your GitHub account to import repositories.",
        })
      : t({
          ko: "현재 GitHub 연결에는 repo 권한이 없습니다. private 저장소까지 사용하려면 다시 연결해야 합니다.",
          en: "The current GitHub connection lacks repo scope. Reconnect to access private repositories as well.",
          ja: "The current GitHub connection lacks repo scope. Reconnect to access private repositories as well.",
          zh: "The current GitHub connection lacks repo scope. Reconnect to access private repositories as well.",
        });

  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-slate-300">{description}</p>

      {deviceStatus === "idle" && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disconnecting}
            onClick={() => void startFlow()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {disconnecting
              ? t({ ko: "연결 해제 중...", en: "Disconnecting...", ja: "Disconnecting...", zh: "Disconnecting..." })
              : reason === "not_connected"
                ? t({ ko: "GitHub 연결", en: "Connect GitHub", ja: "Connect GitHub", zh: "Connect GitHub" })
                : t({
                    ko: "GitHub 다시 연결 (repo 권한)",
                    en: "Reconnect GitHub (repo scope)",
                    ja: "Reconnect GitHub (repo scope)",
                    zh: "Reconnect GitHub (repo scope)",
                  })}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
          >
            {t({ ko: "닫기", en: "Close", ja: "Close", zh: "Close" })}
          </button>
        </div>
      )}

      {deviceStatus === "waiting" && deviceUserCode && (
        <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-900/20 p-4">
          <p className="text-xs text-slate-300">
            {t({
              ko: "아래 코드를 GitHub 인증 페이지에 입력하세요.",
              en: "Enter this code on the GitHub verification page.",
              ja: "Enter this code on the GitHub verification page.",
              zh: "Enter this code on the GitHub verification page.",
            })}
          </p>
          <div className="flex items-center gap-3">
            <code className="rounded-lg bg-slate-800 px-4 py-2 text-lg font-bold tracking-widest text-white">
              {deviceUserCode}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(deviceUserCode);
              }}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              {t({ ko: "복사", en: "Copy", ja: "Copy", zh: "Copy" })}
            </button>
          </div>
          {deviceVerifyUrl && (
            <a
              href={deviceVerifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-blue-400 underline hover:text-blue-300"
            >
              {t({
                ko: "GitHub 인증 페이지 열기",
                en: "Open GitHub verification page",
                ja: "Open GitHub verification page",
                zh: "Open GitHub verification page",
              })}
            </a>
          )}
          <p className="animate-pulse text-xs text-slate-400">
            {t({
              ko: "인증 대기 중...",
              en: "Waiting for authorization...",
              ja: "Waiting for authorization...",
              zh: "Waiting for authorization...",
            })}
          </p>
        </div>
      )}

      {deviceStatus === "complete" && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          {t({
            ko: "GitHub 연결 완료. 저장소 목록을 불러옵니다...",
            en: "GitHub connected. Loading repositories...",
            ja: "GitHub connected. Loading repositories...",
            zh: "GitHub connected. Loading repositories...",
          })}
        </div>
      )}

      {deviceStatus === "error" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {deviceError}
          </div>
          <button
            type="button"
            onClick={() => {
              setDeviceStatus("idle");
              setDeviceError(null);
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
          >
            {t({ ko: "다시 시도", en: "Try again", ja: "Try again", zh: "Try again" })}
          </button>
        </div>
      )}
    </div>
  );
}
