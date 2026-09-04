import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectContinuityWorkspace,
  digestContinuityChangedPath,
  validateContinuityWorkspace,
} from "./workspace-identity.ts";

const roots: string[] = [];

function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dongri-continuity-"));
  roots.push(root);
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@dongri.local"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Dongri Fixture"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "initial\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("continuity workspace identity", () => {
  it("collects clean and dirty identities deterministically", () => {
    const root = repo();
    const clean = collectContinuityWorkspace(root, "2026-08-28T09:00:00+09:00");
    expect(clean.dirty).toBe(false);

    fs.writeFileSync(path.join(root, "README.md"), "changed\n");
    fs.writeFileSync(path.join(root, "new.txt"), "new\n");
    const dirty = collectContinuityWorkspace(root, "2026-08-28T09:01:00+09:00");
    expect(dirty.changed_paths).toEqual(["new.txt", "README.md"].sort((a, b) => a.localeCompare(b)));
    expect(dirty.workspace_digest).not.toBe(clean.workspace_digest);
  });

  it("allows an unchanged dirty workspace and fails closed on content drift", () => {
    const root = repo();
    fs.writeFileSync(path.join(root, "README.md"), "dirty\n");
    const expected = collectContinuityWorkspace(root);
    expect(validateContinuityWorkspace(expected, collectContinuityWorkspace(root))).toEqual({ ok: true });

    fs.writeFileSync(path.join(root, "README.md"), "drift\n");
    expect(validateContinuityWorkspace(expected, collectContinuityWorkspace(root))).toMatchObject({
      ok: false,
      code: "workspace_drift",
    });
  });

  it("blocks a different clone path even when HEAD matches", () => {
    const root = repo();
    const clone = `${root}-clone`;
    roots.push(clone);
    execFileSync("git", ["clone", root, clone]);
    const result = validateContinuityWorkspace(collectContinuityWorkspace(root), collectContinuityWorkspace(clone));
    expect(result).toMatchObject({ ok: false, code: "workspace_path_mismatch" });
  });

  it("does not follow a changed path through a junction outside the Git root", () => {
    const root = repo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dongri-continuity-outside-"));
    roots.push(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "outside\n");
    fs.symlinkSync(outside, path.join(root, "linked-outside"), "junction");

    expect(() => digestContinuityChangedPath(root, "linked-outside/secret.txt")).toThrow(
      "continuity_changed_path_outside_git_root",
    );
  });
});
