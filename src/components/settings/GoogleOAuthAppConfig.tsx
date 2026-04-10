import { useEffect, useState } from "react";
import * as api from "../../api";
import type { TFunction } from "./types";

function normalizeSettingValue(value: unknown): string {
  if (value == null) return "";
  const raw = String(value)
    .replace(/^"|"$/g, "")
    .trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || raw === "__CHANGE_ME__" || raw.startsWith("YOUR_")) {
    return "";
  }
  return raw;
}

export default function GoogleOAuthAppConfig({ t }: { t: TFunction }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getSettingsRaw()
      .then((settings) => {
        setClientId(normalizeSettingValue(settings?.google_oauth_client_id));
        setClientSecret(normalizeSettingValue(settings?.google_oauth_client_secret));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const saveGoogleOAuth = () => {
    api
      .saveSettingsPatch({
        google_oauth_client_id: clientId.trim() || null,
        google_oauth_client_secret: clientSecret.trim() || null,
      })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t({
            ko: "Google OAuth App (Antigravity)",
            en: "Google OAuth App (Antigravity)",
            ja: "Google OAuth App (Antigravity)",
            zh: "Google OAuth App (Antigravity)",
          })}
        </h4>
        {saved && (
          <span className="text-[10px] text-green-400">
            {t({ ko: "저장됨", en: "Saved", ja: "保存済み", zh: "已保存" })}
          </span>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        {t({
          ko: "Antigravity에 사용할 Google OAuth Client ID / Client Secret을 설정합니다. 저장 후 다시 연결하면 새 값으로 OAuth가 시작됩니다.",
          en: "Set the Google OAuth Client ID and Client Secret used by Antigravity. After saving, click Connect again to start OAuth with the new values.",
          ja: "Antigravity で使用する Google OAuth Client ID / Client Secret を保存します。保存後に再接続すると新しい値で OAuth が開始されます。",
          zh: "设置 Antigravity 使用的 Google OAuth Client ID / Client Secret。保存后重新点击连接即可用新值发起 OAuth。",
        })}
      </p>

      {loaded && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="client-id.apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-blue-500"
          />
          <button
            onClick={saveGoogleOAuth}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500"
          >
            {t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
          </button>
        </div>
      )}
    </div>
  );
}
