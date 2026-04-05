import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BOSS_COMMAND_STORAGE_KEY } from "../lib/office-console";
import { OFFICE_LOCALE_STORAGE_KEY } from "../i18n/office-i18n";
import OfficePage from "./OfficePage";

const bootstrapMock = {
  isLoading: false,
  errorMessage: null,
  pools: [
    {
      id: "pool-1",
      key: "codex-main",
      provider: "codex",
      label: "Codex Main",
      planTier: "pro",
      fatigueMode: "official",
      maxConcurrency: 4,
      isEnabled: true,
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      latestFatigue: null,
      runtimeProfiles: []
    }
  ],
  profiles: [
    {
      id: "profile-1",
      key: "codex-main-a",
      provider: "codex",
      accountPoolId: "pool-1",
      profilePath: ".codex/profiles/a",
      status: "active",
      isEnabled: true,
      capabilities: []
    }
  ],
  providers: [
    {
      provider: "codex",
      cliInstalled: true,
      executablePath: "/usr/bin/codex",
      configPath: "~/.codex",
      loginStatus: "logged_in",
      checkedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  officeOpsState: {
    selectedProvider: "codex",
    selectedAccountPoolId: "pool-1",
    selectedRuntimeProfileId: "profile-1"
  },
  setOfficeOpsState: vi.fn(),
  refresh: vi.fn(async () => undefined)
};

const probeMock = {
  isRunning: false,
  isHistoryLoading: false,
  errorMessage: null,
  actionMessage: null,
  historyLimit: 20,
  historyRuns: [],
  latestRun: null,
  changeHistoryLimit: vi.fn(async () => undefined),
  runProbe: vi.fn(async () => true),
  refreshHistory: vi.fn(async () => true)
};

const runtimeCrudMock = {
  isMutating: false,
  errorMessage: null,
  actionMessage: null,
  createProfile: vi.fn(async () => true),
  updateProfile: vi.fn(async () => true),
  removeProfile: vi.fn(async () => true),
  clearMessages: vi.fn()
};

const agentModelAssignmentsMock = {
  assignments: [
    {
      agentId: "main",
      provider: "codex",
      accountPoolId: "pool-1",
      runtimeProfileId: "profile-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  assignmentByAgentId: {
    main: {
      agentId: "main",
      provider: "codex",
      accountPoolId: "pool-1",
      runtimeProfileId: "profile-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  },
  isLoading: false,
  isMutating: false,
  errorMessage: null,
  actionMessage: null,
  refresh: vi.fn(async () => undefined),
  upsert: vi.fn(async () => null)
};

const oauthSessionsMock = {
  sessions: [
    {
      provider: "codex",
      accountPoolId: "pool-1",
      status: "connected",
      connected: true,
      expiresAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastError: null
    }
  ],
  sessionByPoolId: {
    "pool-1": {
      provider: "codex",
      accountPoolId: "pool-1",
      status: "connected",
      connected: true,
      expiresAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastError: null
    }
  },
  isLoading: false,
  isMutating: false,
  errorMessage: null,
  actionMessage: null,
  refresh: vi.fn(async () => undefined),
  connect: vi.fn(async () => true),
  disconnect: vi.fn(async () => true)
};

const tycoonMock = {
  simState: {
    tick: 1,
    seed: 1,
    simSpeed: "1x",
    isPaused: false,
    loopState: "working",
    jobQueue: 0,
    completedJobs: 0,
    pmReports: 0,
    phaseTicks: 0,
    lastLoopEvent: null,
    agentLoad: {
      "actor-main": 21,
      "actor-router": 34,
      "actor-runtime": 48,
      "actor-probe": 55,
      "actor-history": 17,
      "actor-pm": 12
    },
    agents: []
  },
  kpi: {
    throughput: 1,
    queueDepth: 2,
    slaRisk: "low",
    probeConfidence: "high",
    avgAgentLoad: 10
  },
  eventLog: [
    {
      id: "evt-1",
      tick: 3,
      category: "system",
      message: "HUD committed: runProbe backend-success",
      actorId: "boss",
      speaker: "Boss"
    }
  ],
  dispatchHudCommand: vi.fn(),
  registerEditorEvent: vi.fn()
};

const officeBoardSceneCalls = vi.hoisted(() => [] as Array<{ showStatusPanel?: boolean }>);

vi.mock("../hooks/useStep2OpsBootstrap", () => ({
  useStep2OpsBootstrap: () => bootstrapMock
}));

vi.mock("../hooks/useProviderProbe", () => ({
  useProviderProbe: () => probeMock
}));

vi.mock("../hooks/useRuntimeProfileCrud", () => ({
  useRuntimeProfileCrud: () => runtimeCrudMock
}));

vi.mock("../hooks/useAgentModelAssignments", () => ({
  useAgentModelAssignments: () => agentModelAssignmentsMock
}));

vi.mock("../hooks/useOAuthSessions", () => ({
  useOAuthSessions: () => oauthSessionsMock
}));

vi.mock("../hooks/useTycoonSimulation", () => ({
  useTycoonSimulation: () => tycoonMock
}));

vi.mock("../board/OfficeBoardScene", () => ({
  OfficeBoardScene: (props: { showStatusPanel?: boolean }) => {
    officeBoardSceneCalls.push(props);
    return <div data-testid="board-scene" />;
  }
}));

vi.mock("../board/office-agents", () => ({
  bossCommandRecipients: [
    { value: "pm", actorId: "actor-pm", label: "PM Liaison" },
    { value: "router", actorId: "actor-router", label: "Router Ops" },
    { value: "runtime", actorId: "actor-runtime", label: "Runtime Ops" },
    { value: "probe", actorId: "actor-probe", label: "Probe Watch" },
    { value: "history", actorId: "actor-history", label: "History Desk" }
  ],
  getMonitorEntries: () => [
    {
      id: "main",
      name: "Main",
      role: "Lead Agent",
      roleLabel: "리드 에이전트",
      stateLabel: "작업 중",
      fatigue: 21,
      usagePercent: 21,
      modelLabel: "CODEX / codex-main-a",
      locationLabel: "작업 구역",
      spriteId: "char_0",
      animState: "idle"
    },
    {
      id: "router",
      name: "Router",
      role: "Router Ops",
      roleLabel: "라우터 운영",
      stateLabel: "작업 중",
      fatigue: 34,
      usagePercent: 34,
      modelLabel: "Route Planner v2",
      locationLabel: "작업 구역",
      spriteId: "char_1",
      animState: "walk"
    },
    {
      id: "runtime",
      name: "Runtime",
      role: "Runtime Ops",
      roleLabel: "런타임 운영",
      stateLabel: "PM으로 이동",
      fatigue: 48,
      usagePercent: 48,
      modelLabel: "Runtime Guard 4x",
      locationLabel: "인프라 베이",
      spriteId: "char_2",
      animState: "walk"
    },
    {
      id: "probe",
      name: "Probe",
      role: "Probe Watch",
      roleLabel: "프로브 감시",
      stateLabel: "보고 중",
      fatigue: 55,
      usagePercent: 55,
      modelLabel: "Signal Watcher",
      locationLabel: "작업 구역",
      spriteId: "char_3",
      animState: "report"
    },
    {
      id: "history",
      name: "History",
      role: "History Desk",
      roleLabel: "히스토리 데스크",
      stateLabel: "대기",
      fatigue: 17,
      usagePercent: 17,
      modelLabel: "Replay Clerk",
      locationLabel: "히스토리 아카이브",
      spriteId: "char_4",
      animState: "idle"
    },
    {
      id: "pm",
      name: "PM",
      role: "PM Liaison",
      roleLabel: "PM 연락 담당",
      stateLabel: "리뷰 대기",
      fatigue: 12,
      usagePercent: 12,
      modelLabel: "PM Relay Desk",
      locationLabel: "PM 데스크",
      spriteId: "char_5",
      animState: "idle"
    }
  ]
}));

vi.mock("../avatar/AvatarLayerBoundary", () => ({
  AvatarLayerBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("../avatar/AgentShell", () => ({
  AgentShell: () => <div data-testid="agent-shell" />
}));

describe("OfficePage MVP layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(OFFICE_LOCALE_STORAGE_KEY, "ko");
    window.localStorage.removeItem(BOSS_COMMAND_STORAGE_KEY);
    bootstrapMock.setOfficeOpsState.mockReset();
    bootstrapMock.refresh.mockClear();
    probeMock.changeHistoryLimit.mockClear();
    probeMock.refreshHistory.mockClear();
    probeMock.runProbe.mockClear();
    agentModelAssignmentsMock.upsert.mockClear();
    oauthSessionsMock.connect.mockClear();
    oauthSessionsMock.disconnect.mockClear();
    officeBoardSceneCalls.length = 0;
  });

  it("renders left inline settings and switches tabs without modal", async () => {
    const user = userEvent.setup();
    render(<OfficePage />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".office-settings-rail")).not.toBeNull();
    expect(document.querySelector(".office-center-column")).not.toBeNull();
    expect(document.querySelector(".office-right-column")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "계정 풀" })).not.toBeNull();
    expect(screen.getByText("선택 풀 상세")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "에이전트 모델" })).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: "런타임" }));
    expect(screen.getByText("런타임 프로필")).not.toBeNull();
  });

  it("renders center-bottom 3xN monitor cards with model and location", () => {
    render(<OfficePage />);

    const grid = screen.getByTestId("center-agent-monitor-grid");
    expect(within(grid).getAllByTestId("center-agent-monitor-card")).toHaveLength(6);
    expect(within(grid).getByText("Main")).not.toBeNull();
    expect(within(grid).getByText("CODEX / codex-main-a")).not.toBeNull();
    expect(within(grid).getByText("인프라 베이")).not.toBeNull();
    expect(within(grid).getByText("55%")).not.toBeNull();
  });

  it("renders right console tabs and switches to boss command thread panel", async () => {
    const user = userEvent.setup();
    render(<OfficePage />);

    expect(screen.getByRole("tab", { name: "전체 에이전트 로그" })).not.toBeNull();
    expect(screen.getByTestId("all-log-panel")).not.toBeNull();
    expect(screen.getByText("HUD committed: runProbe backend-success")).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: "보스 명령 / PM 피드백" }));
    expect(screen.getByTestId("boss-command-panel")).not.toBeNull();
    expect(screen.getByRole("button", { name: "명령 전송" })).not.toBeNull();
  });

  it("updates the heading when locale changes inline", async () => {
    const user = userEvent.setup();
    render(<OfficePage />);

    await user.selectOptions(screen.getByLabelText("UI 언어"), "en");
    expect(await screen.findByRole("heading", { name: "Donggri Office Command Deck" })).not.toBeNull();
  });

  it("keeps the center board status panel disabled", () => {
    render(<OfficePage />);

    expect(officeBoardSceneCalls.length).toBeGreaterThan(0);
    expect(officeBoardSceneCalls[0]?.showStatusPanel).toBe(false);
  });

  it("applies theme on page scope without mutating document colorScheme", async () => {
    const user = userEvent.setup();
    render(<OfficePage />);

    const root = document.querySelector(".office-page-main");
    expect(root?.getAttribute("data-office-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("");

    await user.selectOptions(screen.getByLabelText("색상 테마"), "dark");
    expect(root?.getAttribute("data-office-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("");
  });
});
