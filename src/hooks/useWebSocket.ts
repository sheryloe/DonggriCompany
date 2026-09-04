import { useEffect, useRef, useCallback, useState } from "react";
import { bootstrapSession } from "../api";
import type { WebSocketConnectionState, WSEvent, WSEventType } from "../types";

type Listener = (payload: unknown) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<WSEventType, Set<Listener>>>(new Map());
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>("connecting");

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;
    let alive = true;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let forceSessionBootstrap = false;

    async function connect() {
      if (!alive) return;
      const forceBootstrap = forceSessionBootstrap;
      try {
        const bootstrapped = await bootstrapSession({
          promptOnUnauthorized: false,
          force: forceBootstrap,
        });
        if (!alive) return;
        if (!bootstrapped) {
          if (forceBootstrap) setConnectionState("auth_recovering");
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 2000);
          return;
        }
        forceSessionBootstrap = false;
      } catch {
        if (!alive) return;
        // Avoid force bootstrap busy-loop when unauthorized recovery itself fails.
        if (forceBootstrap) forceSessionBootstrap = false;
        setConnectionState(forceBootstrap ? "auth_recovering" : "reconnecting");
        // ignore bootstrap errors; ws connect result will drive retry
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 2000);
        return;
      }
      const socket = new WebSocket(url);
      ws = socket;
      wsRef.current = socket;

      socket.onopen = () => {
        if (alive && wsRef.current === socket) setConnectionState("connected");
      };
      socket.onclose = (event) => {
        if (!alive || wsRef.current !== socket) return;
        wsRef.current = null;
        if (event.code === 1008) {
          forceSessionBootstrap = true;
          setConnectionState("auth_recovering");
        } else {
          setConnectionState("reconnecting");
        }
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 2000);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (e) => {
        if (!alive || wsRef.current !== socket) return;
        try {
          const evt = JSON.parse(e.data) as Partial<WSEvent>;
          if (!evt || typeof evt !== "object" || typeof evt.type !== "string" || !("payload" in evt)) return;
          const listeners = listenersRef.current.get(evt.type as WSEventType);
          if (listeners) {
            for (const fn of listeners) fn(evt.payload);
          }
        } catch {
          void 0;
        }
      };
    }

    void connect();
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, []);

  const on = useCallback((type: WSEventType, fn: Listener) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(fn);
    return () => {
      listenersRef.current.get(type)?.delete(fn);
    };
  }, []);

  return { connected: connectionState === "connected", connectionState, on };
}
