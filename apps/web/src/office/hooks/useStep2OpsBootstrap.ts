"use client";

import { useEffect, useState } from "react";

import type { AccountPoolView, ProviderProbeView, RuntimeProfileView } from "@workspace/shared";

import {
  listAccountPools,
  listProviders,
  listRuntimeProfiles
} from "../../lib/api/office-step2";
import {
  createInitialOfficeOpsState,
  normalizeOfficeOpsState,
  type OfficeOpsState
} from "../stores/officeOpsStore";

export type Step2OpsBootstrapResult = {
  isLoading: boolean;
  errorMessage: string | null;
  pools: AccountPoolView[];
  profiles: RuntimeProfileView[];
  providers: ProviderProbeView[];
  officeOpsState: OfficeOpsState;
  setOfficeOpsState: (updater: (previous: OfficeOpsState) => OfficeOpsState) => void;
  refresh: () => Promise<void>;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

export const useStep2OpsBootstrap = (): Step2OpsBootstrapResult => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pools, setPools] = useState<AccountPoolView[]>([]);
  const [profiles, setProfiles] = useState<RuntimeProfileView[]>([]);
  const [providers, setProviders] = useState<ProviderProbeView[]>([]);
  const [officeOpsState, setOfficeOpsStateInternal] = useState<OfficeOpsState>(createInitialOfficeOpsState());

  const refresh = async (): Promise<void> => {
    const shouldShowPageLoading = pools.length === 0 && profiles.length === 0 && providers.length === 0;
    if (shouldShowPageLoading) {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const [poolResponse, profileResponse, providerResponse] = await Promise.all([
        listAccountPools(),
        listRuntimeProfiles(),
        listProviders()
      ]);

      setPools(poolResponse.pools);
      setProfiles(profileResponse.profiles);
      setProviders(providerResponse.providers);
      setOfficeOpsStateInternal((previous) =>
        normalizeOfficeOpsState(previous, poolResponse.pools, profileResponse.profiles)
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const setOfficeOpsState = (updater: (previous: OfficeOpsState) => OfficeOpsState): void => {
    setOfficeOpsStateInternal((previous) => normalizeOfficeOpsState(updater(previous), pools, profiles));
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    isLoading,
    errorMessage,
    pools,
    profiles,
    providers,
    officeOpsState,
    setOfficeOpsState,
    refresh
  };
};
