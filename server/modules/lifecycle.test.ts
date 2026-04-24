import { describe, expect, it } from "vitest";
import { buildWatchdogRecoveryMessage, resolveStartupAuthenticatedProviders } from "./lifecycle.ts";

describe("lifecycle startup helpers", () => {
  it("uses connected CLI account pools as startup authenticated provider evidence", () => {
    expect(resolveStartupAuthenticatedProviders({}, ["codex"])).toEqual(["codex"]);
  });

  it("keeps detected authenticated CLI providers and deduplicates connected pools", () => {
    expect(
      resolveStartupAuthenticatedProviders(
        {
          codex: { installed: true, authenticated: true },
          gemini: { installed: true, authenticated: false },
        },
        ["codex", "jules"],
      ),
    ).toEqual(["codex", "jules"]);
  });

  it("returns Korean watchdog recovery copy only for Korean UI", () => {
    expect(buildWatchdogRecoveryMessage("작업", "ko")).toContain("실행 프로세스가 없어 inbox로 복구했습니다");
    expect(buildWatchdogRecoveryMessage("Task", "ja")).toBe(
      "[WATCHDOG] 'Task' was in progress but had no active process. Recovered to inbox.",
    );
    expect(buildWatchdogRecoveryMessage("Task", "zh")).toBe(
      "[WATCHDOG] 'Task' was in progress but had no active process. Recovered to inbox.",
    );
  });
});
