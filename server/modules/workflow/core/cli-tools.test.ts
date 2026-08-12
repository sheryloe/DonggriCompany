import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliTools } from "./cli-tools.ts";

const AGY_ENV_KEYS = [
  "AGY_CLI_MODEL",
  "ANTIGRAVITY_CLI_MODEL",
  "AGY_CLI_CONVERSATION_ID",
  "ANTIGRAVITY_CLI_CONVERSATION_ID",
  "AGY_CLI_PROJECT_ID",
  "ANTIGRAVITY_CLI_PROJECT_ID",
  "AGY_CLI_PRINT_TIMEOUT",
  "ANTIGRAVITY_CLI_PRINT_TIMEOUT",
  "AGY_CLI_CONTINUE",
  "ANTIGRAVITY_CLI_CONTINUE",
];

let previousAgyEnv: Record<string, string | undefined> = {};

function createTools() {
  return createCliTools({
    nowMs: () => 0,
    cliOutputDedupWindowMs: 1000,
  });
}

describe("buildAgentArgs", () => {
  beforeEach(() => {
    previousAgyEnv = Object.fromEntries(AGY_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of AGY_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of AGY_ENV_KEYS) {
      const value = previousAgyEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not enable unsafe approval-bypass flags by default", () => {
    const tools = createTools();

    expect(tools.buildAgentArgs("codex", "gpt-5.3-codex", "high")).not.toContain("--yolo");
    expect(tools.buildAgentArgs("gemini", "gemini-3-pro-preview")).not.toContain("--yolo");
    expect(tools.buildAgentArgs("claude", "claude-opus-4-6")).not.toContain("--dangerously-skip-permissions");
    expect(tools.buildAgentArgs("antigravity", "google/antigravity-gemini-3-pro")).not.toContain(
      "--dangerously-skip-permissions",
    );
  });

  it("uses non-interactive safe approval modes instead of hanging for headless runs", () => {
    const tools = createTools();

    expect(tools.buildAgentArgs("codex", "gpt-5.3-codex", "high")).toEqual(
      expect.arrayContaining(["--ask-for-approval", "never", "--sandbox", "workspace-write"]),
    );
    expect(tools.buildAgentArgs("agy", "Gemini 3.1 Pro (High)")).toEqual(
      expect.arrayContaining(["agy", "--model", "Gemini 3.1 Pro (High)", "--sandbox", "--print-timeout", "5m"]),
    );
    expect(tools.buildAgentArgs("claude", "claude-opus-4-6")).toEqual(
      expect.arrayContaining(["--permission-mode", "plan"]),
    );
    expect(tools.buildAgentArgs("antigravity", "google/antigravity-gemini-3-pro")).toEqual(
      expect.arrayContaining(["agy", "--model", "Gemini 3.1 Pro (High)", "--sandbox", "--print-timeout", "5m"]),
    );
  });

  it("builds AGY CLI args without embedding the prompt argument", () => {
    const tools = createTools();
    const args = tools.buildAgentArgs("agy", "Gemini 3.1 Pro (High)");

    expect(args[0]).toBe("agy");
    expect(args).toEqual(
      expect.arrayContaining(["--model", "Gemini 3.1 Pro (High)", "--sandbox", "--print-timeout", "5m"]),
    );
    expect(args).not.toContain("--print");
  });

  it("builds AGY session args from explicit continuation metadata", () => {
    const tools = createTools();
    const args = tools.buildAgentArgs("agy", "google/antigravity-gemini-3-flash", undefined, {
      agy: {
        continueConversation: true,
        projectId: "project-123",
        logFile: "G:\\logs\\task.log.agy.log",
        addDirs: ["G:\\logs"],
        printTimeout: "90s",
      },
    });

    expect(args).toEqual(
      expect.arrayContaining([
        "--model",
        "Gemini 3.5 Flash (Medium)",
        "--continue",
        "--project",
        "project-123",
        "--add-dir",
        "G:\\logs",
        "--log-file",
        "G:\\logs\\task.log.agy.log",
        "--print-timeout",
        "90s",
      ]),
    );
  });

  it("prefers AGY conversation id over --continue", () => {
    const tools = createTools();
    const args = tools.buildAgentArgs("agy", "Gemini 3.1 Pro (High)", undefined, {
      agy: {
        continueConversation: true,
        conversationId: "conv-123",
      },
    });

    expect(args).toEqual(expect.arrayContaining(["--conversation", "conv-123"]));
    expect(args).not.toContain("--continue");
  });

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
