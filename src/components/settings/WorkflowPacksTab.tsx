import { useEffect, useState } from "react";
import * as api from "../../api";
import type { WorkflowPackConfig } from "../../api";
import type { TFunction } from "./types";

type WorkflowPacksTabProps = { t: TFunction };
type InspectorSection = { key: string; label: string; value: unknown };

function ProjectionBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
      {label}
    </span>
  );
}

function renderJson(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {}, null, 2);
}

export default function WorkflowPacksTab({ t }: WorkflowPacksTabProps) {
  const [packs, setPacks] = useState<WorkflowPackConfig[]>([]);
  const [source, setSource] = useState<string>("canonical_projection");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWorkflowPacks();
      setPacks(result.packs ?? []);
      setSource(result.source ?? "canonical_projection");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setPacks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPacks();
  }, []);

  return (
    <section
      className="space-y-5 rounded-xl p-5 sm:p-6"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
            {t({
              ko: "워크플로 팩 인스펙터",
              en: "Workflow Pack Inspector",
              ja: "Workflow Pack Inspector",
              zh: "Workflow Pack Inspector",
            })}
          </h3>
          <p className="text-xs leading-5" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "워크플로 팩은 표준 정책 컴파일러가 만든 읽기 전용 projection입니다. 여기서는 실행 기준을 확인만 합니다.",
              en: "Workflow packs are read-only projections from the canonical compiler. This view is for inspection only.",
              ja: "Workflow packs are read-only projections from the canonical compiler. This view is for inspection only.",
              zh: "Workflow packs are read-only projections from the canonical compiler. This view is for inspection only.",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectionBadge
            label={t({
              ko: "읽기 전용 projection",
              en: "Read-only projection",
              ja: "Read-only projection",
              zh: "Read-only projection",
            })}
          />
          <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-0.5 text-[11px] text-slate-300">
            {source}
          </span>
          <button
            type="button"
            onClick={() => void loadPacks()}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-blue-400 hover:text-blue-300"
            style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-secondary)" }}
          >
            {t({ ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh" })}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
          {t({
            ko: "워크플로 팩 projection을 불러오는 중입니다...",
            en: "Loading workflow pack projection...",
            ja: "Loading workflow pack projection...",
            zh: "Loading workflow pack projection...",
          })}
        </div>
      ) : null}
      {!loading && error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
      {!loading && !error && packs.length === 0 ? (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
          {t({
            ko: "워크플로 팩 projection 데이터가 없습니다.",
            en: "No workflow pack projection is available.",
            ja: "No workflow pack projection is available.",
            zh: "No workflow pack projection is available.",
          })}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {packs.map((pack) => {
            const sections: InspectorSection[] = [
              {
                key: "routing_keywords",
                label: t({
                  ko: "라우팅 키워드",
                  en: "Routing Keywords",
                  ja: "Routing Keywords",
                  zh: "Routing Keywords",
                }),
                value: pack.routing_keywords,
              },
              {
                key: "input_schema",
                label: t({ ko: "입력 스키마", en: "Input Schema", ja: "Input Schema", zh: "Input Schema" }),
                value: pack.input_schema,
              },
              {
                key: "prompt_preset",
                label: t({ ko: "프롬프트 프리셋", en: "Prompt Preset", ja: "Prompt Preset", zh: "Prompt Preset" }),
                value: pack.prompt_preset,
              },
              {
                key: "qa_rules",
                label: t({ ko: "QA 규칙", en: "QA Rules", ja: "QA Rules", zh: "QA Rules" }),
                value: pack.qa_rules,
              },
              {
                key: "output_template",
                label: t({ ko: "출력 템플릿", en: "Output Template", ja: "Output Template", zh: "Output Template" }),
                value: pack.output_template,
              },
              {
                key: "cost_profile",
                label: t({ ko: "비용 프로필", en: "Cost Profile", ja: "Cost Profile", zh: "Cost Profile" }),
                value: pack.cost_profile,
              },
              {
                key: "required_artifacts",
                label: t({
                  ko: "필수 산출물",
                  en: "Required Artifacts",
                  ja: "Required Artifacts",
                  zh: "Required Artifacts",
                }),
                value: pack.required_artifacts ?? [],
              },
              {
                key: "output_contract",
                label: t({ ko: "출력 계약", en: "Output Contract", ja: "Output Contract", zh: "Output Contract" }),
                value: pack.output_contract ?? [],
              },
            ];
            return (
              <article key={pack.key} className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">{pack.name}</div>
                    <div className="text-xs text-slate-400">{pack.key}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <ProjectionBadge
                      label={
                        pack.enabled === false
                          ? t({ ko: "비활성", en: "disabled", ja: "disabled", zh: "disabled" })
                          : t({ ko: "활성", en: "enabled", ja: "enabled", zh: "enabled" })
                      }
                    />
                    {pack.base_key ? <ProjectionBadge label={`base:${String(pack.base_key)}`} /> : null}
                    {pack.derived_from ? <ProjectionBadge label={`derived:${String(pack.derived_from)}`} /> : null}
                    {pack.model_tier_preference ? (
                      <ProjectionBadge label={`tier:${String(pack.model_tier_preference)}`} />
                    ) : null}
                    {pack.source_layer ? <ProjectionBadge label={String(pack.source_layer)} /> : null}
                  </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {sections.map((section) => (
                    <div key={section.key} className="space-y-1 rounded border border-slate-700/50 bg-slate-950/40 p-3">
                      <div className="text-xs font-medium text-slate-300">{section.label}</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-400">
                        {renderJson(section.value)}
                      </pre>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
