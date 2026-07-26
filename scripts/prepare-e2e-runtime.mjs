#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const runtimeDir = path.resolve(process.cwd(), ".tmp", "e2e-runtime");
const logsDir = path.join(runtimeDir, "logs");
const projectsDir = path.join(runtimeDir, "projects");
const dbPath = path.join(runtimeDir, "claw-empire.e2e.sqlite");

fs.mkdirSync(runtimeDir, { recursive: true });

function normalizeForCompare(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" || process.platform === "darwin" ? normalized.toLowerCase() : normalized;
}

function assertProjectsDirBoundary() {
  const expectedParent = normalizeForCompare(runtimeDir);
  const actualParent = normalizeForCompare(path.dirname(projectsDir));
  if (actualParent !== expectedParent || path.basename(projectsDir) !== "projects") {
    throw new Error(`[e2e] projects cleanup boundary mismatch: ${projectsDir}`);
  }
}

function lstatIfPresent(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function cleanupProjectsDir() {
  assertProjectsDirBoundary();
  const counts = { files: 0, directories: 0, links: 0, bytes: 0 };
  const rootStat = lstatIfPresent(projectsDir);
  if (!rootStat) return counts;

  if (rootStat.isSymbolicLink()) {
    fs.unlinkSync(projectsDir);
    counts.links += 1;
    return counts;
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`[e2e] projects cleanup target is not a directory: ${projectsDir}`);
  }

  const removeEntry = (target) => {
    const relative = path.relative(projectsDir, target);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`[e2e] projects cleanup entry escaped boundary: ${target}`);
    }

    const stat = lstatIfPresent(target);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(target);
      counts.links += 1;
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) {
        removeEntry(path.join(target, name));
      }
      fs.rmdirSync(target);
      counts.directories += 1;
      return;
    }

    fs.unlinkSync(target);
    counts.files += 1;
    counts.bytes += stat.size;
  };

  for (const name of fs.readdirSync(projectsDir)) {
    removeEntry(path.join(projectsDir, name));
  }
  fs.rmdirSync(projectsDir);
  counts.directories += 1;
  return counts;
}

const projectCleanup = cleanupProjectsDir();

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${dbPath}${suffix}`;
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { force: true });
}

fs.rmSync(logsDir, { recursive: true, force: true });
fs.mkdirSync(logsDir, { recursive: true });

console.log(`[e2e] prepared isolated runtime`);
console.log(`[e2e] DB_PATH=${dbPath}`);
console.log(`[e2e] LOGS_DIR=${logsDir}`);
console.log(
  `[e2e] PROJECTS_CLEANUP files=${projectCleanup.files} directories=${projectCleanup.directories} links=${projectCleanup.links} bytes=${projectCleanup.bytes}`,
);
