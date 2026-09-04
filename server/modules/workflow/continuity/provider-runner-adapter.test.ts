import { describe, expect, it } from "vitest";

import { buildProviderRunnerCommand, parseProviderRunnerEvent } from "./provider-runner-adapter.ts";

describe("provider runner adapter", () => {
  it("builds host-native Codex and Claude start commands without invoking either provider", () => {
    expect(
      buildProviderRunnerCommand({ provider: "codex", mode: "start", model: "gpt-5.6-sol", reasoning_level: "high" }),
    ).toEqual({
      command: "codex",
      args: [
        "-m",
        "gpt-5.6-sol",
        "-c",
        'model_reasoning_effort="high"',
        "--ask-for-approval",
        "never",
        "--sandbox",
        "workspace-write",
        "exec",
        "--json",
      ],
    });
    expect(
      buildProviderRunnerCommand({ provider: "claude", mode: "start", model: "sonnet", reasoning_level: "high" }),
    ).toEqual({
      command: "claude",
      args: [
        "--permission-mode",
        "plan",
        "--print",
        "--verbose",
        "--output-format=stream-json",
        "--include-partial-messages",
        "--max-turns",
        "200",
        "--model",
        "sonnet",
        "--effort",
        "high",
      ],
    });
  });

  it("builds provider-native resume commands and rejects ambiguous session ownership", () => {
    expect(
      buildProviderRunnerCommand({
        provider: "codex",
        mode: "resume",
        provider_native_session_id: "codex-thread-1",
      }).args.slice(-3),
    ).toEqual(["resume", "--json", "codex-thread-1"]);
    expect(
      buildProviderRunnerCommand({
        provider: "claude",
        mode: "resume",
        provider_native_session_id: "claude-session-1",
      }).args.slice(-2),
    ).toEqual(["--resume", "claude-session-1"]);
    expect(() => buildProviderRunnerCommand({ provider: "codex", mode: "resume" })).toThrow(
      "continuity_provider_native_session_id_required",
    );
    expect(() =>
      buildProviderRunnerCommand({
        provider: "claude",
        mode: "start",
        provider_native_session_id: "must-not-be-reused",
      }),
    ).toThrow("continuity_start_must_not_reuse_native_session");
    expect(() =>
      buildProviderRunnerCommand({
        provider: "codex",
        mode: "resume",
        provider_native_session_id: "--last",
      }),
    ).toThrow("continuity_provider_native_session_id_invalid");
    expect(() =>
      buildProviderRunnerCommand({ provider: "claude", mode: "start", reasoning_level: "ultra" }),
    ).toThrow("continuity_claude_effort_unsupported");
  });

  it("extracts Codex thread identity and terminal state from JSONL", () => {
    expect(parseProviderRunnerEvent("codex", '{"type":"thread.started","thread_id":"thread-123"}')).toEqual({
      provider: "codex",
      kind: "session_started",
      provider_event_type: "thread.started",
      provider_native_session_id: "thread-123",
    });
    expect(parseProviderRunnerEvent("codex", '{"type":"turn.completed"}')).toMatchObject({
      kind: "completed",
      provider_native_session_id: null,
    });
  });

  it("extracts Claude session identity and result state from stream-json", () => {
    expect(
      parseProviderRunnerEvent(
        "claude",
        '{"type":"system","subtype":"init","session_id":"session-123","tools":["Read"]}',
      ),
    ).toEqual({
      provider: "claude",
      kind: "session_started",
      provider_event_type: "system:init",
      provider_native_session_id: "session-123",
    });
    expect(parseProviderRunnerEvent("claude", '{"type":"result","subtype":"success","session_id":"session-123"}')).toMatchObject({
      kind: "completed",
      provider_native_session_id: "session-123",
    });
    expect(parseProviderRunnerEvent("claude", '{"type":"result","subtype":"error","is_error":true}')).toMatchObject({
      kind: "failed",
    });
  });

  it("returns only normalized metadata and drops prompt, transcript and credential text", () => {
    const secret = `Bearer ${"a".repeat(32)}`;
    const parsed = parseProviderRunnerEvent(
      "claude",
      JSON.stringify({ type: "assistant", session_id: "safe-session", message: { content: secret } }),
    );
    expect(parsed).toMatchObject({ kind: "progress", provider_native_session_id: "safe-session" });
    expect(JSON.stringify(parsed)).not.toContain(secret);
    expect(parseProviderRunnerEvent("codex", "not json")).toBeNull();
  });
});
