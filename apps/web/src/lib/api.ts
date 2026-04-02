import type {
  AccountPoolCreateResponse,
  AccountPoolFatigueHistoryResponse,
  AccountPoolsListResponse,
  AccountPoolUpdateResponse,
  ApiErrorResponse,
  BootstrapInitRequest,
  BootstrapInitResponse,
  BootstrapStateResponse,
  CreateAccountPoolRequest,
  ProviderKey,
  ProviderProbeResponse,
  ProvidersListResponse,
  ProviderUsageProbeHistoryResponse,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse,
  RolePacksResponse,
  RuntimeRouterRequest,
  RuntimeRouterResolveResponse,
  RuntimeRouterSimulateResponse,
  UpdateAccountPoolRequest
} from "@workspace/shared";

const API_BASE = "/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

const parseError = async (response: Response): Promise<ApiClientError> => {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    if (payload && payload.ok === false && payload.error) {
      return new ApiClientError(payload.error.code, payload.error.message, response.status);
    }
  } catch {
    // Fall through to generic error.
  }

  return new ApiClientError("INTERNAL_ERROR", "Request failed", response.status);
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
};

export const getBootstrapState = async (): Promise<BootstrapStateResponse> => {
  return requestJson<BootstrapStateResponse>("/bootstrap/state", { method: "GET" });
};

export const initializeBootstrap = async (
  payload: BootstrapInitRequest
): Promise<BootstrapInitResponse> => {
  return requestJson<BootstrapInitResponse>("/bootstrap/init", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const listProviders = async (): Promise<ProvidersListResponse> => {
  return requestJson<ProvidersListResponse>("/providers", { method: "GET" });
};

export const probeProvider = async (provider: ProviderKey): Promise<ProviderProbeResponse> => {
  return requestJson<ProviderProbeResponse>("/providers/probe", {
    method: "POST",
    body: JSON.stringify({ provider })
  });
};

export const listRolePacks = async (): Promise<RolePacksResponse> => {
  return requestJson<RolePacksResponse>("/rolepacks", { method: "GET" });
};

export const listAccountPools = async (): Promise<AccountPoolsListResponse> => {
  return requestJson<AccountPoolsListResponse>("/account-pools", { method: "GET" });
};

export const createAccountPool = async (
  payload: CreateAccountPoolRequest
): Promise<AccountPoolCreateResponse> => {
  return requestJson<AccountPoolCreateResponse>("/account-pools", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const updateAccountPool = async (
  id: string,
  payload: UpdateAccountPoolRequest
): Promise<AccountPoolUpdateResponse> => {
  return requestJson<AccountPoolUpdateResponse>(`/account-pools/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
};

export const listAccountPoolFatigueHistory = async (
  accountPoolId: string,
  limit = 100
): Promise<AccountPoolFatigueHistoryResponse> => {
  return requestJson<AccountPoolFatigueHistoryResponse>(
    `/account-pools/${accountPoolId}/fatigue?limit=${limit}`,
    { method: "GET" }
  );
};

export const simulateRuntimeRouter = async (
  payload: RuntimeRouterRequest
): Promise<RuntimeRouterSimulateResponse> => {
  return requestJson<RuntimeRouterSimulateResponse>("/runtime-router/simulate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const resolveRuntimeRouter = async (
  payload: RuntimeRouterRequest
): Promise<RuntimeRouterResolveResponse> => {
  return requestJson<RuntimeRouterResolveResponse>("/runtime-router/resolve", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const runProviderUsageProbe = async (
  payload: ProviderUsageProbeRunRequest
): Promise<ProviderUsageProbeRunResponse> => {
  return requestJson<ProviderUsageProbeRunResponse>("/provider-probes/run", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const listProviderUsageProbeHistory = async (
  limit = 50
): Promise<ProviderUsageProbeHistoryResponse> => {
  return requestJson<ProviderUsageProbeHistoryResponse>(`/provider-probes/history?limit=${limit}`, {
    method: "GET"
  });
};
