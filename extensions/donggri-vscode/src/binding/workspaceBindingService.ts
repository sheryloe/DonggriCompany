import * as vscode from "vscode";
import type { DefaultProjectBindingMode, DonggriProject, WorkspaceBinding } from "../types";
import { DonggriClient } from "../api/donggriClient";
import { buildWorkspaceBindingStorageKey, findMatchingProject } from "../util/path";

export function buildWorkspaceBinding(
  project: DonggriProject,
  folder: vscode.WorkspaceFolder,
  source: WorkspaceBinding["bindingSource"],
): WorkspaceBinding {
  return {
    workspaceFolderName: folder.name,
    workspaceFolderPath: folder.uri.fsPath,
    projectId: project.id,
    projectName: project.name,
    projectPath: project.project_path,
    projectContext: project.core_goal,
    bindingSource: source,
    updatedAt: Date.now(),
  };
}

export function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    return vscode.workspace.getWorkspaceFolder(activeUri) ?? vscode.workspace.workspaceFolders?.[0];
  }

  return vscode.workspace.workspaceFolders?.[0];
}

export class WorkspaceBindingService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: DonggriClient,
  ) {}

  getCachedBinding(folder = getPrimaryWorkspaceFolder()): WorkspaceBinding | undefined {
    if (!folder) {
      return undefined;
    }

    return this.context.workspaceState.get<WorkspaceBinding>(buildWorkspaceBindingStorageKey(folder.uri.fsPath));
  }

  async bindCurrentWorkspace(options?: {
    interactive?: boolean;
    mode?: DefaultProjectBindingMode;
    coreGoal?: string;
  }): Promise<WorkspaceBinding | undefined> {
    const folder = getPrimaryWorkspaceFolder();
    if (!folder) {
      if (options?.interactive) {
        void vscode.window.showWarningMessage("Open a workspace folder first.");
      }
      return undefined;
    }

    const projects = await this.client.listAllProjects();
    const matched = findMatchingProject(projects, folder.uri.fsPath);
    if (matched) {
      const binding = buildWorkspaceBinding(matched, folder, "matched");
      await this.context.workspaceState.update(buildWorkspaceBindingStorageKey(folder.uri.fsPath), binding);
      return binding;
    }

    const mode = options?.mode ?? "match-or-create";
    if (mode === "match-only") {
      return undefined;
    }

    const coreGoal =
      options?.coreGoal ??
      (options?.interactive
        ? await vscode.window.showInputBox({
            prompt: "Donggri project core goal",
            value: `Ship ${folder.name} changes from VS Code`,
            ignoreFocusOut: true,
          })
        : undefined) ??
      `Ship ${folder.name} changes from VS Code`;

    if (!coreGoal.trim()) {
      return undefined;
    }

    const project = await this.client.createProject({
      name: folder.name,
      project_path: folder.uri.fsPath,
      core_goal: coreGoal.trim(),
    });

    const binding = buildWorkspaceBinding(project, folder, "created");
    await this.context.workspaceState.update(buildWorkspaceBindingStorageKey(folder.uri.fsPath), binding);
    return binding;
  }
}
