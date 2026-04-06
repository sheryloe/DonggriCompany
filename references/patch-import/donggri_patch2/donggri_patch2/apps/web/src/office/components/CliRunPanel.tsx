"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@workspace/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4315";
const WS_BASE = API_BASE.replace(/^http/, "ws");

type CliProvider = "claude" | "codex" | "gemini" | "opencode" | "kimi";

const PROVIDERS: { id: CliProvider; label: string; icon: string; color: string }[] = [
  { id: "claude",    label: "Claude Code", icon: "🤖", color: "#d97706" },
  { id: "codex",     label: "Codex CLI",   icon: "⚡", color: "#3b82f6" },
  { id: "gemini",    label: "Gemini CLI",  icon: "💎", color: "#6366f1" },
  { id: "opencode",  label: "OpenCode",    icon: "🔷", color: "#10b981" },
  { id: "kimi",      label: "Kimi Code",   icon: "🌙", color: "#8b5cf6" },
];

interface LogEntry {
  stream: "stdout" | "stderr";
  data: string;
  ts: number;
}

interface CliRunPanelProps {
  task: Task;
  onStatusChange?: (taskId: string, status: string) => void;
}

export default function CliRunPanel({ task, onStatusChange }: CliRunPanelProps) {
  const [provider, setProvider] = useState<CliProvider>("claude");
  const [model, setModel] = useState("");
  const [projectPath, setProjectPath] = useState(task.projectPath ?? "");
  const [prompt, setPrompt] = useState(`# Task: ${task.title}\n\n${task.description ?? ""}`);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket CLI output 수신
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/office`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>;
        if (msg.type === "cli_output" && msg.task_id === task.id) {
          setLogs((prev) => [...prev, {
            stream: msg.stream as "stdout" | "stderr",
            data: msg.data as string,
            ts: Date.now(),
          }]);
        }
        if (msg.type === "cli_done" && msg.task_id === task.id) {
          setRunning(false);
          onStatusChange?.(task.id, (msg.exit_code === 0 ? "review" : "pending") as string);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [task.id, onStatusChange]);

  // 로그 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const run = useCallback(async () => {
    if (!projectPath.trim() || !prompt.trim()) return;
    setLogs([]);
    setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/cli/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id, provider, prompt: prompt.trim(),
          projectPath: projectPath.trim(), model: model.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setLogs([{ stream: "stderr", data: err.error ?? "실행 실패", ts: Date.now() }]);
        setRunning(false);
      }
    } catch (err) {
      setLogs([{ stream: "stderr", data: String(err), ts: Date.now() }]);
      setRunning(false);
    }
  }, [task.id, provider, prompt, projectPath, model]);

  const stop = useCallback(async () => {
    await fetch(`${API_BASE}/api/cli/stop/${task.id}`, { method: "POST" });
  }, [task.id]);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="flex h-full flex-col gap-3 bg-gray-950 p-4 text-white">
      <div className="flex items-center gap-2">
        <span className="text-lg">{selectedProvider.icon}</span>
        <h2 className="font-bold text-white">CLI 에이전트 실행</h2>
        <span className="ml-auto text-xs text-gray-500 truncate max-w-40">{task.title}</span>
      </div>

      {/* Provider 선택 */}
      <div className="flex flex-wrap gap-1.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id} onClick={() => setProvider(p.id)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              provider === p.id ? "text-white shadow" : "border border-white/10 text-gray-400 hover:text-white"
            }`}
            style={provider === p.id ? { backgroundColor: p.color } : {}}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* 설정 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">프로젝트 경로</label>
          <input
            value={projectPath} onChange={(e) => setProjectPath(e.target.value)}
            placeholder="/path/to/project"
            className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">모델 (선택)</label>
          <input
            value={model} onChange={(e) => setModel(e.target.value)}
            placeholder="기본값 사용"
            className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 프롬프트 */}
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <label className="text-xs text-gray-400">프롬프트</label>
        <textarea
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          className="flex-1 min-h-24 rounded-lg border border-white/10 bg-gray-800 p-3 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500 resize-none font-mono"
        />
      </div>

      {/* 실행 버튼 */}
      <div className="flex gap-2">
        {running ? (
          <button onClick={stop}
            className="flex-1 rounded-lg border border-red-700/50 bg-red-900/30 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/50">
            ⏹ 중단
          </button>
        ) : (
          <button onClick={run} disabled={!projectPath.trim()}
            className="flex-1 rounded-lg py-2 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: selectedProvider.color }}>
            ▶ {selectedProvider.label} 실행
          </button>
        )}
      </div>

      {/* 로그 뷰어 */}
      {logs.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-xs">
          {logs.map((log, i) => (
            <div key={i} className={log.stream === "stderr" ? "text-red-400" : "text-gray-300"}>
              {log.data}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
