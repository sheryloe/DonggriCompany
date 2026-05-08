import { describe, expect, it } from "vitest";
import { createCliTools } from "./cli-tools.ts";

function createTools() {
  return createCliTools({
    nowMs: () => 0,
    cliOutputDedupWindowMs: 1000,
  });
}

describe("buildAgentArgs", () => {
  it("claude noTools mode uses --tools= without empty argv", () => {
    const tools = createTools();
    const args = tools.buildAgentArgs("claude", "claude-opus-4-6", undefined, { noTools: true });

    expect(args).toContain("--tools=");
    expect(args).not.toContain("--tools");
    expect(args).not.toContain("");
  });
});

describe("normalizeStreamChunk", () => {
  it("drops Codex startup/model refresh noise from task output", () => {
    const tools = createTools();
    const text = [
      "2026-05-08T03:31:47.945343Z ERROR codex_models_manager::manager: failed to refresh available models: stream disconnected before completion",
      "2026-05-08T03:31:46.335670Z WARN codex_core_plugins::startup_remote_sync: startup remote plugin sync failed",
      "2026-05-08T03:39:13.984650Z WARN codex_core_skills::loader: ignoring interface.icon_large: icon path must not contain '..'",
      "<html>",
      "real task output",
    ].join("\n");

    expect(tools.normalizeStreamChunk(text, { dropCliNoise: true })).toBe("real task output");
  });
});
