import type { CliModelInfo } from "../types";

const CODEX_FALLBACK_MODELS: CliModelInfo[] = [
  { slug: "gpt-5.3-codex", displayName: "GPT-5.3 Codex" },
  { slug: "gpt-5.2-codex", displayName: "GPT-5.2 Codex" },
  { slug: "gpt-5.1-codex-max", displayName: "GPT-5.1 Codex Max" },
  { slug: "gpt-5.2", displayName: "GPT-5.2" },
  { slug: "gpt-5.1-codex-mini", displayName: "GPT-5.1 Codex Mini" },
];

const AGY_FALLBACK_MODELS: CliModelInfo[] = [
  { slug: "Gemini 3.1 Pro (High)", displayName: "Gemini 3.1 Pro (High)" },
  { slug: "Gemini 3.5 Flash (Medium)", displayName: "Gemini 3.5 Flash (Medium)" },
];

function dedupeModels(models: readonly CliModelInfo[]): CliModelInfo[] {
  const seen = new Set<string>();
  const list: CliModelInfo[] = [];
  for (const model of models) {
    const slug = String(model.slug ?? "").trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    list.push({
      slug,
      displayName: model.displayName || slug,
      description: model.description,
      reasoningLevels: model.reasoningLevels,
      defaultReasoningLevel: model.defaultReasoningLevel,
    });
  }
  return list;
}

function providerFallbackModels(provider: string): CliModelInfo[] {
  if (provider === "codex") return CODEX_FALLBACK_MODELS;
  if (provider === "agy" || provider === "gemini" || provider === "antigravity") return AGY_FALLBACK_MODELS;
  return [];
}

export function withCliModelFallback(
  provider: string,
  models: readonly CliModelInfo[] | null | undefined,
): CliModelInfo[] {
  const base = Array.isArray(models) ? models : [];
  const fallback = providerFallbackModels(provider);
  if (base.length > 0) return dedupeModels(base);
  return dedupeModels(fallback);
}
