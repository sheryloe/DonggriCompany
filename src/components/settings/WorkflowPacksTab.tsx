import { useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import type { WorkflowPackConfig } from "../../api";
import type { TFunction } from "./types";

type JsonFieldKey =
  | "routing_keywords"
  | "input_schema"
  | "prompt_preset"
  | "qa_rules"
  | "output_template"
  | "cost_profile";

type WorkflowPackDraft = {
  name: string;
  enabled: boolean;
  routing_keywords: string;
  input_schema: string;
  prompt_preset: string;
  qa_rules: string;
  output_template: string;
  cost_profile: string;
};

const JSON_FIELDS: Array<{ key: JsonFieldKey; label: (t: TFunction) => string }> = [
  {
    key: "routing_keywords",
    label: (t) => t({ ko: "라우팅 키워드", en: "Routing keywords", ja: "Routing keywords", zh: "Routing keywords" }),
  },
  {
    key: "input_schema",
    label: (t) => t({ ko: "입력 스키마", en: "Input schema", ja: "Input schema", zh: "Input schema" }),
  },
  {
    key: "prompt_preset",
    label: (t) => t({ ko: "프롬프트 프리셋", en: "Prompt preset", ja: "Prompt preset", zh: "Prompt preset" }),
  },
  {
    key: "qa_rules",
    label: (t) => t({ ko: "QA 규칙", en: "QA rules", ja: "QA rules", zh: "QA rules" }),
  },
  {
    key: "output_template",
    label: (t) => t({ ko: "출력 템플릿", en: "Output template", ja: "Output template", zh: "Output template" }),
  },
  {
    key: "cost_profile",
    label: (t) => t({ ko: "비용 프로필", en: "Cost profile", ja: "Cost profile", zh: "Cost profile" }),
  },
];

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function createDraft(pack: WorkflowPackConfig): WorkflowPackDraft {
  return {
    name: pack.name,
    enabled: pack.enabled !== false,
    routing_keywords: formatJson(pack.routing_keywords),
    input_schema: formatJson(pack.input_schema),
    prompt_preset: formatJson(pack.prompt_preset),
    qa_rules: formatJson(pack.qa_rules),
    output_template: formatJson(pack.output_template),
    cost_profile: formatJson(pack.cost_profile),
  };
}

type WorkflowPacksTabProps = {
  t: TFunction;
};

export default function WorkflowPacksTab({ t }: WorkflowPacksTabProps) {
  const [packs, setPacks] = useState<WorkflowPackConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, WorkflowPackDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveMessageByKey, setSaveMessageByKey] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [validationByKey, setValidationByKey] = useState<Record<string, Partial<Record<JsonFieldKey, string>>>>({});

  const packEntries = useMemo(
    () => packs.map((pack) => ({ pack, draft: drafts[pack.key] ?? createDraft(pack) })),
    [drafts, packs],
  );

  const loadPacks = async () => {
    setLoading(true);
    setLoadingError(null);
    try {
      const result = await api.getWorkflowPacks();
      const nextPacks = result.packs ?? [];
      setPacks(nextPacks);
      setDrafts(
        Object.fromEntries(nextPacks.map((pack) => [pack.key, createDraft(pack)])) as Record<string, WorkflowPackDraft>,
      );
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : String(error));
      setPacks([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPacks();
  }, []);

  const setDraftField = <K extends keyof WorkflowPackDraft>(packKey: string, field: K, value: WorkflowPackDraft[K]) => {
    setDrafts((prev) => ({
      ...prev,
      [packKey]: {
        ...(prev[packKey] ?? drafts[packKey]),
        [field]: value,
      },
    }));
    if (field !== "name" && field !== "enabled") {
      setValidationByKey((prev) => ({
        ...prev,
        [packKey]: {
          ...(prev[packKey] ?? {}),
          [field]: undefined,
        },
      }));
    }
    setSaveMessageByKey((prev) => {
      const next = { ...prev };
      delete next[packKey];
      return next;
    });
  };

  const savePack = async (pack: WorkflowPackConfig) => {
    const draft = drafts[pack.key];
    if (!draft) return;

    const validationErrors: Partial<Record<JsonFieldKey, string>> = {};
    const parsedPayload: Partial<Omit<WorkflowPackConfig, "key" | "created_at" | "updated_at">> = {
      name: draft.name.trim(),
      enabled: draft.enabled,
    };

    for (const field of JSON_FIELDS) {
      try {
        parsedPayload[field.key] = JSON.parse(draft[field.key]);
      } catch {
        validationErrors[field.key] = t({
          ko: "유효한 JSON을 입력하세요.",
          en: "Enter valid JSON.",
          ja: "Enter valid JSON.",
          zh: "Enter valid JSON.",
        });
      }
    }

    if (!parsedPayload.name) {
      setSaveMessageByKey((prev) => ({
        ...prev,
        [pack.key]: {
          ok: false,
          message: t({
            ko: "이름은 비워둘 수 없습니다.",
            en: "Name is required.",
            ja: "Name is required.",
            zh: "Name is required.",
          }),
        },
      }));
      return;
    }

    setValidationByKey((prev) => ({ ...prev, [pack.key]: validationErrors }));
    if (Object.keys(validationErrors).length > 0) {
      setSaveMessageByKey((prev) => ({
        ...prev,
        [pack.key]: {
          ok: false,
          message: t({
            ko: "저장 전에 JSON 오류를 수정하세요.",
            en: "Fix JSON validation errors before saving.",
            ja: "Fix JSON validation errors before saving.",
            zh: "Fix JSON validation errors before saving.",
          }),
        },
      }));
      return;
    }

    setSavingKey(pack.key);
    try {
      const result = await api.updateWorkflowPack(pack.key, parsedPayload);
      setPacks((prev) => prev.map((entry) => (entry.key === pack.key ? result.pack : entry)));
      setDrafts((prev) => ({
        ...prev,
        [pack.key]: createDraft(result.pack),
      }));
      setSaveMessageByKey((prev) => ({
        ...prev,
        [pack.key]: {
          ok: true,
          message: t({
            ko: "워크플로 팩 정책을 저장했습니다.",
            en: "Workflow pack policy saved.",
            ja: "Workflow pack policy saved.",
            zh: "Workflow pack policy saved.",
          }),
        },
      }));
    } catch (error) {
      setSaveMessageByKey((prev) => ({
        ...prev,
        [pack.key]: {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section
      className="space-y-5 rounded-xl p-5 sm:p-6"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
            {t({
              ko: "워크플로 팩 정책",
              en: "Workflow pack policy",
              ja: "Workflow pack policy",
              zh: "Workflow pack policy",
            })}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {t({
              ko: "세션 선택과 분리된 정책 편집 전용 화면입니다.",
              en: "Policy editor only. Session-level pack selection stays in channel settings.",
              ja: "Policy editor only. Session-level pack selection stays in channel settings.",
              zh: "Policy editor only. Session-level pack selection stays in channel settings.",
            })}
          </p>
        </div>
        <button
          onClick={() => void loadPacks()}
          className="text-xs text-blue-400 transition-colors hover:text-blue-300"
        >
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-4 text-sm text-slate-400">
          {t({
            ko: "워크플로 팩을 불러오는 중...",
            en: "Loading workflow packs...",
            ja: "Loading workflow packs...",
            zh: "Loading workflow packs...",
          })}
        </div>
      ) : null}

      {!loading && loadingError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-4 text-sm text-rose-200">
          {loadingError}
        </div>
      ) : null}

      {!loading && !loadingError && packEntries.length === 0 ? (
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-4 text-sm text-slate-400">
          {t({
            ko: "편집 가능한 워크플로 팩이 없습니다.",
            en: "No workflow packs available.",
            ja: "No workflow packs available.",
            zh: "No workflow packs available.",
          })}
        </div>
      ) : null}

      {!loading && !loadingError ? (
        <div className="space-y-4">
          {packEntries.map(({ pack, draft }) => {
            const validation = validationByKey[pack.key] ?? {};
            const saveState = saveMessageByKey[pack.key] ?? null;
            const isSaving = savingKey === pack.key;

            return (
              <article key={pack.key} className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{pack.key}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {t({ ko: "마지막 업데이트", en: "Last updated", ja: "Last updated", zh: "Last updated" })}:{" "}
                      {pack.updated_at ? new Date(pack.updated_at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => setDraftField(pack.key, "enabled", event.target.checked)}
                    />
                    <span>{t({ ko: "활성화", en: "Enabled", ja: "Enabled", zh: "Enabled" })}</span>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">
                    {t({ ko: "표시 이름", en: "Name", ja: "Name", zh: "Name" })}
                  </span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraftField(pack.key, "name", event.target.value)}
                    className="w-full rounded border border-slate-600 bg-slate-900/50 px-2 py-1.5 text-sm text-white"
                  />
                </label>

                <div className="grid gap-3 lg:grid-cols-2">
                  {JSON_FIELDS.map((field) => (
                    <label key={`${pack.key}:${field.key}`} className="block space-y-1">
                      <span className="text-xs text-slate-400">{field.label(t)}</span>
                      <textarea
                        value={draft[field.key]}
                        onChange={(event) => setDraftField(pack.key, field.key, event.target.value)}
                        className="min-h-[180px] w-full rounded border border-slate-600 bg-slate-900/50 px-2 py-2 font-mono text-xs text-white"
                      />
                      {validation[field.key] ? (
                        <span className="text-[11px] text-rose-300">{validation[field.key]}</span>
                      ) : null}
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs">
                    {saveState ? (
                      <span className={saveState.ok ? "text-emerald-300" : "text-rose-300"}>{saveState.message}</span>
                    ) : (
                      <span className="text-slate-500">
                        {t({
                          ko: "JSON은 그대로 편집되며 저장 전에 클라이언트에서 검증합니다.",
                          en: "JSON is edited raw and validated client-side before save.",
                          ja: "JSON is edited raw and validated client-side before save.",
                          zh: "JSON is edited raw and validated client-side before save.",
                        })}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void savePack(pack)}
                    className="rounded border border-blue-500/40 px-3 py-1.5 text-xs text-blue-300 enabled:hover:bg-blue-500/10 disabled:opacity-50"
                  >
                    {isSaving
                      ? t({ ko: "저장 중...", en: "Saving...", ja: "Saving...", zh: "Saving..." })
                      : t({ ko: "이 팩 저장", en: "Save pack", ja: "Save pack", zh: "Save pack" })}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
