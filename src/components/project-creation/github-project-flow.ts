import {
  checkProjectPath,
  browseProjectPath,
  cloneGitHubRepo,
  createGitHubRepo,
  deleteGitHubLocalPath,
  deleteGitHubRepo,
  createProject,
  getCloneStatus,
  getGitHubStatus,
  isApiRequestError,
} from "../../api";
import type { GitHubCreateRepoResponse, GitHubStatus } from "../../api";
import type { AssignmentMode, Project } from "../../types";

const CLONE_POLL_INTERVAL_MS = 1_000;
const CLONE_TIMEOUT_MS = 120_000;

export type GitHubGateReason = "not_connected" | "missing_repo_scope";
type GitHubProjectFailureStage = "status" | "create_repo" | "clone" | "create_project" | null;

export interface GitHubRollbackStatus {
  attempted: boolean;
  remoteDeleteAttempted: boolean;
  remoteRepoDeleted: boolean;
  remoteRepoDeleteError: string | null;
  localCleanupAttempted: boolean;
  localPathDeleted: boolean;
  localPathDeleteError: string | null;
  manualCleanupRequired: boolean;
}

export class GitHubProjectCreateError extends Error {
  readonly code: string;
  readonly gateReason: GitHubGateReason | null;
  readonly remoteRepoFullName: string | null;
  readonly localPath: string | null;
  readonly stage: GitHubProjectFailureStage;
  readonly causeDetail: unknown;
  readonly rollback: GitHubRollbackStatus | null;

  constructor(
    message: string,
    options: {
      code: string;
      gateReason?: GitHubGateReason | null;
      remoteRepoFullName?: string | null;
      localPath?: string | null;
      stage?: GitHubProjectFailureStage;
      causeDetail?: unknown;
      rollback?: GitHubRollbackStatus | null;
    },
  ) {
    super(message);
    this.name = "GitHubProjectCreateError";
    this.code = options.code;
    this.gateReason = options.gateReason ?? null;
    this.remoteRepoFullName = options.remoteRepoFullName ?? null;
    this.localPath = options.localPath ?? null;
    this.stage = options.stage ?? null;
    this.causeDetail = options.causeDetail;
    this.rollback = options.rollback ?? null;
  }
}

export function isGitHubProjectCreateError(error: unknown): error is GitHubProjectCreateError {
  return error instanceof GitHubProjectCreateError;
}

export function slugifyRepositoryName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 100);
  return slug || "new-repo";
}

export function joinProjectPath(root: string, leaf: string): string {
  const base = root.trim();
  if (!base) return "";
  const name = leaf.trim();
  if (!name) return base;
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${separator}${name.replace(/^[\\/]+/, "")}`;
}

export async function getDefaultProjectRoot(): Promise<string> {
  try {
    const result = await browseProjectPath();
    return result.current_path.trim();
  } catch {
    // The browser cannot safely infer a host filesystem root. Keep the field
    // empty until the server projects a configured/allowed location.
    return "";
  }
}

export function resolveGitHubGateReason(status: GitHubStatus): GitHubGateReason | null {
  if (!status.connected) return "not_connected";
  if (!status.has_repo_scope) return "missing_repo_scope";
  return null;
}

function splitRepoFullName(fullName: string): { owner: string; repo: string } | null {
  const [owner, repo] = fullName.split("/", 2).map((part) => part.trim());
  if (!owner || !repo) return null;
  return { owner, repo };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createRollbackStatus(overrides?: Partial<GitHubRollbackStatus>): GitHubRollbackStatus {
  return {
    attempted: false,
    remoteDeleteAttempted: false,
    remoteRepoDeleted: false,
    remoteRepoDeleteError: null,
    localCleanupAttempted: false,
    localPathDeleted: false,
    localPathDeleteError: null,
    manualCleanupRequired: false,
    ...(overrides ?? {}),
  };
}

async function didPathExist(pathValue: string): Promise<boolean> {
  try {
    const result = await checkProjectPath(pathValue);
    return result.exists;
  } catch {
    return false;
  }
}

async function rollbackGitHubBootstrap(options: {
  owner: string;
  repo: string;
  localPath: string | null;
  localPathCreatedByFlow: boolean;
  stage: "clone" | "create_project";
  cause: unknown;
}): Promise<GitHubRollbackStatus> {
  const canAutoRollback = options.stage === "clone" || isApiRequestError(options.cause);
  const rollback = createRollbackStatus({
    attempted: canAutoRollback,
    manualCleanupRequired: options.stage === "create_project" && !canAutoRollback,
  });

  if (!canAutoRollback) {
    return rollback;
  }

  rollback.remoteDeleteAttempted = true;
  try {
    await deleteGitHubRepo(options.owner, options.repo);
    rollback.remoteRepoDeleted = true;
  } catch (error) {
    rollback.remoteRepoDeleteError = formatErrorMessage(error);
  }

  if (options.localPathCreatedByFlow && options.localPath) {
    rollback.localCleanupAttempted = true;
    try {
      const cleanup = await deleteGitHubLocalPath(options.localPath);
      rollback.localPathDeleted = cleanup.removed === true;
    } catch (error) {
      rollback.localPathDeleteError = formatErrorMessage(error);
    }
  }

  return rollback;
}

async function waitForCloneCompletion(cloneId: string): Promise<void> {
  const deadline = Date.now() + CLONE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getCloneStatus(cloneId);
    if (status.status === "done") return;
    if (status.status === "error") {
      throw new Error(status.error || "Clone failed");
    }
    await sleep(CLONE_POLL_INTERVAL_MS);
  }
  throw new Error("Clone timed out");
}

export interface CreateProjectWithGitHubAutomationInput {
  name: string;
  coreGoal: string;
  projectPath: string;
  createPathIfMissing?: boolean;
  assignmentMode?: AssignmentMode;
  agentIds?: string[];
  staffingPolicyJson?: string;
  github: {
    enabled: boolean;
    repoName: string;
    private: boolean;
  };
}

export interface CreateProjectWithGitHubAutomationResult {
  project: Project;
  remoteRepo: GitHubCreateRepoResponse["repo"] | null;
  projectPath: string;
}

export async function createProjectWithGitHubAutomation(
  input: CreateProjectWithGitHubAutomationInput,
): Promise<CreateProjectWithGitHubAutomationResult> {
  if (!input.github.enabled) {
    const project = await createProject({
      name: input.name,
      project_path: input.projectPath,
      core_goal: input.coreGoal,
      create_path_if_missing: input.createPathIfMissing,
      assignment_mode: input.assignmentMode,
      agent_ids: input.assignmentMode === "manual" ? (input.agentIds ?? []) : [],
      staffing_policy_json: input.staffingPolicyJson ? JSON.parse(input.staffingPolicyJson) : undefined,
    });
    return {
      project,
      remoteRepo: null,
      projectPath: input.projectPath,
    };
  }

  const githubStatus = await getGitHubStatus();
  const gateReason = resolveGitHubGateReason(githubStatus);
  if (gateReason) {
    throw new GitHubProjectCreateError("GitHub connection is required", {
      code: "github_connection_required",
      gateReason,
      stage: "status",
    });
  }

  const projectPathExistedAtStart = await didPathExist(input.projectPath);

  const remoteRepo = (
    await createGitHubRepo({
      name: input.github.repoName,
      private: input.github.private,
    })
  ).repo;

  const repoOwner = splitRepoFullName(remoteRepo.full_name);
  if (!repoOwner) {
    throw new GitHubProjectCreateError("Remote repository metadata is invalid", {
      code: "github_repo_metadata_invalid",
      remoteRepoFullName: remoteRepo.full_name,
      localPath: input.projectPath,
      stage: "create_repo",
    });
  }

  let resolvedProjectPath = input.projectPath;
  let stage: "clone" | "create_project" = "clone";
  let localPathCreatedByFlow = false;
  try {
    const cloneResult = await cloneGitHubRepo({
      owner: repoOwner.owner,
      repo: repoOwner.repo,
      branch: remoteRepo.default_branch ?? undefined,
      target_path: input.projectPath,
    });

    resolvedProjectPath = cloneResult.target_path || input.projectPath;
    localPathCreatedByFlow = !projectPathExistedAtStart && cloneResult.already_exists !== true;
    if (cloneResult.clone_id) {
      await waitForCloneCompletion(cloneResult.clone_id);
    }

    stage = "create_project";
    const project = await createProject({
      name: input.name,
      project_path: resolvedProjectPath,
      core_goal: input.coreGoal,
      create_path_if_missing: input.createPathIfMissing,
      assignment_mode: input.assignmentMode,
      agent_ids: input.assignmentMode === "manual" ? (input.agentIds ?? []) : [],
      staffing_policy_json: input.staffingPolicyJson ? JSON.parse(input.staffingPolicyJson) : undefined,
      github_repo: remoteRepo.full_name,
    });

    return {
      project,
      remoteRepo,
      projectPath: resolvedProjectPath,
    };
  } catch (error) {
    const rollback = await rollbackGitHubBootstrap({
      owner: repoOwner.owner,
      repo: repoOwner.repo,
      localPath: resolvedProjectPath,
      localPathCreatedByFlow,
      stage,
      cause: error,
    });
    throw new GitHubProjectCreateError("GitHub repository was created but local setup failed", {
      code: "github_repo_created_but_local_setup_failed",
      remoteRepoFullName: remoteRepo.full_name,
      localPath: resolvedProjectPath,
      stage,
      causeDetail: error,
      rollback,
    });
  }
}
