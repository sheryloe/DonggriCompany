import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDonggriControlRoot } from "./control-root.ts";

describe("resolveDonggriControlRoot", () => {
  it("accepts an explicit absolute local root", () => {
    const root = path.resolve("fixture", "control-root");
    expect(resolveDonggriControlRoot({ envValue: `"${root}"`, repoRoot: path.resolve("repo") })).toBe(root);
  });

  it("rejects a relative environment override", () => {
    expect(() => resolveDonggriControlRoot({ envValue: "../private-root", repoRoot: path.resolve("repo") })).toThrow(
      "donggri_control_root_must_be_absolute",
    );
  });

  it("discovers the DevDrive root only when both markers exist", () => {
    const repoRoot = path.resolve("devdrive", "repos", "DonggriCompany");
    const devRoot = path.resolve(repoRoot, "..", "..");
    const markers = new Set([path.join(devRoot, "AGENTS.md"), path.join(devRoot, "storage", "codex-control")]);

    expect(resolveDonggriControlRoot({ repoRoot, existsSync: (candidate) => markers.has(candidate) })).toBe(devRoot);
    expect(resolveDonggriControlRoot({ repoRoot, existsSync: () => false })).toBe(repoRoot);
  });
});
