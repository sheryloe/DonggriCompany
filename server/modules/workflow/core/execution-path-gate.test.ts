import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { evaluateExecutionPathGate } from "./execution-path-gate.ts";

vi.setConfig({ testTimeout: 20_000 });

type ProjectRow = { project_path: string | null } | undefined;

type FakeDb = Pick<DatabaseSync, "prepare">;

const originalAllowedRoots = process.env.PROJECT_PATH_ALLOWED_ROOTS;
const originalBootstrap = process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP;
const originalControlRoot = process.env.DONGGRI_CONTROL_ROOT;
const originalCwd = process.cwd();
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

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 10000 }).trim();
}

function initGitRepo(targetPath: string): void {
  try {
    runGit(targetPath, ["init", "-b", "main"]);
  } catch {
    runGit(targetPath, ["init"]);
  }
  runGit(targetPath, ["config", "user.name", "Dongri Path Gate Test"]);
  runGit(targetPath, ["config", "user.email", "dongri-path-gate@example.local"]);
  fs.writeFileSync(path.join(targetPath, "README.md"), "path gate fixture\n", "utf8");
  runGit(targetPath, ["add", "README.md"]);
  runGit(targetPath, ["commit", "-m", "test: seed path gate repository"]);
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
  if (originalControlRoot === undefined) {
    delete process.env.DONGGRI_CONTROL_ROOT;
  } else {
    process.env.DONGGRI_CONTROL_ROOT = originalControlRoot;
  }
  process.chdir(originalCwd);
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

  it("classifies a missing child under an allowed root as git_repo_required", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const missingProject = path.join(allowedRoot, "missing-project");
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({}) as DatabaseSync,
      task: {
        project_id: null,
        project_path: missingProject,
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
  }, 20_000);

  it("blocks a nested directory inside a git repository", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const gitProject = path.join(allowedRoot, "git-project");
    const nestedProject = path.join(gitProject, "nested-project");
    fs.mkdirSync(gitProject, { recursive: true });
    initGitRepo(gitProject);
    fs.mkdirSync(nestedProject, { recursive: true });
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: nestedProject }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 409,
      error: "git_repo_required",
      message: "Project path must be the exact root of a Git repository or linked worktree.",
    });
  });

  it("blocks nested git bootstrap inside a parent repository", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const gitProject = path.join(allowedRoot, "git-project");
    const nestedProject = path.join(gitProject, "nested-project");
    fs.mkdirSync(gitProject, { recursive: true });
    initGitRepo(gitProject);
    fs.mkdirSync(nestedProject, { recursive: true });
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: nestedProject }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 409,
      error: "git_repo_required",
    });
    expect(fs.existsSync(path.join(nestedProject, ".git"))).toBe(false);
  });

  it("allows an exact linked worktree root", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const gitProject = path.join(allowedRoot, "git-project");
    const linkedWorktree = path.join(allowedRoot, "linked-worktree");
    fs.mkdirSync(gitProject, { recursive: true });
    initGitRepo(gitProject);
    runGit(gitProject, ["worktree", "add", "-b", "test/linked-root", linkedWorktree, "HEAD"]);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: linkedWorktree }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.normalize(result.projectPath)).toBe(path.normalize(linkedWorktree));
    }
  }, 20_000);

  it("blocks a canonical path that escapes an allowed root through a directory link", () => {
    const allowedRoot = createTempDir("path-gate-allowed-");
    const externalRoot = createTempDir("path-gate-external-");
    const externalProject = path.join(externalRoot, "git-project");
    const linkedProject = path.join(allowedRoot, "linked-project");
    fs.mkdirSync(externalProject, { recursive: true });
    initGitRepo(externalProject);
    fs.symlinkSync(externalProject, linkedProject, process.platform === "win32" ? "junction" : "dir");
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: linkedProject }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      statusCode: 422,
      error: "project_path_not_allowed",
    });
  });

  it("allows runtime projects under an explicit Donggri control root", () => {
    delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";

    const workspaceRoot = createTempDir("path-gate-donggri-");
    const projectRoot = path.join(workspaceRoot, "DonggriCompany");
    const runtimeProject = path.join(workspaceRoot, "runtime", "DonggriCompany", "workflow-sample");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(runtimeProject, { recursive: true });
    process.env.DONGGRI_CONTROL_ROOT = workspaceRoot;
    process.chdir(projectRoot);

    const result = evaluateExecutionPathGate({
      db: createFakeDb({ project1: runtimeProject }) as DatabaseSync,
      task: {
        project_id: "project1",
        project_path: null,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.normalize(result.projectPath)).toBe(path.normalize(runtimeProject));
      expect(result.allowedRoots.map((root) => path.normalize(root))).toContain(
        path.normalize(path.join(workspaceRoot, "runtime")),
      );
    }
  });

  it("keeps a standalone clean clone portable when no control root is configured", () => {
    delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
    delete process.env.DONGGRI_CONTROL_ROOT;
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";

    const standaloneRoot = createTempDir("path-gate-standalone-");
    process.chdir(standaloneRoot);

    const result = evaluateExecutionPathGate({
      db: createFakeDb({}) as DatabaseSync,
      task: {
        project_id: null,
        project_path: standaloneRoot,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.allowedRoots.map((root) => path.normalize(root))).toContain(path.normalize(standaloneRoot));
    expect(result.allowedRoots.join("\n")).not.toMatch(/G:[\\/]Donggri_DevDrive/i);
  });
});
