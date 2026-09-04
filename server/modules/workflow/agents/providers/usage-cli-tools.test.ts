import { afterEach, describe, expect, it, vi } from "vitest";

import { createUsageCliTools } from "./usage-cli-tools.ts";

describe("createUsageCliTools.fetchGeminiUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps 403 scope/service errors to usage_api_unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              status: "PERMISSION_DENIED",
              details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
            },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const tools = createUsageCliTools({
      jsonHasKey: () => false,
      fileExistsNonEmpty: () => false,
      readClaudeToken: () => null,
      readCodexTokens: () => null,
      readGeminiCredsFromKeychain: () => null,
      freshGeminiToken: async () => "token-1",
      getGeminiProjectId: async () => "project-1",
    });

    const usage = await tools.fetchGeminiUsage();
    expect(usage.error).toBe("usage_api_unavailable");
    expect(usage.windows).toHaveLength(0);
  });

  it("returns usage windows when quota API succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            buckets: [
              { modelId: "gemini-3-flash", remainingFraction: 0.6, resetTime: "2026-04-10T00:00:00.000Z" },
              { modelId: "gemini-3-pro", remainingFraction: 0.2, resetTime: "2026-04-10T01:00:00.000Z" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const tools = createUsageCliTools({
      jsonHasKey: () => false,
      fileExistsNonEmpty: () => false,
      readClaudeToken: () => null,
      readCodexTokens: () => null,
      readGeminiCredsFromKeychain: () => null,
      freshGeminiToken: async () => "token-1",
      getGeminiProjectId: async () => "project-1",
    });

    const usage = await tools.fetchGeminiUsage();
    expect(usage.error).toBeNull();
    expect(usage.windows.map((window) => window.label)).toEqual(["gemini-3-flash", "gemini-3-pro"]);
  });

  it("detects versions through resolved executables with minimal env and shell:false", async () => {
    const resolverCalls: Array<{ command: string; argv: readonly string[]; allowedCommands: readonly string[] }> = [];
    const execCalls: Array<{ executable: string; argv: readonly string[]; options: any }> = [];
    const tools = createUsageCliTools({
      jsonHasKey: () => false,
      fileExistsNonEmpty: () => false,
      readClaudeToken: () => null,
      readCodexTokens: () => null,
      readGeminiCredsFromKeychain: () => null,
      freshGeminiToken: async () => null,
      getGeminiProjectId: async () => null,
      sourceEnv: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        DONGGRI_USAGE_SECRET: "must-not-reach-child",
      },
      platform: process.platform,
      resolveExecutable: ((input: any) => {
        resolverCalls.push({
          command: input.command,
          argv: [...(input.argv ?? [])],
          allowedCommands: [...(input.allowedCommands ?? [])],
        });
        const executable = process.platform === "win32" ? `C:\\safe\\${input.command}.exe` : `/safe/${input.command}`;
        return {
          ok: true,
          executable,
          argv: [...(input.argv ?? [])],
          commandPath: executable,
          source: "native",
          shell: false,
        };
      }) as any,
      execFileCommand: ((executable: string, argv: readonly string[], options: any, callback: any) => {
        execCalls.push({ executable, argv: [...argv], options });
        queueMicrotask(() => callback(null, "1.2.3\n", ""));
        return {};
      }) as any,
      providerLiveExecutionGate: (request) => request.gateId === "G-PROVIDER-LIVE",
    });

    const status = await tools.detectAllCli();

    expect(status.claude).toMatchObject({ installed: true, version: "1.2.3", authenticated: false });
    expect(status.kimi).toMatchObject({ installed: true, version: "1.2.3", authenticated: false });
    expect(status.opencode).toMatchObject({ installed: true, version: "1.2.3", authenticated: false });
    expect(resolverCalls.some((call) => call.command === "where" || call.command === "which")).toBe(false);
    expect(
      resolverCalls
        .filter((call) => call.command === "kimi" || call.command === "opencode")
        .every((call) => call.allowedCommands.length === 1 && call.allowedCommands[0] === call.command),
    ).toBe(true);
    expect(execCalls.length).toBeGreaterThan(0);
    for (const call of execCalls) {
      expect(call.options.shell).toBe(false);
      expect(call.options.env.DONGGRI_USAGE_SECRET).toBeUndefined();
    }
  });

  it("keeps status probes async and denies every child execution without the code gate", async () => {
    const execFileCommand = vi.fn();
    process.env.G_PROVIDER_LIVE = "true";
    try {
      const tools = createUsageCliTools({
        jsonHasKey: () => false,
        fileExistsNonEmpty: () => false,
        readClaudeToken: () => null,
        readCodexTokens: () => null,
        readGeminiCredsFromKeychain: () => null,
        freshGeminiToken: async () => null,
        getGeminiProjectId: async () => null,
        resolveExecutable: ((input: any) => ({
          ok: true,
          executable: process.platform === "win32" ? `C:\\safe\\${input.command}.exe` : `/safe/${input.command}`,
          argv: [...(input.argv ?? [])],
          commandPath: input.command,
          source: "native",
          shell: false,
        })) as any,
        execFileCommand: execFileCommand as any,
      });

      const status = await tools.detectAllCli();
      expect(status.kimi).toMatchObject({ installed: true, version: null });
      expect(status.opencode).toMatchObject({ installed: true, version: null });
      expect(execFileCommand).not.toHaveBeenCalled();
      await expect(tools.execWithTimeout("whoami", [], 10)).rejects.toThrow("cli_tool_command_not_allowed");
    } finally {
      delete process.env.G_PROVIDER_LIVE;
    }
  });
});
