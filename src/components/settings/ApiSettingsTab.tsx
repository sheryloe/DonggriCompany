import { useState } from "react";
import { API_TYPE_PRESETS } from "./constants";
import ApiAssignModal from "./ApiAssignModal";
import { getApiSettingsCopy, getSettingsCommonCopy } from "./settings-copy";
import type { ApiStateBundle, TFunction } from "./types";
import { DEFAULT_API_FORM } from "./useApiProvidersState";

interface ApiSettingsTabProps {
  t: TFunction;
  localeTag: string;
  apiState: ApiStateBundle;
}

export default function ApiSettingsTab({ t, localeTag, apiState }: ApiSettingsTabProps) {
  const common = getSettingsCommonCopy(t);
  const copy = getApiSettingsCopy(t);
  const {
    apiProviders,
    apiProvidersLoading,
    apiOfficialPresets,
    apiPresetsLoading,
    apiAddMode,
    apiEditingId,
    apiForm,
    apiSaving,
    apiSaveError,
    apiTesting,
    apiTestResult,
    apiModelsExpanded,
    setApiAddMode,
    setApiEditingId,
    setApiForm,
    setApiSaveError,
    setApiModelsExpanded,
    loadApiProviders,
    loadApiPresets,
    handleApiProviderSave,
    handleApiProviderDelete,
    handleApiProviderTest,
    handleApiProviderToggle,
    handleApiEditStart,
    handleApiModelAssign,
  } = apiState;

  const [modelSearchQueries, setModelSearchQueries] = useState<Record<string, string>>({});
  const selectedOfficialPreset = apiForm.preset_key ? apiOfficialPresets[apiForm.preset_key] : null;
  const isOfficialPresetSelected = Boolean(apiForm.preset_key);

  function resetForm(): void {
    setApiAddMode(false);
    setApiEditingId(null);
    setApiSaveError(null);
    setApiForm(DEFAULT_API_FORM);
  }

  function openAddMode(): void {
    setApiAddMode(true);
    setApiEditingId(null);
    setApiSaveError(null);
    setApiForm(DEFAULT_API_FORM);
  }

  return (
    <>
      <section className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{copy.title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void Promise.all([loadApiProviders(), loadApiPresets()]);
              }}
              disabled={apiProvidersLoading || apiPresetsLoading}
              className="text-xs text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50"
            >
              {common.refresh}
            </button>
            {!apiAddMode && (
              <button
                onClick={openAddMode}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              >
                + {common.add}
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">{copy.intro}</p>
        <p className="text-[11px] text-slate-500">
          {t({
            ko: "agent/dept API 모델 강제 할당은 compatibility-only로 전환되어 읽기 전용입니다.",
            en: "Agent/department API model assignment is compatibility-only and read-only.",
            ja: "Agent/department API model assignment is compatibility-only and read-only.",
            zh: "Agent/department API model assignment is compatibility-only and read-only.",
          })}
        </p>

        {apiAddMode && (
          <div className="space-y-3 rounded-lg border border-blue-500/30 bg-slate-900/50 p-4">
            <h4 className="text-xs font-semibold uppercase text-blue-400">
              {apiEditingId ? copy.editProvider : copy.addProvider}
            </h4>

            <div>
              <label className="mb-1 block text-xs text-slate-400">{copy.officialPresets}</label>
              <p className="mb-2 text-[11px] text-slate-500">{copy.officialPresetsHelp}</p>

              {apiPresetsLoading ? (
                <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
                  {copy.presetsLoading}
                </div>
              ) : Object.keys(apiOfficialPresets).length === 0 ? (
                <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
                  {copy.presetsFailed}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(apiOfficialPresets).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setApiSaveError(null);
                        setApiForm((prev) => ({
                          ...prev,
                          preset_key: key,
                          name: preset.label,
                          type: preset.type,
                          base_url: preset.base_url,
                        }));
                      }}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        apiForm.preset_key === key
                          ? "border-blue-500/60 bg-blue-600/15"
                          : "border-slate-700/40 bg-slate-900/40 hover:border-slate-500/60 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{preset.label}</span>
                        <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                          {preset.type}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{preset.description}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">{preset.base_url}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedOfficialPreset && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-blue-300">{selectedOfficialPreset.label}</div>
                  <a
                    href={selectedOfficialPreset.docs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    {copy.openDocs}
                  </a>
                </div>
                <div className="mt-2 text-[11px] text-slate-300">{selectedOfficialPreset.api_key_hint}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedOfficialPreset.fallback_models.map((model) => (
                    <span
                      key={model}
                      className="rounded-full border border-blue-500/20 bg-slate-950/40 px-2 py-0.5 text-[10px] font-mono text-blue-200"
                    >
                      {model}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-400">{copy.genericType}</label>
              <p className="mb-2 text-[11px] text-slate-500">
                {isOfficialPresetSelected ? copy.genericTypeHelpLocked : copy.genericTypeHelpManual}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  Object.entries(API_TYPE_PRESETS) as Array<
                    [keyof typeof API_TYPE_PRESETS, { label: string; base_url: string }]
                  >
                ).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setApiSaveError(null);
                      setApiForm((prev) => ({
                        ...prev,
                        preset_key: null,
                        type: key,
                        base_url: preset.base_url || prev.base_url,
                        name: prev.name || preset.label,
                      }));
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                      !apiForm.preset_key && apiForm.type === key
                        ? "border-blue-500/50 bg-blue-600/30 text-blue-300"
                        : "border-slate-600/30 bg-slate-700/30 text-slate-400 hover:border-slate-500/50 hover:text-slate-200"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">{copy.name}</label>
              <input
                type="text"
                value={apiForm.name}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, name: e.target.value }));
                }}
                placeholder={copy.namePlaceholder}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Base URL</label>
              <input
                type="text"
                value={apiForm.base_url}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, base_url: e.target.value }));
                }}
                placeholder="https://api.openai.com/v1"
                readOnly={isOfficialPresetSelected}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none ${
                  isOfficialPresetSelected
                    ? "border-blue-500/20 bg-slate-800/70 text-slate-300"
                    : "border-slate-600 bg-slate-700/50"
                }`}
              />
              {isOfficialPresetSelected && (
                <p className="mt-1 text-[11px] text-slate-500">{copy.baseUrlManagedByPreset}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">
                API Key{" "}
                {!selectedOfficialPreset && apiForm.type === "ollama" && (
                  <span className="text-slate-600">({copy.usuallyNotNeededForLocal})</span>
                )}
              </label>
              <input
                type="password"
                value={apiForm.api_key}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, api_key: e.target.value }));
                }}
                placeholder={
                  apiEditingId
                    ? copy.changeApiKeyPlaceholder
                    : (selectedOfficialPreset?.api_key_placeholder ?? "sk-...")
                }
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none"
              />
              {selectedOfficialPreset && (
                <p className="mt-1 text-[11px] text-slate-500">{selectedOfficialPreset.api_key_hint}</p>
              )}
            </div>

            {apiSaveError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {apiSaveError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleApiProviderSave()}
                disabled={apiSaving || !apiForm.name.trim() || !apiForm.base_url.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {apiSaving ? common.saving : apiEditingId ? common.update : common.add}
              </button>
              <button
                onClick={resetForm}
                className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-600"
              >
                {common.cancel}
              </button>
            </div>
          </div>
        )}

        {apiProvidersLoading ? (
          <div className="animate-pulse py-4 text-center text-xs text-slate-500">{common.loading}</div>
        ) : apiProviders.length === 0 && !apiAddMode ? (
          <div className="py-6 text-center text-xs text-slate-500">{copy.noProviders}</div>
        ) : (
          <div className="space-y-3">
            {apiProviders.map((provider) => {
              const testResult = apiTestResult[provider.id];
              const isExpanded = apiModelsExpanded[provider.id];
              const searchQuery = (modelSearchQueries[provider.id] || "").trim().toLowerCase();
              const filteredModels = isExpanded
                ? provider.models_cache.filter((model) =>
                    searchQuery ? model.toLowerCase().includes(searchQuery) : true,
                  )
                : [];
              const presetLabel = provider.preset_key
                ? (apiOfficialPresets[provider.preset_key]?.label ?? provider.preset_key)
                : null;

              return (
                <div
                  key={provider.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    provider.enabled
                      ? "border-slate-600/50 bg-slate-800/40"
                      : "border-slate-700/30 bg-slate-900/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                          provider.enabled ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                      <span className="truncate text-sm font-medium text-white">{provider.name}</span>
                      <span className="flex-shrink-0 rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                        {provider.type}
                      </span>
                      {presetLabel && (
                        <span className="flex-shrink-0 rounded border border-blue-500/20 bg-blue-600/20 px-1.5 py-0.5 text-[10px] text-blue-300">
                          {presetLabel}
                        </span>
                      )}
                      {provider.has_api_key && <span className="flex-shrink-0 text-[10px] text-emerald-400">key</span>}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => void handleApiProviderTest(provider.id)}
                        disabled={apiTesting === provider.id}
                        className="rounded border border-cyan-500/30 bg-cyan-600/20 px-2 py-1 text-[10px] text-cyan-400 transition-colors hover:bg-cyan-600/30 disabled:opacity-50"
                        title={copy.testConnection}
                      >
                        {apiTesting === provider.id ? "..." : common.test}
                      </button>
                      <button
                        onClick={() => handleApiEditStart(provider)}
                        className="rounded border border-slate-500/30 bg-slate-600/30 px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-slate-600/50 hover:text-slate-200"
                      >
                        {common.edit}
                      </button>
                      <button
                        onClick={() => void handleApiProviderToggle(provider.id, provider.enabled)}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                          provider.enabled
                            ? "border-amber-500/30 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                            : "border-emerald-500/30 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                        }`}
                      >
                        {provider.enabled ? common.disable : common.enable}
                      </button>
                      <button
                        onClick={() => void handleApiProviderDelete(provider.id)}
                        className="rounded border border-red-500/30 bg-red-600/20 px-2 py-1 text-[10px] text-red-400 transition-colors hover:bg-red-600/30"
                      >
                        {common.delete}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 truncate text-[11px] font-mono text-slate-500">{provider.base_url}</div>

                  {testResult && (
                    <div
                      className={`mt-2 rounded px-2.5 py-1.5 text-[11px] ${
                        testResult.ok
                          ? "border border-green-500/20 bg-green-500/10 text-green-400"
                          : "border border-red-500/20 bg-red-500/10 text-red-400"
                      }`}
                    >
                      {testResult.msg}
                    </div>
                  )}

                  {provider.models_cache && provider.models_cache.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setApiModelsExpanded((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="text-[11px] text-slate-400 transition-colors hover:text-slate-200"
                      >
                        {isExpanded ? "-" : "+"} {common.models} ({provider.models_cache.length})
                        {provider.models_cached_at && (
                          <span className="ml-1 text-slate-600">
                            {new Date(provider.models_cached_at).toLocaleString(localeTag, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder={`${common.searchModels}...`}
                            aria-label={common.searchModels}
                            value={modelSearchQueries[provider.id] || ""}
                            onChange={(e) =>
                              setModelSearchQueries((prev) => ({ ...prev, [provider.id]: e.target.value }))
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] text-white focus:border-blue-500 focus:outline-none"
                          />
                          <div className="max-h-48 overflow-y-auto rounded border border-slate-700/30 bg-slate-900/40 p-2">
                            {filteredModels.map((model) => (
                              <div
                                key={model}
                                className="group/model -mx-1 flex items-center justify-between rounded px-1 py-0.5 text-[11px] font-mono text-slate-400 hover:bg-slate-700/30"
                              >
                                <span className="truncate">{model}</span>
                                <button
                                  onClick={() => void handleApiModelAssign(provider.id, model)}
                                  disabled
                                  className="ml-2 whitespace-nowrap rounded bg-slate-700/70 px-1.5 py-0.5 text-[9px] text-slate-400 opacity-0 transition-opacity group-hover/model:opacity-100 disabled:cursor-not-allowed"
                                  title={t({
                                    ko: "읽기 전용(compatibility-only)",
                                    en: "Read-only (compatibility-only)",
                                    ja: "Read-only (compatibility-only)",
                                    zh: "Read-only (compatibility-only)",
                                  })}
                                >
                                  {t({ ko: "읽기 전용", en: "Read-only", ja: "Read-only", zh: "Read-only" })}
                                </button>
                              </div>
                            ))}
                            {filteredModels.length === 0 && (
                              <div className="py-2 text-center text-[11px] text-slate-500">{common.noResults}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ApiAssignModal t={t} localeTag={localeTag} apiState={apiState} />
    </>
  );
}
