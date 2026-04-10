import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiProviderTools } from "./api-provider-tools.ts";

describe("createApiProviderTools.executeApiProviderAgent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores Google image responses as files for image-capable models", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-api-provider-tools-"));
    const logsDir = path.join(tempRoot, "logs");
    const projectPath = path.join(tempRoot, "project");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(projectPath, { recursive: true });

    const provider = {
      id: "provider-google",
      name: "Google Stitch",
      type: "google",
      base_url: "https://generativelanguage.googleapis.com/v1beta",
      api_key_enc: null,
      enabled: 1,
      models_cache: JSON.stringify(["gemini-2.5-flash-image"]),
      models_cached_at: Date.now(),
    };

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain(":generateContent");
      expect(url).not.toContain(":streamGenerateContent");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "image ready" },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: Buffer.from("png-bytes").toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const broadcast = vi.fn();
    const logChunks: string[] = [];
    const tools = createApiProviderTools({
      db: {
        prepare: () => ({
          get: () => provider,
        }),
      },
      logsDir,
      activeProcesses: new Map(),
      broadcast,
      normalizeStreamChunk: (raw) => String(raw),
      handleTaskRunComplete: () => {},
      createSafeLogStreamOps: () => ({
        safeWrite: (text: string) => {
          logChunks.push(text);
          return true;
        },
        safeEnd: (onDone?: () => void) => onDone?.(),
        isClosed: () => false,
      }),
      parseSSEStream: async () => {},
      parseGeminiSSEStream: async () => {},
    });

    const logPath = path.join(logsDir, "task.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });

    try {
      await tools.executeApiProviderAgent(
        "create an image",
        projectPath,
        logStream,
        new AbortController().signal,
        "task-1",
        "provider-google",
        "gemini-2.5-flash-image",
        (text) => {
          logChunks.push(text);
          return true;
        },
      );
    } finally {
      await new Promise<void>((resolve) => logStream.end(resolve));
    }

    const outputDir = path.join(projectPath, ".claw-empire", "generated-images", "task-1");
    const files = fs.readdirSync(outputDir);

    expect(files).toEqual(["gemini-2.5-flash-image-01.png"]);
    expect(fs.readFileSync(path.join(outputDir, files[0]), "utf8")).toBe("png-bytes");
    expect(logChunks.join("")).toContain("image ready");
    expect(logChunks.join("")).toContain("Saved image:");
    expect(broadcast).toHaveBeenCalledWith(
      "cli_output",
      expect.objectContaining({
        task_id: "task-1",
        stream: "stderr",
      }),
    );
  });
});
