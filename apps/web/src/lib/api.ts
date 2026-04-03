import type {
  BootstrapInitRequest,
  BootstrapInitResponse,
  BootstrapStateResponse,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeHistoryResponse,
  RolePacksResponse,
  RuntimeRouterRequest,
  RuntimeRouterResolveResponse,
  RuntimeRouterSimulateResponse
} from "@workspace/shared";

import { STEP3_ALLOWED_ROUTES } from "./api/allowed-routes";
import { ApiClientError, requestJson } from "./api/client";
import {
  createAccountPool as createAccountPoolImpl,
  createRuntimeProfile as createRuntimeProfileImpl,
  deleteRuntimeProfile as deleteRuntimeProfileImpl,
  listAccountPoolFatigueHistory as listAccountPoolFatigueHistoryImpl,
  listAccountPools as listAccountPoolsImpl,
  listProviderUsageProbeHistory as listProviderUsageProbeHistoryImpl,
  listProviders as listProvidersImpl,
  listRuntimeProfiles as listRuntimeProfilesImpl,
  probeProvider as probeProviderImpl,
  runProviderUsageProbe as runProviderUsageProbeImpl,
  updateAccountPool as updateAccountPoolImpl,
  updateRuntimeProfile as updateRuntimeProfileImpl
} from "./api/office-step2";

export { ApiClientError };

export const getBootstrapState = async (): Promise<BootstrapStateResponse> => {
  return requestJson<BootstrapStateResponse>(STEP3_ALLOWED_ROUTES.OFFICE_BOOTSTRAP, { method: "GET" });
};

export const initializeBootstrap = async (
  payload: BootstrapInitRequest
): Promise<BootstrapInitResponse> => {
  return requestJson<BootstrapInitResponse>(STEP3_ALLOWED_ROUTES.BOOTSTRAP_INIT, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const listProviders = listProvidersImpl;
export const probeProvider = probeProviderImpl;

export const listRolePacks = async (): Promise<RolePacksResponse> => {
  return requestJson<RolePacksResponse>(STEP3_ALLOWED_ROUTES.ROLEPACKS, { method: "GET" });
};

export const listAccountPools = listAccountPoolsImpl;
export const createAccountPool = createAccountPoolImpl;
export const updateAccountPool = updateAccountPoolImpl;
export const listAccountPoolFatigueHistory = listAccountPoolFatigueHistoryImpl;

export const listRuntimeProfiles = listRuntimeProfilesImpl;
export const createRuntimeProfile = createRuntimeProfileImpl;
export const updateRuntimeProfile = updateRuntimeProfileImpl;
export const deleteRuntimeProfile = deleteRuntimeProfileImpl;

export const simulateRuntimeRouter = async (
  payload: RuntimeRouterRequest
): Promise<RuntimeRouterSimulateResponse> => {
  return requestJson<RuntimeRouterSimulateResponse>(STEP3_ALLOWED_ROUTES.RUNTIME_ROUTER_SIMULATE, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const resolveRuntimeRouter = async (
  payload: RuntimeRouterRequest
): Promise<RuntimeRouterResolveResponse> => {
  return requestJson<RuntimeRouterResolveResponse>(STEP3_ALLOWED_ROUTES.RUNTIME_ROUTER_RESOLVE, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const runProviderUsageProbe = runProviderUsageProbeImpl;

export const listProviderUsageProbeHistory = async (
  query: ProviderUsageProbeHistoryQuery | number = 50
): Promise<ProviderUsageProbeHistoryResponse> => {
  if (typeof query === "number") {
    return listProviderUsageProbeHistoryImpl({ limit: query });
  }
  return listProviderUsageProbeHistoryImpl(query);
};
