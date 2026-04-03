export type ApiHealthResponse = {
  ok: true;
  service: "server";
  timestamp: string;
};

export type ProviderKey = "claude" | "codex" | "gemini" | "jules";

export type ProviderUsageProbeProvider = "claude" | "codex" | "gemini";

export type ProbeLoginStatus = "unknown" | "logged_in" | "logged_out";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export type WorkspaceView = {
  id: string;
  name: string;
  rootPath: string;
  dbPath: string;
  createdAt: string;
  updatedAt: string;
};

export type BootstrapStatePayload = {
  workspace: WorkspaceView | null;
  isInitialized: boolean;
  selectedProviders: string[];
  selectedRolePackIds: string[];
  officeTheme: string;
  updatedAt: string | null;
};

export type BootstrapInitRequest = {
  workspaceName: string;
  rootPath: string;
  selectedProviders: string[];
  selectedRolePackIds: string[];
  officeTheme?: string;
};

export type ProviderProbeRequest = {
  provider: ProviderKey;
};

export type BootstrapStateResponse = {
  ok: true;
  state: BootstrapStatePayload;
};

export type BootstrapInitResponse = {
  ok: true;
  state: BootstrapStatePayload;
};

export type ProviderProbeView = {
  provider: ProviderKey;
  cliInstalled: boolean;
  executablePath: string | null;
  configPath: string | null;
  loginStatus: ProbeLoginStatus;
  checkedAt: string | null;
};

export type ProvidersListResponse = {
  ok: true;
  providers: ProviderProbeView[];
};

export type ProviderProbeResponse = {
  ok: true;
  probe: ProviderProbeView & {
    checkedAt: string;
  };
};

export type RolePackView = {
  id: string;
  slug: string;
  title: string;
  description: string;
  rootDir: string;
  manifest: Record<string, unknown>;
  isEnabled: boolean;
};

export type RolePacksResponse = {
  ok: true;
  rolePacks: RolePackView[];
};

export type FatiguePrecision = "official" | "derived" | "manual";

export type FatigueState = "fresh" | "warm" | "hot" | "critical" | "unknown";

export type ProbeRunStatus = "success" | "failure" | "partial";

export type RouterDecisionState = "resolved" | "fallback" | "no_route" | "error";

export type UsageProbeStatus = "ok" | "degraded";

export type RuntimeCapabilityView = {
  key: string;
  label: string;
  strength: number;
};

export type RuntimeProfileView = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string | null;
  profilePath: string | null;
  status: string;
  isEnabled: boolean;
  capabilities: RuntimeCapabilityView[];
};

export type FatigueSnapshotView = {
  id: string;
  accountPoolId: string;
  precision: FatiguePrecision;
  rawUsageValue: number | null;
  rawLimitValue: number | null;
  rawUnit: string | null;
  normalizedPercent: number;
  fatigueState: FatigueState;
  confidenceScore: number;
  observedAt: string;
};

export type AccountPoolLatestFatigueView = {
  precision: FatiguePrecision;
  normalizedPercent: number;
  fatigueState: FatigueState;
  confidenceScore: number;
  observedAt: string;
};

export type AccountPoolView = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  planTier: string | null;
  fatigueMode: FatiguePrecision;
  maxConcurrency: number | null;
  isEnabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  latestFatigue: AccountPoolLatestFatigueView | null;
  runtimeProfiles: RuntimeProfileView[];
};

export type CreateAccountPoolRequest = {
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  planTier?: string | null;
  fatigueMode?: FatiguePrecision;
  maxConcurrency?: number | null;
  notes?: string | null;
  isEnabled?: boolean;
};

export type UpdateAccountPoolRequest = {
  label?: string;
  planTier?: string | null;
  fatigueMode?: FatiguePrecision;
  maxConcurrency?: number | null;
  notes?: string | null;
  isEnabled?: boolean;
};

export type AccountPoolsListResponse = {
  ok: true;
  pools: AccountPoolView[];
};

export type AccountPoolCreateResponse = {
  ok: true;
  pool: AccountPoolView;
};

export type AccountPoolUpdateResponse = {
  ok: true;
  pool: AccountPoolView;
};

export type AccountPoolFatigueHistoryResponse = {
  ok: true;
  accountPoolId: string;
  snapshots: FatigueSnapshotView[];
};

export type CreateRuntimeProfileRequest = {
  key: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  profilePath?: string | null;
  status?: string;
};

export type UpdateRuntimeProfileRequest = {
  key?: string;
  accountPoolId?: string | null;
  profilePath?: string | null;
  status?: string;
};

export type RuntimeProfilesListResponse = {
  ok: true;
  profiles: RuntimeProfileView[];
};

export type RuntimeProfileCreateResponse = {
  ok: true;
  profile: RuntimeProfileView;
};

export type RuntimeProfileUpdateResponse = {
  ok: true;
  profile: RuntimeProfileView;
};

export type RuntimeProfileDeleteResponse = {
  ok: true;
  id: string;
};

export type RuntimeRouterRequest = {
  taskType?: string;
  roleKey?: string;
  preferredRuntimeProfileIds?: string[];
  requiredCapabilities?: string[];
  workspaceMode?: string;
};

export type RuntimeRouterCandidateScoreView = {
  runtimeProfileId: string;
  runtimeProfileKey: string;
  accountPoolId: string | null;
  ruleKey: string;
  isFallback: boolean;
  score: number;
  rejected: boolean;
  rejectReason: string | null;
};

export type RuntimeRouterDecisionView = {
  decisionId: string | null;
  decisionState: RouterDecisionState;
  selectedRuntimeProfileId: string | null;
  selectedRuntimeProfileKey: string | null;
  selectedAccountPoolId: string | null;
  reasonText: string;
  fallbackChain: string[];
  scoreBreakdown: RuntimeRouterCandidateScoreView[];
};

export type RuntimeRouterSimulateResponse = {
  ok: true;
  decision: RuntimeRouterDecisionView;
};

export type RuntimeRouterResolveResponse = {
  ok: true;
  decision: RuntimeRouterDecisionView;
};

export type NormalizedUsageInput = {
  provider: ProviderUsageProbeProvider;
  usageValue: number | null;
  limitValue: number | null;
  unit: string | null;
  normalizedPercent: number;
  precision: FatiguePrecision;
  status: UsageProbeStatus;
  observedAt: string;
};

export type ProviderUsageProbeRunRequest = {
  provider: ProviderUsageProbeProvider;
  accountPoolId?: string;
  runtimeProfileId?: string;
  persistSnapshot?: boolean;
};

export type ProviderUsageProbeHistoryQuery = {
  limit?: number;
  provider?: ProviderUsageProbeProvider;
  accountPoolId?: string;
  runtimeProfileId?: string;
};

export type ProviderProbeRunView = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string | null;
  runtimeProfileId: string | null;
  probeKind: string;
  status: ProbeRunStatus;
  precision: FatiguePrecision | null;
  degraded: boolean;
  startedAt: string;
  finishedAt: string | null;
};

export type ProviderUsageProbeRunResponse = {
  ok: true;
  run: ProviderProbeRunView;
  usage: NormalizedUsageInput | null;
  fatigueSnapshot: FatigueSnapshotView | null;
};

export type ProviderUsageProbeHistoryResponse = {
  ok: true;
  runs: ProviderProbeRunView[];
};
