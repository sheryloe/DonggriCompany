import type { ChildProcess } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import type { WebSocket as WsSocket, WebSocketServer } from "ws";

export interface GracefulShutdownSupervisorPort {
  shutdown(signal?: string): Promise<{ failed: number }>;
}

export interface RegisterGracefulShutdownHandlersOptions {
  activeProcesses: Map<string, ChildProcess>;
  stopRequestedTasks: Set<string>;
  killPidTree: (pid: number) => void;
  rollbackTaskWorktree: (taskId: string, reason: string) => void;
  db: DatabaseSync;
  nowMs: () => number;
  endTaskExecutionSession: (taskId: string, reason: string) => void;
  wsClients: Set<WsSocket>;
  wss: WebSocketServer;
  server: { close: (callback: () => void) => void };
  onBeforeClose?: () => void;
  supervisor?: GracefulShutdownSupervisorPort | null;
  forceTimeoutMs?: number;
  exit?: (code: number) => void;
  resignal?: (signal: "SIGUSR2") => void;
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve) => wss.close(() => resolve()));
}

function closeHttpServer(server: { close: (callback: () => void) => void }): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

export function createGracefulShutdownHandler(options: RegisterGracefulShutdownHandlersOptions) {
  let shutdown: Promise<void> | null = null;

  return (signal: "SIGINT" | "SIGTERM" | "SIGUSR2"): Promise<void> => {
    if (shutdown) return shutdown;
    shutdown = (async () => {
      console.log(`\n[Dongri-grigri] ${signal} received. Shutting down gracefully...`);
      const exit = options.exit ?? ((code: number) => process.exit(code));
      const resignal = options.resignal ?? ((nextSignal: "SIGUSR2") => process.kill(process.pid, nextSignal));
      const timeout = setTimeout(() => {
        console.error("[Dongri-grigri] Forced exit after shutdown timeout.");
        exit(1);
      }, Math.max(100, options.forceTimeoutMs ?? 5_000));
      timeout.unref();

      try {
        options.onBeforeClose?.();

        // RunnerSupervisor owns only its own child set. It must acknowledge or
        // conservatively reconcile those children before any SQLite close.
        const supervisorResult = await options.supervisor?.shutdown(signal);
        if (supervisorResult && supervisorResult.failed > 0) {
          throw new Error(`runner_supervisor_shutdown_failed:${supervisorResult.failed}`);
        }

        // Preserve the legacy task runner shutdown path without registering
        // Supervisor children in activeProcesses a second time.
        for (const [taskId, child] of options.activeProcesses) {
          console.log(`[Dongri-grigri] Stopping legacy process for task ${taskId} (pid: ${child.pid})`);
          options.stopRequestedTasks.add(taskId);
          if (child.pid) options.killPidTree(child.pid);
          options.activeProcesses.delete(taskId);

          options.rollbackTaskWorktree(taskId, "server_shutdown");
          const task = options.db.prepare("SELECT assigned_agent_id FROM tasks WHERE id = ?").get(taskId) as
            | { assigned_agent_id: string | null }
            | undefined;
          if (task?.assigned_agent_id) {
            options.db
              .prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?")
              .run(task.assigned_agent_id);
          }
          options.db
            .prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'in_progress'")
            .run(options.nowMs(), taskId);
          options.endTaskExecutionSession(taskId, "server_shutdown");
        }

        for (const ws of options.wsClients) ws.close(1001, "Server shutting down");
        options.wsClients.clear();
        await closeWebSocketServer(options.wss);
        await closeHttpServer(options.server);
        options.db.close();
        console.log("[Dongri-grigri] Shutdown complete.");
        clearTimeout(timeout);
        if (signal === "SIGUSR2") resignal("SIGUSR2");
        else exit(0);
      } catch (error) {
        clearTimeout(timeout);
        console.error("[Dongri-grigri] Graceful shutdown failed.", error);
        exit(1);
      }
    })();
    return shutdown;
  };
}

export function registerGracefulShutdownHandlers(options: RegisterGracefulShutdownHandlersOptions): void {
  const gracefulShutdown = createGracefulShutdownHandler(options);
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.once("SIGUSR2", () => void gracefulShutdown("SIGUSR2"));
}
