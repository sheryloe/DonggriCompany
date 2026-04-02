import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { ProbeLoginStatus } from "@workspace/shared";

import type { ProviderProbeAdapter, ProviderProbeResult } from "./types.js";

const detectExecutablePath = (binary: string): string | null => {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [binary], {
    encoding: "utf8",
    timeout: 3000
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  const firstMatch = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMatch ?? null;
};

const detectRunnable = (binary: string): boolean => {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    timeout: 3000
  });

  return result.status === 0;
};

const resolveConfigPath = (candidates: string[]): string | null => {
  const normalized = candidates.map((candidate) => candidate.trim()).filter(Boolean);
  const existing = normalized.find((candidate) => fs.existsSync(candidate));
  return existing ?? null;
};

const detectLoginStatus = (
  configPath: string | null,
  loginSignalFiles: string[],
  cliInstalled: boolean
): ProbeLoginStatus => {
  if (!configPath) {
    return "unknown";
  }

  const matchedSignals = loginSignalFiles.filter((relativePath) =>
    fs.existsSync(path.join(configPath, relativePath))
  );

  if (matchedSignals.length > 0) {
    return "logged_in";
  }

  return cliInstalled ? "logged_out" : "unknown";
};

export const runProbeAdapter = (adapter: ProviderProbeAdapter): ProviderProbeResult => {
  const checkedAt = new Date().toISOString();

  try {
    const executablePath = detectExecutablePath(adapter.binary);
    const cliInstalled = executablePath !== null;
    const executableRunnable = cliInstalled ? detectRunnable(adapter.binary) : false;
    const configPath = resolveConfigPath(adapter.resolveConfigCandidates());
    const loginStatus = detectLoginStatus(configPath, adapter.loginSignalFiles, cliInstalled);

    return {
      provider: adapter.provider,
      cliInstalled,
      executablePath,
      configPath,
      loginStatus,
      checkedAt,
      diagnostics: {
        probeVersion: "step1-t006-minimal",
        binary: adapter.binary,
        executableRunnable,
        loginSignalFilesChecked: adapter.loginSignalFiles,
        platform: process.platform
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown adapter error";

    return {
      provider: adapter.provider,
      cliInstalled: false,
      executablePath: null,
      configPath: null,
      loginStatus: "unknown",
      checkedAt,
      diagnostics: {
        probeVersion: "step1-t006-minimal",
        binary: adapter.binary,
        fallbackReason: errorMessage,
        platform: process.platform
      }
    };
  }
};