import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { ContinuityWorkspaceSchema, type ContinuityWorkspace } from "./checkpoint-contract.js";

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`continuity_git_failed:${args[0]}`);
  return result.stdout.trimEnd();
}

function canonical(value: string): string {
  return fs.realpathSync.native(path.resolve(value));
}

function changedPaths(cwd: string): string[] {
  return git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).split(" -> ").at(-1) ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function digestContinuityChangedPath(root: string, relativePath: string): string {
  const absolute = path.resolve(root, ...relativePath.split("/"));
  if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) return "missing";
  const canonicalAbsolute = fs.realpathSync.native(absolute);
  if (canonicalAbsolute !== root && !canonicalAbsolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("continuity_changed_path_outside_git_root");
  }
  const stat = fs.statSync(canonicalAbsolute);
  if (!stat.isFile()) return `non-file:${stat.size}`;
  return createHash("sha256").update(fs.readFileSync(canonicalAbsolute)).digest("hex");
}

export function collectContinuityWorkspace(
  projectPath: string,
  capturedAt = new Date().toISOString(),
): ContinuityWorkspace {
  const canonicalProjectPath = canonical(projectPath);
  const gitRoot = canonical(git(canonicalProjectPath, ["rev-parse", "--show-toplevel"]));
  if (canonicalProjectPath !== gitRoot && !canonicalProjectPath.startsWith(`${gitRoot}${path.sep}`)) {
    throw new Error("continuity_project_outside_git_root");
  }
  const branchValue = git(gitRoot, ["branch", "--show-current"]);
  const changed = changedPaths(gitRoot);
  const head = git(gitRoot, ["rev-parse", "HEAD"]);
  const digestInput = {
    canonical_project_path: canonicalProjectPath,
    git_root: gitRoot,
    branch: branchValue || null,
    head,
    changed_paths: changed.map((relativePath) => [relativePath, digestContinuityChangedPath(gitRoot, relativePath)]),
  };

  return ContinuityWorkspaceSchema.parse({
    canonical_project_path: canonicalProjectPath,
    git_root: gitRoot,
    branch: branchValue || null,
    head,
    dirty: changed.length > 0,
    changed_paths: changed,
    workspace_digest: createHash("sha256").update(JSON.stringify(digestInput)).digest("hex"),
    captured_at: capturedAt,
  });
}

export type WorkspaceValidation =
  | { ok: true }
  | { ok: false; code: "workspace_path_mismatch" | "git_identity_mismatch" | "workspace_drift"; changed: string[] };

export function validateContinuityWorkspace(
  expected: ContinuityWorkspace,
  actual: ContinuityWorkspace,
): WorkspaceValidation {
  if (expected.canonical_project_path !== actual.canonical_project_path || expected.git_root !== actual.git_root) {
    return { ok: false, code: "workspace_path_mismatch", changed: [] };
  }
  if (expected.branch !== actual.branch || expected.head !== actual.head) {
    return { ok: false, code: "git_identity_mismatch", changed: [] };
  }
  if (expected.workspace_digest !== actual.workspace_digest) {
    const paths = new Set([...expected.changed_paths, ...actual.changed_paths]);
    return { ok: false, code: "workspace_drift", changed: [...paths].sort() };
  }
  return { ok: true };
}
