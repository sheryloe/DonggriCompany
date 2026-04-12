import { useCallback, type Dispatch, type SetStateAction } from "react";
import { checkProjectPath, createProject, isApiRequestError, updateProject } from "../../api";
import type { AssignmentMode } from "../../types";
import {
  createProjectWithGitHubAutomation,
  isGitHubProjectCreateError,
  type GitHubGateReason,
} from "../project-creation/github-project-flow";
import type { ManualAssignmentWarning, ProjectI18nTranslate } from "./types";
import type { ProjectManagerPathTools } from "./useProjectManagerPathTools";

interface UseProjectSaveHandlerParams {
  canSave: boolean;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  assignmentMode: AssignmentMode;
  getManualAssignmentWarning: () => ManualAssignmentWarning["reason"] | null;
  setManualAssignmentWarning: Dispatch<SetStateAction<ManualAssignmentWarning | null>>;
  projectPath: string;
  setProjectPath: Dispatch<SetStateAction<string>>;
  pathTools: ProjectManagerPathTools;
  editingProjectId: string | null;
  name: string;
  coreGoal: string;
  selectedAgentIds: Set<string>;
  githubAutoCreateEnabled: boolean;
  githubRepoName: string;
  githubRepoPrivate: boolean;
  onRequireGitHubConnection: (
    reason: GitHubGateReason,
    options: { allowCreateMissingPath: boolean; bypassManualWarning: boolean },
  ) => void;
  loadProjects: (targetPage: number, keyword: string) => Promise<void>;
  search: string;
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
  setEditingProjectId: Dispatch<SetStateAction<string | null>>;
  setIsCreating: Dispatch<SetStateAction<boolean>>;
  t: ProjectI18nTranslate;
}

export function useProjectSaveHandler({
  canSave,
  saving,
  setSaving,
  assignmentMode,
  getManualAssignmentWarning,
  setManualAssignmentWarning,
  projectPath,
  setProjectPath,
  pathTools,
  editingProjectId,
  name,
  coreGoal,
  selectedAgentIds,
  githubAutoCreateEnabled,
  githubRepoName,
  githubRepoPrivate,
  onRequireGitHubConnection,
  loadProjects,
  search,
  setSelectedProjectId,
  setEditingProjectId,
  setIsCreating,
  t,
}: UseProjectSaveHandlerParams) {
  return useCallback(
    async (allowCreateMissingPath = false, bypassManualWarning = false) => {
      if (!canSave || saving) return;
      if (!bypassManualWarning && assignmentMode === "manual") {
        const warningReason = getManualAssignmentWarning();
        if (warningReason) {
          setManualAssignmentWarning({ reason: warningReason, allowCreateMissingPath });
          return;
        }
      }
      pathTools.setFormFeedback(null);
      let savePath = projectPath.trim();
      let createPathIfMissing = allowCreateMissingPath;

      if (!allowCreateMissingPath) {
        try {
          const pathCheck = await checkProjectPath(savePath);
          savePath = pathCheck.normalized_path || savePath;
          if (savePath !== projectPath.trim()) {
            setProjectPath(savePath);
          }
          if (pathCheck.exists && !pathCheck.is_directory) {
            pathTools.setFormFeedback({
              tone: "error",
              message: t({
                ko: "해당 경로는 폴더가 아닙니다. 디렉터리 경로를 입력해주세요.",
                en: "This path is not a directory. Please enter a directory path.",
                ja: "このパスはフォルダではありません。ディレクトリパスを入力してください。",
                zh: "该路径不是文件夹，请输入目录路径。",
              }),
            });
            return;
          }
          if (!pathCheck.exists) {
            pathTools.setMissingPathPrompt({
              normalizedPath: pathCheck.normalized_path || savePath,
              canCreate: pathCheck.can_create,
              nearestExistingParent: pathCheck.nearest_existing_parent,
            });
            return;
          }
          createPathIfMissing = false;
        } catch (err) {
          console.error("Failed to check project path:", err);
          if (isApiRequestError(err) && err.status === 404) {
            pathTools.setPathApiUnsupported(true);
            createPathIfMissing = true;
            pathTools.setFormFeedback({ tone: "info", message: pathTools.unsupportedPathApiMessage });
          } else {
            pathTools.setFormFeedback({
              tone: "error",
              message: pathTools.resolvePathHelperErrorMessage(err, {
                ko: "프로젝트 경로 확인에 실패했습니다.",
                en: "Failed to verify project path.",
                ja: "プロジェクトパスの確認に失敗しました。",
                zh: "项目路径校验失败。",
              }),
            });
            return;
          }
        }
      }

      setSaving(true);
      try {
        if (editingProjectId) {
          const updated = await updateProject(editingProjectId, {
            name: name.trim(),
            project_path: savePath,
            core_goal: coreGoal.trim(),
            create_path_if_missing: createPathIfMissing,
            assignment_mode: assignmentMode,
            agent_ids: assignmentMode === "manual" ? Array.from(selectedAgentIds) : [],
          });
          setSelectedProjectId(updated.id);
        } else {
          const created = await createProjectWithGitHubAutomation({
            name: name.trim(),
            coreGoal: coreGoal.trim(),
            projectPath: savePath,
            createPathIfMissing,
            assignmentMode,
            agentIds: assignmentMode === "manual" ? Array.from(selectedAgentIds) : [],
            github: {
              enabled: githubAutoCreateEnabled,
              repoName: githubRepoName.trim(),
              private: githubRepoPrivate,
            },
          });
          setSelectedProjectId(created.project.id);
        }
        await loadProjects(1, search);
        setEditingProjectId(null);
        setIsCreating(false);
        setManualAssignmentWarning(null);
        pathTools.resetPathHelperState();
      } catch (err) {
        console.error("Failed to save project:", err);
        if (isGitHubProjectCreateError(err)) {
          if (err.code === "github_connection_required" && err.gateReason) {
            onRequireGitHubConnection(err.gateReason, { allowCreateMissingPath, bypassManualWarning });
            return;
          }
          if (err.code === "github_repo_created_but_local_setup_failed") {
            const detail =
              err.causeDetail instanceof Error
                ? err.causeDetail.message
                : typeof err.causeDetail === "string"
                  ? err.causeDetail
                  : "";
            pathTools.setFormFeedback({
              tone: "error",
              message: t({
                ko: `GitHub 레포 '${err.remoteRepoFullName || githubRepoName.trim() || "repository"}'는 생성됐지만 로컬 설정에 실패했습니다. 원격 레포는 유지됩니다. 경로: ${err.localPath || savePath}${detail ? ` / 원인: ${detail}` : ""}`,
                en: `GitHub repository '${err.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${err.localPath || savePath}${detail ? ` / Cause: ${detail}` : ""}`,
                ja: `GitHub repository '${err.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${err.localPath || savePath}${detail ? ` / Cause: ${detail}` : ""}`,
                zh: `GitHub repository '${err.remoteRepoFullName || githubRepoName.trim() || "repository"}' was created, but local setup failed. The remote repository was kept. Path: ${err.localPath || savePath}${detail ? ` / Cause: ${detail}` : ""}`,
              }),
            });
            return;
          }
        }
        if (isApiRequestError(err) && err.code === "github_not_connected") {
          onRequireGitHubConnection("not_connected", { allowCreateMissingPath, bypassManualWarning });
          return;
        }
        if (isApiRequestError(err) && err.code === "repo_name_conflict") {
          pathTools.setFormFeedback({
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
        if (isApiRequestError(err) && err.code === "project_path_conflict") {
          const details =
            (err.details as {
              existing_project_name?: unknown;
              existing_project_path?: unknown;
            } | null) ?? null;
          const existingProjectName =
            typeof details?.existing_project_name === "string" ? details.existing_project_name : "";
          const existingProjectPath =
            typeof details?.existing_project_path === "string" ? details.existing_project_path : "";
          pathTools.setFormFeedback({
            tone: "info",
            message: t({
              ko: existingProjectName
                ? `동일 경로가 이미 '${existingProjectName}' 프로젝트에 등록되어 있습니다. (${existingProjectPath || "path"})`
                : "동일 경로가 이미 다른 프로젝트에 등록되어 있습니다.",
              en: existingProjectName
                ? `This path is already registered by '${existingProjectName}'. (${existingProjectPath || "path"})`
                : "This path is already registered by another project.",
              ja: existingProjectName
                ? `このパスは既に '${existingProjectName}' に登録されています。(${existingProjectPath || "path"})`
                : "このパスは既に別のプロジェクトに登録されています。",
              zh: existingProjectName
                ? `该路径已被‘${existingProjectName}’注册。(${existingProjectPath || "path"})`
                : "该路径已被其他项目注册。",
            }),
          });
          return;
        }
        if (isApiRequestError(err) && err.code === "project_path_not_found") {
          const details =
            (err.details as {
              normalized_path?: unknown;
              can_create?: unknown;
              nearest_existing_parent?: unknown;
            } | null) ?? null;
          pathTools.setMissingPathPrompt({
            normalizedPath: typeof details?.normalized_path === "string" ? details.normalized_path : savePath,
            canCreate: Boolean(details?.can_create),
            nearestExistingParent:
              typeof details?.nearest_existing_parent === "string" ? details.nearest_existing_parent : null,
          });
          return;
        }
        pathTools.setFormFeedback({
          tone: "error",
          message: pathTools.resolvePathHelperErrorMessage(err, {
            ko: "프로젝트 저장에 실패했습니다. 입력값을 확인해주세요.",
            en: "Failed to save project. Please check your inputs.",
            ja: "プロジェクト保存に失敗しました。入力値を確認してください。",
            zh: "项目保存失败，请检查输入值。",
          }),
        });
      } finally {
        setSaving(false);
      }
    },
    [
      assignmentMode,
      canSave,
      coreGoal,
      editingProjectId,
      githubAutoCreateEnabled,
      githubRepoName,
      githubRepoPrivate,
      getManualAssignmentWarning,
      loadProjects,
      name,
      onRequireGitHubConnection,
      pathTools,
      projectPath,
      saving,
      search,
      selectedAgentIds,
      setEditingProjectId,
      setIsCreating,
      setManualAssignmentWarning,
      setProjectPath,
      setSaving,
      setSelectedProjectId,
      t,
    ],
  );
}
