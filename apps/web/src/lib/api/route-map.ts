import { STEP3_ALLOWED_ROUTES } from "./allowed-routes";

export type AllowedHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Step3RouteSpec = {
  method: AllowedHttpMethod;
  path: string;
};

export const STEP3_ROUTE_MAP = {
  getBootstrapState: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_BOOTSTRAP },
  initializeBootstrap: { method: "POST", path: STEP3_ALLOWED_ROUTES.BOOTSTRAP_INIT },
  listProviders: { method: "GET", path: STEP3_ALLOWED_ROUTES.PROVIDERS },
  probeProvider: { method: "POST", path: STEP3_ALLOWED_ROUTES.PROVIDERS_PROBE },
  listRolePacks: { method: "GET", path: STEP3_ALLOWED_ROUTES.ROLEPACKS },
  listAccountPools: { method: "GET", path: STEP3_ALLOWED_ROUTES.ACCOUNT_POOLS },
  createAccountPool: { method: "POST", path: STEP3_ALLOWED_ROUTES.ACCOUNT_POOLS },
  updateAccountPool: { method: "PATCH", path: STEP3_ALLOWED_ROUTES.ACCOUNT_POOL_BY_ID },
  listAccountPoolFatigue: { method: "GET", path: STEP3_ALLOWED_ROUTES.ACCOUNT_POOL_FATIGUE },
  listRuntimeProfiles: { method: "GET", path: STEP3_ALLOWED_ROUTES.RUNTIME_PROFILES },
  createRuntimeProfile: { method: "POST", path: STEP3_ALLOWED_ROUTES.RUNTIME_PROFILES },
  updateRuntimeProfile: { method: "PATCH", path: STEP3_ALLOWED_ROUTES.RUNTIME_PROFILE_BY_ID },
  deleteRuntimeProfile: { method: "DELETE", path: STEP3_ALLOWED_ROUTES.RUNTIME_PROFILE_BY_ID },
  simulateRuntimeRouter: { method: "POST", path: STEP3_ALLOWED_ROUTES.RUNTIME_ROUTER_SIMULATE },
  resolveRuntimeRouter: { method: "POST", path: STEP3_ALLOWED_ROUTES.RUNTIME_ROUTER_RESOLVE },
  runProviderUsageProbe: { method: "POST", path: STEP3_ALLOWED_ROUTES.PROVIDER_PROBES_RUN },
  listProviderUsageProbeHistory: { method: "GET", path: STEP3_ALLOWED_ROUTES.PROVIDER_PROBES_HISTORY },
  listAgentModels: { method: "GET", path: STEP3_ALLOWED_ROUTES.AGENT_MODELS },
  upsertAgentModel: { method: "PUT", path: STEP3_ALLOWED_ROUTES.AGENT_MODEL_BY_ID },
  startOAuth: { method: "POST", path: STEP3_ALLOWED_ROUTES.OAUTH_PROVIDER_START },
  getOAuthStatus: { method: "GET", path: STEP3_ALLOWED_ROUTES.OAUTH_PROVIDER_STATUS },
  disconnectOAuth: { method: "POST", path: STEP3_ALLOWED_ROUTES.OAUTH_PROVIDER_DISCONNECT },
  getOfficeBootstrap: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_BOOTSTRAP },
  listWorkspaces: { method: "GET", path: STEP3_ALLOWED_ROUTES.WORKSPACES },
  listEmployees: { method: "GET", path: STEP3_ALLOWED_ROUTES.EMPLOYEES },
  listActiveSessions: { method: "GET", path: STEP3_ALLOWED_ROUTES.SESSIONS_ACTIVE },
  listTimeline: { method: "GET", path: STEP3_ALLOWED_ROUTES.TIMELINE }
} as const satisfies Record<string, Step3RouteSpec>;
