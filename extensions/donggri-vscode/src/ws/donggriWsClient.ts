import * as vscode from "vscode";
import WebSocket from "ws";
import type { DonggriServerConfig, DonggriWsEvent } from "../types";
import { DonggriHttpClient } from "../api/httpClient";

export class DonggriWsClient implements vscode.Disposable {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private disposed = false;
  private readonly eventEmitter = new vscode.EventEmitter<DonggriWsEvent>();
  private readonly connectionEmitter = new vscode.EventEmitter<boolean>();

  readonly onEvent = this.eventEmitter.event;
  readonly onConnectionChanged = this.connectionEmitter.event;

  constructor(
    private readonly http: DonggriHttpClient,
    private readonly getConfig: () => DonggriServerConfig,
  ) {}

  async connect(forceBootstrap = false): Promise<void> {
    if (this.disposed) {
      return;
    }

    const config = this.getConfig();
    if (!config.autoConnect) {
      this.disconnect();
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.close();

    if (forceBootstrap) {
      await this.http.bootstrapSession(true).catch(() => undefined);
    } else if (!config.apiToken) {
      await this.http.bootstrapSession().catch(() => undefined);
    }

    const url = this.http.getEffectiveBaseUrl().replace(/^http/iu, "ws") + "/ws";
    const socket = new WebSocket(url, {
      headers: this.http.createWebSocketHeaders(),
    });
    this.socket = socket;

    socket.on("open", () => {
      this.connectionEmitter.fire(true);
    });

    socket.on("message", (payload) => {
      try {
        const event = JSON.parse(String(payload)) as DonggriWsEvent;
        this.eventEmitter.fire(event);
      } catch {
        return;
      }
    });

    socket.on("close", (code) => {
      this.connectionEmitter.fire(false);
      this.scheduleReconnect(code === 1008);
    });

    socket.on("error", () => {
      socket.close();
    });
  }

  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = undefined;
    this.connectionEmitter.fire(false);
  }

  private scheduleReconnect(forceBootstrap: boolean): void {
    if (this.disposed || !this.getConfig().autoConnect) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect(forceBootstrap);
    }, 2_000);
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.eventEmitter.dispose();
    this.connectionEmitter.dispose();
  }
}
