"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AddBossCommandMessageRequest,
  BossCommandThreadView,
  CreateBossCommandThreadRequest,
  CreateOfficeKanbanTaskRequest,
  CreateOfficeMeetingRequest,
  DepartmentView,
  OfficeCliLogView,
  OfficeCliRunRequest,
  OfficeCliRunView,
  OfficeCliSubtaskView,
  OfficeCommandRequest,
  OfficeEventLogView,
  OfficeMeetingView,
  OfficeRunnerQueueItemView,
  OfficeRunnerStatusView,
  OfficeRealtimeEvent,
  OfficeRuntimeStateView,
  ProviderUsageProbeProvider,
  TaskSummaryView,
  UpdateBossCommandThreadStatusRequest,
  UpdateOfficeKanbanTaskRequest
} from "@workspace/shared";

import {
  appendOfficeThreadMessage,
  completeOfficeMeeting,
  createOfficeKanbanTask,
  createOfficeMeeting,
  createOfficeThread,
  deactivateOfficeRunner,
  deleteOfficeMeeting,
  activateOfficeRunner,
  getOfficeRuntimeState,
  listOfficeCliActiveRuns,
  listOfficeCliLogs,
  listOfficeCliSubtasks,
  listOfficeKanbanTasks,
  listOfficeLogs,
  listOfficeMeetings,
  listOfficeRunnerQueue,
  listOfficeRunners,
  listOfficeThreads,
  patchOfficeThreadStatus,
  runOfficeCli,
  sendOfficeRuntimeCommand,
  startOfficeMeeting,
  stopOfficeCli,
  updateOfficeKanbanTask
} from "../../lib/api/office-step2";

const RUNTIME_FALLBACK: OfficeRuntimeStateView = {
  tick: 0,
  seed: 271_828,
  simSpeed: "1x",
  isPaused: false,
  loopState: "idle",
  phaseTicks: 0,
  jobQueue: 0,
  completedJobs: 0,
  pmReports: 0,
  lastLoopEvent: null,
  agentLoadById: {
    "actor-main": 0,
    "actor-router": 0,
    "actor-runtime": 0,
    "actor-probe": 0,
    "actor-history": 0,
    "actor-pm": 0
  },
  actors: [
    {
      id: "actor-main",
      role: "main-agent",
      fsmState: "idle",
      facing: "right",
      tile: { x: 15, y: 9 },
      path: [],
      taskId: null,
      eta: 0
    },
    {
      id: "actor-router",
      role: "router",
      fsmState: "idle",
      facing: "right",
      tile: { x: 12, y: 7 },
      path: [],
      taskId: null,
      eta: 0
    },
    {
      id: "actor-runtime",
      role: "runtime",
      fsmState: "idle",
      facing: "right",
      tile: { x: 12, y: 12 },
      path: [],
      taskId: null,
      eta: 0
    },
    {
      id: "actor-probe",
      role: "probe",
      fsmState: "idle",
      facing: "right",
      tile: { x: 15, y: 7 },
      path: [],
      taskId: null,
      eta: 0
    },
    {
      id: "actor-history",
      role: "history",
      fsmState: "idle",
      facing: "right",
      tile: { x: 17, y: 12 },
      path: [],
      taskId: null,
      eta: 0
    },
    {
      id: "actor-pm",
      role: "pm-liaison",
      fsmState: "idle",
      facing: "left",
      tile: { x: 18, y: 9 },
      path: [],
      taskId: null,
      eta: 0
    }
  ],
  kpi: {
    throughput: 0,
    queueDepth: 0,
    slaRisk: "low",
    probeConfidence: "none",
    avgAgentLoad: 0
  },
  updatedAt: new Date(0).toISOString()
};

const upsertThread = (
  previous: BossCommandThreadView[],
  thread: BossCommandThreadView
): BossCommandThreadView[] => {
  const filtered = previous.filter((item) => item.id !== thread.id);
  return [thread, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const upsertTask = (previous: TaskSummaryView[], task: TaskSummaryView): TaskSummaryView[] => {
  const filtered = previous.filter((item) => item.id !== task.id);
  return [task, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const upsertMeeting = (
  previous: OfficeMeetingView[],
  meeting: OfficeMeetingView
): OfficeMeetingView[] => {
  const filtered = previous.filter((item) => item.id !== meeting.id);
  return [meeting, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const upsertRun = (previous: OfficeCliRunView[], run: OfficeCliRunView): OfficeCliRunView[] => {
  const filtered = previous.filter((item) => item.taskId !== run.taskId);
  return [run, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const upsertRunner = (
  previous: OfficeRunnerStatusView[],
  runner: OfficeRunnerStatusView
): OfficeRunnerStatusView[] => {
  const filtered = previous.filter(
    (item) => !(item.provider === runner.provider && item.accountPoolId === runner.accountPoolId)
  );
  return [runner, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const upsertRunnerQueueItem = (
  previous: OfficeRunnerQueueItemView[],
  queueItem: OfficeRunnerQueueItemView
): OfficeRunnerQueueItemView[] => {
  const filtered = previous.filter((item) => item.id !== queueItem.id);
  return [queueItem, ...filtered].sort((left, right) => right.enqueuedAt.localeCompare(left.enqueuedAt));
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected office realtime error";
};

type UseOfficeRealtimeSyncResult = {
  runtimeState: OfficeRuntimeStateView;
  logs: OfficeEventLogView[];
  threads: BossCommandThreadView[];
  kanban: {
    departments: DepartmentView[];
    tasks: TaskSummaryView[];
  };
  meetings: OfficeMeetingView[];
  cli: {
    runs: OfficeCliRunView[];
    logsByTaskId: Record<string, OfficeCliLogView[]>;
    subtasksByTaskId: Record<string, OfficeCliSubtaskView[]>;
  };
  runners: {
    items: OfficeRunnerStatusView[];
    queue: OfficeRunnerQueueItemView[];
  };
  isConnected: boolean;
  isHydrating: boolean;
  isMutating: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  sendCommand: (payload: OfficeCommandRequest) => Promise<boolean>;
  createThread: (payload: CreateBossCommandThreadRequest) => Promise<BossCommandThreadView | null>;
  appendThreadMessage: (
    threadId: string,
    payload: AddBossCommandMessageRequest
  ) => Promise<BossCommandThreadView | null>;
  updateThreadStatus: (
    threadId: string,
    payload: UpdateBossCommandThreadStatusRequest
  ) => Promise<BossCommandThreadView | null>;
  createKanbanTask: (payload: CreateOfficeKanbanTaskRequest) => Promise<TaskSummaryView | null>;
  updateKanbanTask: (
    taskId: string,
    payload: UpdateOfficeKanbanTaskRequest
  ) => Promise<TaskSummaryView | null>;
  createMeeting: (payload: CreateOfficeMeetingRequest) => Promise<OfficeMeetingView | null>;
  startMeeting: (meetingId: string) => Promise<OfficeMeetingView | null>;
  completeMeeting: (meetingId: string) => Promise<OfficeMeetingView | null>;
  deleteMeeting: (meetingId: string) => Promise<boolean>;
  runCli: (payload: OfficeCliRunRequest) => Promise<OfficeCliRunView | null>;
  stopCli: (taskId: string) => Promise<boolean>;
  loadCliLogs: (taskId: string) => Promise<void>;
  loadCliSubtasks: (taskId: string) => Promise<void>;
  activateRunner: (
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ) => Promise<boolean>;
  deactivateRunner: (
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ) => Promise<boolean>;
};

export const useOfficeRealtimeSync = (): UseOfficeRealtimeSyncResult => {
  const [runtimeState, setRuntimeState] = useState<OfficeRuntimeStateView>(RUNTIME_FALLBACK);
  const [logs, setLogs] = useState<OfficeEventLogView[]>([]);
  const [threads, setThreads] = useState<BossCommandThreadView[]>([]);
  const [kanbanDepartments, setKanbanDepartments] = useState<DepartmentView[]>([]);
  const [kanbanTasks, setKanbanTasks] = useState<TaskSummaryView[]>([]);
  const [meetings, setMeetings] = useState<OfficeMeetingView[]>([]);
  const [cliRuns, setCliRuns] = useState<OfficeCliRunView[]>([]);
  const [runnerItems, setRunnerItems] = useState<OfficeRunnerStatusView[]>([]);
  const [runnerQueue, setRunnerQueue] = useState<OfficeRunnerQueueItemView[]>([]);
  const [cliLogsByTaskId, setCliLogsByTaskId] = useState<Record<string, OfficeCliLogView[]>>({});
  const [cliSubtasksByTaskId, setCliSubtasksByTaskId] = useState<
    Record<string, OfficeCliSubtaskView[]>
  >({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    const [
      stateResponse,
      logResponse,
      threadResponse,
      kanbanResponse,
      meetingResponse,
      cliActiveResponse,
      runnerResponse,
      runnerQueueResponse
    ] = await Promise.all([
      getOfficeRuntimeState(),
      listOfficeLogs(120),
      listOfficeThreads(),
      listOfficeKanbanTasks(),
      listOfficeMeetings(),
      listOfficeCliActiveRuns(),
      listOfficeRunners(),
      listOfficeRunnerQueue()
    ]);
    setRuntimeState(stateResponse.state);
    setLogs(logResponse.logs);
    setThreads(threadResponse.threads);
    setKanbanDepartments(kanbanResponse.departments);
    setKanbanTasks(kanbanResponse.tasks);
    setMeetings(meetingResponse.meetings);
    setCliRuns(cliActiveResponse.runs);
    setRunnerItems(runnerResponse.runners);
    setRunnerQueue(runnerQueueResponse.queue);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const hydrate = async (): Promise<void> => {
      try {
        await refresh();
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(toErrorMessage(error));
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setIsConnected(false);
      return;
    }

    const eventSource = new EventSource("/api/events/stream");
    eventSource.onopen = () => {
      setIsConnected(true);
    };
    eventSource.onerror = () => {
      setIsConnected(false);
    };
    eventSource.onmessage = (messageEvent) => {
      try {
        const event = JSON.parse(messageEvent.data) as OfficeRealtimeEvent;
        if (event.type === "runtime.state") {
          setRuntimeState(event.payload);
          return;
        }
        if (event.type === "log.appended") {
          setLogs((previous) => [event.payload, ...previous].slice(0, 180));
          return;
        }
        if (event.type === "thread.upserted") {
          setThreads((previous) => upsertThread(previous, event.payload));
          return;
        }
        if (event.type === "kanban.updated") {
          setKanbanTasks((previous) => upsertTask(previous, event.payload.task));
          return;
        }
        if (event.type === "meeting.updated") {
          if (event.payload.reason === "deleted") {
            setMeetings((previous) =>
              previous.filter((meeting) => meeting.id !== event.payload.meeting.id)
            );
            return;
          }
          setMeetings((previous) => upsertMeeting(previous, event.payload.meeting));
          return;
        }
        if (event.type === "cli.run.updated") {
          setCliRuns((previous) => upsertRun(previous, event.payload));
          return;
        }
        if (event.type === "cli.log.appended") {
          setCliLogsByTaskId((previous) => {
            const existing = previous[event.payload.taskId] ?? [];
            return {
              ...previous,
              [event.payload.taskId]: [...existing, event.payload].slice(-300)
            };
          });
          return;
        }
        if (event.type === "runner.updated") {
          setRunnerItems((previous) => upsertRunner(previous, event.payload));
          return;
        }
        if (event.type === "runner.queue.updated") {
          setRunnerQueue((previous) => upsertRunnerQueueItem(previous, event.payload));
        }
      } catch {
        // ignore malformed event payload
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const withMutation = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | null> => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        return await operation();
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const sendCommand = useCallback(
    async (payload: OfficeCommandRequest): Promise<boolean> => {
      const response = await withMutation(() => sendOfficeRuntimeCommand(payload));
      if (!response) {
        return false;
      }
      setRuntimeState(response.state);
      return true;
    },
    [withMutation]
  );

  const createThreadHandler = useCallback(
    async (payload: CreateBossCommandThreadRequest): Promise<BossCommandThreadView | null> => {
      const response = await withMutation(() => createOfficeThread(payload));
      if (!response) {
        return null;
      }
      setThreads((previous) => upsertThread(previous, response.thread));
      return response.thread;
    },
    [withMutation]
  );

  const appendThreadMessageHandler = useCallback(
    async (
      threadId: string,
      payload: AddBossCommandMessageRequest
    ): Promise<BossCommandThreadView | null> => {
      const response = await withMutation(() => appendOfficeThreadMessage(threadId, payload));
      if (!response) {
        return null;
      }
      setThreads((previous) => upsertThread(previous, response.thread));
      return response.thread;
    },
    [withMutation]
  );

  const updateThreadStatusHandler = useCallback(
    async (
      threadId: string,
      payload: UpdateBossCommandThreadStatusRequest
    ): Promise<BossCommandThreadView | null> => {
      const response = await withMutation(() => patchOfficeThreadStatus(threadId, payload));
      if (!response) {
        return null;
      }
      setThreads((previous) => upsertThread(previous, response.thread));
      return response.thread;
    },
    [withMutation]
  );

  const createKanbanTaskHandler = useCallback(
    async (payload: CreateOfficeKanbanTaskRequest): Promise<TaskSummaryView | null> => {
      const response = await withMutation(() => createOfficeKanbanTask(payload));
      if (!response) {
        return null;
      }
      setKanbanTasks((previous) => upsertTask(previous, response.task));
      return response.task;
    },
    [withMutation]
  );

  const updateKanbanTaskHandler = useCallback(
    async (
      taskId: string,
      payload: UpdateOfficeKanbanTaskRequest
    ): Promise<TaskSummaryView | null> => {
      const response = await withMutation(() => updateOfficeKanbanTask(taskId, payload));
      if (!response) {
        return null;
      }
      setKanbanTasks((previous) => upsertTask(previous, response.task));
      return response.task;
    },
    [withMutation]
  );

  const createMeetingHandler = useCallback(
    async (payload: CreateOfficeMeetingRequest): Promise<OfficeMeetingView | null> => {
      const response = await withMutation(() => createOfficeMeeting(payload));
      if (!response) {
        return null;
      }
      setMeetings((previous) => upsertMeeting(previous, response.meeting));
      return response.meeting;
    },
    [withMutation]
  );

  const startMeetingHandler = useCallback(
    async (meetingId: string): Promise<OfficeMeetingView | null> => {
      const response = await withMutation(() => startOfficeMeeting(meetingId));
      if (!response) {
        return null;
      }
      setMeetings((previous) => upsertMeeting(previous, response.meeting));
      return response.meeting;
    },
    [withMutation]
  );

  const completeMeetingHandler = useCallback(
    async (meetingId: string): Promise<OfficeMeetingView | null> => {
      const response = await withMutation(() =>
        completeOfficeMeeting(meetingId, { summary: null })
      );
      if (!response) {
        return null;
      }
      setMeetings((previous) => upsertMeeting(previous, response.meeting));
      return response.meeting;
    },
    [withMutation]
  );

  const deleteMeetingHandler = useCallback(
    async (meetingId: string): Promise<boolean> => {
      const response = await withMutation(() => deleteOfficeMeeting(meetingId));
      if (!response) {
        return false;
      }
      setMeetings((previous) => previous.filter((meeting) => meeting.id !== response.id));
      return true;
    },
    [withMutation]
  );

  const runCliHandler = useCallback(
    async (payload: OfficeCliRunRequest): Promise<OfficeCliRunView | null> => {
      const response = await withMutation(() => runOfficeCli(payload));
      if (!response) {
        return null;
      }
      setCliRuns((previous) => upsertRun(previous, response.run));
      return response.run;
    },
    [withMutation]
  );

  const stopCliHandler = useCallback(
    async (taskId: string): Promise<boolean> => {
      const response = await withMutation(() => stopOfficeCli(taskId));
      if (!response) {
        return false;
      }
      const logs = await listOfficeCliLogs(taskId, 200);
      setCliLogsByTaskId((previous) => ({
        ...previous,
        [taskId]: logs.logs
      }));
      return response.stopped;
    },
    [withMutation]
  );

  const loadCliLogsHandler = useCallback(async (taskId: string): Promise<void> => {
    const response = await listOfficeCliLogs(taskId, 200);
    setCliLogsByTaskId((previous) => ({
      ...previous,
      [taskId]: response.logs
    }));
  }, []);

  const loadCliSubtasksHandler = useCallback(async (taskId: string): Promise<void> => {
    const response = await listOfficeCliSubtasks(taskId);
    setCliSubtasksByTaskId((previous) => ({
      ...previous,
      [taskId]: response.subtasks
    }));
  }, []);

  const activateRunnerHandler = useCallback(
    async (
      provider: ProviderUsageProbeProvider,
      accountPoolId: string
    ): Promise<boolean> => {
      const response = await withMutation(() =>
        activateOfficeRunner({ provider, accountPoolId })
      );
      if (!response) {
        return false;
      }
      setRunnerItems((previous) => upsertRunner(previous, response.runner));
      const queueItem = response.queueItem;
      if (queueItem) {
        setRunnerQueue((previous) => upsertRunnerQueueItem(previous, queueItem));
      }
      return true;
    },
    [withMutation]
  );

  const deactivateRunnerHandler = useCallback(
    async (
      provider: ProviderUsageProbeProvider,
      accountPoolId: string
    ): Promise<boolean> => {
      const response = await withMutation(() =>
        deactivateOfficeRunner({ provider, accountPoolId, reason: "ui-manual" })
      );
      if (!response) {
        return false;
      }
      setRunnerItems((previous) => upsertRunner(previous, response.runner));
      const promotedQueueItem = response.promotedQueueItem;
      if (promotedQueueItem) {
        setRunnerQueue((previous) =>
          upsertRunnerQueueItem(previous, promotedQueueItem)
        );
      }
      return true;
    },
    [withMutation]
  );

  return useMemo(
    () => ({
      runtimeState,
      logs,
      threads,
      kanban: {
        departments: kanbanDepartments,
        tasks: kanbanTasks
      },
      meetings,
      cli: {
        runs: cliRuns,
        logsByTaskId: cliLogsByTaskId,
        subtasksByTaskId: cliSubtasksByTaskId
      },
      runners: {
        items: runnerItems,
        queue: runnerQueue
      },
      isConnected,
      isHydrating,
      isMutating,
      errorMessage,
      refresh,
      sendCommand,
      createThread: createThreadHandler,
      appendThreadMessage: appendThreadMessageHandler,
      updateThreadStatus: updateThreadStatusHandler,
      createKanbanTask: createKanbanTaskHandler,
      updateKanbanTask: updateKanbanTaskHandler,
      createMeeting: createMeetingHandler,
      startMeeting: startMeetingHandler,
      completeMeeting: completeMeetingHandler,
      deleteMeeting: deleteMeetingHandler,
      runCli: runCliHandler,
      stopCli: stopCliHandler,
      loadCliLogs: loadCliLogsHandler,
      loadCliSubtasks: loadCliSubtasksHandler,
      activateRunner: activateRunnerHandler,
      deactivateRunner: deactivateRunnerHandler
    }),
    [
      activateRunnerHandler,
      appendThreadMessageHandler,
      cliLogsByTaskId,
      cliRuns,
      cliSubtasksByTaskId,
      completeMeetingHandler,
      createKanbanTaskHandler,
      createMeetingHandler,
      createThreadHandler,
      deleteMeetingHandler,
      errorMessage,
      isConnected,
      isHydrating,
      isMutating,
      kanbanDepartments,
      kanbanTasks,
      loadCliLogsHandler,
      loadCliSubtasksHandler,
      logs,
      meetings,
      refresh,
      runnerItems,
      runnerQueue,
      runCliHandler,
      runtimeState,
      sendCommand,
      startMeetingHandler,
      stopCliHandler,
      threads,
      deactivateRunnerHandler,
      updateKanbanTaskHandler,
      updateThreadStatusHandler
    ]
  );
};
