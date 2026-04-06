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

export type AgentId = "main" | "router" | "runtime" | "probe" | "history" | "pm";

export type AgentModelAssignmentView = {
  agentId: AgentId;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  runtimeProfileId: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentModelAssignmentsListResponse = {
  ok: true;
  assignments: AgentModelAssignmentView[];
};

export type UpsertAgentModelAssignmentRequest = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  runtimeProfileId: string;
};

export type UpsertAgentModelAssignmentResponse = {
  ok: true;
  assignment: AgentModelAssignmentView;
};

export type OAuthStartRequest = {
  accountPoolId: string;
  clientOrigin?: string;
};

export type OAuthStartResponse = {
  ok: true;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  authorizeUrl: string;
  state: string;
  expiresAt: string;
};

export type OAuthSessionStatus = "connected" | "disconnected" | "pending" | "error";

export type OAuthSessionStatusView = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  status: OAuthSessionStatus;
  connected: boolean;
  expiresAt: string | null;
  updatedAt: string;
  lastError: string | null;
};

export type OAuthStatusResponse = {
  ok: true;
  provider: ProviderUsageProbeProvider;
  sessions: OAuthSessionStatusView[];
};

export type OAuthDisconnectRequest = {
  accountPoolId: string;
};

export type OAuthDisconnectResponse = {
  ok: true;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  disconnected: true;
};

export type OfficeLoopState =
  | "idle"
  | "moving_to_task"
  | "working"
  | "moving_to_pm"
  | "reporting"
  | "waiting_review"
  | "blocked";

export type OfficeLoopEventType =
  | "tick"
  | "runProbe"
  | "refreshHistory"
  | "setSimSpeed"
  | "pauseSim"
  | "resumeSim"
  | "resetSimulation"
  | "probeError"
  | "probeRecovered";

export type OfficeLoopEventPhase = "pending" | "committed" | "rejected";

export type OfficeLoopEvent = {
  type: OfficeLoopEventType;
  atTick: number;
  source: "hud" | "system";
  phase: OfficeLoopEventPhase;
  detail?: string;
};

export type OfficeSimSpeed = "1x" | "2x" | "4x";

export type OfficeFacingDir = "left" | "right";

export type OfficeTileCoord = {
  x: number;
  y: number;
};

export type OfficeRuntimeActorView = {
  id: string;
  role: string;
  fsmState: OfficeLoopState;
  facing: OfficeFacingDir;
  tile: OfficeTileCoord;
  path: OfficeTileCoord[];
  taskId: string | null;
  eta: number;
};

export type OfficeKpiView = {
  throughput: number;
  queueDepth: number;
  slaRisk: "low" | "medium" | "high";
  probeConfidence: "high" | "medium" | "low" | "none";
  avgAgentLoad: number;
};

export type OfficeRuntimeStateView = {
  tick: number;
  seed: number;
  simSpeed: OfficeSimSpeed;
  isPaused: boolean;
  loopState: OfficeLoopState;
  phaseTicks: number;
  jobQueue: number;
  completedJobs: number;
  pmReports: number;
  lastLoopEvent: OfficeLoopEvent | null;
  agentLoadById: Record<string, number>;
  actors: OfficeRuntimeActorView[];
  kpi: OfficeKpiView;
  updatedAt: string;
};

export type OfficeRuntimeStateResponse = {
  ok: true;
  state: OfficeRuntimeStateView;
};

export type OfficeCommandRequest = {
  command: Exclude<OfficeLoopEventType, "tick">;
  speed?: OfficeSimSpeed;
  detail?: string;
  phase?: OfficeLoopEventPhase;
};

export type OfficeCommandResponse = {
  ok: true;
  state: OfficeRuntimeStateView;
  event: OfficeLoopEvent;
};

export type OfficeEventLogCategory = "system" | "agent" | "validation" | "error";

export type OfficeEventLogView = {
  id: string;
  tick: number;
  category: OfficeEventLogCategory;
  message: string;
  actorId: string | null;
  speaker: string | null;
  createdAt: string;
};

export type OfficeLogsResponse = {
  ok: true;
  logs: OfficeEventLogView[];
};

export type BossCommandRecipient = "pm" | "router" | "runtime" | "probe" | "history";

export type BossCommandThreadStatus = "draft" | "sent" | "acknowledged" | "feedback" | "closed";

export type BossCommandMessageView = {
  id: string;
  sender: "boss" | BossCommandRecipient;
  body: string;
  createdAt: string;
};

export type BossCommandThreadView = {
  id: string;
  recipient: BossCommandRecipient;
  summary: string;
  status: BossCommandThreadStatus;
  createdAt: string;
  updatedAt: string;
  messages: BossCommandMessageView[];
};

export type OfficeThreadsResponse = {
  ok: true;
  threads: BossCommandThreadView[];
};

export type CreateBossCommandThreadRequest = {
  recipient: BossCommandRecipient;
  summary: string;
  body: string;
};

export type CreateBossCommandThreadResponse = {
  ok: true;
  thread: BossCommandThreadView;
};

export type AddBossCommandMessageRequest = {
  sender: BossCommandRecipient;
  body: string;
};

export type AddBossCommandMessageResponse = {
  ok: true;
  thread: BossCommandThreadView;
};

export type UpdateBossCommandThreadStatusRequest = {
  status: BossCommandThreadStatus;
};

export type UpdateBossCommandThreadStatusResponse = {
  ok: true;
  thread: BossCommandThreadView;
};

export type OfficeRealtimeEventType =
  | "runtime.state"
  | "log.appended"
  | "thread.upserted"
  | "heartbeat";

export type OfficeRealtimeEvent =
  | {
      id: string;
      type: "runtime.state";
      ts: number;
      payload: OfficeRuntimeStateView;
    }
  | {
      id: string;
      type: "log.appended";
      ts: number;
      payload: OfficeEventLogView;
    }
  | {
      id: string;
      type: "thread.upserted";
      ts: number;
      payload: BossCommandThreadView;
    }
  | {
      id: string;
      type: "heartbeat";
      ts: number;
      payload: {
        tick: number;
      };
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
