import * as vscode from "vscode";
import { registerDonggriChatParticipant } from "./chat";
import { isDonggriConfigChange } from "./config";
import { DonggriExtensionController } from "./controller";
import { registerDonggriTools } from "./tools";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new DonggriExtensionController(context);
  context.subscriptions.push(controller);

  context.subscriptions.push(
    vscode.commands.registerCommand("donggri.bindProject", async () => {
      await controller.bindProject(true);
      await controller.refreshState(false);
    }),
    vscode.commands.registerCommand("donggri.reviewSelection", async () => {
      const result = await controller.reviewCurrentContext({
        mode: "selection",
        prompt: "Review the current selection or active file.",
      });
      await controller.showMarkdownDocument("Donggri Review", result.text);
    }),
    vscode.commands.registerCommand("donggri.reviewDiff", async () => {
      const result = await controller.reviewCurrentContext({
        mode: "diff",
        prompt: "Review the current workspace diff.",
      });
      await controller.showMarkdownDocument("Donggri Diff Review", result.text);
    }),
    vscode.commands.registerCommand("donggri.createTask", async () => {
      await controller.createTaskFromCurrentContext("Implement the requested change from the current VS Code context.");
    }),
    vscode.commands.registerCommand("donggri.runTask", async (taskId?: string) => {
      await controller.runTask(taskId);
    }),
    vscode.commands.registerCommand("donggri.pauseTask", async (taskId?: string) => {
      await controller.pauseTask(taskId);
    }),
    vscode.commands.registerCommand("donggri.resumeTask", async (taskId?: string) => {
      await controller.resumeTask(taskId);
    }),
    vscode.commands.registerCommand("donggri.openDecisionInbox", async (decisionId?: string) => {
      await controller.openDecisionInbox(decisionId);
    }),
    vscode.commands.registerCommand("donggri.applyPendingEdit", async (editId: string) => {
      await controller.applyPendingEdit(editId);
    }),
    vscode.commands.registerCommand("donggri.refreshState", async () => {
      await controller.refreshState(true);
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!isDonggriConfigChange(event)) {
        return;
      }

      await controller.refreshState(false);
      await controller.wsClient.connect();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await controller.refreshState(false);
    }),
  );

  registerDonggriChatParticipant(context, controller);
  registerDonggriTools(context, controller);
  await controller.initialize();
}

export function deactivate(): void {}
