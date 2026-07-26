import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SEED_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const PATH_CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

function normalizeForCompare(value: string): string {
  const normalized = path.normalize(value);
  return PATH_CASE_INSENSITIVE ? normalized.toLowerCase() : normalized;
}

function assertDirectChild(parentPath: string, childPath: string): void {
  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  const relative = path.relative(resolvedParent, resolvedChild);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new Error(`e2e_git_fixture_path_outside_projects_root:${resolvedChild}`);
  }
}

function runGit(projectPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
    windowsHide: true,
  }).trim();
}

export function createE2EGitProject(seed: string): string {
  if (!SEED_PATTERN.test(seed)) {
    throw new Error(`e2e_git_fixture_seed_invalid:${seed}`);
  }

  const projectsRoot = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "projects");
  const projectPath = path.join(projectsRoot, seed);
  assertDirectChild(projectsRoot, projectPath);

  fs.mkdirSync(projectsRoot, { recursive: true });
  if (fs.existsSync(projectPath)) {
    throw new Error(`e2e_git_fixture_already_exists:${projectPath}`);
  }
  fs.mkdirSync(projectPath);

  try {
    runGit(projectPath, ["init", "-b", "main"]);
  } catch {
    runGit(projectPath, ["init"]);
    runGit(projectPath, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  }

  runGit(projectPath, ["config", "--local", "user.name", "Dongri E2E"]);
  runGit(projectPath, ["config", "--local", "user.email", "dongri-e2e@local.invalid"]);
  runGit(projectPath, ["config", "--local", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(projectPath, "README.md"), "# Dongri E2E Git fixture\n", "utf8");
  runGit(projectPath, ["add", "--", "README.md"]);
  runGit(projectPath, ["commit", "-m", "test: initialize isolated E2E project"]);

  const expectedRoot = fs.realpathSync.native(projectPath);
  const actualRoot = fs.realpathSync.native(runGit(projectPath, ["rev-parse", "--show-toplevel"]));
  if (normalizeForCompare(actualRoot) !== normalizeForCompare(expectedRoot)) {
    throw new Error(`e2e_git_fixture_root_mismatch:expected=${expectedRoot}:actual=${actualRoot}`);
  }

  const head = runGit(projectPath, ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/i.test(head)) {
    throw new Error(`e2e_git_fixture_head_invalid:${head}`);
  }

  return projectPath;
}
