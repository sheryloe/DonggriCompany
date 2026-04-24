import type { SettingsTab, TFunction } from "./types";

interface SettingsTabNavProps {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  t: TFunction;
}

const TAB_ITEMS: Array<{ key: SettingsTab; label: (t: TFunction) => string }> = [
  { key: "general", label: (t) => t({ ko: "일반 설정", en: "General", ja: "General", zh: "General" }) },
  { key: "cli", label: (t) => t({ ko: "CLI 계정", en: "CLI Accounts", ja: "CLI Accounts", zh: "CLI Accounts" }) },
  { key: "oauth", label: (t) => t({ ko: "OAuth 연동", en: "OAuth", ja: "OAuth", zh: "OAuth" }) },
  { key: "api", label: (t) => t({ ko: "API 연동", en: "API", ja: "API", zh: "API" }) },
  { key: "workflow-packs", label: (t) => t({ ko: "워크플로 팩", en: "Workflow Packs", ja: "Workflow Packs", zh: "Workflow Packs" }) },
  { key: "canonical", label: (t) => t({ ko: "정책 인스펙터", en: "Policy Inspector", ja: "Policy Inspector", zh: "Policy Inspector" }) },
  { key: "organization", label: (t) => t({ ko: "조직 기본값", en: "Organization Defaults", ja: "Organization Defaults", zh: "Organization Defaults" }) },
  { key: "gateway", label: (t) => t({ ko: "채널 메시지", en: "Channel", ja: "Channel", zh: "Channel" }) },
];

export default function SettingsTabNav({ tab, setTab, t }: SettingsTabNavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-700/50 pb-1">
      {TAB_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => setTab(item.key)}
          className={`rounded-t-lg px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:py-2.5 sm:text-sm ${
            tab === item.key ? "text-blue-400 border-b-2 border-blue-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {item.label(t)}
        </button>
      ))}
    </div>
  );
}
