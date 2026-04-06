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
  getOfficeRuntimeState: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNTIME_STATE },
  sendOfficeRuntimeCommand: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNTIME_COMMAND },
  listOfficeLogs: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_LOGS },
  listOfficeThreads: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_THREADS },
  createOfficeThread: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_THREADS },
  appendOfficeThreadMessage: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_THREAD_MESSAGES },
  patchOfficeThreadStatus: { method: "PATCH", path: STEP3_ALLOWED_ROUTES.OFFICE_THREAD_STATUS },
  listOfficeKanbanTasks: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_KANBAN_TASKS },
  createOfficeKanbanTask: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_KANBAN_TASKS },
  updateOfficeKanbanTask: { method: "PATCH", path: STEP3_ALLOWED_ROUTES.OFFICE_KANBAN_TASK_BY_ID },
  listOfficeMeetings: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_MEETINGS },
  createOfficeMeeting: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_MEETINGS },
  startOfficeMeeting: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_MEETING_START },
  completeOfficeMeeting: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_MEETING_COMPLETE },
  deleteOfficeMeeting: { method: "DELETE", path: STEP3_ALLOWED_ROUTES.OFFICE_MEETING_BY_ID },
  runOfficeCli: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_CLI_RUN },
  stopOfficeCli: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_CLI_STOP },
  listOfficeCliLogs: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_CLI_LOGS },
  listOfficeCliSubtasks: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_CLI_SUBTASKS },
  listOfficeCliActiveRuns: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_CLI_ACTIVE },
  listOfficeRunners: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS },
  listOfficeRunnerQueue: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_QUEUE },
  activateOfficeRunner: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_ACTIVATE },
  deactivateOfficeRunner: { method: "POST", path: STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_DEACTIVATE },
  getOfficeBootstrap: { method: "GET", path: STEP3_ALLOWED_ROUTES.OFFICE_BOOTSTRAP },
  listWorkspaces: { method: "GET", path: STEP3_ALLOWED_ROUTES.WORKSPACES },
  listEmployees: { method: "GET", path: STEP3_ALLOWED_ROUTES.EMPLOYEES },
  listActiveSessions: { method: "GET", path: STEP3_ALLOWED_ROUTES.SESSIONS_ACTIVE },
  listTimeline: { method: "GET", path: STEP3_ALLOWED_ROUTES.TIMELINE }
} as const satisfies Record<string, Step3RouteSpec>;
