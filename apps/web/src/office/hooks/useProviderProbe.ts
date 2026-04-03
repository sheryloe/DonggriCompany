"use client";

import { useState } from "react";

import type {
  ProviderProbeRunView,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeRunRequest
} from "@workspace/shared";

import {
  listProviderUsageProbeHistory,
  runProviderUsageProbe
} from "../../lib/api/office-step2";
import { validateProviderProbeRun } from "../../lib/validation/office-step2";

type UseProviderProbeOptions = {
  getHistoryQuery: () => ProviderUsageProbeHistoryQuery;
};

export type ProbeUiState = "success" | "partial" | "stale" | "no-signal" | "error";

const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 200;

const clampHistoryLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    return 1;
  }
  if (normalized > MAX_HISTORY_LIMIT) {
    return MAX_HISTORY_LIMIT;
  }
  return normalized;
};

const getTimestamp = (run: ProviderProbeRunView): number => {
  const candidate = run.finishedAt ?? run.startedAt;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

const classifyProbeRunState = (
  run: ProviderProbeRunView | null,
  nowTimestamp: number
): ProbeUiState => {
  if (!run) {
    return "no-signal";
  }
  if (run.status === "success") {
    return "success";
  }
  if (run.status === "partial") {
    return "partial";
  }
  if (nowTimestamp - getTimestamp(run) > STALE_WINDOW_MS) {
    return "stale";
  }
  return "no-signal";
};

export const classifyProbeUiState = (
  input: {
    run: ProviderProbeRunView | null;
    errorMessage?: string | null;
    nowTimestamp?: number;
  }
): ProbeUiState => {
  const nowTimestamp = input.nowTimestamp ?? Date.now();
  const run = input.run;

  if (input.errorMessage) {
    return "error";
  }
  return classifyProbeRunState(run, nowTimestamp);
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

export const useProviderProbe = (options: UseProviderProbeOptions) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(DEFAULT_HISTORY_LIMIT);
  const [historyRuns, setHistoryRuns] = useState<ProviderProbeRunView[]>([]);
  const [latestRun, setLatestRun] = useState<ProviderProbeRunView | null>(null);

  const refreshHistory = async (limitOverride?: number): Promise<boolean> => {
    const effectiveLimit = clampHistoryLimit(limitOverride ?? historyLimit);
    setIsHistoryLoading(true);
    setErrorMessage(null);
    try {
      const history = await listProviderUsageProbeHistory({
        ...options.getHistoryQuery(),
        limit: effectiveLimit
      });
      setHistoryRuns(history.runs);
      setLatestRun(history.runs[0] ?? null);
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      return false;
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const changeHistoryLimit = async (nextLimit: number): Promise<void> => {
    const clamped = clampHistoryLimit(nextLimit);
    setHistoryLimit(clamped);
    await refreshHistory(clamped);
  };

  const runProbe = async (payload: ProviderUsageProbeRunRequest): Promise<boolean> => {
    const issue = validateProviderProbeRun(payload);
    if (issue) {
      setErrorMessage(issue);
      return false;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await runProviderUsageProbe(payload);
      const refreshed = await refreshHistory();
      if (!refreshed) {
        setLatestRun(response.run);
      }
      setActionMessage("Probe run completed.");
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      return false;
    } finally {
      setIsRunning(false);
    }
  };

  return {
    isRunning,
    isHistoryLoading,
    errorMessage,
    actionMessage,
    historyLimit,
    historyRuns,
    latestRun,
    changeHistoryLimit,
    runProbe,
    refreshHistory
  };
};
