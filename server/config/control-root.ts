import fs from "node:fs";
import path from "node:path";

type ResolveControlRootOptions = {
  envValue?: string;
  repoRoot: string;
  existsSync?: (candidate: string) => boolean;
};

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isPortableAbsolute(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function normalizeAbsolute(value: string): string {
  return path.win32.isAbsolute(value) ? path.win32.normalize(value) : path.resolve(value);
}

export function resolveDonggriControlRoot({
  envValue,
  repoRoot,
  existsSync = fs.existsSync,
}: ResolveControlRootOptions): string {
  const explicit = stripQuotes(envValue ?? "");
  if (explicit) {
    if (!isPortableAbsolute(explicit)) {
      throw new Error("donggri_control_root_must_be_absolute");
    }
    return normalizeAbsolute(explicit);
  }

  const normalizedRepoRoot = path.resolve(repoRoot);
  const devDriveCandidate = path.resolve(normalizedRepoRoot, "..", "..");
  const hasControlPlane =
    existsSync(path.join(devDriveCandidate, "AGENTS.md")) &&
    existsSync(path.join(devDriveCandidate, "storage", "codex-control"));

  return hasControlPlane ? devDriveCandidate : normalizedRepoRoot;
}
