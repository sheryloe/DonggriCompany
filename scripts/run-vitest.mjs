import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./ensure-vitest-coverage-dir.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const [configPath, ...rawArgs] = process.argv.slice(2);
const forwardedArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (!configPath) {
  console.error("[run-vitest] config path is required");
  process.exit(1);
}

const vitestEntry = path.join(rootDir, "node_modules", "vitest", "vitest.mjs");
if (!fs.existsSync(vitestEntry)) {
  console.error(`[run-vitest] vitest entry not found: ${vitestEntry}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [vitestEntry, "--config", configPath, ...forwardedArgs], {
  cwd: rootDir,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
