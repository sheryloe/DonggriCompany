import { describe, expect, it, vi } from "vitest";
import type { ReleaseIdentity } from "./release-identity.ts";
import { buildGitHubReleasesUrl, discoverGitHubReleaseIdentity } from "./github-release-discovery.ts";

const localIdentity: ReleaseIdentity = {
  schema_version: "1.0.0",
  product_id: "dongri-grigri",
  distribution_id: "donggri-company",
  source_repository: "sheryloe/DonggriCompany",
  release_epoch: "dongri-grigri-v1",
  epoch: 1,
  product_version: "1.0.0-alpha.0",
  channel: "alpha",
  git_sha: "9519f4036ec8e9380d044a4ff65e737485256a3b",
  target_revision: "9519f4036ec8e9380d044a4ff65e737485256a3b",
  candidate_id: "dongri-grigri-v1-alpha.0",
  source_epoch: `sha256:${"a".repeat(64)}`,
  built_at: "2026-07-25T00:00:00+09:00",
  legacy_source_version: "2.0.4",
};

const identity = (
  productVersion: string,
  channel: ReleaseIdentity["channel"],
  overrides: Partial<ReleaseIdentity> = {},
): ReleaseIdentity => ({
  ...localIdentity,
  product_version: productVersion,
  channel,
  candidate_id: `dongri-grigri-v1-${productVersion}`,
  built_at: "2026-07-25T01:00:00+09:00",
  ...overrides,
});

function jsonResponse(value: unknown, init: ResponseInit & { url?: string } = {}): Response {
  const response = new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (init.url) Object.defineProperty(response, "url", { value: init.url });
  return response;
}

describe("GitHub release identity discovery", () => {
  it("uses the releases collection endpoint so prereleases are visible", () => {
    expect(buildGitHubReleasesUrl("sheryloe/DonggriCompany")).toBe(
      "https://api.github.com/repos/sheryloe/DonggriCompany/releases?per_page=20",
    );
    expect(() => buildGitHubReleasesUrl("https://github.com/attacker/repo")).toThrow("update_repository_invalid");
  });

  it("selects the highest strict-SemVer prerelease and keeps it status-only", async () => {
    const releases = [
      {
        draft: false,
        prerelease: true,
        tag_name: "v1.0.0-alpha.1",
        html_url: "https://github.com/sheryloe/DonggriCompany/releases/tag/v1.0.0-alpha.1",
        assets: [
          {
            name: "donggri-release-identity.json",
            browser_download_url:
              "https://github.com/sheryloe/DonggriCompany/releases/download/v1.0.0-alpha.1/donggri-release-identity.json",
          },
        ],
      },
      {
        draft: false,
        prerelease: true,
        tag_name: "v1.0.0-beta.1",
        html_url: "https://github.com/sheryloe/DonggriCompany/releases/tag/v1.0.0-beta.1",
        assets: [
          {
            name: "donggri-release-identity.json",
            browser_download_url:
              "https://github.com/sheryloe/DonggriCompany/releases/download/v1.0.0-beta.1/donggri-release-identity.json",
          },
        ],
      },
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("/releases?")) return jsonResponse(releases);
      if (value.includes("alpha.1")) {
        return jsonResponse(identity("1.0.0-alpha.1", "alpha"), {
          url: "https://release-assets.githubusercontent.com/alpha",
        });
      }
      return jsonResponse(identity("1.0.0-beta.1", "beta"), {
        url: "https://release-assets.githubusercontent.com/beta",
      });
    }) as typeof fetch;

    const result = await discoverGitHubReleaseIdentity({
      repository: "sheryloe/DonggriCompany",
      localIdentity,
      fetchImpl,
    });

    expect(result).toMatchObject({
      identity: { product_version: "1.0.0-beta.1" },
      comparison: {
        state: "update_available",
        update_available: true,
        auto_apply_allowed: false,
      },
      inspected_releases: 2,
      identity_candidates: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects unsafe assets, duplicate identity assets, and tag/identity mismatches", async () => {
    const asset = {
      name: "donggri-release-identity.json",
      browser_download_url:
        "https://github.com/sheryloe/DonggriCompany/releases/download/v1.0.0-alpha.1/donggri-release-identity.json",
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/releases?")) {
        return jsonResponse([
          {
            draft: false,
            tag_name: "v1.0.0-alpha.1",
            assets: [{ ...asset, browser_download_url: "https://evil.example/identity.json" }],
          },
          { draft: false, tag_name: "v1.0.0-alpha.1", assets: [asset, asset] },
          { draft: false, tag_name: "v1.0.0-alpha.1", assets: [asset] },
        ]);
      }
      return jsonResponse(identity("1.0.0-alpha.2", "alpha"), {
        url: "https://release-assets.githubusercontent.com/mismatch",
      });
    }) as typeof fetch;

    await expect(
      discoverGitHubReleaseIdentity({
        repository: "sheryloe/DonggriCompany",
        localIdentity,
        fetchImpl,
      }),
    ).rejects.toThrow("release_identity_candidate_missing");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces a different epoch as migration-required instead of comparing version numbers", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/releases?")) {
        return jsonResponse([
          {
            draft: false,
            tag_name: "v1.0.0-alpha.0",
            html_url: "https://github.com/sheryloe/DonggriCompany/releases/tag/v1.0.0-alpha.0",
            assets: [
              {
                name: "donggri-release-identity.json",
                browser_download_url:
                  "https://github.com/sheryloe/DonggriCompany/releases/download/v1.0.0-alpha.0/donggri-release-identity.json",
              },
            ],
          },
        ]);
      }
      return jsonResponse(
        identity("1.0.0-alpha.0", "alpha", {
          release_epoch: "dongri-grigri-v2",
          epoch: 2,
        }),
        { url: "https://release-assets.githubusercontent.com/v2" },
      );
    }) as typeof fetch;

    await expect(
      discoverGitHubReleaseIdentity({
        repository: "sheryloe/DonggriCompany",
        localIdentity,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      comparison: {
        state: "epoch_migration_required",
        update_available: false,
        auto_apply_allowed: false,
      },
    });
  });
});
