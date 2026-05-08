import { describe, expect, it } from "vitest";
import {
  buildWatchdogRecoveryMessage,
  resolveStartupAuthenticatedProviders,
  terminalLogHasCliFinalOutput,
} from "./lifecycle.ts";

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

  it("detects successful final Codex output in terminal logs for orphan recovery", () => {
    expect(
      terminalLogHasCliFinalOutput(
        [
          "noise",
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done." } }),
        ].join("\n"),
      ),
    ).toBe(true);
    expect(terminalLogHasCliFinalOutput(JSON.stringify({ type: "turn.completed", usage: {} }))).toBe(true);
    expect(
      terminalLogHasCliFinalOutput(JSON.stringify({ type: "item.completed", item: { type: "command_execution" } })),
    ).toBe(false);
    expect(
      terminalLogHasCliFinalOutput(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "I found corrupted docs and will apply a follow-up patch." },
        }),
      ),
    ).toBe(false);
  });
});
