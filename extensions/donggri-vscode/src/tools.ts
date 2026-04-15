import * as vscode from "vscode";
import { DonggriExtensionController } from "./controller";

type CreateTaskInput = {
  title?: string;
  prompt?: string;
  runAfterCreate?: boolean;
};

type ControlTaskInput = {
  taskId?: string;
  action?: "run" | "pause" | "resume";
};

type ReadDiffInput = {
  scope?: "activeFile" | "workspace";
};

type ReadTerminalInput = {
  taskId?: string;
  lines?: number;
};

class ReadActiveEditorTool implements vscode.LanguageModelTool<{ includeFileText?: boolean }> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<{ includeFileText?: boolean }>): Promise<vscode.LanguageModelToolResult> {
    const context = await this.controller.collectContext({
      includeFileText: options.input.includeFileText !== false,
      includeDiff: false,
    });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        [
          `File: ${context.filePath ?? "unknown"}`,
          `Language: ${context.languageId ?? "unknown"}`,
          context.selectionText ? `Selection:\n${context.selectionText}` : "Selection: none",
          context.activeFileText ? `File text:\n${context.activeFileText}` : "File text not included",
        ].join("\n\n"),
      ),
    ]);
  }
}

class ReadSelectionTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const context = await this.controller.collectContext({
      includeFileText: false,
      includeDiff: false,
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(context.selectionText || "No active selection.")]);
  }
}

class ReadWorkingDiffTool implements vscode.LanguageModelTool<ReadDiffInput> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ReadDiffInput>): Promise<vscode.LanguageModelToolResult> {
    const context = await this.controller.collectContext({
      includeFileText: false,
      includeDiff: true,
      diffScope: options.input.scope ?? "activeFile",
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(context.workingDiff || "No working diff found.")]);
  }
}

class ReadProjectBindingTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const binding = await this.controller.bindProject(false);
    const text = binding
      ? `Project: ${binding.projectName}\nPath: ${binding.projectPath}\nCore goal: ${binding.projectContext}`
      : "Workspace is not bound to any Donggri project.";
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
}

class CreateTaskTool implements vscode.LanguageModelTool<CreateTaskInput> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<CreateTaskInput>): Promise<vscode.LanguageModelToolResult> {
    if (!options.input.title || !options.input.prompt) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("Task title and prompt are required.")]);
    }

    const task = await this.controller.createTaskFromCurrentContext(options.input.prompt, undefined, undefined, {
      title: options.input.title,
      runAfterCreate: options.input.runAfterCreate === true,
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Created task ${task.id}: ${task.title}`)]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateTaskInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: "Creating Donggri task",
      confirmationMessages: {
        title: "Create Donggri task",
        message: new vscode.MarkdownString(`Create a Donggri task for **${options.input.title ?? "current context"}**?`),
      },
    };
  }
}

class ControlTaskTool implements vscode.LanguageModelTool<ControlTaskInput> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ControlTaskInput>): Promise<vscode.LanguageModelToolResult> {
    if (!options.input.taskId || !options.input.action) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("taskId and action are required.")]);
    }

    await this.controller.controlTask(options.input.taskId, options.input.action);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Task ${options.input.taskId} -> ${options.input.action}`),
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ControlTaskInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Applying ${options.input.action ?? "control"} to task`,
      confirmationMessages: {
        title: "Control Donggri task",
        message: new vscode.MarkdownString(
          `Run action \`${options.input.action ?? "unknown"}\` on task \`${options.input.taskId ?? "unknown"}\`?`,
        ),
      },
    };
  }
}

class ReadTaskTerminalTool implements vscode.LanguageModelTool<ReadTerminalInput> {
  constructor(private readonly controller: DonggriExtensionController) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ReadTerminalInput>): Promise<vscode.LanguageModelToolResult> {
    if (!options.input.taskId) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("taskId is required.")]);
    }

    const result = await this.controller.readTaskTerminal(options.input.taskId, options.input.lines ?? 120);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  }
}

export function registerDonggriTools(context: vscode.ExtensionContext, controller: DonggriExtensionController): void {
  context.subscriptions.push(
    vscode.lm.registerTool("donggri_read_active_editor", new ReadActiveEditorTool(controller)),
    vscode.lm.registerTool("donggri_read_selection", new ReadSelectionTool(controller)),
    vscode.lm.registerTool("donggri_read_working_diff", new ReadWorkingDiffTool(controller)),
    vscode.lm.registerTool("donggri_read_project_binding", new ReadProjectBindingTool(controller)),
    vscode.lm.registerTool("donggri_create_task", new CreateTaskTool(controller)),
    vscode.lm.registerTool("donggri_control_task", new ControlTaskTool(controller)),
    vscode.lm.registerTool("donggri_read_task_terminal", new ReadTaskTerminalTool(controller)),
  );
}
