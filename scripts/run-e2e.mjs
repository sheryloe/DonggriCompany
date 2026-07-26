#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const corepackBin = isWindows ? "corepack.cmd" : "corepack";
const nodeBin = process.execPath;
const e2eApiAuthToken = randomBytes(32).toString("hex");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eRuntimeDir = path.join(projectRoot, ".tmp", "e2e-runtime");
const e2eEnv = {
  ...process.env,
  AGENT_GUIDE_ROOT: path.join(e2eRuntimeDir, "projects", "agent-guides"),
  API_AUTH_TOKEN: e2eApiAuthToken,
  E2E_PROXY_API_AUTH_TOKEN: e2eApiAuthToken,
  E2E_ISOLATED_RUNTIME: "1",
  OAUTH_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
  PROJECT_PATH_ALLOWED_ROOTS: projectRoot,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"].filter(Boolean).join(" "),
};

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function collectProtectedSourceSnapshot() {
  const snapshot = new Map();
  const rootAgentsPath = path.join(projectRoot, "AGENTS.md");
  if (fs.existsSync(rootAgentsPath)) {
    if (fs.lstatSync(rootAgentsPath).isSymbolicLink()) {
      throw new Error("protected_source_link_not_allowed:AGENTS.md");
    }
    snapshot.set("AGENTS.md", sha256File(rootAgentsPath));
  }

  const agentsRoot = path.join(projectRoot, "agents");
  if (fs.existsSync(agentsRoot) && fs.lstatSync(agentsRoot).isSymbolicLink()) {
    throw new Error("protected_source_link_not_allowed:agents");
  }

  if (fs.existsSync(agentsRoot)) {
    const pending = [agentsRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
        if (entry.isSymbolicLink()) {
          throw new Error(`protected_source_link_not_allowed:${relativePath}`);
        }
        if (entry.isDirectory()) {
          pending.push(absolutePath);
          continue;
        }
        if (
          !entry.isFile() ||
          (!entry.name.endsWith("_AGENTS.md") &&
            !entry.name.endsWith("_skills.md") &&
            !entry.name.endsWith("_settings.json"))
        ) {
          continue;
        }
        snapshot.set(relativePath, sha256File(absolutePath));
      }
    }
  }

  if (snapshot.size === 0) {
    throw new Error("protected_source_snapshot_empty");
  }
  return snapshot;
}

function diffProtectedSourceSnapshot(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((filePath) => before.get(filePath) !== after.get(filePath))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
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
const protectedSourceSnapshot = collectProtectedSourceSnapshot();

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

  try {
    const protectedSourceDrift = diffProtectedSourceSnapshot(protectedSourceSnapshot, collectProtectedSourceSnapshot());
    if (protectedSourceDrift.length > 0) {
      exitCode = 1;
      console.error(`[e2e] PROTECTED_SOURCE_INTEGRITY failed paths=${protectedSourceDrift.join(",")}`);
    } else {
      console.log(`[e2e] PROTECTED_SOURCE_INTEGRITY pass files=${protectedSourceSnapshot.size}`);
    }
  } catch (error) {
    exitCode = 1;
    console.error(`[e2e] PROTECTED_SOURCE_INTEGRITY failed error=${String(error)}`);
  }
}

process.exit(exitCode);
