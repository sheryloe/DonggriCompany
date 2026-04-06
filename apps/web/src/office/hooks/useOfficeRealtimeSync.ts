"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AddBossCommandMessageRequest,
  BossCommandThreadView,
  CreateBossCommandThreadRequest,
  OfficeCommandRequest,
  OfficeEventLogView,
  OfficeRealtimeEvent,
  OfficeRuntimeStateView,
  UpdateBossCommandThreadStatusRequest
} from "@workspace/shared";

import {
  appendOfficeThreadMessage,
  createOfficeThread,
  getOfficeRuntimeState,
  listOfficeLogs,
  listOfficeThreads,
  patchOfficeThreadStatus,
  sendOfficeRuntimeCommand
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
    { id: "actor-main", role: "main-agent", fsmState: "idle", facing: "right", tile: { x: 15, y: 9 }, path: [], taskId: null, eta: 0 },
    { id: "actor-router", role: "router", fsmState: "idle", facing: "right", tile: { x: 12, y: 7 }, path: [], taskId: null, eta: 0 },
    { id: "actor-runtime", role: "runtime", fsmState: "idle", facing: "right", tile: { x: 12, y: 12 }, path: [], taskId: null, eta: 0 },
    { id: "actor-probe", role: "probe", fsmState: "idle", facing: "right", tile: { x: 15, y: 7 }, path: [], taskId: null, eta: 0 },
    { id: "actor-history", role: "history", fsmState: "idle", facing: "right", tile: { x: 17, y: 12 }, path: [], taskId: null, eta: 0 },
    { id: "actor-pm", role: "pm-liaison", fsmState: "idle", facing: "left", tile: { x: 18, y: 9 }, path: [], taskId: null, eta: 0 }
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
  return [thread, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
};

export const useOfficeRealtimeSync = (): UseOfficeRealtimeSyncResult => {
  const [runtimeState, setRuntimeState] = useState<OfficeRuntimeStateView>(RUNTIME_FALLBACK);
  const [logs, setLogs] = useState<OfficeEventLogView[]>([]);
  const [threads, setThreads] = useState<BossCommandThreadView[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    const [stateResponse, logResponse, threadResponse] = await Promise.all([
      getOfficeRuntimeState(),
      listOfficeLogs(120),
      listOfficeThreads()
    ]);
    setRuntimeState(stateResponse.state);
    setLogs(logResponse.logs);
    setThreads(threadResponse.threads);
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
        }
      } catch {
        // ignore malformed event payload
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const sendCommand = useCallback(
    async (payload: OfficeCommandRequest): Promise<boolean> => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        const response = await sendOfficeRuntimeCommand(payload);
        setRuntimeState(response.state);
        return true;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const createThreadHandler = useCallback(
    async (payload: CreateBossCommandThreadRequest): Promise<BossCommandThreadView | null> => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        const response = await createOfficeThread(payload);
        setThreads((previous) => upsertThread(previous, response.thread));
        return response.thread;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const appendThreadMessageHandler = useCallback(
    async (
      threadId: string,
      payload: AddBossCommandMessageRequest
    ): Promise<BossCommandThreadView | null> => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        const response = await appendOfficeThreadMessage(threadId, payload);
        setThreads((previous) => upsertThread(previous, response.thread));
        return response.thread;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const updateThreadStatusHandler = useCallback(
    async (
      threadId: string,
      payload: UpdateBossCommandThreadStatusRequest
    ): Promise<BossCommandThreadView | null> => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        const response = await patchOfficeThreadStatus(threadId, payload);
        setThreads((previous) => upsertThread(previous, response.thread));
        return response.thread;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  return useMemo(
    () => ({
      runtimeState,
      logs,
      threads,
      isConnected,
      isHydrating,
      isMutating,
      errorMessage,
      refresh,
      sendCommand,
      createThread: createThreadHandler,
      appendThreadMessage: appendThreadMessageHandler,
      updateThreadStatus: updateThreadStatusHandler
    }),
    [
      appendThreadMessageHandler,
      createThreadHandler,
      errorMessage,
      isConnected,
      isHydrating,
      isMutating,
      logs,
      refresh,
      runtimeState,
      sendCommand,
      threads,
      updateThreadStatusHandler
    ]
  );
};
