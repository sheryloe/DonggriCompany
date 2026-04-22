import { useCallback, type Dispatch, type SetStateAction } from "react";
import { checkProjectPath, isApiRequestError, updateProject } from "../../api";
import type { AssignmentMode } from "../../types";
import {
  createProjectWithGitHubAutomation,
  isGitHubProjectCreateError,
  type GitHubGateReason,
  type GitHubProjectCreateError,
} from "../project-creation/github-project-flow";
import type { I18nTextMap, ManualAssignmentWarning, ProjectI18nTranslate } from "./types";
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
  staffingPolicyJson: string;
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

function messages(ko: string, en: string, ja = en, zh = en): I18nTextMap {
  return { ko, en, ja, zh };
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
  staffingPolicyJson,
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
  const buildGitHubRollbackMessage = (err: GitHubProjectCreateError, savePath: string, detail: string): string => {
    const remoteName = err.remoteRepoFullName || githubRepoName.trim() || "repository";
    const effectivePath = err.localPath || savePath;
    const detailSuffix = detail ? ` / Cause: ${detail}` : "";
    const detailSuffixKo = detail ? ` / 원인: ${detail}` : "";
    const rollback = err.rollback;

    if (rollback?.manualCleanupRequired) {
      return t(
        messages(
          `GitHub 저장소 '${remoteName}' 생성 후 프로젝트 등록 상태를 확정하지 못했습니다. 원격 저장소와 로컬 경로를 수동으로 확인하세요. 경로: ${effectivePath}${detailSuffixKo}`,
          `GitHub repository '${remoteName}' was created, but project registration state is uncertain. Verify the remote repository and local path manually. Path: ${effectivePath}${detailSuffix}`,
        ),
      );
    }

    const rollbackPartsKo: string[] = [];
    const rollbackPartsEn: string[] = [];

    if (rollback?.remoteRepoDeleted) {
      rollbackPartsKo.push("원격 저장소 삭제 완료");
      rollbackPartsEn.push("remote repository deleted");
    } else if (rollback?.remoteDeleteAttempted && rollback.remoteRepoDeleteError) {
      rollbackPartsKo.push(`원격 저장소 정리 실패: ${rollback.remoteRepoDeleteError}`);
      rollbackPartsEn.push(`remote cleanup failed: ${rollback.remoteRepoDeleteError}`);
    }

    if (rollback?.localPathDeleted) {
      rollbackPartsKo.push("로컬 clone 경로 삭제 완료");
      rollbackPartsEn.push("local clone removed");
    } else if (rollback?.localCleanupAttempted && rollback.localPathDeleteError) {
      rollbackPartsKo.push(`로컬 경로 정리 실패: ${rollback.localPathDeleteError}`);
      rollbackPartsEn.push(`local cleanup failed: ${rollback.localPathDeleteError}`);
    }

    const rollbackSummaryKo = rollbackPartsKo.length > 0 ? ` / 롤백 결과: ${rollbackPartsKo.join(", ")}` : "";
    const rollbackSummaryEn = rollbackPartsEn.length > 0 ? ` / Rollback: ${rollbackPartsEn.join(", ")}` : "";

    return t(
      messages(
        `GitHub 저장소 '${remoteName}' 생성 후 로컬 설정에 실패했습니다. 경로: ${effectivePath}${detailSuffixKo}${rollbackSummaryKo}`,
        `GitHub repository '${remoteName}' was created, but local setup failed. Path: ${effectivePath}${detailSuffix}${rollbackSummaryEn}`,
      ),
    );
  };

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
              message: t(
                messages(
                  "해당 경로는 디렉터리가 아닙니다. 디렉터리 경로를 입력하세요.",
                  "This path is not a directory. Please enter a directory path.",
                ),
              ),
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
              message: pathTools.resolvePathHelperErrorMessage(
                err,
                messages("프로젝트 경로 확인에 실패했습니다.", "Failed to verify project path."),
              ),
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
            staffing_policy_json: staffingPolicyJson.trim() ? JSON.parse(staffingPolicyJson.trim()) : undefined,
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
            staffingPolicyJson: staffingPolicyJson.trim(),
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
              message: buildGitHubRollbackMessage(err, savePath, detail),
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
            message: t(
              messages(
                "이미 존재하는 저장소 이름입니다. 다른 이름을 입력하세요.",
                "This repository name already exists. Please choose another name.",
              ),
            ),
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
            message: t(
              existingProjectName
                ? messages(
                    `동일 경로가 이미 '${existingProjectName}' 프로젝트에 등록되어 있습니다. (${existingProjectPath || "path"})`,
                    `This path is already registered by '${existingProjectName}'. (${existingProjectPath || "path"})`,
                  )
                : messages(
                    "동일 경로가 이미 다른 프로젝트에 등록되어 있습니다.",
                    "This path is already registered by another project.",
                  ),
            ),
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
          message: pathTools.resolvePathHelperErrorMessage(
            err,
            messages(
              "프로젝트 저장에 실패했습니다. 입력값을 확인하세요.",
              "Failed to save project. Please check your inputs.",
            ),
          ),
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
      getManualAssignmentWarning,
      githubAutoCreateEnabled,
      githubRepoName,
      githubRepoPrivate,
      loadProjects,
      name,
      onRequireGitHubConnection,
      pathTools,
      projectPath,
      saving,
      search,
      selectedAgentIds,
      staffingPolicyJson,
      setEditingProjectId,
      setIsCreating,
      setManualAssignmentWarning,
      setProjectPath,
      setSaving,
      setSelectedProjectId,
      t,
      buildGitHubRollbackMessage,
    ],
  );
}
