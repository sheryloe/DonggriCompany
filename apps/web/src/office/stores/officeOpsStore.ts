import type {
  AccountPoolView,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeProvider,
  RuntimeProfileView
} from "@workspace/shared";

export type OfficeOpsState = {
  selectedProvider: ProviderUsageProbeProvider;
  selectedAccountPoolId: string;
  selectedRuntimeProfileId: string;
};

const defaultProvider: ProviderUsageProbeProvider = "codex";

export const createInitialOfficeOpsState = (): OfficeOpsState => ({
  selectedProvider: defaultProvider,
  selectedAccountPoolId: "",
  selectedRuntimeProfileId: ""
});

export const normalizeOfficeOpsState = (
  state: OfficeOpsState,
  pools: AccountPoolView[],
  profiles: RuntimeProfileView[]
): OfficeOpsState => {
  const providerCandidates = new Set<ProviderUsageProbeProvider>([
    ...pools.map((pool) => pool.provider),
    ...profiles.map((profile) => profile.provider)
  ]);
  const selectedProvider = providerCandidates.has(state.selectedProvider)
    ? state.selectedProvider
    : pools[0]?.provider ?? profiles[0]?.provider ?? defaultProvider;

  const providerPools = pools.filter((pool) => pool.provider === selectedProvider);
  const selectedAccountPoolId = providerPools.some((pool) => pool.id === state.selectedAccountPoolId)
    ? state.selectedAccountPoolId
    : providerPools[0]?.id ?? "";

  const profileCandidates = profiles.filter((profile) => {
    if (profile.provider !== selectedProvider) {
      return false;
    }
    if (selectedAccountPoolId.length > 0) {
      return profile.accountPoolId === selectedAccountPoolId;
    }
    return true;
  });
  const selectedRuntimeProfileId = profileCandidates.some((profile) => profile.id === state.selectedRuntimeProfileId)
    ? state.selectedRuntimeProfileId
    : profileCandidates[0]?.id ?? "";

  return {
    selectedProvider,
    selectedAccountPoolId,
    selectedRuntimeProfileId
  };
};

export const toProbeHistoryQuery = (state: OfficeOpsState): ProviderUsageProbeHistoryQuery => {
  return {
    provider: state.selectedProvider,
    accountPoolId: state.selectedAccountPoolId || undefined,
    runtimeProfileId: state.selectedRuntimeProfileId || undefined
  };
};
