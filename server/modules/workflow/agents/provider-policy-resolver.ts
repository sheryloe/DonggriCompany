export type ProviderModelConfig = Record<
  string,
  {
    model: string;
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
  reasoningLevel: string | undefined;
};

export function resolveProviderExecutionPolicy(
  input: ResolveProviderExecutionPolicyInput,
): ProviderExecutionPolicy {
  const provider = String(input.provider ?? "").trim().toLowerCase();
  const providerConfig = input.providerModelConfig[provider] ?? null;
  return {
    model: providerConfig?.model || undefined,
    reasoningLevel: providerConfig?.reasoningLevel || undefined,
  };
}
