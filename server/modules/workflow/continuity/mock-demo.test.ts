import { describe, expect, it } from "vitest";

import { runContinuityMockDemo } from "./mock-demo.ts";

describe("portable continuity mock demo", () => {
  it(
    "completes Codex to Claude and Claude to Codex without credentials",
    async () => {
      const result = await runContinuityMockDemo();
      expect(result).toEqual({
        ok: true,
        credentials_used: false,
        transfers: [
          { direction: "codex->claude", task_id: "demo:codex-to-claude", final_status: "running", checkpoints: 5 },
          { direction: "claude->codex", task_id: "demo:claude-to-codex", final_status: "running", checkpoints: 5 },
        ],
      });
    },
    30_000,
  );
});
