import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { evaluateExecutionPathGate } from "./execution-path-gate.ts";

type ProjectRow = { project_path: string | null } | undefined;

type FakeDb = Pick<DatabaseSync, "prepare">;

const originalAllowedRoots = process.env.PROJECT_PATH_ALLOWED_ROOTS;
const originalBootstrap = process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP;
const tempDirs: string[] = [];

function createFakeDb(projects: Record<string, string>): FakeDb {
  return {
    prepare(_sql: string) {
      return {
        get(projectId: string): ProjectRow {
          const projectPath = projects[projectId];
          if (!projectPath) return undefined;
          return { project_path: projectPath };
        },
      } as any;
    },
  } as FakeDb;
}

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function initGitRepo(targetPath: string): void {
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: targetPath, stdio: "pipe", timeout: 10000 });
  } catch {
    execFileSync("git", ["init"], { cwd: targetPath, stdio: "pipe", timeout: 10000 });
  }
}

afterEach(() => {
  if (originalAllowedRoots === undefined) {
    delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
  } else {
    process.env.PROJECT_PATH_ALLOWED_ROOTS = originalAllowedRoots;
  }
  if (originalBootstrap === undefined) {
    delete process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP;
  } else {
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = originalBootstrap;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("evaluateExecutionPathGate", () => {
  it("blocks when project path is missing", () => {
    process.env.PROJECT_PATH_ALLOWED_ROOTS = createTempDir("path-gate-allowed-");
    const result = evaluateExecutionPathGate({
      db: createFakeDb({}) as DatabaseSync,
      task: {
        project_id: null,
        project_path: null,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 422,
      error: "project_path_required",
    });
  });

  it("blocks paths outside allowed roots", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const deniedRoot = createTempDir("path-gate-denied-");
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({}) as DatabaseSync,
      task: {
        project_id: null,
        project_path: deniedRoot,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 422,
      error: "project_path_not_allowed",
    });
  });

  it("blocks non-git project when bootstrap is disabled", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const nonGitProject = path.join(allowedRoot, "non-git");
    fs.mkdirSync(nonGitProject, { recursive: true });
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({}) as DatabaseSync,
      task: {
        project_id: null,
        project_path: nonGitProject,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 409,
      error: "git_repo_required",
    });
  });

  it("allows git project in allowed root", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const gitProject = path.join(allowedRoot, "git-project");
    fs.mkdirSync(gitProject, { recursive: true });
    initGitRepo(gitProject);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: gitProject }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.normalize(result.projectPath)).toBe(path.normalize(gitProject));
    }
  });
});

