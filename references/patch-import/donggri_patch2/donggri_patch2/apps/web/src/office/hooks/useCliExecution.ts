"use client";

import { useCallback, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4315";

interface SubTask {
  id: string;
  taskId: string;
  title: string;
  cliToolUseId: string | null;
  status: "pending" | "done";
  createdAt: number;
}

interface LogEntry {
  id: string;
  kind: string;
  message: string;
  createdAt: number;
}

export function useCliExecution(taskId: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`${API_BASE}/api/cli/logs/${taskId}`);
      const data = await res.json() as { ok: true; logs: LogEntry[] };
      setLogs(data.logs);
    } finally { setLoadingLogs(false); }
  }, [taskId]);

  const fetchSubtasks = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/cli/subtasks/${taskId}`);
    const data = await res.json() as { ok: true; subtasks: SubTask[] };
    setSubtasks(data.subtasks);
  }, [taskId]);

  const stop = useCallback(async () => {
    await fetch(`${API_BASE}/api/cli/stop/${taskId}`, { method: "POST" });
  }, [taskId]);

  return { logs, subtasks, loadingLogs, fetchLogs, fetchSubtasks, stop };
}
