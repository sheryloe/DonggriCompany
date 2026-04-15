import { describe, expect, it } from "vitest";
import { compareSkillsByInstalls, compareSkillsByRank } from "./model";

describe("skills library sorting helpers", () => {
  it("keeps ranked items ahead of catalog-only items in rank mode", () => {
    const skills = [
      { name: "Zulu", repo: "acme/catalog", skillId: "zulu", rank: 0, installs: 0, isRanked: false },
      { name: "Alpha", repo: "acme/catalog", skillId: "alpha", rank: 2, installs: 100, isRanked: true },
      { name: "Beta", repo: "acme/catalog", skillId: "beta", rank: 1, installs: 200, isRanked: true },
      { name: "Able", repo: "acme/catalog", skillId: "able", rank: 0, installs: 0, isRanked: false },
    ];

    const sorted = [...skills].sort((left, right) => compareSkillsByRank(left, right, "en"));

    expect(sorted.map((skill) => skill.skillId)).toEqual(["beta", "alpha", "able", "zulu"]);
  });

  it("keeps ranked entries ahead when installs tie at zero", () => {
    const skills = [
      { name: "Catalog Only", repo: "acme/catalog", skillId: "catalog-only", rank: 0, installs: 0, isRanked: false },
      { name: "Ranked", repo: "acme/catalog", skillId: "ranked", rank: 10, installs: 0, isRanked: true },
    ];

    const sorted = [...skills].sort((left, right) => compareSkillsByInstalls(left, right, "en"));

    expect(sorted.map((skill) => skill.skillId)).toEqual(["ranked", "catalog-only"]);
  });
});
