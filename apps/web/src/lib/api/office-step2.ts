import type {
  AccountPoolCreateResponse,
  AccountPoolFatigueHistoryResponse,
  AccountPoolsListResponse,
  AccountPoolUpdateResponse,
  CreateAccountPoolRequest,
  CreateRuntimeProfileRequest,
  ProviderProbeResponse,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeHistoryResponse,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse,
  RuntimeProfileCreateResponse,
  RuntimeProfileDeleteResponse,
  RuntimeProfilesListResponse,
  RuntimeProfileUpdateResponse,
  UpdateAccountPoolRequest,
  UpdateRuntimeProfileRequest,
  ProvidersListResponse,
  ProviderKey
} from "@workspace/shared";

import { buildStep3Route, STEP3_ALLOWED_ROUTES } from "./allowed-routes";
import { requestJson, withQuery } from "./client";

export const listProviders = async (): Promise<ProvidersListResponse> => {
  return requestJson<ProvidersListResponse>(STEP3_ALLOWED_ROUTES.PROVIDERS, {
    method: "GET"
  });
};

export const probeProvider = async (provider: ProviderKey): Promise<ProviderProbeResponse> => {
  return requestJson<ProviderProbeResponse>(STEP3_ALLOWED_ROUTES.PROVIDERS_PROBE, {
    method: "POST",
    body: JSON.stringify({ provider })
  });
};

export const listAccountPools = async (): Promise<AccountPoolsListResponse> => {
  return requestJson<AccountPoolsListResponse>(STEP3_ALLOWED_ROUTES.ACCOUNT_POOLS, { method: "GET" });
};

export const createAccountPool = async (
  payload: CreateAccountPoolRequest
): Promise<AccountPoolCreateResponse> => {
  return requestJson<AccountPoolCreateResponse>(STEP3_ALLOWED_ROUTES.ACCOUNT_POOLS, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const updateAccountPool = async (
  id: string,
  payload: UpdateAccountPoolRequest
): Promise<AccountPoolUpdateResponse> => {
  return requestJson<AccountPoolUpdateResponse>(buildStep3Route.accountPoolById(id), {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
};

export const listAccountPoolFatigueHistory = async (
  accountPoolId: string,
  limit = 100
): Promise<AccountPoolFatigueHistoryResponse> => {
  return requestJson<AccountPoolFatigueHistoryResponse>(
    withQuery(buildStep3Route.accountPoolFatigue(accountPoolId), { limit }),
    { method: "GET" }
  );
};

export const listRuntimeProfiles = async (): Promise<RuntimeProfilesListResponse> => {
  return requestJson<RuntimeProfilesListResponse>(STEP3_ALLOWED_ROUTES.RUNTIME_PROFILES, { method: "GET" });
};

export const createRuntimeProfile = async (
  payload: CreateRuntimeProfileRequest
): Promise<RuntimeProfileCreateResponse> => {
  return requestJson<RuntimeProfileCreateResponse>(STEP3_ALLOWED_ROUTES.RUNTIME_PROFILES, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const updateRuntimeProfile = async (
  id: string,
  payload: UpdateRuntimeProfileRequest
): Promise<RuntimeProfileUpdateResponse> => {
  return requestJson<RuntimeProfileUpdateResponse>(buildStep3Route.runtimeProfileById(id), {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
};

export const deleteRuntimeProfile = async (id: string): Promise<RuntimeProfileDeleteResponse> => {
  return requestJson<RuntimeProfileDeleteResponse>(buildStep3Route.runtimeProfileById(id), {
    method: "DELETE"
  });
};

export const runProviderUsageProbe = async (
  payload: ProviderUsageProbeRunRequest
): Promise<ProviderUsageProbeRunResponse> => {
  return requestJson<ProviderUsageProbeRunResponse>(STEP3_ALLOWED_ROUTES.PROVIDER_PROBES_RUN, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const listProviderUsageProbeHistory = async (
  query: ProviderUsageProbeHistoryQuery = {}
): Promise<ProviderUsageProbeHistoryResponse> => {
  return requestJson<ProviderUsageProbeHistoryResponse>(
    withQuery(STEP3_ALLOWED_ROUTES.PROVIDER_PROBES_HISTORY, {
      limit: query.limit,
      provider: query.provider,
      accountPoolId: query.accountPoolId,
      runtimeProfileId: query.runtimeProfileId
    }),
    { method: "GET" }
  );
};
