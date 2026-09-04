import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { resolveDonggriControlRoot } from "../../../config/control-root.ts";
import {
  isExactGitWorkingTreeRoot,
  isPathInsideCanonicalRoot,
  resolveGitWorkingTreeRoot,
} from "./git-repository-root.ts";

type ProjectBoundTask = {
  project_id?: string | null;
  project_path?: string | null;
};

type ExecutionPathGateErrorCode = "project_path_required" | "project_path_not_allowed" | "git_repo_required";

type ExecutionPathGateBlocked = {
  ok: false;
  statusCode: 422 | 409;
  error: ExecutionPathGateErrorCode;
  message: string;
  allowedRoots: string[];
};

type ExecutionPathGateAllowed = {
  ok: true;
  projectPath: string;
  allowedRoots: string[];
};

export type ExecutionPathGateResult = ExecutionPathGateAllowed | ExecutionPathGateBlocked;

const PATH_SCOPE_CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

function normalizeForCompare(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return PATH_SCOPE_CASE_INSENSITIVE ? normalized.toLowerCase() : normalized;
}

function normalizeProjectPathInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (candidate === "~") {
    candidate = os.homedir();
  } else if (candidate.startsWith("~/")) {
    candidate = path.join(os.homedir(), candidate.slice(2));
  }
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
  return path.normalize(absolute);
}

function parseAllowedRootsEnv(raw: string | undefined): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of text
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const normalized = normalizeProjectPathInput(token);
    if (!normalized) continue;
    const key = normalizeForCompare(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function getAllowedRoots(): string[] {
  const parsed = parseAllowedRootsEnv(process.env.PROJECT_PATH_ALLOWED_ROOTS);
  if (parsed.length > 0) return parsed;
  return getDefaultAllowedRoots();
}

function getDefaultAllowedRoots(): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];

  const pushRoot = (candidate: string) => {
    const normalized = normalizeProjectPathInput(candidate);
    if (!normalized) return;
    const key = normalizeForCompare(normalized);
    if (seen.has(key)) return;
    if (roots.length > 0 && !fs.existsSync(normalized)) return;
    seen.add(key);
    roots.push(normalized);
  };

  const projectRoot = path.resolve(process.cwd());
  pushRoot(projectRoot);

  const controlRoot = resolveDonggriControlRoot({
    envValue: process.env.DONGGRI_CONTROL_ROOT,
    repoRoot: projectRoot,
  });
  const hasConfiguredControlRoot =
    Boolean(process.env.DONGGRI_CONTROL_ROOT?.trim()) ||
    (fs.existsSync(path.join(controlRoot, "AGENTS.md")) &&
      fs.existsSync(path.join(controlRoot, "storage", "codex-control")));

  if (hasConfiguredControlRoot) {
    pushRoot(path.join(controlRoot, "repos"));
    pushRoot(path.join(controlRoot, "runtime"));
  } else {
    // A standalone clean clone has no Donggri root to infer. Permit only the
    // clone itself and conventional user project roots that actually exist.
    pushRoot(path.join(os.homedir(), "Projects"));
    pushRoot(path.join(os.homedir(), "projects"));
  }

  return roots;
}

function isPathInsideAllowedRoots(candidatePath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) =>
    isPathInsideCanonicalRoot(candidatePath, root, {
      allowMissingCandidate: true,
    }),
  );
}

function resolveTaskProjectPath(
  db: DatabaseSync,
  task: ProjectBoundTask,
  requestedProjectPath?: string | null,
): string | null {
  const requested = normalizeProjectPathInput(requestedProjectPath);
  if (requested) return requested;

  const projectId = String(task.project_id ?? "").trim();
  if (projectId) {
    const byId = db
      .prepare(
        `
          SELECT project_path
          FROM projects
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(projectId) as { project_path: string | null } | undefined;
    const fromProject = normalizeProjectPathInput(byId?.project_path ?? null);
    if (fromProject) return fromProject;
  }

  const fromTask = normalizeProjectPathInput(task.project_path);
  if (fromTask) return fromTask;
  return null;
}

export function evaluateExecutionPathGate(input: {
  db: DatabaseSync;
  task: ProjectBoundTask;
  requestedProjectPath?: string | null;
  allowGitBootstrap?: boolean;
}): ExecutionPathGateResult {
  const allowedRoots = getAllowedRoots();
  const projectPath = resolveTaskProjectPath(input.db, input.task, input.requestedProjectPath);
  if (!projectPath) {
    return {
      ok: false,
      statusCode: 422,
      error: "project_path_required",
      message: "Project path is required before execution.",
      allowedRoots,
    };
  }

  const normalizedPath = path.normalize(path.resolve(projectPath));
  if (!isPathInsideAllowedRoots(normalizedPath, allowedRoots)) {
    return {
      ok: false,
      statusCode: 422,
      error: "project_path_not_allowed",
      message: "Project path is outside allowed roots.",
      allowedRoots,
    };
  }

  const allowGitBootstrap = input.allowGitBootstrap ?? process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP === "1";
  const isExactGitRoot = isExactGitWorkingTreeRoot(normalizedPath);
  const isNestedInsideGitRoot = !isExactGitRoot && Boolean(resolveGitWorkingTreeRoot(normalizedPath));
  if (!isExactGitRoot && (!allowGitBootstrap || isNestedInsideGitRoot)) {
    return {
      ok: false,
      statusCode: 409,
      error: "git_repo_required",
      message: "Project path must be the exact root of a Git repository or linked worktree.",
      allowedRoots,
    };
  }

  return {
    ok: true,
    projectPath: normalizedPath,
    allowedRoots,
  };
}
