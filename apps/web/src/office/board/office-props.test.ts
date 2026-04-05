import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildThirdPartyAssetsMarkdown,
  roomAssetManifest,
  roomPropVariants,
  validateAssetManifest
} from "./office-props";

describe("office-props asset manifest", () => {
  it("keeps manifest valid and license set constrained", () => {
    const validation = validateAssetManifest(roomAssetManifest);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    const allowedLicenses = new Set(["CC0", "CC-BY-4.0", "CC-BY-SA-4.0"]);
    for (const entry of roomAssetManifest) {
      expect(allowedLicenses.has(entry.license)).toBe(true);
      expect(entry.tileSize).toBeGreaterThan(0);
      expect(entry.sourceUrl.startsWith("https://")).toBe(true);
    }
  });

  it("maps all room variants into manifest entries", () => {
    const variantCount = Object.values(roomPropVariants).reduce((sum, variants) => sum + variants.length, 0);
    expect(roomAssetManifest).toHaveLength(variantCount);
  });

  it("keeps THIRD_PARTY_ASSETS.md synchronized with manifest output", () => {
    const expected = buildThirdPartyAssetsMarkdown(roomAssetManifest);
    const assetDocPath = new URL("../../../../../THIRD_PARTY_ASSETS.md", import.meta.url);
    const actual = readFileSync(assetDocPath, "utf8");
    expect(actual).toBe(expected);
  });
});
