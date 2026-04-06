"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, CompanyStats, Department, Task, WsMessage } from "@workspace/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4315";
const WS_BASE = API_BASE.replace(/^http/, "ws");

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export interface OfficeData {
  agents: Agent[];
  tasks: Task[];
  departments: Department[];
  stats: CompanyStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOfficeData(): OfficeData {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentsRes, tasksRes, deptsRes, statsRes] = await Promise.all([
        fetchJson<{ ok: true; agents: Agent[] }>(`${API_BASE}/api/agents`),
        fetchJson<{ ok: true; tasks: Task[] }>(`${API_BASE}/api/tasks`),
        fetchJson<{ ok: true; departments: Department[] }>(`${API_BASE}/api/departments`),
        fetchJson<{ ok: true; stats: CompanyStats }>(`${API_BASE}/api/stats`),
      ]);
      setAgents(agentsRes.agents);
      setTasks(tasksRes.tasks);
      setDepartments(deptsRes.departments);
      setStats(statsRes.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load office data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/ws/office`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        switch (msg.type) {
          case "agents_updated": setAgents(msg.agents); break;
          case "tasks_updated": setTasks(msg.tasks); break;
          case "stats_updated": setStats(msg.stats); break;
          case "agent_status":
            setAgents((prev) =>
              prev.map((a) => a.id === msg.agentId ? { ...a, status: msg.status } : a)
            );
            break;
          case "pong": break;
        }
      } catch {}
    };

    ws.onclose = () => {
      reconnectTimerRef.current = setTimeout(connectWs, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    // 30초마다 ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 30_000);

    ws.addEventListener("close", () => clearInterval(pingInterval));
  }, []);

  useEffect(() => {
    void loadInitial();
    connectWs();

    return () => {
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [loadInitial, connectWs]);

  return { agents, tasks, departments, stats, isLoading, error, refresh: loadInitial };
}
