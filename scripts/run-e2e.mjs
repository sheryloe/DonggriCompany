#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

const isWindows = process.platform === "win32";
const corepackBin = isWindows ? "corepack.cmd" : "corepack";
const nodeBin = process.execPath;
const e2eApiAuthToken = randomBytes(32).toString("hex");
const e2eRuntimeDir = path.resolve(process.cwd(), ".tmp", "e2e-runtime");
const e2eEnv = {
  ...process.env,
  AGENT_GUIDE_ROOT: path.join(e2eRuntimeDir, "projects", "agent-guides"),
  API_AUTH_TOKEN: e2eApiAuthToken,
  E2E_PROXY_API_AUTH_TOKEN: e2eApiAuthToken,
  E2E_ISOLATED_RUNTIME: "1",
  OAUTH_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
  PROJECT_PATH_ALLOWED_ROOTS: process.cwd(),
  SESSION_SECRET: randomBytes(32).toString("hex"),
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"].filter(Boolean).join(" "),
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: e2eEnv,
      shell: isWindows && command.toLowerCase().endsWith(".cmd"),
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} exited with ${code ?? "null"}${signal ? ` (signal=${signal})` : ""}`),
      );
    });
  });
}

let exitCode = 0;

try {
  await run(nodeBin, ["scripts/prepare-e2e-runtime.mjs"]);
  await run(corepackBin, [
    "pnpm",
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.config.ts",
    ...process.argv.slice(2),
  ]);
} catch (error) {
  exitCode = 1;
  console.error(String(error));
} finally {
  try {
    await run(nodeBin, ["scripts/prepare-e2e-runtime.mjs"]);
  } catch (error) {
    exitCode = 1;
    console.error(String(error));
  }
}

process.exit(exitCode);
