import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATH_IDENTITY_CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

function normalizePathIdentity(value: string): string {
  const normalized = path.normalize(value);
  return PATH_IDENTITY_CASE_INSENSITIVE ? normalized.toLowerCase() : normalized;
}

function resolveCanonicalPathAllowingMissing(candidatePath: string): string | null {
  let cursor = path.resolve(candidatePath);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalAncestor = fs.realpathSync.native(cursor);
      if (!fs.statSync(canonicalAncestor).isDirectory()) return null;
      return path.normalize(path.join(canonicalAncestor, ...missingSegments));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
      const parent = path.dirname(cursor);
      if (parent === cursor) return null;
      missingSegments.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

export function resolveCanonicalDirectory(candidatePath: string): string | null {
  try {
    const resolved = fs.realpathSync.native(path.resolve(candidatePath));
    if (!fs.statSync(resolved).isDirectory()) return null;
    return path.normalize(resolved);
  } catch {
    return null;
  }
}

export function isPathInsideCanonicalRoot(
  candidatePath: string,
  rootPath: string,
  options: { allowMissingCandidate?: boolean } = {},
): boolean {
  const candidate = options.allowMissingCandidate
    ? resolveCanonicalPathAllowingMissing(candidatePath)
    : resolveCanonicalDirectory(candidatePath);
  const root = resolveCanonicalDirectory(rootPath);
  if (!candidate || !root) return false;

  const relative = path.relative(normalizePathIdentity(root), normalizePathIdentity(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function resolveGitWorkingTreeRoot(candidatePath: string): string | null {
  const candidate = resolveCanonicalDirectory(candidatePath);
  if (!candidate) return null;

  try {
    const topLevelRaw = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: candidate,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    if (!topLevelRaw) return null;

    const topLevel = resolveCanonicalDirectory(topLevelRaw);
    return topLevel ?? null;
  } catch {
    return null;
  }
}

export function isExactGitWorkingTreeRoot(candidatePath: string): boolean {
  const candidate = resolveCanonicalDirectory(candidatePath);
  const topLevel = resolveGitWorkingTreeRoot(candidatePath);
  if (!candidate || !topLevel) return false;
  return normalizePathIdentity(candidate) === normalizePathIdentity(topLevel);
}
