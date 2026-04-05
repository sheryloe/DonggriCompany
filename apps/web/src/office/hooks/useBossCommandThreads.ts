"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BossCommandRecipient } from "../board/office-agents";
import {
  appendBossCommandFeedback,
  createBossCommandThread,
  loadBossCommandThreads,
  saveBossCommandThreads,
  updateBossCommandStatus,
  type BossCommandThread,
  type BossCommandThreadStatus
} from "../lib/office-console";

type UseBossCommandThreadsResult = {
  threads: BossCommandThread[];
  selectedThreadId: string | null;
  selectedThread: BossCommandThread | null;
  selectThread: (threadId: string) => void;
  createThread: (recipient: BossCommandRecipient, summary: string, body: string) => void;
  addFeedback: (threadId: string, sender: BossCommandRecipient, body: string) => void;
  updateStatus: (threadId: string, status: BossCommandThreadStatus) => void;
};

const sortThreads = (threads: BossCommandThread[]): BossCommandThread[] => {
  return [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const useBossCommandThreads = (): UseBossCommandThreadsResult => {
  const [threads, setThreads] = useState<BossCommandThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const loaded = sortThreads(loadBossCommandThreads(window.localStorage));
    setThreads(loaded);
    setSelectedThreadId(loaded[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    saveBossCommandThreads(threads, window.localStorage);
  }, [threads]);

  const createThread = useCallback((recipient: BossCommandRecipient, summary: string, body: string): void => {
    const nextThread = createBossCommandThread(recipient, summary, body);
    setThreads((previous) => sortThreads([nextThread, ...previous]));
    setSelectedThreadId(nextThread.id);
  }, []);

  const addFeedback = useCallback((threadId: string, sender: BossCommandRecipient, body: string): void => {
    setThreads((previous) =>
      sortThreads(
        previous.map((thread) =>
          thread.id === threadId ? appendBossCommandFeedback(thread, sender, body) : thread
        )
      )
    );
  }, []);

  const updateStatus = useCallback((threadId: string, status: BossCommandThreadStatus): void => {
    setThreads((previous) =>
      sortThreads(
        previous.map((thread) =>
          thread.id === threadId ? updateBossCommandStatus(thread, status) : thread
        )
      )
    );
  }, []);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads]
  );

  return {
    threads,
    selectedThreadId,
    selectedThread,
    selectThread: setSelectedThreadId,
    createThread,
    addFeedback,
    updateStatus
  };
};
