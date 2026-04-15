import * as vscode from "vscode";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PromptContextSnapshot } from "../types";
import { trimToLength } from "../util/text";

const execFileAsync = promisify(execFile);

export interface CollectedEditorContext extends PromptContextSnapshot {
  documentUri: vscode.Uri;
  editableRange: vscode.Range;
}

async function readGitDiff(
  workspacePath: string,
  relativePath?: string,
  scope: "activeFile" | "workspace" = "activeFile",
): Promise<string> {
  const args = ["diff", "--no-ext-diff", "--unified=3"];
  if (scope === "activeFile" && relativePath) {
    args.push("--", relativePath);
  }

  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspacePath,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

export async function collectEditorContext(options?: {
  includeFileText?: boolean;
  includeDiff?: boolean;
  diffScope?: "activeFile" | "workspace";
}): Promise<CollectedEditorContext> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Open a file in the editor first.");
  }

  const document = editor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const selectionText = editor.selection.isEmpty ? "" : document.getText(editor.selection);
  const fileText = options?.includeFileText === false ? "" : document.getText();
  const activeFileTextTruncated = fileText.length > 20_000;
  const diffScope = options?.diffScope ?? "activeFile";
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
    : path.basename(document.uri.fsPath);
  const workingDiff = options?.includeDiff
    ? await readGitDiff(workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath), relativePath, diffScope)
    : "";

  return {
    workspaceFolderName: workspaceFolder?.name,
    workspaceFolderPath: workspaceFolder?.uri.fsPath,
    filePath: document.uri.fsPath,
    relativePath,
    languageId: document.languageId,
    selectionText: selectionText || undefined,
    activeFileText: fileText ? trimToLength(fileText, 20_000) : undefined,
    activeFileTextTruncated,
    workingDiff: workingDiff ? trimToLength(workingDiff, 16_000) : undefined,
    workingDiffTruncated: Boolean(workingDiff && workingDiff.length > 16_000),
    documentUri: document.uri,
    editableRange: editor.selection.isEmpty
      ? new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
      : editor.selection,
  };
}
