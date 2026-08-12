import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseChannel = "alpha" | "beta" | "rc" | "stable";

export type StrictSemVer = {
  raw: string;
  major: string;
  minor: string;
  patch: string;
  prerelease: string[];
  build: string[];
};

export type ReleaseIdentity = {
  schema_version: "1.0.0";
  product_id: string;
  distribution_id: string;
  source_repository: string;
  release_epoch: string;
  epoch: number;
  product_version: string;
  channel: ReleaseChannel;
  git_sha: string;
  target_revision: string;
  candidate_id: string;
  source_epoch: string;
  built_at: string;
  legacy_source_version: string;
};

export type ReleaseComparisonState =
  | "current"
  | "update_available"
  | "stale_remote"
  | "identity_mismatch"
  | "epoch_migration_required"
  | "invalid_remote";

export type ReleaseComparison = {
  state: ReleaseComparisonState;
  update_available: boolean;
  auto_apply_allowed: boolean;
  reason: string;
};

type PackageReleaseMetadata = {
  schemaVersion?: unknown;
  productId?: unknown;
  distributionId?: unknown;
  sourceRepository?: unknown;
  releaseEpoch?: unknown;
  epoch?: unknown;
  channel?: unknown;
  gitSha?: unknown;
  candidateId?: unknown;
  sourceEpoch?: unknown;
  builtAt?: unknown;
  legacySourceVersion?: unknown;
};

type PackageManifest = {
  version?: unknown;
  donggriRelease?: PackageReleaseMetadata;
};

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

function isValidNumericIdentifier(value: string): boolean {
  return value === "0" || /^[1-9]\d*$/.test(value);
}

function compareNumericIdentifiers(left: string, right: string): -1 | 0 | 1 {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function parseIdentifiers(raw: string, kind: "prerelease" | "build"): string[] | null {
  if (!raw) return [];
  const identifiers = raw.split(".");
  if (identifiers.some((identifier) => !identifier || !/^[0-9A-Za-z-]+$/.test(identifier))) return null;
  if (
    kind === "prerelease" &&
    identifiers.some((identifier) => isNumericIdentifier(identifier) && !isValidNumericIdentifier(identifier))
  ) {
    return null;
  }
  return identifiers;
}

export function parseStrictSemVer(value: unknown): StrictSemVer | null {
  const raw = String(value ?? "")
    .trim()
    .replace(/^v/i, "");
  if (!raw) return null;

  const plusIndex = raw.indexOf("+");
  if (plusIndex !== -1 && raw.indexOf("+", plusIndex + 1) !== -1) return null;
  const withoutBuild = plusIndex === -1 ? raw : raw.slice(0, plusIndex);
  const buildRaw = plusIndex === -1 ? "" : raw.slice(plusIndex + 1);
  if (plusIndex !== -1 && !buildRaw) return null;

  const dashIndex = withoutBuild.indexOf("-");
  const coreRaw = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex);
  const prereleaseRaw = dashIndex === -1 ? "" : withoutBuild.slice(dashIndex + 1);
  if (dashIndex !== -1 && !prereleaseRaw) return null;
  const core = coreRaw.split(".");
  if (core.length !== 3 || core.some((identifier) => !isValidNumericIdentifier(identifier))) return null;

  const prerelease = parseIdentifiers(prereleaseRaw, "prerelease");
  const build = parseIdentifiers(buildRaw, "build");
  if (!prerelease || !build) return null;

  return {
    raw,
    major: core[0],
    minor: core[1],
    patch: core[2],
    prerelease,
    build,
  };
}

export function compareStrictSemVer(leftValue: unknown, rightValue: unknown): -1 | 0 | 1 | null {
  const left = parseStrictSemVer(leftValue);
  const right = parseStrictSemVer(rightValue);
  if (!left || !right) return null;

  for (const key of ["major", "minor", "patch"] as const) {
    const compared = compareNumericIdentifiers(left[key], right[key]);
    if (compared !== 0) return compared;
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier == null) return -1;
    if (rightIdentifier == null) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = isNumericIdentifier(leftIdentifier);
    const rightNumeric = isNumericIdentifier(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return compareNumericIdentifiers(leftIdentifier, rightIdentifier);
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  return 0;
}

function parseChannel(value: unknown): ReleaseChannel | null {
  return value === "alpha" || value === "beta" || value === "rc" || value === "stable" ? value : null;
}

function isRevision(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

function currentGitRevision(projectRoot: string): string {
  try {
    const revision = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .toLowerCase();
    return isRevision(revision) ? revision : "";
  } catch {
    return "";
  }
}

function isReleaseIdentity(value: unknown): value is ReleaseIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  const parsedVersion = parseStrictSemVer(identity.product_version);
  const channel = parseChannel(identity.channel);
  const prereleaseChannel = parsedVersion?.prerelease[0] ?? null;
  const channelMatchesVersion =
    Boolean(parsedVersion) &&
    Boolean(channel) &&
    (channel === "stable" ? parsedVersion!.prerelease.length === 0 : prereleaseChannel === channel);
  return (
    identity.schema_version === "1.0.0" &&
    typeof identity.product_id === "string" &&
    identity.product_id.length > 0 &&
    typeof identity.distribution_id === "string" &&
    identity.distribution_id.length > 0 &&
    typeof identity.source_repository === "string" &&
    identity.source_repository.length > 0 &&
    typeof identity.release_epoch === "string" &&
    identity.release_epoch.length > 0 &&
    Number.isSafeInteger(identity.epoch) &&
    Number(identity.epoch) > 0 &&
    channelMatchesVersion &&
    typeof identity.git_sha === "string" &&
    isRevision(identity.git_sha) &&
    typeof identity.target_revision === "string" &&
    isRevision(identity.target_revision) &&
    typeof identity.candidate_id === "string" &&
    identity.candidate_id.length > 0 &&
    typeof identity.source_epoch === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(identity.source_epoch) &&
    typeof identity.built_at === "string" &&
    !Number.isNaN(Date.parse(identity.built_at)) &&
    typeof identity.legacy_source_version === "string" &&
    identity.legacy_source_version.length > 0
  );
}

export function parseReleaseIdentity(value: unknown): ReleaseIdentity | null {
  return isReleaseIdentity(value) ? value : null;
}

export function resolveReleaseIdentity(
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."),
  env: NodeJS.ProcessEnv = process.env,
): ReleaseIdentity {
  const packagePath = path.join(projectRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageManifest;
  const metadata = manifest.donggriRelease ?? {};
  const productVersion = String(manifest.version ?? "");
  const channel = parseChannel(metadata.channel);
  const gitSha = firstNonEmpty(
    env.DONGRI_RELEASE_GIT_SHA,
    currentGitRevision(projectRoot),
    metadata.gitSha,
  ).toLowerCase();

  const candidate: unknown = {
    schema_version: metadata.schemaVersion,
    product_id: metadata.productId,
    distribution_id: metadata.distributionId,
    source_repository: metadata.sourceRepository,
    release_epoch: metadata.releaseEpoch,
    epoch: metadata.epoch,
    product_version: productVersion,
    channel,
    git_sha: gitSha,
    target_revision: gitSha,
    candidate_id: firstNonEmpty(env.DONGRI_RELEASE_CANDIDATE_ID, metadata.candidateId),
    source_epoch: firstNonEmpty(env.DONGRI_SOURCE_EPOCH, metadata.sourceEpoch),
    built_at: firstNonEmpty(env.DONGRI_RELEASE_BUILT_AT, metadata.builtAt),
    legacy_source_version: metadata.legacySourceVersion,
  };

  const identity = parseReleaseIdentity(candidate);
  if (
    !identity ||
    identity.product_id !== "dongri-grigri" ||
    identity.distribution_id !== "donggri-company" ||
    identity.source_repository !== "sheryloe/DonggriCompany" ||
    identity.release_epoch !== "dongri-grigri-v1" ||
    identity.legacy_source_version !== "2.0.4"
  ) {
    throw new Error(`invalid_donggri_release_identity:${packagePath}`);
  }
  return identity;
}

export function compareReleaseIdentity(local: ReleaseIdentity, remoteValue: unknown): ReleaseComparison {
  const remote = parseReleaseIdentity(remoteValue);
  if (!remote) {
    return {
      state: "invalid_remote",
      update_available: false,
      auto_apply_allowed: false,
      reason: "remote_release_identity_invalid",
    };
  }

  if (
    remote.product_id !== local.product_id ||
    remote.distribution_id !== local.distribution_id ||
    remote.source_repository !== local.source_repository
  ) {
    return {
      state: "identity_mismatch",
      update_available: false,
      auto_apply_allowed: false,
      reason: "remote_release_identity_mismatch",
    };
  }

  if (remote.release_epoch !== local.release_epoch) {
    return {
      state: "epoch_migration_required",
      update_available: false,
      auto_apply_allowed: false,
      reason: "release_epoch_migration_required",
    };
  }

  if (remote.epoch !== local.epoch) {
    return {
      state: remote.epoch > local.epoch ? "epoch_migration_required" : "stale_remote",
      update_available: false,
      auto_apply_allowed: false,
      reason: remote.epoch > local.epoch ? "release_epoch_migration_required" : "remote_release_epoch_is_stale",
    };
  }

  const compared = compareStrictSemVer(remote.product_version, local.product_version);
  if (compared == null) {
    return {
      state: "invalid_remote",
      update_available: false,
      auto_apply_allowed: false,
      reason: "remote_product_version_invalid",
    };
  }
  if (compared <= 0) {
    return {
      state: compared === 0 ? "current" : "stale_remote",
      update_available: false,
      auto_apply_allowed: false,
      reason: compared === 0 ? "release_is_current" : "remote_release_is_older",
    };
  }

  const stableToStable = local.channel === "stable" && remote.channel === "stable";
  return {
    state: "update_available",
    update_available: true,
    auto_apply_allowed: stableToStable,
    reason: stableToStable ? "same_epoch_stable_update_available" : "prerelease_status_only",
  };
}

export type RemoteReleaseIdentityCandidate = {
  identity: unknown;
  release_url: string | null;
};

export type SelectedRemoteReleaseIdentity = {
  identity: ReleaseIdentity;
  release_url: string | null;
  comparison: ReleaseComparison;
};

export function selectRemoteReleaseIdentity(
  local: ReleaseIdentity,
  candidates: readonly RemoteReleaseIdentityCandidate[],
): SelectedRemoteReleaseIdentity | null {
  const parsed = candidates
    .map((candidate) => ({
      identity: parseReleaseIdentity(candidate.identity),
      release_url: candidate.release_url,
    }))
    .filter((candidate): candidate is { identity: ReleaseIdentity; release_url: string | null } =>
      Boolean(candidate.identity),
    )
    .filter(
      (candidate) =>
        candidate.identity.product_id === local.product_id &&
        candidate.identity.distribution_id === local.distribution_id &&
        candidate.identity.source_repository === local.source_repository,
    );
  if (parsed.length === 0) return null;

  const epochMigration = parsed
    .filter(
      (candidate) => candidate.identity.release_epoch !== local.release_epoch || candidate.identity.epoch > local.epoch,
    )
    .sort((left, right) => Date.parse(right.identity.built_at) - Date.parse(left.identity.built_at))[0];
  if (epochMigration) {
    return {
      ...epochMigration,
      comparison: compareReleaseIdentity(local, epochMigration.identity),
    };
  }

  const sameEpoch = parsed
    .filter(
      (candidate) =>
        candidate.identity.release_epoch === local.release_epoch && candidate.identity.epoch === local.epoch,
    )
    .sort((left, right) => {
      const compared = compareStrictSemVer(right.identity.product_version, left.identity.product_version);
      return compared ?? 0;
    })[0];
  const selected = sameEpoch ?? parsed.sort((left, right) => right.identity.epoch - left.identity.epoch)[0];
  return {
    ...selected,
    comparison: compareReleaseIdentity(local, selected.identity),
  };
}
