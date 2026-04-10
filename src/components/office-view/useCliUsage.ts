import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  getCliStatus,
  getCliUsage,
  refreshCliUsage,
  type CliPoolUsageEntry,
  type CliSessionUsageEntry,
  type CliUsageEntry,
} from "../../api";
import type { Task, CliStatusMap } from "../../types";

interface UseCliUsageResult {
  cliStatus: CliStatusMap | null;
  cliUsage: Record<string, CliUsageEntry> | null;
  cliPoolUsage: CliPoolUsageEntry[];
  cliSessionUsage: CliSessionUsageEntry[];
  cliUsageRef: MutableRefObject<Record<string, CliUsageEntry> | null>;
  refreshing: boolean;
  handleRefreshUsage: () => void;
}

export function useCliUsage(tasks: Task[]): UseCliUsageResult {
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [cliUsage, setCliUsage] = useState<Record<string, CliUsageEntry> | null>(null);
  const [cliPoolUsage, setCliPoolUsage] = useState<CliPoolUsageEntry[]>([]);
  const [cliSessionUsage, setCliSessionUsage] = useState<CliSessionUsageEntry[]>([]);
  const cliUsageByKey = useMemo(() => {
    const base: Record<string, CliUsageEntry> = { ...(cliUsage ?? {}) };
    for (const pool of cliPoolUsage) {
      if (!pool?.key) continue;
      base[pool.key] = pool.usage;
    }
    return Object.keys(base).length > 0 ? base : null;
  }, [cliUsage, cliPoolUsage]);
  const cliUsageRef = useRef<Record<string, CliUsageEntry> | null>(null);
  cliUsageRef.current = cliUsageByKey;

  const [refreshing, setRefreshing] = useState(false);
  const doneCountRef = useRef(0);

  useEffect(() => {
    getCliStatus()
      .then(setCliStatus)
      .catch(() => {});
    getCliUsage()
      .then((response) => {
        if (!response.ok) return;
        setCliUsage(response.usage);
        setCliPoolUsage(response.poolUsage ?? []);
        setCliSessionUsage(response.sessionUsage ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const doneCount = tasks.filter((task) => task.status === "done").length;
    if (doneCountRef.current > 0 && doneCount > doneCountRef.current) {
      refreshCliUsage()
        .then((response) => {
        if (!response.ok) return;
        setCliUsage(response.usage);
        setCliPoolUsage(response.poolUsage ?? []);
        setCliSessionUsage(response.sessionUsage ?? []);
      })
      .catch(() => {});
    }
    doneCountRef.current = doneCount;
  }, [tasks]);

  const handleRefreshUsage = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    refreshCliUsage()
      .then((response) => {
        if (!response.ok) return;
        setCliUsage(response.usage);
        setCliPoolUsage(response.poolUsage ?? []);
        setCliSessionUsage(response.sessionUsage ?? []);
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refreshing]);

  return {
    cliStatus,
    cliUsage,
    cliPoolUsage,
    cliSessionUsage,
    cliUsageRef,
    refreshing,
    handleRefreshUsage,
  };
}
