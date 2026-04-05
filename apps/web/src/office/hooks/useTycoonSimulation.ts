"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { ProbeUiState } from "../lib/probe-ui-state";
import type {
  AgentSimActor,
  AgentWorkLoopState,
  FacingDir,
  HudCommandEvent,
  LoopEvent,
  LoopEventPhase,
  NpcRoleProfile,
  SimulationSpeed,
  TycoonEventLogItem,
  TycoonKpi,
  TycoonSimState
} from "../board/scene-types";
import { officeNpcProfiles } from "../board/office-agents";

type UseTycoonSimulationOptions = {
  probeState: ProbeUiState;
  selectedProvider: string;
};

type HudCommandPayload = {
  speed?: SimulationSpeed;
  phase?: LoopEventPhase;
  detail?: string;
};

type UseTycoonSimulationResult = {
  simState: TycoonSimState;
  kpi: TycoonKpi;
  eventLog: TycoonEventLogItem[];
  dispatchHudCommand: (event: HudCommandEvent, payload?: HudCommandPayload) => void;
  registerEditorEvent: (message: string) => void;
};

type SimulationReducerState = {
  sim: TycoonSimState;
  eventLog: TycoonEventLogItem[];
  logSeq: number;
};

type SimulationAction =
  | {
      type: "tick";
      selectedProvider: string;
    }
  | {
      type: "hud-command";
      command: HudCommandEvent;
      payload?: HudCommandPayload;
      probeState: ProbeUiState;
    }
  | {
      type: "probe-state";
      probeState: ProbeUiState;
      previousProbeState: ProbeUiState;
    }
  | {
      type: "editor-event";
      message: string;
    };

const speedToTickMs: Record<SimulationSpeed, number> = {
  "1x": 600,
  "2x": 360,
  "4x": 220
};

const initialSeed = 271_828;

const mainPhaseDurations: Record<Exclude<AgentWorkLoopState, "idle" | "blocked">, number> = {
  moving_to_task: 3,
  working: 5,
  moving_to_pm: 3,
  reporting: 3,
  waiting_review: 2
};

const createInitialActors = (): AgentSimActor[] => {
  return [
    { id: "actor-main", role: "main-agent", fsmState: "idle", facing: "right", tile: { x: 15, y: 9 }, path: [], taskId: null, eta: 0 },
    { id: "actor-router", role: "router", fsmState: "idle", facing: "right", tile: { x: 12, y: 7 }, path: [], taskId: null, eta: 0 },
    { id: "actor-runtime", role: "runtime", fsmState: "idle", facing: "right", tile: { x: 12, y: 12 }, path: [], taskId: null, eta: 0 },
    { id: "actor-probe", role: "probe", fsmState: "idle", facing: "right", tile: { x: 15, y: 7 }, path: [], taskId: null, eta: 0 },
    { id: "actor-history", role: "history", fsmState: "idle", facing: "right", tile: { x: 17, y: 12 }, path: [], taskId: null, eta: 0 },
    { id: "actor-pm", role: "pm-liaison", fsmState: "idle", facing: "left", tile: { x: 18, y: 9 }, path: [], taskId: null, eta: 0 }
  ];
};

const createInitialSimState = (simSpeed: SimulationSpeed = "1x"): TycoonSimState => {
  return {
    tick: 0,
    seed: initialSeed,
    simSpeed,
    isPaused: false,
    loopState: "idle",
    jobQueue: 4,
    completedJobs: 0,
    pmReports: 0,
    phaseTicks: 0,
    lastLoopEvent: null,
    agentLoad: {
      "actor-main": 0,
      "actor-router": 0,
      "actor-runtime": 0,
      "actor-probe": 0,
      "actor-history": 0,
      "actor-pm": 0
    },
    agents: createInitialActors()
  };
};

const lcgNext = (seed: number): number => {
  return (seed * 1103515245 + 12345) % 2147483647;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const kpiFromSimState = (state: TycoonSimState, probeState: ProbeUiState): TycoonKpi => {
  const loadValues = Object.values(state.agentLoad);
  const avgLoad = loadValues.length > 0 ? loadValues.reduce((sum, current) => sum + current, 0) / loadValues.length : 0;
  const confidence =
    probeState === "success" ? "high" : probeState === "partial" ? "medium" : probeState === "stale" || probeState === "error" ? "low" : "none";
  const slaRisk =
    state.loopState === "blocked" || state.jobQueue > 14 || probeState === "error"
      ? "high"
      : state.jobQueue > 8 || probeState === "partial" || probeState === "stale"
        ? "medium"
        : "low";

  return {
    throughput: clamp(Math.floor(state.completedJobs / Math.max(1, state.tick / 16)), 0, 999),
    queueDepth: state.jobQueue,
    slaRisk,
    probeConfidence: confidence,
    avgAgentLoad: Number(avgLoad.toFixed(1))
  };
};

const appendLog = (
  previous: TycoonEventLogItem[],
  item: TycoonEventLogItem
): TycoonEventLogItem[] => {
  const next = [item, ...previous];
  return next.slice(0, 120);
};

const getNextFacing = (fromX: number, toX: number, current: FacingDir): FacingDir => {
  if (toX > fromX) {
    return "right";
  }
  if (toX < fromX) {
    return "left";
  }
  return current;
};

const resolvePatrolState = (profile: NpcRoleProfile, tick: number): AgentWorkLoopState => {
  const timeline: Array<{ state: AgentWorkLoopState; duration: number }> = [
    { state: "moving_to_task", duration: profile.phaseDurations.moving_to_task },
    { state: "working", duration: profile.phaseDurations.working },
    { state: "moving_to_pm", duration: profile.phaseDurations.moving_to_pm },
    { state: "reporting", duration: profile.phaseDurations.reporting },
    { state: "waiting_review", duration: profile.phaseDurations.waiting_review },
    { state: "idle", duration: 2 }
  ];
  const totalDuration = timeline.reduce((sum, item) => sum + item.duration, 0);
  let cursor = tick % Math.max(totalDuration, 1);

  for (const item of timeline) {
    if (cursor < item.duration) {
      return item.state;
    }
    cursor -= item.duration;
  }

  return "idle";
};

const resolveNpcState = (
  profile: NpcRoleProfile,
  mainLoopState: AgentWorkLoopState,
  tick: number
): AgentWorkLoopState => {
  if (mainLoopState === "blocked") {
    return "blocked";
  }

  if (profile.scheduler === "stationary") {
    if (mainLoopState === "working") {
      return "working";
    }
    if (mainLoopState === "reporting" || mainLoopState === "waiting_review") {
      return "waiting_review";
    }
    return "idle";
  }

  if (profile.scheduler === "review") {
    if (mainLoopState === "reporting") {
      return "reporting";
    }
    if (mainLoopState === "waiting_review") {
      return "waiting_review";
    }
    return "idle";
  }

  return resolvePatrolState(profile, tick);
};

const resolveNpcTile = (
  profile: NpcRoleProfile,
  tick: number,
  fallbackX: number,
  fallbackY: number
): { x: number; y: number } => {
  if (profile.patrolRoute.length === 0) {
    return { x: fallbackX, y: fallbackY };
  }
  const index = Math.floor(tick / 3) % profile.patrolRoute.length;
  return profile.patrolRoute[index];
};

const updateActors = (
  actors: AgentSimActor[],
  loopState: AgentWorkLoopState,
  phaseTicks: number,
  tick: number
): AgentSimActor[] => {
  return actors.map((actor, index) => {
    if (actor.role === "main-agent") {
      return {
        ...actor,
        fsmState: loopState,
        taskId: loopState === "working" ? `job-${Math.floor(tick / 4)}-main` : null,
        eta: loopState === "working" ? Math.max(1, mainPhaseDurations.working - phaseTicks) : 0
      };
    }

    const profile = officeNpcProfiles[actor.role];
    if (!profile) {
      return actor;
    }

    const nextState = resolveNpcState(profile, loopState, tick + index * 2);
    const nextTile = resolveNpcTile(profile, tick + index * 2, actor.tile.x, actor.tile.y);

    return {
      ...actor,
      fsmState: nextState,
      facing: getNextFacing(actor.tile.x, nextTile.x, actor.facing),
      tile: { x: nextTile.x, y: nextTile.y },
      taskId: nextState === "working" ? `job-${Math.floor(tick / 5)}-${actor.role}` : null,
      eta: nextState === "working" ? Math.max(1, profile.phaseDurations.working - (tick % profile.phaseDurations.working)) : 0
    };
  });
};

const toLoopEvent = (
  type: LoopEvent["type"],
  atTick: number,
  source: LoopEvent["source"],
  phase: LoopEventPhase,
  detail?: string
): LoopEvent => {
  return {
    type,
    atTick,
    source,
    phase,
    detail
  };
};

const syncActorsForState = (state: TycoonSimState): TycoonSimState => {
  return {
    ...state,
    agents: updateActors(state.agents, state.loopState, state.phaseTicks, state.tick)
  };
};

const applyLoopEvent = (
  previous: TycoonSimState,
  event: LoopEvent,
  probeState: ProbeUiState,
  payload?: {
    speed?: SimulationSpeed;
  }
): TycoonSimState => {
  if (event.phase !== "committed") {
    return {
      ...previous,
      lastLoopEvent: event
    };
  }

  if (event.type === "pauseSim") {
    return {
      ...previous,
      isPaused: true,
      lastLoopEvent: event
    };
  }

  if (event.type === "resumeSim") {
    return {
      ...previous,
      isPaused: false,
      lastLoopEvent: event
    };
  }

  if (event.type === "setSimSpeed" && payload?.speed) {
    return {
      ...previous,
      simSpeed: payload.speed,
      lastLoopEvent: event
    };
  }

  if (event.type === "runProbe") {
    if (probeState === "error") {
      return {
        ...previous,
        loopState: "blocked",
        phaseTicks: 0,
        lastLoopEvent: event
      };
    }
    return {
      ...previous,
      loopState: "moving_to_task",
      phaseTicks: 0,
      lastLoopEvent: event
    };
  }

  if (event.type === "refreshHistory") {
    const shouldResetLoop = previous.loopState === "reporting" || previous.loopState === "waiting_review";
    return {
      ...previous,
      loopState: shouldResetLoop ? "idle" : previous.loopState,
      phaseTicks: shouldResetLoop ? 0 : previous.phaseTicks,
      lastLoopEvent: event
    };
  }

  if (event.type === "resetSimulation") {
    return {
      ...createInitialSimState(previous.simSpeed),
      lastLoopEvent: event
    };
  }

  if (event.type === "probeError") {
    return {
      ...previous,
      loopState: "blocked",
      phaseTicks: 0,
      lastLoopEvent: event
    };
  }

  if (event.type === "probeRecovered") {
    return {
      ...previous,
      loopState: "idle",
      phaseTicks: 0,
      lastLoopEvent: event
    };
  }

  return {
    ...previous,
    lastLoopEvent: event
  };
};

const advanceMainLoop = (
  loopState: AgentWorkLoopState,
  phaseTicks: number
): { loopState: AgentWorkLoopState; phaseTicks: number; transitioned: boolean } => {
  if (loopState === "idle" || loopState === "blocked") {
    return { loopState, phaseTicks: 0, transitioned: false };
  }

  const nextTicks = phaseTicks + 1;
  const threshold = mainPhaseDurations[loopState];
  if (nextTicks < threshold) {
    return {
      loopState,
      phaseTicks: nextTicks,
      transitioned: false
    };
  }

  if (loopState === "moving_to_task") {
    return { loopState: "working", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "working") {
    return { loopState: "moving_to_pm", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "moving_to_pm") {
    return { loopState: "reporting", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "reporting") {
    return { loopState: "waiting_review", phaseTicks: 0, transitioned: true };
  }

  return { loopState: "idle", phaseTicks: 0, transitioned: true };
};

const addReducerLog = (
  state: SimulationReducerState,
  item: Omit<TycoonEventLogItem, "id">
): SimulationReducerState => {
  const nextId = `evt-${(state.logSeq + 1).toString().padStart(6, "0")}`;
  return {
    ...state,
    logSeq: state.logSeq + 1,
    eventLog: appendLog(state.eventLog, { ...item, id: nextId })
  };
};

const simulationReducer = (
  state: SimulationReducerState,
  action: SimulationAction
): SimulationReducerState => {
  if (action.type === "tick") {
    const previous = state.sim;
    const tick = previous.tick + 1;
    const nextSeed = lcgNext(previous.seed);
    const nextLoop = advanceMainLoop(previous.loopState, previous.phaseTicks);

    const didComplete = previous.loopState === "reporting" && nextLoop.loopState === "waiting_review";
    const queueNoise = (nextSeed % 5) - 2;
    const stateQueueBias =
      nextLoop.loopState === "blocked"
        ? 2
        : nextLoop.loopState === "moving_to_task"
          ? 1
          : nextLoop.loopState === "working"
            ? -1
            : nextLoop.loopState === "reporting" || nextLoop.loopState === "waiting_review"
              ? -1
              : 0;

    const queueDepth = clamp(previous.jobQueue + queueNoise + stateQueueBias, 0, 30);
    const completed = previous.completedJobs + (didComplete ? 1 : 0);
    const pmReports = previous.pmReports + (didComplete ? 1 : 0);
    const agentLoad = Object.fromEntries(
      Object.entries(previous.agentLoad).map(([key, value], index) => {
        const drift = ((nextSeed >> index) & 3) - 1;
        const loopBias = nextLoop.loopState === "working" ? 1 : nextLoop.loopState === "blocked" ? 2 : 0;
        return [key, clamp(value + drift + loopBias, 0, 100)];
      })
    ) as Record<string, number>;

    const tickEvent = toLoopEvent(
      "tick",
      tick,
      "system",
      "committed",
      nextLoop.transitioned ? `${previous.loopState}->${nextLoop.loopState}` : nextLoop.loopState
    );

    const nextSim = {
      ...previous,
      tick,
      seed: nextSeed,
      loopState: nextLoop.loopState,
      phaseTicks: nextLoop.phaseTicks,
      jobQueue: queueDepth,
      completedJobs: completed,
      pmReports,
      agentLoad,
      agents: updateActors(previous.agents, nextLoop.loopState, nextLoop.phaseTicks, tick),
      lastLoopEvent: tickEvent
    };

    const nextState = {
      ...state,
      sim: nextSim
    };

    if (tick % 3 === 0 || nextLoop.transitioned) {
      return addReducerLog(nextState, {
        tick,
        category: nextLoop.loopState === "blocked" ? "error" : nextLoop.transitioned ? "validation" : "agent",
        message: `[${action.selectedProvider}] loop=${nextLoop.loopState} queue=${queueDepth} reports=${pmReports}`,
        actorId: "actor-main",
        speaker: `${action.selectedProvider.toUpperCase()} Agent`
      });
    }

    return nextState;
  }

  if (action.type === "hud-command") {
    const phase = action.payload?.phase ?? "committed";
    const event = toLoopEvent(
      action.command,
      state.sim.tick,
      "hud",
      phase,
      action.payload?.detail ?? action.payload?.speed
    );
    const updated = syncActorsForState(
      applyLoopEvent(state.sim, event, action.probeState, {
        speed: action.payload?.speed
      })
    );

    const category =
      phase === "rejected"
        ? "error"
        : action.command === "runProbe" || action.command === "refreshHistory" || action.command === "resetSimulation"
          ? "system"
          : "validation";

    return addReducerLog(
      {
        ...state,
        sim: updated
      },
      {
        tick: updated.tick,
        category,
        message: `HUD ${phase}: ${action.command}${action.payload?.speed ? `(${action.payload.speed})` : ""}${action.payload?.detail ? ` ${action.payload.detail}` : ""}`,
        actorId: "boss",
        speaker: "Boss"
      }
    );
  }

  if (action.type === "probe-state") {
    if (action.probeState === action.previousProbeState) {
      return state;
    }

    if (action.probeState === "error") {
      const event = toLoopEvent("probeError", state.sim.tick, "system", "committed", "probe-state=error");
      const updated = syncActorsForState(applyLoopEvent(state.sim, event, action.probeState));
      return addReducerLog(
        {
          ...state,
          sim: updated
        },
        {
          tick: updated.tick,
          category: "error",
          message: "probe signal degraded to error; loop interrupted",
          actorId: "system",
          speaker: "System"
        }
      );
    }

    if (action.previousProbeState !== "error") {
      return state;
    }

    const event = toLoopEvent("probeRecovered", state.sim.tick, "system", "committed", `probe-state=${action.probeState}`);
    const updated = syncActorsForState(applyLoopEvent(state.sim, event, action.probeState));
    return addReducerLog(
      {
        ...state,
        sim: updated
      },
      {
        tick: updated.tick,
        category: "system",
        message: `probe signal recovered (${action.probeState}); loop reset to idle`,
        actorId: "system",
        speaker: "System"
      }
    );
  }

  return addReducerLog(state, {
    tick: state.sim.tick,
    category: "system",
    message: action.message,
    actorId: "boss",
    speaker: "Boss"
  });
};

export const useTycoonSimulation = ({
  probeState,
  selectedProvider
}: UseTycoonSimulationOptions): UseTycoonSimulationResult => {
  const [state, dispatch] = useReducer(simulationReducer, undefined, () => ({
    sim: createInitialSimState(),
    eventLog: [],
    logSeq: 0
  }));
  const previousProbeStateRef = useRef<ProbeUiState>(probeState);

  useEffect(() => {
    if (state.sim.isPaused) {
      return;
    }
    const tickMs = speedToTickMs[state.sim.simSpeed];
    const timer = setInterval(() => {
      dispatch({
        type: "tick",
        selectedProvider
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [selectedProvider, state.sim.isPaused, state.sim.simSpeed]);

  useEffect(() => {
    const previousProbeState = previousProbeStateRef.current;
    if (previousProbeState === probeState) {
      return;
    }
    previousProbeStateRef.current = probeState;
    dispatch({
      type: "probe-state",
      probeState,
      previousProbeState
    });
  }, [probeState]);

  const dispatchHudCommand = useCallback(
    (event: HudCommandEvent, payload?: HudCommandPayload): void => {
      dispatch({
        type: "hud-command",
        command: event,
        payload,
        probeState
      });
    },
    [probeState]
  );

  const registerEditorEvent = useCallback((message: string): void => {
    dispatch({
      type: "editor-event",
      message
    });
  }, []);

  const kpi = useMemo(() => kpiFromSimState(state.sim, probeState), [probeState, state.sim]);

  return {
    simState: state.sim,
    kpi,
    eventLog: state.eventLog,
    dispatchHudCommand,
    registerEditorEvent
  };
};
