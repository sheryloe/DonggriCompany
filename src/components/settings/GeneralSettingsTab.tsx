import type { CliProvider } from "../../types";
import type { LocalSettings, SetLocalSettings, TFunction } from "./types";

interface GeneralSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  saved: boolean;
  onSave: () => void;
}

interface ToggleSettingCardProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  title?: string;
}

function ToggleSettingCard({ label, checked, onToggle, title }: ToggleSettingCardProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:px-4"
      style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
    >
      <label className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
        {label}
      </label>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-slate-600"}`}
        title={title}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

export default function GeneralSettingsTab({ t, form, setForm, saved, onSave }: GeneralSettingsTabProps) {
  return (
    <>
      <section
        className="rounded-xl p-5 sm:p-6 space-y-5"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          {t({ ko: "기본 운영 설정", en: "General Settings", ja: "General Settings", zh: "General Settings" })}
        </h3>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "회사 이름", en: "Company Name", ja: "Company Name", zh: "Company Name" })}
          </label>
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "CEO 이름", en: "CEO Name", ja: "CEO Name", zh: "CEO Name" })}
          </label>
          <input
            type="text"
            value={form.ceoName}
            onChange={(e) => setForm({ ...form, ceoName: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ToggleSettingCard
            label={t({ ko: "자동 배정", en: "Auto Assign", ja: "Auto Assign", zh: "Auto Assign" })}
            checked={form.autoAssign}
            onToggle={() => setForm({ ...form, autoAssign: !form.autoAssign })}
          />
          <ToggleSettingCard
            label={t({ ko: "YOLO 모드", en: "YOLO Mode", ja: "YOLO Mode", zh: "YOLO Mode" })}
            checked={form.yoloMode === true}
            onToggle={() => setForm({ ...form, yoloMode: !(form.yoloMode === true) })}
            title={t({
              ko: "계획 리더가 의사결정 단계를 자동 분석하고 다음 단계를 이어서 실행합니다.",
              en: "Planning lead automatically analyzes decision steps and continues execution.",
              ja: "Planning lead automatically analyzes decision steps and continues execution.",
              zh: "Planning lead automatically analyzes decision steps and continues execution.",
            })}
          />
          <ToggleSettingCard
            label={t({
              ko: "자동 업데이트(전역)",
              en: "Auto Update (Global)",
              ja: "Auto Update (Global)",
              zh: "Auto Update (Global)",
            })}
            checked={form.autoUpdateEnabled}
            onToggle={() => setForm({ ...form, autoUpdateEnabled: !form.autoUpdateEnabled })}
            title={t({
              ko: "서버 전체 자동 업데이트 루프를 켜거나 끕니다.",
              en: "Enable or disable the server-wide auto-update loop.",
              ja: "Enable or disable the server-wide auto-update loop.",
              zh: "Enable or disable the server-wide auto-update loop.",
            })}
          />
          <ToggleSettingCard
            label={t({ ko: "OAuth 자동 전환", en: "OAuth Auto Swap", ja: "OAuth Auto Swap", zh: "OAuth Auto Swap" })}
            checked={form.oauthAutoSwap !== false}
            onToggle={() => setForm({ ...form, oauthAutoSwap: !(form.oauthAutoSwap !== false) })}
            title={t({
              ko: "실패나 제한 발생 시 다음 OAuth 계정으로 자동 전환합니다.",
              en: "Automatically switches to the next OAuth account on failures or limits.",
              ja: "Automatically switches to the next OAuth account on failures or limits.",
              zh: "Automatically switches to the next OAuth account on failures or limits.",
            })}
          />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({
              ko: "기본 CLI Provider",
              en: "Default CLI Provider",
              ja: "Default CLI Provider",
              zh: "Default CLI Provider",
            })}
          </label>
          <select
            value={form.defaultProvider}
            onChange={(e) => setForm({ ...form, defaultProvider: e.target.value as CliProvider })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex CLI</option>
            <option value="gemini">Gemini CLI</option>
            <option value="jules">Jules CLI</option>
            <option value="opencode">OpenCode</option>
          </select>
          <p className="mt-1 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "개별 에이전트의 모델 선택은 숨겨지고, 실제 모델 배정은 Provider 정책에서 결정됩니다.",
              en: "Per-agent model selection is hidden. Actual model routing is controlled by provider policy.",
              ja: "Per-agent model selection is hidden. Actual model routing is controlled by provider policy.",
              zh: "Per-agent model selection is hidden. Actual model routing is controlled by provider policy.",
            })}
          </p>
        </div>

        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
        >
          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
            {t({ ko: "표시 언어", en: "Display Language", ja: "Display Language", zh: "Display Language" })}
          </div>
          <p className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({
              ko: "운영 화면과 메시지는 한국어로 고정됩니다. 내부 key, API payload, MD 산출물은 영어 canonical 기준을 유지합니다.",
              en: "The operational UI is fixed to Korean while internal keys, API payloads, and Markdown outputs remain canonical English.",
              ja: "The operational UI is fixed to Korean while internal keys, API payloads, and Markdown outputs remain canonical English.",
              zh: "The operational UI is fixed to Korean while internal keys, API payloads, and Markdown outputs remain canonical English.",
            })}
          </p>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        {saved && (
          <span className="self-center text-sm text-green-400">
            {t({ ko: "저장 완료", en: "Saved", ja: "Saved", zh: "Saved" })}
          </span>
        )}
        <button
          onClick={onSave}
          className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
        >
          {t({ ko: "저장", en: "Save", ja: "Save", zh: "Save" })}
        </button>
      </div>
    </>
  );
}
