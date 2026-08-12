import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DurableControlTowerSnapshot } from "./control-tower";

const coreApi = vi.hoisted(() => ({ bootstrapSession: vi.fn() }));

vi.mock("./core", () => ({
  bootstrapSession: coreApi.bootstrapSession,
  post: vi.fn(),
  request: vi.fn(),
}));

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, (event: MessageEvent<string>) => void>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, listener as (event: MessageEvent<string>) => void);
  }

  emit(type: string, payload: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

function snapshot(rootProjectId = "project:BloggerGent"): DurableControlTowerSnapshot {
  return {
    root_project_id: rootProjectId,
    root_project: {
      project_id: rootProjectId,
      project_key: rootProjectId.replace(/^project:/, ""),
      display_name: "BloggerGent Project Scope",
      owner_department: "OPS",
      implementation_delegate: "IMPLEMENT",
      lifecycle_status: "active",
      role_agents: [],
      lanes: [],
    },
    projects: [],
    deployments: [],
    tasks: [],
    runs: [],
    approvals: [],
    handoffs: [],
    artifacts: [],
    journeys: [],
    event_count: 125,
  };
}

describe("Control Tower real-time subscription", () => {
  beforeEach(() => {
    coreApi.bootstrapSession.mockReset();
    coreApi.bootstrapSession.mockResolvedValue(true);
    FakeEventSource.latest = null;
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("connects, applies same-Project snapshots, reports reconnecting, and closes cleanly", async () => {
    const { subscribeDurableControlTowerState } = await import("./control-tower");
    const statuses: string[] = [];
    const snapshots: number[] = [];
    const errors: string[] = [];
    const close = await subscribeDurableControlTowerState("project:BloggerGent", {
      onStatus: (status) => statuses.push(status),
      onSnapshot: (event) => snapshots.push(event.snapshot.event_count),
      onError: (message) => errors.push(message),
    });
    const source = FakeEventSource.latest!;

    expect(coreApi.bootstrapSession).toHaveBeenCalledWith({ promptOnUnauthorized: false });
    expect(source.url).toContain("project%3ABloggerGent/events");
    source.onopen?.();
    source.emit("snapshot", {
      reason: "journey",
      emitted_at: "2026-07-15T05:17:00.000Z",
      snapshot: snapshot(),
    });
    source.onerror?.();

    expect(statuses).toEqual(["connecting", "connected", "reconnecting"]);
    expect(snapshots).toEqual([125]);
    expect(errors).toEqual([]);
    close();
    expect(source.closed).toBe(true);
  });

  it("blocks a snapshot from another Project and reports malformed events", async () => {
    const { subscribeDurableControlTowerState } = await import("./control-tower");
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    await subscribeDurableControlTowerState("project:BloggerGent", {
      onStatus: vi.fn(),
      onSnapshot,
      onError,
    });
    const source = FakeEventSource.latest!;
    source.emit("snapshot", {
      reason: "action",
      emitted_at: "2026-07-15T05:17:00.000Z",
      snapshot: snapshot("project:CardNewsAgent"),
    });
    source.listeners.get("snapshot")?.({ data: "{" } as MessageEvent<string>);

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Project 범위가 다른 실시간 상태를 차단했습니다.");
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("실시간 상태를 해석하지 못했습니다"));
  });
});
