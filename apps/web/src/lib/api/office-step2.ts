import type {
  AddBossCommandMessageRequest,
  AddBossCommandMessageResponse,
  AgentId,
  AgentModelAssignmentsListResponse,
  CreateBossCommandThreadRequest,
  CreateBossCommandThreadResponse,
  AccountPoolCreateResponse,
  AccountPoolFatigueHistoryResponse,
  AccountPoolsListResponse,
  AccountPoolUpdateResponse,
  CreateAccountPoolRequest,
  CreateRuntimeProfileRequest,
  CreateOfficeKanbanTaskRequest,
  CreateOfficeKanbanTaskResponse,
  CreateOfficeMeetingRequest,
  CreateOfficeMeetingResponse,
  ActivateOfficeRunnerRequest,
  ActivateOfficeRunnerResponse,
  DeactivateOfficeRunnerRequest,
  DeactivateOfficeRunnerResponse,
  OfficeCommandRequest,
  OfficeCommandResponse,
  OfficeCliActiveRunsResponse,
  OfficeCliLogsResponse,
  OfficeCliRunRequest,
  OfficeCliRunResponse,
  OfficeCliStopResponse,
  OfficeCliSubtasksResponse,
  OfficeKanbanTasksResponse,
  OfficeLogsResponse,
  OfficeMeetingResponse,
  OfficeMeetingsResponse,
  OfficeRunnerListResponse,
  OfficeRunnerQueueResponse,
  OfficeRuntimeStateResponse,
  OfficeThreadsResponse,
  OAuthProvider,
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
  UpdateOfficeKanbanTaskRequest,
  UpdateOfficeKanbanTaskResponse,
  UpdateBossCommandThreadStatusRequest,
  UpdateBossCommandThreadStatusResponse,
  UpsertAgentModelAssignmentRequest,
  UpsertAgentModelAssignmentResponse,
  UpdateAccountPoolRequest,
  UpdateRuntimeProfileRequest,
  ProvidersListResponse,
  ProviderKey,
  ProviderUsageProbeProvider,
  DeleteOfficeMeetingResponse,
  CompleteOfficeMeetingRequest
} from "@workspace/shared";

import { buildStep3Route, STEP3_ALLOWED_ROUTES } from "./allowed-routes";
import { requestJson, withQuery } from "./client";

const getOfficeWriteHeaders = (): Record<string, string> => {
  const token = process.env.NEXT_PUBLIC_OFFICE_WRITE_TOKEN;
  if (!token) {
    return {};
  }
  return {
    "x-office-write-token": token
  };
};

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
    headers: getOfficeWriteHeaders(),
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
  provider: OAuthProvider,
  payload: OAuthStartRequest
): Promise<OAuthStartResponse> => {
  return requestJson<OAuthStartResponse>(buildStep3Route.oauthProviderStart(provider), {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

export const getOAuthStatus = async (
  provider: OAuthProvider,
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
  provider: OAuthProvider,
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

export const getOfficeRuntimeState = async (): Promise<OfficeRuntimeStateResponse> => {
  return requestJson<OfficeRuntimeStateResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNTIME_STATE, {
    method: "GET"
  });
};

export const sendOfficeRuntimeCommand = async (
  payload: OfficeCommandRequest
): Promise<OfficeCommandResponse> => {
  return requestJson<OfficeCommandResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNTIME_COMMAND, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const listOfficeLogs = async (limit = 120): Promise<OfficeLogsResponse> => {
  return requestJson<OfficeLogsResponse>(
    withQuery(STEP3_ALLOWED_ROUTES.OFFICE_LOGS, { limit }),
    {
      method: "GET"
    }
  );
};

export const listOfficeThreads = async (): Promise<OfficeThreadsResponse> => {
  return requestJson<OfficeThreadsResponse>(STEP3_ALLOWED_ROUTES.OFFICE_THREADS, {
    method: "GET"
  });
};

export const createOfficeThread = async (
  payload: CreateBossCommandThreadRequest
): Promise<CreateBossCommandThreadResponse> => {
  return requestJson<CreateBossCommandThreadResponse>(STEP3_ALLOWED_ROUTES.OFFICE_THREADS, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const appendOfficeThreadMessage = async (
  threadId: string,
  payload: AddBossCommandMessageRequest
): Promise<AddBossCommandMessageResponse> => {
  return requestJson<AddBossCommandMessageResponse>(
    buildStep3Route.officeThreadMessages(threadId),
    {
      method: "POST",
      headers: getOfficeWriteHeaders(),
      body: JSON.stringify(payload)
    }
  );
};

export const patchOfficeThreadStatus = async (
  threadId: string,
  payload: UpdateBossCommandThreadStatusRequest
): Promise<UpdateBossCommandThreadStatusResponse> => {
  return requestJson<UpdateBossCommandThreadStatusResponse>(
    buildStep3Route.officeThreadStatus(threadId),
    {
      method: "PATCH",
      headers: getOfficeWriteHeaders(),
      body: JSON.stringify(payload)
    }
  );
};

export const listOfficeKanbanTasks = async (): Promise<OfficeKanbanTasksResponse> => {
  return requestJson<OfficeKanbanTasksResponse>(STEP3_ALLOWED_ROUTES.OFFICE_KANBAN_TASKS, {
    method: "GET"
  });
};

export const createOfficeKanbanTask = async (
  payload: CreateOfficeKanbanTaskRequest
): Promise<CreateOfficeKanbanTaskResponse> => {
  return requestJson<CreateOfficeKanbanTaskResponse>(STEP3_ALLOWED_ROUTES.OFFICE_KANBAN_TASKS, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const updateOfficeKanbanTask = async (
  id: string,
  payload: UpdateOfficeKanbanTaskRequest
): Promise<UpdateOfficeKanbanTaskResponse> => {
  return requestJson<UpdateOfficeKanbanTaskResponse>(buildStep3Route.officeKanbanTaskById(id), {
    method: "PATCH",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const listOfficeMeetings = async (): Promise<OfficeMeetingsResponse> => {
  return requestJson<OfficeMeetingsResponse>(STEP3_ALLOWED_ROUTES.OFFICE_MEETINGS, {
    method: "GET"
  });
};

export const createOfficeMeeting = async (
  payload: CreateOfficeMeetingRequest
): Promise<CreateOfficeMeetingResponse> => {
  return requestJson<CreateOfficeMeetingResponse>(STEP3_ALLOWED_ROUTES.OFFICE_MEETINGS, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const startOfficeMeeting = async (id: string): Promise<OfficeMeetingResponse> => {
  return requestJson<OfficeMeetingResponse>(buildStep3Route.officeMeetingStart(id), {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify({})
  });
};

export const completeOfficeMeeting = async (
  id: string,
  payload: CompleteOfficeMeetingRequest
): Promise<OfficeMeetingResponse> => {
  return requestJson<OfficeMeetingResponse>(buildStep3Route.officeMeetingComplete(id), {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const deleteOfficeMeeting = async (id: string): Promise<DeleteOfficeMeetingResponse> => {
  return requestJson<DeleteOfficeMeetingResponse>(buildStep3Route.officeMeetingById(id), {
    method: "DELETE",
    headers: getOfficeWriteHeaders()
  });
};

export const runOfficeCli = async (
  payload: OfficeCliRunRequest
): Promise<OfficeCliRunResponse> => {
  return requestJson<OfficeCliRunResponse>(STEP3_ALLOWED_ROUTES.OFFICE_CLI_RUN, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const stopOfficeCli = async (taskId: string): Promise<OfficeCliStopResponse> => {
  return requestJson<OfficeCliStopResponse>(buildStep3Route.officeCliStop(taskId), {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify({})
  });
};

export const listOfficeCliLogs = async (
  taskId: string,
  limit = 200
): Promise<OfficeCliLogsResponse> => {
  return requestJson<OfficeCliLogsResponse>(
    withQuery(buildStep3Route.officeCliLogs(taskId), { limit }),
    { method: "GET" }
  );
};

export const listOfficeCliSubtasks = async (
  taskId: string
): Promise<OfficeCliSubtasksResponse> => {
  return requestJson<OfficeCliSubtasksResponse>(buildStep3Route.officeCliSubtasks(taskId), {
    method: "GET"
  });
};

export const listOfficeCliActiveRuns = async (): Promise<OfficeCliActiveRunsResponse> => {
  return requestJson<OfficeCliActiveRunsResponse>(STEP3_ALLOWED_ROUTES.OFFICE_CLI_ACTIVE, {
    method: "GET"
  });
};

export const listOfficeRunners = async (): Promise<OfficeRunnerListResponse> => {
  return requestJson<OfficeRunnerListResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS, {
    method: "GET"
  });
};

export const listOfficeRunnerQueue = async (): Promise<OfficeRunnerQueueResponse> => {
  return requestJson<OfficeRunnerQueueResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_QUEUE, {
    method: "GET"
  });
};

export const activateOfficeRunner = async (
  payload: ActivateOfficeRunnerRequest
): Promise<ActivateOfficeRunnerResponse> => {
  return requestJson<ActivateOfficeRunnerResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_ACTIVATE, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};

export const deactivateOfficeRunner = async (
  payload: DeactivateOfficeRunnerRequest
): Promise<DeactivateOfficeRunnerResponse> => {
  return requestJson<DeactivateOfficeRunnerResponse>(STEP3_ALLOWED_ROUTES.OFFICE_RUNNERS_DEACTIVATE, {
    method: "POST",
    headers: getOfficeWriteHeaders(),
    body: JSON.stringify(payload)
  });
};
