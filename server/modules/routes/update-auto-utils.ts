import { compareStrictSemVer, parseStrictSemVer } from "../release/release-identity.ts";

export type AutoUpdateChannel = "patch" | "minor" | "all";
export type UpdateDeltaKind = "none" | "patch" | "minor" | "major";

export function normalizeVersionTag(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^v/i, "");
}

/**
 * Keep only semver core (major.minor.patch), ignoring pre-release/build metadata.
 * Examples:
 * - 1.2.3-beta.1 -> 1.2.3
 * - 1.2.3+build.5 -> 1.2.3
 */
export function normalizeSemverCore(value: string): string {
  const parsed = parseStrictSemVer(value);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : "";
}

function parseSemverCoreParts(core: string): number[] {
  if (!core) return [0];
  return core.split(".").map((part) => {
    const matched = String(part).match(/\d+/);
    return matched ? Number(matched[0]) : 0;
  });
}

export function parseVersionParts(value: string): number[] {
  const normalized = normalizeSemverCore(value);
  return parseSemverCoreParts(normalized);
}

export function isRemoteVersionNewer(remote: string, local: string): boolean {
  return compareStrictSemVer(remote, local) === 1;
}

export function computeVersionDeltaKind(local: string, remote: string | null): UpdateDeltaKind {
  if (!remote || !isRemoteVersionNewer(remote, local)) return "none";
  const localVersion = parseStrictSemVer(local);
  const remoteVersion = parseStrictSemVer(remote);
  if (!localVersion || !remoteVersion) return "none";
  if (localVersion.major !== remoteVersion.major) return "major";
  if (localVersion.minor !== remoteVersion.minor) return "minor";
  return "patch";
}

export function isDeltaAllowedByChannel(delta: UpdateDeltaKind, channel: AutoUpdateChannel): boolean {
  if (delta === "none") return false;
  if (channel === "all") return true;
  if (channel === "minor") return delta === "minor" || delta === "patch";
  return delta === "patch";
}
