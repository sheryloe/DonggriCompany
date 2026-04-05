import { describe, expect, it } from "vitest";

import { createOfficeTranslator } from "../i18n/office-i18n";
import { getLocationLabel, getMonitorEntries } from "./office-agents";
import type { SceneSyncState } from "./scene-types";

const t = createOfficeTranslator("ko");

const baseSceneSync: SceneSyncState = {
  loopState: "working",
  lastLoopEvent: null,
  activeAgents: 6,
  actors: [
    { id: "actor-main", role: "main-agent", fsmState: "working", facing: "right", tile: { x: 6, y: 5 }, path: [], taskId: null, eta: 0 },
    { id: "actor-router", role: "router", fsmState: "working", facing: "right", tile: { x: 7, y: 5 }, path: [], taskId: null, eta: 0 },
    { id: "actor-runtime", role: "runtime", fsmState: "idle", facing: "right", tile: { x: 8, y: 13 }, path: [], taskId: null, eta: 0 },
    { id: "actor-probe", role: "probe", fsmState: "reporting", facing: "left", tile: { x: 14, y: 7 }, path: [], taskId: null, eta: 0 },
    { id: "actor-history", role: "history", fsmState: "idle", facing: "left", tile: { x: 21, y: 13 }, path: [], taskId: null, eta: 0 },
    { id: "actor-pm", role: "pm-liaison", fsmState: "waiting_review", facing: "left", tile: { x: 22, y: 5 }, path: [], taskId: null, eta: 0 }
  ],
  agentLoadById: {
    "actor-main": 33,
    "actor-router": 44,
    "actor-runtime": 11,
    "actor-probe": 65,
    "actor-history": 27,
    "actor-pm": 18
  },
  selectedProvider: "codex",
  selectedPoolKey: "pool-1",
  selectedProfileKey: "codex-main-a",
  probeState: "success",
  lastActionAt: "boot",
  kpi: {
    throughput: 1,
    queueDepth: 1,
    slaRisk: "low",
    probeConfidence: "high",
    avgAgentLoad: 20
  },
  simSpeed: "1x",
  isPaused: false
};

describe("office agent monitor mapping", () => {
  it("maps usage, model, location, and localized state labels", () => {
    const entries = getMonitorEntries(baseSceneSync, "CODEX Agent", t);
    expect(entries).toHaveLength(6);
    expect(entries[0]?.name).toBe("CODEX Agent");
    expect(entries[0]?.usagePercent).toBe(33);
    expect(entries[0]?.modelLabel).toBe("CODEX / codex-main-a");
    expect(entries[0]?.locationLabel).toBe("작업 구역");
    expect(entries[3]?.stateLabel).toBe("보고 중");
  });

  it("resolves tile zones to room labels", () => {
    expect(getLocationLabel({ x: 5, y: 4 }, t)).toBe("작업 구역");
    expect(getLocationLabel({ x: 22, y: 5 }, t)).toBe("PM 데스크");
    expect(getLocationLabel({ x: 3, y: 13 }, t)).toBe("인프라 베이");
    expect(getLocationLabel({ x: 20, y: 14 }, t)).toBe("히스토리 아카이브");
    expect(getLocationLabel({ x: 15, y: 10 }, t)).toBe("이동 구간");
  });
});
