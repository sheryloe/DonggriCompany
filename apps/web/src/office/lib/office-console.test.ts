import { describe, expect, it } from "vitest";

import {
  appendBossCommandFeedback,
  buildConversationEntries,
  createBossCommandThread,
  loadBossCommandThreads,
  saveBossCommandThreads,
  updateBossCommandStatus
} from "./office-console";

describe("office console helpers", () => {
  it("normalizes guidance and event log entries into conversation feed", () => {
    const entries = buildConversationEntries(
      [
        {
          id: "evt-1",
          tick: 7,
          category: "system",
          message: "HUD committed: runProbe backend-success",
          actorId: "boss",
          speaker: "Boss"
        }
      ],
      {
        headline: "Probe ready",
        body: "Signal is stable.",
        primaryAction: "Proceed.",
        supportingHint: "History is aligned.",
        riskLevel: "low"
      },
      "CODEX Agent"
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.speaker).toBe("CODEX Agent");
    expect(entries[1]?.speaker).toBe("Boss");
    expect(entries[1]?.meta).toBe("tick 0007");
  });

  it("creates, updates, and persists boss command threads", () => {
    const storage = {
      value: "",
      getItem: () => storage.value,
      setItem: (_key: string, nextValue: string) => {
        storage.value = nextValue;
      }
    };

    const created = createBossCommandThread("pm", "Review PRD", "Summarize risk.", "2026-04-05T00:00:00.000Z");
    const acknowledged = updateBossCommandStatus(created, "acknowledged", "2026-04-05T00:10:00.000Z");
    const feedback = appendBossCommandFeedback(acknowledged, "pm", "PRD summary is ready.", "2026-04-05T00:20:00.000Z");

    expect(feedback.status).toBe("feedback");
    expect(feedback.messages).toHaveLength(2);

    saveBossCommandThreads([feedback], storage);
    const restored = loadBossCommandThreads(storage);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.status).toBe("feedback");
    expect(restored[0]?.messages[1]?.body).toBe("PRD summary is ready.");
  });
});
