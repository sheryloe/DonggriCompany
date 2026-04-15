import * as vscode from "vscode";
import { DonggriExtensionController } from "./controller";

function toCommand(command: string, title: string, ...arguments_: unknown[]): vscode.Command {
  return {
    command,
    title,
    arguments: arguments_,
  };
}

export function registerDonggriChatParticipant(
  context: vscode.ExtensionContext,
  controller: DonggriExtensionController,
): void {
  const participant = vscode.chat.createChatParticipant("donggri-vscode.donggri", async (request, _chatContext, stream, token) => {
    switch (request.command) {
      case "bind": {
        stream.progress("Binding workspace...");
        const binding = await controller.bindProject(true);
        if (!binding) {
          stream.markdown("Workspace binding is not available.");
          return;
        }
        stream.markdown(`Bound \`${binding.projectName}\` to \`${binding.projectPath}\`.`);
        return;
      }
      case "review": {
        stream.progress("Reviewing current context...");
        const result = await controller.reviewCurrentContext({
          mode: request.prompt.trim().toLowerCase() === "diff" ? "diff" : "selection",
          prompt: request.prompt,
          model: request.model,
          token,
          onChunk: (chunk) => stream.markdown(chunk),
        });
        if (!result.streamed) {
          stream.markdown(result.text);
        }
        return;
      }
      case "fix": {
        stream.progress("Preparing edit suggestion...");
        const result = await controller.fixCurrentContext(request.prompt, request.model, token);
        stream.markdown(result.markdown);
        if (result.pendingEditId) {
          stream.button(toCommand("donggri.applyPendingEdit", "Apply suggested edit", result.pendingEditId));
        }
        return;
      }
      case "task": {
        stream.progress("Creating Donggri task...");
        const task = await controller.createTaskFromCurrentContext(request.prompt, request.model, token);
        stream.markdown(`Created task \`${task.id}\` for \`${task.title}\`.`);
        stream.button(toCommand("donggri.runTask", "Run task", task.id));
        return;
      }
      case "run": {
        const task = await controller.runTask(request.prompt);
        stream.markdown(`Task \`${task.id}\` is now running.`);
        return;
      }
      case "log": {
        stream.progress("Summarizing latest task log...");
        const summary = await controller.openTaskLog(request.prompt, request.model, token, false);
        stream.markdown(summary);
        return;
      }
      default: {
        stream.markdown(
          [
            "Use one of the Donggri slash commands:",
            "- `/review` for local code review",
            "- `/fix` for an edit suggestion",
            "- `/task` to create a Donggri task",
            "- `/run` to run a task",
            "- `/log` to summarize task output",
            "- `/bind` to bind the current workspace",
          ].join("\n"),
        );
      }
    }
  });

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "donggri.svg");
  context.subscriptions.push(participant);
}
