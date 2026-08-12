export type ProviderModelConfig = Record<
  string,
  {
    model?: string;
    subModel?: string;
    reasoningLevel?: string;
    subModelReasoningLevel?: string;
  }
>;

type ResolveProviderExecutionPolicyInput = {
  provider: string | null | undefined;
  providerModelConfig: ProviderModelConfig;
  canonicalOverride?: {
    provider?: string | null;
    model?: string | null;
    reasoningLevel?: string | null;
    subProvider?: string | null;
    subModel?: string | null;
    subReasoningLevel?: string | null;
  } | null;
};

export type ProviderExecutionPolicy = {
  model: string | undefined;
  subModel: string | undefined;
  reasoningLevel: string | undefined;
  subModelReasoningLevel: string | undefined;
};

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function resolveProviderExecutionPolicy(input: ResolveProviderExecutionPolicyInput): ProviderExecutionPolicy {
  const providerRaw = String(input.provider ?? "")
    .trim()
    .toLowerCase();
  const provider = providerRaw === "gemini" || providerRaw === "antigravity" ? "agy" : providerRaw;
  const providerConfig = provider ? input.providerModelConfig?.[provider] : undefined;
  const canonicalProviderRaw = String(input.canonicalOverride?.provider ?? input.canonicalOverride?.subProvider ?? "")
    .trim()
    .toLowerCase();
  const canonicalProvider =
    canonicalProviderRaw === "gemini" || canonicalProviderRaw === "antigravity" ? "agy" : canonicalProviderRaw;
  const canonicalOverride =
    input.canonicalOverride && (!canonicalProvider || !provider || canonicalProvider === provider)
      ? input.canonicalOverride
      : null;
  return {
    model: normalizeOptionalString(canonicalOverride?.model) ?? normalizeOptionalString(providerConfig?.model),
    subModel: normalizeOptionalString(canonicalOverride?.subModel) ?? normalizeOptionalString(providerConfig?.subModel),
    reasoningLevel:
      normalizeOptionalString(canonicalOverride?.reasoningLevel) ?? normalizeOptionalString(providerConfig?.reasoningLevel),
    subModelReasoningLevel:
      normalizeOptionalString(canonicalOverride?.subReasoningLevel) ??
      normalizeOptionalString(providerConfig?.subModelReasoningLevel),
  };
}
