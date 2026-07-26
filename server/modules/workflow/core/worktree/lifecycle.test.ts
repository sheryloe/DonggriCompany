import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorktreeLifecycleTools } from "./lifecycle.ts";

vi.setConfig({ testTimeout: 20_000 });

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", timeout: 15000 }).toString().trim();
}

function initRepo(basePrefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), basePrefix));
  try {
    runGit(dir, ["init", "-b", "main"]);
  } catch {
    runGit(dir, ["init"]);
    runGit(dir, ["checkout", "-B", "main"]);
  }
  runGit(dir, ["config", "user.name", "Claw-Empire Test"]);
  runGit(dir, ["config", "user.email", "claw-empire-test@example.local"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "seed"]);
  return dir;
}

const tempDirs: string[] = [];
const originalWorktreeBaseDir = process.env.WORKTREE_BASE_DIR;
const originalGitBootstrap = process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP;

beforeEach(() => {
  process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "0";
});

afterEach(() => {
  if (originalWorktreeBaseDir === undefined) {
    delete process.env.WORKTREE_BASE_DIR;
  } else {
    process.env.WORKTREE_BASE_DIR = originalWorktreeBaseDir;
  }
  if (originalGitBootstrap === undefined) {
    delete process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP;
  } else {
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = originalGitBootstrap;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree lifecycle branch collision handling", () => {
  it("reuses existing task branch when branch already exists", () => {
    const repo = initRepo("climpire-wt-reuse-");
    tempDirs.push(repo);
    const shortId = "reuse001";
    const taskId = `${shortId}-0000-0000-0000-000000000000`;
    runGit(repo, ["branch", `climpire/${shortId}`]);

    const taskWorktrees = new Map();
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: () => {},
      taskWorktrees,
    });

    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();
    const info = taskWorktrees.get(taskId);
    expect(info?.branchName).toBe(`climpire/${shortId}`);
    expect(fs.existsSync(String(info?.worktreePath || ""))).toBe(true);
    const dependencyLink = path.join(String(info?.worktreePath || ""), "node_modules");
    expect(fs.lstatSync(dependencyLink).isSymbolicLink()).toBe(true);

    tools.cleanupWorktree(repo, taskId);
    expect(taskWorktrees.has(taskId)).toBe(false);
    expect(fs.existsSync(String(info?.worktreePath || ""))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "node_modules"))).toBe(true);
  }, 20_000);

  it("falls back to suffixed branch when existing branch is occupied in another worktree", () => {
    const repo = initRepo("climpire-wt-fallback-");
    tempDirs.push(repo);
    const shortId = "fallback";
    const baseBranch = `climpire/${shortId}`;
    const occupiedPath = path.join(repo, ".occupied-worktree");
    runGit(repo, ["worktree", "add", occupiedPath, "-b", baseBranch, "HEAD"]);

    const taskId = `${shortId}-0000-0000-0000-000000000000`;
    const taskWorktrees = new Map();
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: () => {},
      taskWorktrees,
    });

    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();
    const info = taskWorktrees.get(taskId);
    expect(info?.branchName.startsWith(baseBranch)).toBe(true);
    expect(info?.branchName).not.toBe(baseBranch);

    tools.cleanupWorktree(repo, taskId);
    runGit(repo, ["worktree", "remove", occupiedPath, "--force"]);
    runGit(repo, ["branch", "-D", baseBranch]);
  }, 20_000);

  it("uses WORKTREE_BASE_DIR for isolated task worktrees when configured", () => {
    const repo = initRepo("climpire-wt-runtime-repo-");
    const runtimeWorktreeBase = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-wt-runtime-base-"));
    tempDirs.push(repo, runtimeWorktreeBase);
    process.env.WORKTREE_BASE_DIR = runtimeWorktreeBase;

    const shortId = "runtime1";
    const taskId = `${shortId}-0000-0000-0000-000000000000`;
    const taskWorktrees = new Map();
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: () => {},
      taskWorktrees,
    });

    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBe(path.join(runtimeWorktreeBase, shortId));
    expect(fs.existsSync(String(worktreePath))).toBe(true);
    expect(fs.existsSync(path.join(repo, ".climpire-worktrees"))).toBe(false);

    tools.cleanupWorktree(repo, taskId);
    expect(taskWorktrees.has(taskId)).toBe(false);
  }, 20_000);

  it("rejects a nested directory even when its parent is a git repository", () => {
    const repo = initRepo("climpire-wt-nested-");
    tempDirs.push(repo);
    const nestedProject = path.join(repo, "nested-project");
    fs.mkdirSync(nestedProject, { recursive: true });
    const taskId = "nested01-0000-0000-0000-000000000000";
    const taskWorktrees = new Map();
    const logs: string[] = [];
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: (_taskId, _kind, message) => logs.push(message),
      taskWorktrees,
    });

    expect(tools.isGitRepo(nestedProject)).toBe(false);
    expect(tools.createWorktree(nestedProject, taskId, "Tester")).toBeNull();
    expect(taskWorktrees.has(taskId)).toBe(false);
    expect(fs.existsSync(path.join(nestedProject, ".climpire-worktrees"))).toBe(false);
    expect(runGit(repo, ["branch", "--list", "climpire/nested01"])).toBe("");
    expect(logs).toContain("execution_blocked git_repo_required");
  });

  it("rejects bootstrap for a nested directory inside a parent repository", () => {
    const repo = initRepo("climpire-wt-nested-bootstrap-");
    tempDirs.push(repo);
    const nestedProject = path.join(repo, "nested-project");
    fs.mkdirSync(nestedProject, { recursive: true });
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";
    const taskId = "nested02-0000-0000-0000-000000000000";
    const taskWorktrees = new Map();
    const logs: string[] = [];
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: (_taskId, _kind, message) => logs.push(message),
      taskWorktrees,
    });

    expect(tools.createWorktree(nestedProject, taskId, "Tester")).toBeNull();
    expect(taskWorktrees.has(taskId)).toBe(false);
    expect(fs.existsSync(path.join(nestedProject, ".git"))).toBe(false);
    expect(logs).toContain("Git bootstrap cannot create a nested repository inside another working tree.");
  });

  it("accepts a linked worktree as an exact git working-tree root", () => {
    const repo = initRepo("climpire-wt-linked-");
    tempDirs.push(repo);
    const linkedRoot = path.join(repo, ".linked-root");
    runGit(repo, ["worktree", "add", linkedRoot, "-b", "test/linked-base", "HEAD"]);
    const taskId = "linked01-0000-0000-0000-000000000000";
    const taskWorktrees = new Map();
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: () => {},
      taskWorktrees,
    });

    expect(tools.isGitRepo(linkedRoot)).toBe(true);
    const worktreePath = tools.createWorktree(linkedRoot, taskId, "Tester");
    expect(worktreePath).toBeTruthy();
    expect(taskWorktrees.get(taskId)?.projectPath).toBe(linkedRoot);

    tools.cleanupWorktree(linkedRoot, taskId);
    runGit(repo, ["worktree", "remove", linkedRoot, "--force"]);
    runGit(repo, ["branch", "-D", "test/linked-base"]);
  }, 20_000);

  it("preserves explicitly enabled git bootstrap for an independent directory", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-wt-bootstrap-"));
    tempDirs.push(project);
    process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP = "1";
    const taskId = "bootstrp-0000-0000-0000-000000000000";
    const taskWorktrees = new Map();
    const tools = createWorktreeLifecycleTools({
      appendTaskLog: () => {},
      taskWorktrees,
    });

    const worktreePath = tools.createWorktree(project, taskId, "Tester");
    expect(worktreePath).toBeTruthy();
    expect(tools.isGitRepo(project)).toBe(true);
    expect(taskWorktrees.has(taskId)).toBe(true);

    tools.cleanupWorktree(project, taskId);
    expect(taskWorktrees.has(taskId)).toBe(false);
  }, 20_000);
});
