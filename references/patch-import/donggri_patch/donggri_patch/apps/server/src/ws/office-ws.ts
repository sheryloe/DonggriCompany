import type { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import type { WsMessage } from "@workspace/shared";
import { AgentService, TaskService, StatsService } from "@workspace/db";

const agentService = new AgentService();
const taskService = new TaskService();
const statsService = new StatsService();

const clients = new Set<WebSocket>();

export function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

export async function registerOfficeWs(server: FastifyInstance): Promise<void> {
  await server.register(fastifyWebsocket);

  server.get("/ws/office", { websocket: true }, (socket) => {
    clients.add(socket);

    // 초기 스냅샷 전달
    try {
      socket.send(JSON.stringify({ type: "agents_updated", agents: agentService.list() } satisfies WsMessage));
      socket.send(JSON.stringify({ type: "tasks_updated", tasks: taskService.list() } satisfies WsMessage));
      socket.send(JSON.stringify({ type: "stats_updated", stats: statsService.getStats() } satisfies WsMessage));
    } catch {}

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        if (msg.type === "ping") socket.send(JSON.stringify({ type: "pong" } satisfies WsMessage));
      } catch {}
    });

    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  // 30초마다 stats 브로드캐스트
  setInterval(() => {
    if (clients.size === 0) return;
    try {
      broadcast({ type: "stats_updated", stats: statsService.getStats() });
    } catch {}
  }, 30_000);
}
