import type {
  AgentId,
  AgentModelAssignmentsListResponse,
  AccountPoolCreateResponse,
  AccountPoolFatigueHistoryResponse,
  AccountPoolsListResponse,
  AccountPoolUpdateResponse,
  CreateAccountPoolRequest,
  CreateRuntimeProfileRequest,
  OAuthDisconnectRequest,
  OAuthDisconnectResponse,
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthStatusResponse,
  ProviderProbeResponse,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeHistoryResponse,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse,
  RuntimeProfileCreateResponse,
  RuntimeProfileDeleteResponse,
  RuntimeProfilesListResponse,
  RuntimeProfileUpdateResponse,
  UpsertAgentModelAssignmentRequest,
  UpsertAgentModelAssignmentResponse,
  UpdateAccountPoolRequest,
  UpdateRuntimeProfileRequest,
  ProvidersListResponse,
  ProviderKey,
  ProviderUsageProbeProvider
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

export const listAgentModelAssignments = async (): Promise<AgentModelAssignmentsListResponse> => {
  return requestJson<AgentModelAssignmentsListResponse>(STEP3_ALLOWED_ROUTES.AGENT_MODELS, {
    method: "GET"
  });
};

export const upsertAgentModelAssignment = async (
  agentId: AgentId,
  payload: UpsertAgentModelAssignmentRequest
): Promise<UpsertAgentModelAssignmentResponse> => {
  return requestJson<UpsertAgentModelAssignmentResponse>(
    buildStep3Route.agentModelById(agentId),
    {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  );
};

export const startOAuth = async (
  provider: ProviderUsageProbeProvider,
  payload: OAuthStartRequest
): Promise<OAuthStartResponse> => {
  return requestJson<OAuthStartResponse>(buildStep3Route.oauthProviderStart(provider), {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const getOAuthStatus = async (
  provider: ProviderUsageProbeProvider,
  accountPoolId?: string
): Promise<OAuthStatusResponse> => {
  return requestJson<OAuthStatusResponse>(
    withQuery(buildStep3Route.oauthProviderStatus(provider), {
      accountPoolId
    }),
    {
      method: "GET"
    }
  );
};

export const disconnectOAuth = async (
  provider: ProviderUsageProbeProvider,
  payload: OAuthDisconnectRequest
): Promise<OAuthDisconnectResponse> => {
  return requestJson<OAuthDisconnectResponse>(
    buildStep3Route.oauthProviderDisconnect(provider),
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
};
