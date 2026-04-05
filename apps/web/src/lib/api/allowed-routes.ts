export const STEP3_ALLOWED_ROUTES = {
  BOOTSTRAP_STATE: "/api/bootstrap/state",
  BOOTSTRAP_INIT: "/api/bootstrap/init",
  PROVIDERS: "/api/providers",
  PROVIDERS_PROBE: "/api/providers/probe",
  ROLEPACKS: "/api/rolepacks",
  ACCOUNT_POOLS: "/api/account-pools",
  ACCOUNT_POOL_BY_ID: "/api/account-pools/:id",
  ACCOUNT_POOL_FATIGUE: "/api/account-pools/:id/fatigue",
  RUNTIME_PROFILES: "/api/runtime-profiles",
  RUNTIME_PROFILE_BY_ID: "/api/runtime-profiles/:id",
  RUNTIME_ROUTER_SIMULATE: "/api/runtime-router/simulate",
  RUNTIME_ROUTER_RESOLVE: "/api/runtime-router/resolve",
  PROVIDER_PROBES_RUN: "/api/provider-probes/run",
  PROVIDER_PROBES_HISTORY: "/api/provider-probes/history",
  AGENT_MODELS: "/api/agent-models",
  AGENT_MODEL_BY_ID: "/api/agent-models/:agentId",
  OAUTH_PROVIDER_START: "/api/oauth/:provider/start",
  OAUTH_PROVIDER_CALLBACK: "/api/oauth/:provider/callback",
  OAUTH_PROVIDER_STATUS: "/api/oauth/:provider/status",
  OAUTH_PROVIDER_DISCONNECT: "/api/oauth/:provider/disconnect",
  OFFICE_BOOTSTRAP: "/api/office/bootstrap",
  WORKSPACES: "/api/workspaces",
  EMPLOYEES: "/api/employees",
  SESSIONS_ACTIVE: "/api/sessions/active",
  SESSIONS_BY_ID: "/api/sessions/:id",
  TIMELINE: "/api/timeline",
  EVENTS_STREAM: "/api/events/stream",
  SESSION_OVERRIDE_RUNTIME: "/api/sessions/:id/override-runtime",
  SESSION_PAUSE: "/api/sessions/:id/pause",
  SESSION_RESUME: "/api/sessions/:id/resume"
} as const;

export const STEP3_EXCLUDED_ROUTE_PREFIXES = [
  "/api/oauth",
  "/api/auth",
  "/api/providers/:provider/login",
  "/api/providers/:provider/callback",
  "/api/providers/:provider/token",
  "/api/providers/:provider/refresh",
  "/api/providers/:provider/raw-command",
  "/api/telegram",
  "/api/webhooks"
] as const;

export const buildStep3Route = {
  accountPoolById: (id: string): string => `/api/account-pools/${id}`,
  accountPoolFatigue: (id: string): string => `/api/account-pools/${id}/fatigue`,
  runtimeProfileById: (id: string): string => `/api/runtime-profiles/${id}`,
  agentModelById: (agentId: string): string => `/api/agent-models/${agentId}`,
  oauthProviderStart: (provider: string): string => `/api/oauth/${provider}/start`,
  oauthProviderCallback: (provider: string): string => `/api/oauth/${provider}/callback`,
  oauthProviderStatus: (provider: string): string => `/api/oauth/${provider}/status`,
  oauthProviderDisconnect: (provider: string): string => `/api/oauth/${provider}/disconnect`,
  sessionsById: (id: string): string => `/api/sessions/${id}`,
  sessionOverrideRuntime: (id: string): string => `/api/sessions/${id}/override-runtime`,
  sessionPause: (id: string): string => `/api/sessions/${id}/pause`,
  sessionResume: (id: string): string => `/api/sessions/${id}/resume`
} as const;
