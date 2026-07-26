import { describe, expect, it } from "vitest";
import {
  compareReleaseIdentity,
  compareStrictSemVer,
  parseReleaseIdentity,
  parseStrictSemVer,
  resolveReleaseIdentity,
  selectRemoteReleaseIdentity,
  type ReleaseIdentity,
} from "./release-identity.ts";

const identity = (overrides: Partial<ReleaseIdentity> = {}): ReleaseIdentity => ({
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
  source_epoch: "sha256:test-source-epoch",
  built_at: "2026-07-25T00:00:00+09:00",
  legacy_source_version: "2.0.4",
  ...overrides,
});

describe("strict SemVer", () => {
  it("parses valid versions and rejects invalid numeric identifiers", () => {
    expect(parseStrictSemVer("v1.2.3-alpha.1+build.7")).toMatchObject({
      major: "1",
      minor: "2",
      patch: "3",
      prerelease: ["alpha", "1"],
      build: ["build", "7"],
    });
    expect(parseStrictSemVer("1.2")).toBeNull();
    expect(parseStrictSemVer("01.2.3")).toBeNull();
    expect(parseStrictSemVer("1.2.3-alpha.01")).toBeNull();
    expect(parseStrictSemVer("1.2.3-")).toBeNull();
    expect(parseStrictSemVer("1.2.3+")).toBeNull();
  });

  it("implements SemVer prerelease precedence without numeric overflow", () => {
    expect(compareStrictSemVer("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareStrictSemVer("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBe(-1);
    expect(compareStrictSemVer("1.0.0-beta.11", "1.0.0-rc.1")).toBe(-1);
    expect(compareStrictSemVer("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareStrictSemVer("1.0.0+one", "1.0.0+two")).toBe(0);
    expect(compareStrictSemVer("1.0.0-999999999999999999999", "1.0.0-1000000000000000000000")).toBe(-1);
  });
});

describe("release identity", () => {
  it("falls back to the immutable package identity when optional build variables are blank", () => {
    expect(
      resolveReleaseIdentity(undefined, {
        DONGRI_RELEASE_GIT_SHA: "",
        DONGRI_RELEASE_CANDIDATE_ID: " ",
        DONGRI_SOURCE_EPOCH: "",
        DONGRI_RELEASE_BUILT_AT: "",
      }),
    ).toMatchObject({
      git_sha: "9519f4036ec8e9380d044a4ff65e737485256a3b",
      candidate_id: "dongri-grigri-v1-alpha.0",
      source_epoch: "sha256:867e09c08292ea677d8542d7a4a4b29a71c8fb4211fc2c995af44ec8322551c4",
    });
  });

  it("rejects malformed or unbound identities", () => {
    expect(parseReleaseIdentity({})).toBeNull();
    expect(parseReleaseIdentity(identity({ git_sha: "unbound" }))).toBeNull();
    expect(parseReleaseIdentity(identity({ channel: "stable" }))).toBeNull();
    expect(parseReleaseIdentity(identity({ product_version: "1.0.0", channel: "alpha" }))).toBeNull();
  });

  it("blocks identity and epoch drift", () => {
    expect(
      compareReleaseIdentity(identity(), {
        ...identity({ product_version: "1.0.0-alpha.1" }),
        source_repository: "someone/other",
      }).state,
    ).toBe("identity_mismatch");
    expect(compareReleaseIdentity(identity(), identity({ epoch: 2 })).state).toBe("epoch_migration_required");
    expect(compareReleaseIdentity(identity({ epoch: 2 }), identity({ epoch: 1 })).state).toBe("stale_remote");
  });

  it("keeps prerelease updates status-only and permits stable-to-stable apply", () => {
    expect(compareReleaseIdentity(identity(), identity({ product_version: "1.0.0-alpha.1" }))).toMatchObject({
      state: "update_available",
      update_available: true,
      auto_apply_allowed: false,
    });
    expect(
      compareReleaseIdentity(
        identity({ product_version: "1.0.0", channel: "stable" }),
        identity({ product_version: "1.0.1", channel: "stable" }),
      ),
    ).toMatchObject({
      state: "update_available",
      update_available: true,
      auto_apply_allowed: true,
    });
  });

  it("selects prereleases by strict SemVer and prioritizes a different release epoch as migration", () => {
    const local = identity();
    expect(
      selectRemoteReleaseIdentity(local, [
        { identity: identity({ product_version: "1.0.0-alpha.1" }), release_url: "alpha.1" },
        { identity: identity({ product_version: "1.0.0-beta.1", channel: "beta" }), release_url: "beta.1" },
      ]),
    ).toMatchObject({
      identity: { product_version: "1.0.0-beta.1" },
      release_url: "beta.1",
      comparison: { state: "update_available", auto_apply_allowed: false },
    });
    expect(
      selectRemoteReleaseIdentity(local, [
        { identity: identity({ product_version: "1.0.0-beta.1", channel: "beta" }), release_url: "beta.1" },
        {
          identity: identity({ release_epoch: "dongri-grigri-v2", epoch: 2, product_version: "1.0.0-alpha.0" }),
          release_url: "v2",
        },
      ]),
    ).toMatchObject({
      release_url: "v2",
      comparison: { state: "epoch_migration_required", update_available: false },
    });
  });
});
