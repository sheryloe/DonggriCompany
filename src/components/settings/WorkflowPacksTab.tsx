import { useEffect, useState } from "react";
import * as api from "../../api";
import type { WorkflowPackConfig } from "../../api";
import type { TFunction } from "./types";

type WorkflowPacksTabProps = {
  t: TFunction;
};

type InspectorSection = {
  key: string;
  label: string;
  value: unknown;
};

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
              ja: "ワークフローパック インスペクター",
              zh: "工作流包检查器",
            })}
          </h3>
          <p className="text-xs leading-5" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "워크플로 팩은 canonical compiler 결과를 읽기 전용 projection으로만 표시합니다.",
              en: "Workflow packs are displayed as read-only projections from the canonical compiler.",
              ja: "ワークフローパックは canonical compiler からの読み取り専用 projection として表示されます。",
              zh: "工作流包仅作为 canonical compiler 的只读 projection 显示。",
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ProjectionBadge label="Projection" />
          <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-0.5 text-[11px] text-slate-300">
            {source}
          </span>
          <button
            type="button"
            onClick={() => void loadPacks()}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-blue-400 hover:text-blue-300"
            style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-secondary)" }}
          >
            {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
          {t({
            ko: "워크플로 팩 projection을 불러오는 중입니다...",
            en: "Loading workflow pack projection...",
            ja: "ワークフローパック projection を読み込んでいます...",
            zh: "正在加载工作流包 projection...",
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
            ja: "利用可能なワークフローパック projection はありません。",
            zh: "没有可用的工作流包 projection。",
          })}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {packs.map((pack) => {
            const sections: InspectorSection[] = [
              { key: "routing_keywords", label: "Routing Keywords", value: pack.routing_keywords },
              { key: "input_schema", label: "Input Schema", value: pack.input_schema },
              { key: "prompt_preset", label: "Prompt Preset", value: pack.prompt_preset },
              { key: "qa_rules", label: "QA Rules", value: pack.qa_rules },
              { key: "output_template", label: "Output Template", value: pack.output_template },
              { key: "cost_profile", label: "Cost Profile", value: pack.cost_profile },
              { key: "required_artifacts", label: "Required Artifacts", value: pack.required_artifacts ?? [] },
              { key: "output_contract", label: "Output Contract", value: pack.output_contract ?? [] },
            ];

            return (
              <article key={pack.key} className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">{pack.name}</div>
                    <div className="text-xs text-slate-400">{pack.key}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <ProjectionBadge label={pack.enabled === false ? "disabled" : "enabled"} />
                    {pack.base_key ? <ProjectionBadge label={`base:${String(pack.base_key)}`} /> : null}
                    {pack.derived_from ? <ProjectionBadge label={`derived:${String(pack.derived_from)}`} /> : null}
                    {pack.model_tier_preference ? <ProjectionBadge label={`tier:${String(pack.model_tier_preference)}`} /> : null}
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
