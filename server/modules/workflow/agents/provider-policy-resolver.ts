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
  const provider = String(input.provider ?? "")
    .trim()
    .toLowerCase();
  const providerConfig = input.providerModelConfig[provider] ?? null;
  return {
    model: normalizeOptionalString(providerConfig?.model),
    subModel: normalizeOptionalString(providerConfig?.subModel),
    reasoningLevel: normalizeOptionalString(providerConfig?.reasoningLevel),
    subModelReasoningLevel: normalizeOptionalString(providerConfig?.subModelReasoningLevel),
  };
}
