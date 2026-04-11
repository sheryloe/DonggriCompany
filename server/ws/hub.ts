import { WebSocket } from "ws";
import { normalizeSubtaskTitleForDisplay } from "../modules/workflow/subtasks/title-normalizer.ts";

export function createWsHub(nowMs: () => number): {
  wsClients: Set<WebSocket>;
  broadcast: (type: string, payload: unknown) => void;
} {
  const wsClients = new Set<WebSocket>();

  function sendRaw(type: string, payload: unknown): void {
    const message = JSON.stringify({ type, payload, ts: nowMs() });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Batched broadcast for high-frequency streaming event types.
  // Collects payloads during a cooldown window, then flushes them all.
  // Only truly high-frequency types are batched; agent_status is excluded
  // because it is paired with task_update (unbatched) and delaying it
  // causes visible ordering mismatches on the frontend.
  const BATCH_INTERVAL: Record<string, number> = {
    cli_output: 250, // highest frequency (process stdout/stderr streams)
    subtask_update: 150, // moderate frequency
  };
  const MAX_BATCH_QUEUE = 60;
  const batches = new Map<string, { queue: unknown[]; timer: ReturnType<typeof setTimeout> }>();

  function normalizePayloadForBroadcast(type: string, payload: unknown): unknown {
    if (type !== "subtask_update" || !payload || typeof payload !== "object") return payload;
    const row = payload as Record<string, unknown>;
    return {
      ...row,
      title: normalizeSubtaskTitleForDisplay(row.title),
    };
  }

  function broadcast(type: string, payload: unknown): void {
    const normalizedPayload = normalizePayloadForBroadcast(type, payload);
    const interval = BATCH_INTERVAL[type];
    if (!interval) {
      sendRaw(type, normalizedPayload);
      return;
    }

    const existing = batches.get(type);
    if (existing) {
      if (existing.queue.length < MAX_BATCH_QUEUE) {
        existing.queue.push(normalizedPayload);
      }
      // Over cap: shed oldest to prevent unbounded growth
      else {
        existing.queue.shift();
        existing.queue.push(normalizedPayload);
      }
      return;
    }

    // First event: send immediately, then open a batch window
    sendRaw(type, normalizedPayload);
    const entry: { queue: unknown[]; timer: ReturnType<typeof setTimeout> } = {
      queue: [],
      timer: setTimeout(() => {
        const items = entry.queue;
        batches.delete(type);
        for (const p of items) {
          try {
            sendRaw(type, p);
          } catch {
            /* skip failed item, continue flushing */
          }
        }
      }, interval),
    };
    batches.set(type, entry);
  }

  return { wsClients, broadcast };
}
