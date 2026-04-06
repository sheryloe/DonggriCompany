"use client";

import { useCallback, useEffect, useState } from "react";

interface OAuthAccount {
  id: string;
  label: string | null;
  email: string | null;
  status: "active" | "disabled";
  executionReady: boolean;
  active: boolean;
  failureCount: number;
}

interface ProviderStatus {
  connected: boolean;
  executionReady: boolean;
  email: string | null;
  activeAccountId: string | null;
  accounts: OAuthAccount[];
}

interface OAuthStatus {
  storageReady: boolean;
  providers: { github: ProviderStatus; google: ProviderStatus };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4315";

export default function OAuthPanel() {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/oauth/status`);
      const data = await res.json() as { storageReady: boolean; providers: any };
      setStatus(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // OAuth 성공/에러 URL 파라미터 감지
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") || params.get("oauth_error")) {
      void loadStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStatus]);

  const disconnect = async (provider: string, accountId?: string) => {
    await fetch(`${API_BASE}/api/oauth/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, accountId }),
    });
    await loadStatus();
  };

  const PROVIDER_INFO = {
    github: { label: "GitHub", icon: "🐙", color: "#6e40c9" },
    google: { label: "Google", icon: "🔵", color: "#4285f4" },
  } as const;

  if (loading) return <div className="p-4 text-sm text-gray-400">OAuth 상태 로딩 중...</div>;
  if (!status) return <div className="p-4 text-sm text-red-400">상태를 불러올 수 없습니다.</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">OAuth 연동</h2>
        {!status.storageReady && (
          <span className="rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300">
            ⚠ OFFICE_OAUTH_ENCRYPTION_KEY 미설정
          </span>
        )}
      </div>

      {(["github", "google"] as const).map((provider) => {
        const provStatus = status.providers[provider];
        const info = PROVIDER_INFO[provider];
        return (
          <div key={provider} className="rounded-xl border border-white/10 bg-gray-900/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{info.icon}</span>
                <div>
                  <p className="font-semibold text-white">{info.label}</p>
                  {provStatus.email && <p className="text-xs text-gray-400">{provStatus.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {provStatus.connected ? (
                  <>
                    <span className="rounded-full bg-green-900/40 px-2 py-0.5 text-xs text-green-400">✅ 연결됨</span>
                    <button
                      onClick={() => disconnect(provider)}
                      className="rounded-lg border border-red-800/40 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20"
                    >연결 해제</button>
                  </>
                ) : (
                  <a
                    href={`${API_BASE}/api/oauth/start/${provider}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-80"
                    style={{ backgroundColor: info.color }}
                  >
                    {info.label}로 연결
                  </a>
                )}
              </div>
            </div>

            {provStatus.accounts.length > 1 && (
              <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                {provStatus.accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${acc.executionReady ? "bg-green-400" : "bg-gray-600"}`} />
                      <span className="text-gray-300">{acc.label ?? acc.email ?? acc.id.slice(0, 8)}</span>
                      {acc.active && <span className="text-indigo-400">(활성)</span>}
                    </div>
                    <button
                      onClick={() => disconnect(provider, acc.id)}
                      className="text-gray-600 hover:text-red-400"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
