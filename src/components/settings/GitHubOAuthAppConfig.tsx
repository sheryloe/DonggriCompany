import { useEffect, useState } from "react";
import * as api from "../../api";
import type { TFunction } from "./types";

export default function GitHubOAuthAppConfig({ t }: { t: TFunction }) {
  const [clientId, setClientId] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .getSettingsRaw()
      .then((settings) => {
        const value = settings?.github_oauth_client_id;
        if (value) setClientId(String(value).replace(/^"|"$/g, ""));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const saveClientId = () => {
    api
      .saveSettingsPatch({ github_oauth_client_id: clientId.trim() || null })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t({
            ko: "GitHub OAuth App (private 저장소 접근)",
            en: "GitHub OAuth App (Private repo access)",
            ja: "GitHub OAuth App (Private repo access)",
            zh: "GitHub OAuth App (Private repo access)",
          })}
        </h4>
        {saved && (
          <span className="text-[10px] text-green-400">
            {t({ ko: "저장됨", en: "Saved", ja: "Saved", zh: "Saved" })}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        {t({
          ko: "기본 GitHub 연결은 Copilot OAuth를 사용하므로 private 저장소 접근이 제한될 수 있습니다. 자체 OAuth App을 등록하면 전체 저장소 접근이 가능합니다.",
          en: "Default GitHub connection uses Copilot OAuth and may limit private repo access. Register your own OAuth App for full repository access.",
          ja: "Default GitHub connection uses Copilot OAuth and may limit private repo access. Register your own OAuth App for full repository access.",
          zh: "Default GitHub connection uses Copilot OAuth and may limit private repo access. Register your own OAuth App for full repository access.",
        })}
      </p>

      <details className="text-[11px] text-slate-500">
        <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
          {t({
            ko: "OAuth App 생성 가이드",
            en: "How to create an OAuth App",
            ja: "How to create an OAuth App",
            zh: "How to create an OAuth App",
          })}
        </summary>
        <ol className="mt-2 ml-4 list-decimal space-y-1 text-slate-400">
          <li>{"GitHub > Settings > Developer settings > OAuth Apps > New OAuth App"}</li>
          <li>
            {t({
              ko: "Application name: 원하는 이름",
              en: "Application name: any name",
              ja: "Application name: any name",
              zh: "Application name: any name",
            })}
          </li>
          <li>{"Homepage URL: http://localhost:8800"}</li>
          <li>{"Callback URL: http://localhost:8800/oauth/callback"}</li>
          <li>
            {t({
              ko: "`Enable Device Flow`를 켭니다.",
              en: "Enable `Enable Device Flow`.",
              ja: "Enable `Enable Device Flow`.",
              zh: "Enable `Enable Device Flow`.",
            })}
          </li>
          <li>
            {t({
              ko: "생성 후 Client ID를 아래 입력창에 붙여넣습니다.",
              en: "After creating it, paste the Client ID below.",
              ja: "After creating it, paste the Client ID below.",
              zh: "After creating it, paste the Client ID below.",
            })}
          </li>
        </ol>
      </details>

      {loaded && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Iv23li..."
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveClientId();
            }}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={saveClientId}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500"
          >
            {t({ ko: "저장", en: "Save", ja: "Save", zh: "Save" })}
          </button>
        </div>
      )}

      {clientId.trim() && (
        <p className="text-[10px] text-amber-400">
          {t({
            ko: "저장 후 위쪽 연결 버튼으로 GitHub 계정을 다시 연결하세요.",
            en: "After saving, reconnect your GitHub account using the connect button above.",
            ja: "After saving, reconnect your GitHub account using the connect button above.",
            zh: "After saving, reconnect your GitHub account using the connect button above.",
          })}
        </p>
      )}
    </div>
  );
}
