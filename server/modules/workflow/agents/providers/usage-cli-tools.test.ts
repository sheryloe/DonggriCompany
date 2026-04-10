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
});
