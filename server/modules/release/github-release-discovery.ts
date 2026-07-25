import {
  selectRemoteReleaseIdentity,
  type ReleaseIdentity,
  type SelectedRemoteReleaseIdentity,
} from "./release-identity.ts";

const RELEASE_IDENTITY_ASSET = "donggri-release-identity.json";
const RELEASE_IDENTITY_MAX_BYTES = 64 * 1024;
const DEFAULT_RELEASE_LIMIT = 20;

type GitHubReleaseAsset = {
  name?: unknown;
  browser_download_url?: unknown;
};

type GitHubRelease = {
  draft?: unknown;
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

export type GitHubReleaseDiscoveryOptions = {
  repository: string;
  localIdentity: ReleaseIdentity;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  releaseLimit?: number;
};

export type GitHubReleaseDiscoveryResult = SelectedRemoteReleaseIdentity & {
  inspected_releases: number;
  identity_candidates: number;
};

function parseRepository(repository: string): { owner: string; repo: string } | null {
  const matched = String(repository ?? "")
    .trim()
    .match(/^([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38}))\/([A-Za-z0-9_.-]{1,100})$/);
  if (!matched || matched[1].includes("..") || matched[2].includes("..")) return null;
  return { owner: matched[1], repo: matched[2] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^v/i, "");
  return normalized || null;
}

function safeRepositoryReleaseUrl(
  value: unknown,
  repository: { owner: string; repo: string },
  kind: "asset" | "page",
): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }
    const prefix =
      kind === "asset"
        ? `/${repository.owner}/${repository.repo}/releases/download/`
        : `/${repository.owner}/${repository.repo}/releases/`;
    if (!url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isSafeResolvedAssetResponseUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
    return new Set([
      "github.com",
      "objects.githubusercontent.com",
      "github-releases.githubusercontent.com",
      "release-assets.githubusercontent.com",
    ]).has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const advertisedLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(advertisedLength) && advertisedLength > RELEASE_IDENTITY_MAX_BYTES) {
    throw new Error("release_identity_asset_too_large");
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > RELEASE_IDENTITY_MAX_BYTES) {
    throw new Error("release_identity_asset_too_large");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("release_identity_asset_invalid_json");
  }
}

export function buildGitHubReleasesUrl(repository: string, releaseLimit = DEFAULT_RELEASE_LIMIT): string {
  const parsed = parseRepository(repository);
  if (!parsed) throw new Error("update_repository_invalid");
  const limit = Math.max(1, Math.min(100, Math.trunc(releaseLimit) || DEFAULT_RELEASE_LIMIT));
  return `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/releases?per_page=${limit}`;
}

export async function discoverGitHubReleaseIdentity(
  options: GitHubReleaseDiscoveryOptions,
): Promise<GitHubReleaseDiscoveryResult> {
  const repository = parseRepository(options.repository);
  if (!repository) throw new Error("update_repository_invalid");
  const fetchImpl = options.fetchImpl ?? fetch;
  const releaseLimit = Math.max(
    1,
    Math.min(100, Math.trunc(options.releaseLimit ?? DEFAULT_RELEASE_LIMIT) || DEFAULT_RELEASE_LIMIT),
  );
  const response = await fetchImpl(buildGitHubReleasesUrl(options.repository, releaseLimit), {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "dongri-grigri-update-check",
    },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`github_http_${response.status}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(body)) throw new Error("github_releases_invalid");

  const releases = body.slice(0, releaseLimit).filter(isRecord) as GitHubRelease[];
  const candidates = releases
    .filter((release) => release.draft !== true)
    .map((release) => {
      const assets = Array.isArray(release.assets) ? (release.assets.filter(isRecord) as GitHubReleaseAsset[]) : [];
      const identityAssets = assets.filter((asset) => asset.name === RELEASE_IDENTITY_ASSET);
      if (identityAssets.length !== 1) return null;
      const identityUrl = safeRepositoryReleaseUrl(identityAssets[0].browser_download_url, repository, "asset");
      const tag = normalizeTag(release.tag_name);
      if (!identityUrl || !tag) return null;
      return {
        identityUrl,
        tag,
        releaseUrl: safeRepositoryReleaseUrl(release.html_url, repository, "page"),
      };
    })
    .filter((candidate): candidate is { identityUrl: string; tag: string; releaseUrl: string | null } =>
      Boolean(candidate),
    );

  const resolved = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const identityResponse = await fetchImpl(candidate.identityUrl, {
          method: "GET",
          headers: {
            accept: "application/json, application/octet-stream",
            "user-agent": "dongri-grigri-update-check",
          },
          signal: options.signal,
        });
        if (!identityResponse.ok || !isSafeResolvedAssetResponseUrl(identityResponse.url)) return null;
        const identity = await readBoundedJson(identityResponse);
        if (
          !isRecord(identity) ||
          typeof identity.product_version !== "string" ||
          identity.product_version !== candidate.tag
        ) {
          return null;
        }
        return { identity, release_url: candidate.releaseUrl };
      } catch (error) {
        if (options.signal?.aborted) throw error;
        return null;
      }
    }),
  );
  const validCandidates = resolved.filter(
    (candidate): candidate is NonNullable<(typeof resolved)[number]> => candidate !== null,
  );
  const selected = selectRemoteReleaseIdentity(options.localIdentity, validCandidates);
  if (!selected) throw new Error("release_identity_candidate_missing");
  return {
    ...selected,
    inspected_releases: releases.length,
    identity_candidates: validCandidates.length,
  };
}
