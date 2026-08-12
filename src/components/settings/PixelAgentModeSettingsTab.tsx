import { Gamepad2, MonitorCog, Palette, Sparkles } from "lucide-react";
import type { PixelAgentDensity, PixelAgentModeSettings, PixelAgentVisualAssetPack } from "../../types";
import type { LocalSettings, SetLocalSettings, TFunction } from "./types";

interface PixelAgentModeSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  persistSettings: (next: LocalSettings) => void;
}

const DENSITY_OPTIONS: Array<{
  value: PixelAgentDensity;
  titleKo: string;
  titleEn: string;
  detailKo: string;
  detailEn: string;
}> = [
  {
    value: "compact",
    titleKo: "컴팩트",
    titleEn: "Compact",
    detailKo: "업무 화면 공간을 우선합니다.",
    detailEn: "Keeps the work surface dense.",
  },
  {
    value: "balanced",
    titleKo: "균형",
    titleEn: "Balanced",
    detailKo: "운영성과 픽셀 연출을 함께 둡니다.",
    detailEn: "Balances operations and pixel motion.",
  },
  {
    value: "showcase",
    titleKo: "쇼케이스",
    titleEn: "Showcase",
    detailKo: "오피스와 에이전트 존재감을 크게 보여줍니다.",
    detailEn: "Makes the office and agents more prominent.",
  },
];

const ASSET_PACK_OPTIONS: Array<{ value: PixelAgentVisualAssetPack; titleKo: string; detailKo: string }> = [
  {
    value: "donggri_visual_v2",
    titleKo: "Visual V2",
    detailKo: "새 Dongri-grigri 이미지젠 V2 팩을 우선 사용합니다.",
  },
];

function normalizePixelAgentMode(raw: PixelAgentModeSettings | undefined): PixelAgentModeSettings {
  const density = raw?.density && DENSITY_OPTIONS.some((option) => option.value === raw.density) ? raw.density : "balanced";
  const visualAssetPack =
    raw?.visualAssetPack && ASSET_PACK_OPTIONS.some((option) => option.value === raw.visualAssetPack)
      ? raw.visualAssetPack
      : "donggri_visual_v2";
  return {
    enabled: raw?.enabled === true,
    density,
    officeTheme: "donggri_cloud_lab",
    visualAssetPack,
  };
}

export default function PixelAgentModeSettingsTab({
  t,
  form,
  setForm,
  persistSettings,
}: PixelAgentModeSettingsTabProps) {
  const settings = normalizePixelAgentMode(form.pixelAgentMode);

  const patchSettings = (patch: Partial<PixelAgentModeSettings>) => {
    setForm({
      ...form,
      pixelAgentMode: normalizePixelAgentMode({ ...settings, ...patch }),
    });
  };

  const save = () => {
    const next = {
      ...form,
      pixelAgentMode: settings,
    };
    setForm(next);
    persistSettings(next);
  };

  return (
    <section
      className="space-y-5 rounded-xl p-5 sm:p-6"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
              {t({ ko: "픽셀 에이전트 모드", en: "픽셀 에이전트 모드", ja: "픽셀 에이전트 모드", zh: "픽셀 에이전트 모드" })}
            </h3>
          </div>
          <p className="mt-2 max-w-[64ch] text-xs leading-relaxed" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "AWS 자산을 복제하지 않고, Donggri 전용 8비트 오피스와 에이전트 아이덴티티를 켭니다.",
              en: "AWS 자산을 복제하지 않고, Donggri 전용 8비트 오피스와 에이전트 아이덴티티를 켭니다.",
              ja: "AWS 자산을 복제하지 않고, Donggri 전용 8비트 오피스와 에이전트 아이덴티티를 켭니다.",
              zh: "AWS 자산을 복제하지 않고, Donggri 전용 8비트 오피스와 에이전트 아이덴티티를 켭니다.",
            })}
          </p>
        </div>

        <button
          type="button"
          aria-pressed={settings.enabled}
          aria-label={t({
            ko: "픽셀 에이전트 모드",
            en: "픽셀 에이전트 모드",
            ja: "픽셀 에이전트 모드",
            zh: "픽셀 에이전트 모드",
          })}
          onClick={() => patchSettings({ enabled: !settings.enabled })}
          className={`relative h-7 w-12 rounded-full transition-colors ${
            settings.enabled ? "bg-cyan-500" : "bg-slate-600"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
            <Palette className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            {t({ ko: "밀도", en: "밀도", ja: "밀도", zh: "밀도" })}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DENSITY_OPTIONS.map((option) => {
              const active = settings.density === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patchSettings({ density: option.value })}
                  className={`rounded-lg border px-3 py-2 text-left transition active:translate-y-px ${
                    active ? "border-cyan-300/70 bg-cyan-400/15" : "border-slate-700/70 bg-slate-950/20"
                  }`}
                >
                  <span className="block text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    {t({ ko: option.titleKo, en: option.titleKo, ja: option.titleKo, zh: option.titleKo })}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: option.detailKo, en: option.detailKo, ja: option.detailKo, zh: option.detailKo })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
            <MonitorCog className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            {t({ ko: "오피스 테마", en: "오피스 테마", ja: "오피스 테마", zh: "오피스 테마" })}
          </div>
          <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2">
            <div className="font-mono text-xs text-emerald-100">donggri_cloud_lab</div>
            <div className="mt-1 text-[11px] leading-snug text-emerald-100/75">
              {t({
                ko: "클라우드 노드, 큐, 알림 비콘을 추상 픽셀 오브젝트로 표현합니다.",
                en: "클라우드 노드, 큐, 알림 비콘을 추상 픽셀 오브젝트로 표현합니다.",
                ja: "클라우드 노드, 큐, 알림 비콘을 추상 픽셀 오브젝트로 표현합니다.",
                zh: "클라우드 노드, 큐, 알림 비콘을 추상 픽셀 오브젝트로 표현합니다.",
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--th-card-border)", background: "var(--th-bg-surface)" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
              에셋 팩
            </div>
            <p className="mt-1 max-w-[64ch] text-xs leading-relaxed" style={{ color: "var(--th-text-muted)" }}>
              기존 이미지는 유지하고 Visual V2는 별도 경로에서 안전하게 비교합니다.
            </p>
          </div>
          <div className="grid min-w-[240px] grid-cols-2 gap-2">
            {ASSET_PACK_OPTIONS.map((option) => {
              const active = settings.visualAssetPack === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patchSettings({ visualAssetPack: option.value })}
                  className={`rounded-lg border px-3 py-2 text-left transition active:translate-y-px ${
                    active ? "border-amber-300/70 bg-amber-300/15" : "border-slate-700/70 bg-slate-950/20"
                  }`}
                  aria-pressed={active}
                >
                  <span className="block text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    {option.titleKo}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug" style={{ color: "var(--th-text-muted)" }}>
                    {option.detailKo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--th-card-border)", background: "var(--th-bg-surface)" }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
          <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
          {t({ ko: "운영 원칙", en: "운영 원칙", ja: "운영 원칙", zh: "운영 원칙" })}
        </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--th-text-muted)" }}>
          {t({
            ko: "새 스프라이트는 기존 정규화 파이프라인으로만 추가합니다. 런타임 PNG를 직접 수정하지 않습니다.",
            en: "새 스프라이트는 기존 정규화 파이프라인으로만 추가합니다. 런타임 PNG를 직접 수정하지 않습니다.",
            ja: "새 스프라이트는 기존 정규화 파이프라인으로만 추가합니다. 런타임 PNG를 직접 수정하지 않습니다.",
            zh: "새 스프라이트는 기존 정규화 파이프라인으로만 추가합니다. 런타임 PNG를 직접 수정하지 않습니다.",
          })}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/15 transition hover:bg-cyan-500 active:translate-y-px"
        >
          {t({ ko: "저장", en: "저장", ja: "저장", zh: "저장" })}
        </button>
      </div>
    </section>
  );
}
