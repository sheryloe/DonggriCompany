import type { Dispatch, SetStateAction } from "react";
import { checkProjectPath, createProject, getProjects, isApiRequestError } from "../../../api";
import type { Project, TaskType, WorkflowPackKey } from "../../../types";
import {
  createProjectWithGitHubAutomation,
  isGitHubProjectCreateError,
  type GitHubGateReason,
} from "../../project-creation/github-project-flow";
import type { FormFeedback, Locale, MissingPathPrompt, TFunction } from "../constants";

type CreateTaskHandler = (input: {
  title: string;
  description?: string;
  department_id?: string;
  task_type?: string;
  priority?: number;
  project_id?: string;
  project_path?: string;
  assigned_agent_id?: string;
  workflow_pack_key?: WorkflowPackKey;
}) => void | Promise<void>;

type ResolvePathHelperErrorMessage = (error: unknown, fallback: Record<Locale, string>) => string;

export type SubmitTaskOptions = {
  allowCreateMissingPath?: boolean;
  allowWithoutProject?: boolean;
};

interface SubmitTaskContext {
  title: string;
  description: string;
  departmentId: string;
  taskType: TaskType;
  priority: number;
  assignAgentId: string;
  projectId: string;
  projectQuery: string;
  createNewProjectMode: boolean;
  newProjectPath: string;
  githubAutoCreateEnabled: boolean;
  githubRepoName: string;
  githubRepoPrivate: boolean;
  selectedProject: Project | null;
  projects: Project[];
  submitBusy: boolean;
  t: TFunction;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: ResolvePathHelperErrorMessage;
  onCreate: CreateTaskHandler;
  onClose: () => void;
  selectProject: (project: Project | null) => void;
  setFormFeedback: (feedback: FormFeedback | null) => void;
  setSubmitWithoutProjectPromptOpen: (open: boolean) => void;
  setSubmitBusy: (busy: boolean) => void;
  setProjectId: (projectId: string) => void;
  setProjectQuery: (query: string) => void;
  setCreateNewProjectMode: (enabled: boolean) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setMissingPathPrompt: (prompt: MissingPathPrompt | null) => void;
  setNewProjectPath: (path: string) => void;
  setPathApiUnsupported: (unsupported: boolean) => void;
  setProjectDropdownOpen: (open: boolean) => void;
  onRequireGitHubConnection: (reason: GitHubGateReason, options: SubmitTaskOptions) => void;
}

function resolveProjectFromQuery(projects: Project[], projectQuery: string): Project | null {
  const query = projectQuery.trim().toLowerCase();
  if (!query) return null;

  const exact = projects.find(
    (project) => project.name.toLowerCase() === query || project.project_path.toLowerCase() === query,
  );
  if (exact) return exact;

  const prefixMatches = projects.filter(
    (project) => project.name.toLowerCase().startsWith(query) || project.project_path.toLowerCase().startsWith(query),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

function getRecoveryDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

export async function submitTaskWithProjectHandling(
  context: SubmitTaskContext,
  options: SubmitTaskOptions = {},
): Promise<void> {
  const allowCreateMissingPath = options.allowCreateMissingPath ?? false;
  const allowWithoutProject = options.allowWithoutProject ?? false;
  const {
    title,
    description,
    departmentId,
    taskType,
    priority,
    assignAgentId,
    projectId,
    projectQuery,
    createNewProjectMode,
    newProjectPath,
    githubAutoCreateEnabled,
    githubRepoName,
    githubRepoPrivate,
    selectedProject,
    projects,
    submitBusy,
    t,
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    onCreate,
    onClose,
    selectProject,
    setFormFeedback,
    setSubmitWithoutProjectPromptOpen,
    setSubmitBusy,
    setProjectId,
    setProjectQuery,
    setCreateNewProjectMode,
    setProjects,
    setMissingPathPrompt,
    setNewProjectPath,
    setPathApiUnsupported,
    setProjectDropdownOpen,
    onRequireGitHubConnection,
  } = context;

  if (!title.trim() || submitBusy) return;

  setFormFeedback(null);
  setSubmitWithoutProjectPromptOpen(false);

  let resolvedProject = selectedProject;
  if (!resolvedProject && projectQuery.trim()) {
    resolvedProject = resolveProjectFromQuery(projects, projectQuery);
  }

  if (projectId && !resolvedProject) {
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "선택한 프로젝트를 찾지 못했습니다. 다시 선택해 주세요.",
        en: "The selected project was not found. Please select again.",
        ja: "The selected project was not found. Please select again.",
        zh: "The selected project was not found. Please select again.",
      }),
    });
    return;
  }

  if (!resolvedProject && projectQuery.trim() && !createNewProjectMode) {
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "입력한 프로젝트를 확정하지 못했습니다. 목록에서 선택하거나 비워서 계속해 주세요.",
        en: "Could not resolve the typed project. Pick from the list or clear it to continue.",
        ja: "Could not resolve the typed project. Pick from the list or clear it to continue.",
        zh: "Could not resolve the typed project. Pick from the list or clear it to continue.",
      }),
    });
    setProjectDropdownOpen(true);
    return;
  }

  if (!resolvedProject && createNewProjectMode) {
    const projectName = projectQuery.trim();
    const coreGoal = description.trim();
    if (!projectName) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "새 프로젝트 이름을 입력해 주세요.",
          en: "Please enter a new project name.",
          ja: "Please enter a new project name.",
          zh: "Please enter a new project name.",
        }),
      });
      return;
    }
    if (!newProjectPath.trim()) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "새 프로젝트 경로를 입력해 주세요.",
          en: "Please enter a new project path.",
          ja: "Please enter a new project path.",
          zh: "Please enter a new project path.",
        }),
      });
      return;
    }
    if (githubAutoCreateEnabled && !githubRepoName.trim()) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "레포지토리 이름을 입력해 주세요.",
          en: "Please enter a repository name.",
          ja: "Please enter a repository name.",
          zh: "Please enter a repository name.",
        }),
      });
      return;
    }
    if (!coreGoal) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "설명은 새 프로젝트 생성 시 필수이며 프로젝트 핵심 목표로 저장됩니다.",
          en: "Description is required for new project creation and will be saved as the project core goal.",
          ja: "Description is required for new project creation and will be saved as the project core goal.",
          zh: "Description is required for new project creation and will be saved as the project core goal.",
        }),
      });
      return;
    }

    setSubmitBusy(true);
    let normalizedPathForRecovery = newProjectPath.trim();
    try {
      const rawNewProjectPath = newProjectPath.trim();
      let normalizedPath = rawNewProjectPath;
      let createPathIfMissing = true;

      try {
        const pathCheck = await checkProjectPath(rawNewProjectPath);
        normalizedPath = pathCheck.normalized_path || rawNewProjectPath;
        normalizedPathForRecovery = normalizedPath;
        if (normalizedPath !== rawNewProjectPath) {
          setNewProjectPath(normalizedPath);
        }

        if (pathCheck.exists && !pathCheck.is_directory) {
          setFormFeedback({
            tone: "error",
            message: t({
              ko: "입력한 경로가 디렉터리가 아닙니다. 디렉터리 경로를 입력해 주세요.",
              en: "The path is not a directory. Please enter a directory path.",
              ja: "The path is not a directory. Please enter a directory path.",
              zh: "The path is not a directory. Please enter a directory path.",
            }),
          });
          return;
        }

        if (!pathCheck.exists && !allowCreateMissingPath) {
          setMissingPathPrompt({
            normalizedPath,
            canCreate: pathCheck.can_create,
            nearestExistingParent: pathCheck.nearest_existing_parent,
          });
          return;
        }

        createPathIfMissing = !pathCheck.exists && allowCreateMissingPath;
      } catch (pathCheckError) {
        if (isApiRequestError(pathCheckError) && pathCheckError.status === 404) {
          setPathApiUnsupported(true);
          setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
          createPathIfMissing = true;
          normalizedPathForRecovery = rawNewProjectPath;
        } else {
          setFormFeedback({
            tone: "error",
            message: resolvePathHelperErrorMessage(pathCheckError, {
              ko: "프로젝트 경로 확인에 실패했습니다.",
              en: "Failed to verify project path.",
              ja: "Failed to verify project path.",
              zh: "Failed to verify project path.",
            }),
          });
          return;
        }
      }

      const createdProjectResult = githubAutoCreateEnabled
        ? await createProjectWithGitHubAutomation({
            name: projectName,
            coreGoal,
            projectPath: normalizedPath,
            createPathIfMissing,
            github: {
              enabled: true,
              repoName: githubRepoName.trim(),
              private: githubRepoPrivate,
            },
          })
        : {
            project: await createProject({
              name: projectName,
              project_path: normalizedPath,
              core_goal: coreGoal,
              create_path_if_missing: createPathIfMissing,
            }),
          };

      const createdProject = createdProjectResult.project;
      setMissingPathPrompt(null);
      resolvedProject = createdProject;
      setProjectId(createdProject.id);
      setProjectQuery(createdProject.name);
      setCreateNewProjectMode(false);
      setProjects((prev) => {
        if (prev.some((project) => project.id === createdProject.id)) return prev;
        return [createdProject, ...prev];
      });
    } catch (error) {
      console.error("Failed to create project during task creation:", error);

      if (isGitHubProjectCreateError(error)) {
        if (error.code === "github_connection_required" && error.gateReason) {
          onRequireGitHubConnection(error.gateReason, options);
          return;
        }
        if (error.code === "github_repo_created_but_local_setup_failed") {
          const recoveryPath = error.localPath || normalizedPathForRecovery;
          const detail = getRecoveryDetail(error.causeDetail);
          setFormFeedback({
            tone: "error",
            message: t({
              ko: `GitHub 레포 '${error.remoteRepoFullName || githubRepoName.trim() || "repository"}'는 생성됐지만 로컬 설정에 실패했습니다. 원격 레포는 유지됩니다. 경로: ${recoveryPath}${detail ? ` / 원인: ${detail}` : ""}`,
              en: `GitHub repository '${error.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${recoveryPath}${detail ? ` / Cause: ${detail}` : ""}`,
              ja: `GitHub repository '${error.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${recoveryPath}${detail ? ` / Cause: ${detail}` : ""}`,
              zh: `GitHub repository '${error.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${recoveryPath}${detail ? ` / Cause: ${detail}` : ""}`,
            }),
          });
          return;
        }
      }

      if (isApiRequestError(error) && error.code === "github_not_connected") {
        onRequireGitHubConnection("not_connected", options);
        return;
      }

      if (isApiRequestError(error) && error.code === "repo_name_conflict") {
        setFormFeedback({
          tone: "error",
          message: t({
            ko: "이미 존재하는 레포지토리명입니다. 다른 이름을 입력해 주세요.",
            en: "This repository name already exists. Please choose another name.",
            ja: "This repository name already exists. Please choose another name.",
            zh: "This repository name already exists. Please choose another name.",
          }),
        });
        return;
      }

      if (isApiRequestError(error) && error.code === "project_path_conflict") {
        const details =
          (error.details as {
            existing_project_id?: unknown;
            existing_project_name?: unknown;
            existing_project_path?: unknown;
          } | null) ?? null;
        const existingProjectId = typeof details?.existing_project_id === "string" ? details.existing_project_id : "";
        const existingProjectName =
          typeof details?.existing_project_name === "string" ? details.existing_project_name : "";
        const existingProjectPath =
          typeof details?.existing_project_path === "string" ? details.existing_project_path : "";
        const existingProject = projects.find(
          (project) =>
            (existingProjectId && project.id === existingProjectId) ||
            (existingProjectPath && project.project_path === existingProjectPath),
        );

        if (existingProject) {
          selectProject(existingProject);
        } else {
          setCreateNewProjectMode(false);
          setProjectDropdownOpen(true);
          void getProjects({ page: 1, page_size: 50 })
            .then((response) => setProjects(response.projects))
            .catch((loadError) => {
              console.error("Failed to refresh projects after path conflict:", loadError);
            });
        }

        setFormFeedback({
          tone: "info",
          message: t({
            ko: existingProjectName
              ? `이 경로는 이미 '${existingProjectName}' 프로젝트가 사용 중입니다. 기존 프로젝트를 선택해 주세요.`
              : "이 경로는 이미 다른 프로젝트가 사용 중입니다. 기존 프로젝트를 선택해 주세요.",
            en: existingProjectName
              ? `This path is already used by '${existingProjectName}'. Please use the existing project.`
              : "This path is already used by another project. Please use the existing project.",
            ja: existingProjectName
              ? `This path is already used by '${existingProjectName}'. Please use the existing project.`
              : "This path is already used by another project. Please use the existing project.",
            zh: existingProjectName
              ? `This path is already used by '${existingProjectName}'. Please use the existing project.`
              : "This path is already used by another project. Please use the existing project.",
          }),
        });
        return;
      }

      if (isApiRequestError(error) && error.code === "project_path_not_found") {
        const details =
          (error.details as {
            normalized_path?: unknown;
            can_create?: unknown;
            nearest_existing_parent?: unknown;
          } | null) ?? null;
        setMissingPathPrompt({
          normalizedPath:
            typeof details?.normalized_path === "string" ? details.normalized_path : newProjectPath.trim(),
          canCreate: Boolean(details?.can_create),
          nearestExistingParent:
            typeof details?.nearest_existing_parent === "string" ? details.nearest_existing_parent : null,
        });
        return;
      }

      setFormFeedback({
        tone: "error",
        message: resolvePathHelperErrorMessage(error, {
          ko: "새 프로젝트 생성에 실패했습니다. 이름과 경로를 확인해 주세요.",
          en: "Failed to create a new project. Please check name/path.",
          ja: "Failed to create a new project. Please check name/path.",
          zh: "Failed to create a new project. Please check name/path.",
        }),
      });
      return;
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!resolvedProject && !allowWithoutProject) {
    setSubmitWithoutProjectPromptOpen(true);
    return;
  }

  setSubmitBusy(true);
  try {
    await Promise.resolve(
      onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        department_id: departmentId || undefined,
        task_type: taskType,
        priority,
        project_id: resolvedProject?.id,
        project_path: resolvedProject?.project_path,
        assigned_agent_id: assignAgentId || undefined,
      }),
    );
    onClose();
  } catch (error) {
    console.error("Failed to create task:", error);
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "업무 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        en: "Failed to create task. Please try again shortly.",
        ja: "Failed to create task. Please try again shortly.",
        zh: "Failed to create task. Please try again shortly.",
      }),
    });
  } finally {
    setSubmitBusy(false);
  }
}
