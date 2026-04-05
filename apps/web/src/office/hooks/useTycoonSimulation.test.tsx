import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProbeUiState } from "../lib/probe-ui-state";
import { useTycoonSimulation } from "./useTycoonSimulation";

describe("useTycoonSimulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drives loop progression from runProbe event", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));

    expect(result.current.simState.loopState).toBe("idle");

    act(() => {
      result.current.dispatchHudCommand("runProbe");
    });

    expect(result.current.simState.loopState).toBe("moving_to_task");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(
      ["moving_to_task", "working", "moving_to_pm", "reporting", "waiting_review", "idle"].includes(result.current.simState.loopState)
    ).toBe(true);
    expect(result.current.simState.lastLoopEvent).not.toBeNull();
  });

  it("pauses and resumes simulation", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "partial", selectedProvider: "codex" }));

    act(() => {
      result.current.dispatchHudCommand("pauseSim");
    });
    const pausedTick = result.current.simState.tick;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.simState.tick).toBe(pausedTick);

    act(() => {
      result.current.dispatchHudCommand("resumeSim");
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.simState.tick).toBeGreaterThan(pausedTick);
  });

  it("accepts speed changes and records hud event", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "stale", selectedProvider: "codex" }));

    act(() => {
      result.current.dispatchHudCommand("setSimSpeed", { speed: "4x" });
    });

    expect(result.current.simState.simSpeed).toBe("4x");
    expect(result.current.simState.lastLoopEvent?.type).toBe("setSimSpeed");
    expect(result.current.eventLog.length).toBeGreaterThan(0);
  });

  it("interrupts loop on probe error and recovers after signal", () => {
    const { result, rerender } = renderHook(
      ({ probeState }: { probeState: ProbeUiState }) => useTycoonSimulation({ probeState, selectedProvider: "codex" }),
      { initialProps: { probeState: "success" as ProbeUiState } }
    );

    act(() => {
      result.current.dispatchHudCommand("runProbe");
    });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    act(() => {
      rerender({ probeState: "error" });
    });
    expect(result.current.simState.loopState).toBe("blocked");
    expect(result.current.simState.agents.every((actor) => actor.fsmState === "blocked")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.simState.agents.every((actor) => actor.fsmState === "blocked")).toBe(true);

    act(() => {
      rerender({ probeState: "success" });
    });
    expect(result.current.simState.loopState).toBe("idle");
  });

  it("blocks runProbe when probe state is error", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "error", selectedProvider: "codex" }));

    act(() => {
      result.current.dispatchHudCommand("runProbe", { phase: "committed" });
    });

    expect(result.current.simState.loopState).toBe("blocked");
    expect(result.current.simState.phaseTicks).toBe(0);
    expect(result.current.simState.agents.every((actor) => actor.fsmState === "blocked")).toBe(true);
  });

  it("keeps loop and actors blocked when probe error arrives during pause", () => {
    const { result, rerender } = renderHook(
      ({ probeState }: { probeState: ProbeUiState }) => useTycoonSimulation({ probeState, selectedProvider: "codex" }),
      { initialProps: { probeState: "success" as ProbeUiState } }
    );

    act(() => {
      result.current.dispatchHudCommand("pauseSim");
      rerender({ probeState: "error" });
    });

    expect(result.current.simState.isPaused).toBe(true);
    expect(result.current.simState.loopState).toBe("blocked");
    expect(result.current.simState.agents.every((actor) => actor.fsmState === "blocked")).toBe(true);
  });

  it("does not move loop on rejected runProbe event", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));
    const baselineTick = result.current.simState.tick;

    act(() => {
      result.current.dispatchHudCommand("runProbe", { phase: "pending" });
      result.current.dispatchHudCommand("runProbe", { phase: "rejected", detail: "backend-failed" });
    });

    expect(result.current.simState.loopState).toBe("idle");
    expect(result.current.simState.tick).toBe(baselineTick);
    expect(result.current.simState.lastLoopEvent?.phase).toBe("rejected");
  });

  it("resets simulation state on resetSimulation command", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));

    act(() => {
      result.current.dispatchHudCommand("runProbe", { phase: "committed" });
      vi.advanceTimersByTime(2400);
    });
    expect(result.current.simState.tick).toBeGreaterThan(0);
    expect(result.current.simState.loopState).not.toBe("idle");

    act(() => {
      result.current.dispatchHudCommand("resetSimulation", { phase: "committed", detail: "context-switch" });
    });

    expect(result.current.simState.tick).toBe(0);
    expect(result.current.simState.loopState).toBe("idle");
    expect(result.current.simState.jobQueue).toBe(4);
    expect(result.current.simState.lastLoopEvent?.type).toBe("resetSimulation");
  });

  it("keeps event log tick ordering stable during interleaving commands", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));

    act(() => {
      result.current.dispatchHudCommand("runProbe", { phase: "pending" });
      vi.advanceTimersByTime(700);
      result.current.dispatchHudCommand("runProbe", { phase: "committed" });
      vi.advanceTimersByTime(700);
      result.current.dispatchHudCommand("refreshHistory", { phase: "pending" });
      result.current.dispatchHudCommand("refreshHistory", { phase: "rejected", detail: "backend-failed" });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.eventLog.length).toBeGreaterThan(0);
    expect(result.current.eventLog.every((entry) => entry.tick <= result.current.simState.tick)).toBe(true);
  });

  it("updates patrol actors with facing direction and movement", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));

    const before = result.current.simState.agents.find((actor) => actor.role === "probe");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const after = result.current.simState.agents.find((actor) => actor.role === "probe");
    expect(after).not.toBeUndefined();
    expect(after?.facing === "left" || after?.facing === "right").toBe(true);
    expect(after?.tile.x !== before?.tile.x || after?.tile.y !== before?.tile.y).toBe(true);
  });

  it("keeps actor/render data stable over 10 minutes of simulated runtime", () => {
    const { result } = renderHook(() => useTycoonSimulation({ probeState: "success", selectedProvider: "codex" }));
    const baselineActorIds = result.current.simState.agents.map((actor) => actor.id).sort();

    act(() => {
      result.current.dispatchHudCommand("runProbe");
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    const currentActorIds = result.current.simState.agents.map((actor) => actor.id).sort();
    expect(result.current.simState.tick).toBeGreaterThan(0);
    expect(currentActorIds).toEqual(baselineActorIds);
    expect(result.current.eventLog.length).toBeLessThanOrEqual(120);
    expect(result.current.simState.lastLoopEvent).not.toBeNull();
  });
});
