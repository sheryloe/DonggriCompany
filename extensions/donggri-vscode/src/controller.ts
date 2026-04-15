import * as vscode from "vscode";
import { DonggriClient } from "./api/donggriClient";
import { DonggriHttpClient } from "./api/httpClient";
import { WorkspaceBindingService } from "./binding/workspaceBindingService";
import { readDonggriServerConfig } from "./config";
import { collectEditorContext, type CollectedEditorContext } from "./local/contextCollector";
import { buildTaskDescription } from "./local/promptBuilders";
import { runFixWithModel, runReviewWithModel, selectDefaultModel, summarizeTerminalWithModel } from "./local/modelService";
import { PendingEditStore } from "./pendingEditStore";
import { DonggriStateStore } from "./state";
import type { DonggriTaskAction, DonggriTaskRef, LocalReviewRequest, WorkspaceBinding } from "./types";
import { DonggriTreeProvider } from "./tree/donggriTreeProvider";
import { buildTaskTitleFromPrompt, detectResponseLanguage, formatBulletList } from "./util/text";
import { matchTaskByQuery } from "./util/task";
import { DonggriWsClient } from "./ws/donggriWsClient";

export class DonggriExtensionController implements vscode.Disposable {
  readonly client: DonggriClient;
  readonly bindingService: WorkspaceBindingService;
  readonly stateStore = new DonggriStateStore();
  readonly pendingEdits = new PendingEditStore();
  readonly treeProvider = new DonggriTreeProvider(this.stateStore);
  readonly wsClient: DonggriWsClient;

  private readonly statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private readonly treeView: vscode.TreeView<unknown>;
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly context: vscode.ExtensionContext) {
    const http = new DonggriHttpClient(() => readDonggriServerConfig());
    this.client = new DonggriClient(http);
    this.bindingService = new WorkspaceBindingService(context, this.client);
    this.wsClient = new DonggriWsClient(http, () => readDonggriServerConfig());
    this.treeView = vscode.window.createTreeView("donggri.overview", {
      treeDataProvider: this.treeProvider,
      showCollapseAll: false,
    });

    this.context.subscriptions.push(this.stateStore, this.treeProvider, this.treeView, this.statusBarItem, this.wsClient);
    this.statusBarItem.command = "workbench.view.extension.donggri";
  }

  async initialize(): Promise<void> {
    this.wsClient.onConnectionChanged((connected) => {
      this.stateStore.setConnected(connected);
      this.updateStatusBar();
    });

    this.wsClient.onEvent((event) => {
      this.stateStore.applyEvent(event);
      this.updateStatusBar();
      if (["task_update", "task_report", "subtask_update", "new_message"].includes(event.type)) {
        this.scheduleRefresh();
      }
    });

    this.stateStore.onDidChange(() => {
      this.updateStatusBar();
    });

    const config = readDonggriServerConfig();
    if (config.autoConnect) {
      await this.refreshState(false);
      await this.wsClient.connect();
    } else {
      this.stateStore.setBinding(this.bindingService.getCachedBinding());
      this.updateStatusBar();
    }
  }

  async refreshState(showErrors = true): Promise<void> {
    try {
      const binding = await this.bindProject(false);
      this.stateStore.setBinding(binding);
      if (!binding) {
        this.stateStore.setTasks([]);
        this.stateStore.setDecisions([]);
        return;
      }

      const [tasks, decisions] = await Promise.all([this.client.getTasks(binding.projectId), this.client.getDecisionInbox()]);
      this.stateStore.setTasks(tasks);
      this.stateStore.setDecisions(decisions);
    } catch (error) {
      if (showErrors) {
        void vscode.window.showErrorMessage(this.asMessage(error));
      }
    }
  }

  async bindProject(interactive: boolean): Promise<WorkspaceBinding | undefined> {
    const binding = await this.bindingService.bindCurrentWorkspace({
      interactive,
      mode: readDonggriServerConfig().defaultProjectBindingMode,
    });
    this.stateStore.setBinding(binding);
    return binding;
  }

  async collectContext(options?: {
    includeFileText?: boolean;
    includeDiff?: boolean;
    diffScope?: "activeFile" | "workspace";
  }): Promise<CollectedEditorContext> {
    return collectEditorContext(options);
  }

  async reviewCurrentContext(input: {
    mode: "selection" | "diff";
    prompt: string;
    model?: vscode.LanguageModelChat;
    token?: vscode.CancellationToken;
    onChunk?: (chunk: string) => void;
  }): Promise<{ text: string; streamed: boolean }> {
    const model = input.model ?? (await selectDefaultModel());
    if (!model) {
      throw new Error("No VS Code language model is available.");
    }

    const context = await this.collectContext({
      includeFileText: input.mode !== "diff",
      includeDiff: input.mode === "diff",
      diffScope: input.mode === "diff" ? "workspace" : "activeFile",
    });
    const request: LocalReviewRequest = {
      mode: input.mode === "diff" ? "diff" : context.selectionText ? "selection" : "file",
      prompt: input.prompt || (input.mode === "diff" ? "Review the current working diff." : "Review the current code."),
      responseLanguage: detectResponseLanguage(input.prompt || ""),
    };
    const text = await runReviewWithModel(model, request, context, input.token ?? new vscode.CancellationTokenSource().token, input.onChunk);
    return {
      text,
      streamed: Boolean(input.onChunk),
    };
  }

  async fixCurrentContext(
    prompt: string,
    model?: vscode.LanguageModelChat,
    token?: vscode.CancellationToken,
  ): Promise<{ markdown: string; pendingEditId?: string }> {
    const resolvedModel = model ?? (await selectDefaultModel());
    if (!resolvedModel) {
      throw new Error("No VS Code language model is available.");
    }

    const context = await this.collectContext({
      includeFileText: true,
      includeDiff: true,
    });
    const request: LocalReviewRequest = {
      mode: context.selectionText ? "selection" : "file",
      prompt: prompt || "Apply the safest fix for the current code.",
      responseLanguage: detectResponseLanguage(prompt || ""),
    };
    const applyable = Boolean(context.selectionText || !context.activeFileTextTruncated);
    const suggestion = await runFixWithModel(
      resolvedModel,
      request,
      context,
      applyable,
      token ?? new vscode.CancellationTokenSource().token,
    );

    const sections: string[] = [`${suggestion.summary}`];
    if (suggestion.why.length > 0) {
      sections.push(formatBulletList(suggestion.why));
    }

    if (suggestion.applyable && suggestion.replacement) {
      const pendingEdit = this.pendingEdits.create({
        uri: context.documentUri,
        range: context.editableRange,
        replacement: suggestion.replacement,
        summary: suggestion.summary,
      });

      sections.push("```");
      sections.push(suggestion.replacement);
      sections.push("```");

      return {
        markdown: sections.join("\n\n"),
        pendingEditId: pendingEdit.id,
      };
    }

    sections.push(suggestion.rawText);
    return {
      markdown: sections.join("\n\n"),
    };
  }

  async createTaskFromCurrentContext(
    prompt: string,
    _model?: vscode.LanguageModelChat,
    _token?: vscode.CancellationToken,
    options?: {
      title?: string;
      runAfterCreate?: boolean;
    },
  ): Promise<DonggriTaskRef> {
    const binding = await this.bindProject(true);
    if (!binding) {
      throw new Error("Workspace binding is required before creating a task.");
    }

    const context = await this.collectContext({
      includeFileText: true,
      includeDiff: true,
      diffScope: "workspace",
    });
    const title =
      options?.title ??
      (await vscode.window.showInputBox({
        prompt: "Donggri task title",
        value: buildTaskTitleFromPrompt(prompt, context.relativePath ? `Work on ${context.relativePath}` : "Work on current context"),
        ignoreFocusOut: true,
      }));

    if (!title?.trim()) {
      throw new Error("Task title is required.");
    }

    const description = buildTaskDescription({
      title,
      prompt: prompt || "Work on the current VS Code context.",
      binding,
      context,
      runAfterCreate: options?.runAfterCreate,
    });

    const task = await this.client.createTask({
      title,
      prompt: description,
      binding,
      context,
      runAfterCreate: options?.runAfterCreate,
    });

    await this.refreshState(false);
    return task;
  }

  async controlTask(taskId: string, action: DonggriTaskAction): Promise<void> {
    await this.client.controlTask(taskId, action);
    await this.refreshState(false);
  }

  async runTask(query?: string): Promise<DonggriTaskRef> {
    const task = await this.pickTask(query, "Run Donggri task");
    await this.client.runTask(task.id);
    await this.refreshState(false);
    return task;
  }

  async pauseTask(query?: string): Promise<DonggriTaskRef> {
    const task = await this.pickTask(query, "Pause Donggri task");
    await this.client.pauseTask(task.id);
    await this.refreshState(false);
    return task;
  }

  async resumeTask(query?: string): Promise<DonggriTaskRef> {
    const task = await this.pickTask(query, "Resume Donggri task");
    await this.client.resumeTask(task.id);
    await this.refreshState(false);
    return task;
  }

  async openTaskLog(
    query?: string,
    model?: vscode.LanguageModelChat,
    token?: vscode.CancellationToken,
    openDocument = true,
  ): Promise<string> {
    const task = await this.pickTask(query, "Select Donggri task log");
    const summary = await this.readTaskTerminal(task.id, 160, task.title, model, token);
    if (openDocument) {
      await this.showMarkdownDocument(`Donggri Log ${task.title}`, summary);
    }
    return summary;
  }

  async readTaskTerminal(
    taskId: string,
    lines = 120,
    taskTitle?: string,
    model?: vscode.LanguageModelChat,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const terminal = await this.client.getTaskTerminal(taskId, lines);
    const hints = terminal.progress_hints?.hints ?? [];

    if (model) {
      return summarizeTerminalWithModel(
        model,
        taskTitle ?? taskId,
        terminal.text,
        hints,
        "ko",
        token ?? new vscode.CancellationTokenSource().token,
      );
    }

    return [
      `# ${taskTitle ?? taskId}`,
      hints.length > 0 ? formatBulletList(hints) : "",
      "```",
      terminal.text || "(empty)",
      "```",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async openDecisionInbox(decisionId?: string): Promise<void> {
    const decisions = await this.client.getDecisionInbox();
    this.stateStore.setDecisions(decisions);
    if (decisions.length === 0) {
      void vscode.window.showInformationMessage("No pending Donggri decisions.");
      return;
    }

    const selectedDecision =
      (decisionId ? decisions.find((item) => item.id === decisionId) : undefined) ??
      (await vscode.window.showQuickPick(
        decisions.map((item) => ({
          label: item.summary,
          description: item.project_name ?? item.kind,
          decision: item,
        })),
        {
          title: "Donggri Decision Inbox",
        },
      ))?.decision;

    if (!selectedDecision) {
      return;
    }

    const selectedOption = await vscode.window.showQuickPick(
      selectedDecision.options.map((option) => ({
        label: `${option.number}. ${option.label}`,
        description: option.action,
        option,
      })),
      {
        title: selectedDecision.summary,
      },
    );

    if (!selectedOption) {
      return;
    }

    await this.client.replyDecision(selectedDecision.id, selectedOption.option.number);
    await this.refreshState(false);
    void vscode.window.showInformationMessage("Donggri decision reply submitted.");
  }

  async applyPendingEdit(id: string): Promise<void> {
    const edit = this.pendingEdits.consume(id);
    if (!edit) {
      throw new Error("Pending edit not found.");
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(edit.uri, edit.range, edit.replacement);
    await vscode.workspace.applyEdit(workspaceEdit);
    void vscode.window.showInformationMessage(edit.summary);
  }

  async showMarkdownDocument(title: string, content: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: `# ${title}\n\n${content}`,
      language: "markdown",
    });
    await vscode.window.showTextDocument(document, {
      preview: false,
    });
  }

  private async pickTask(query: string | undefined, title: string): Promise<DonggriTaskRef> {
    const tasks = this.stateStore.snapshot.tasks;
    const matched = matchTaskByQuery(tasks, query);
    if (matched) {
      return matched;
    }

    const selected = await vscode.window.showQuickPick(
      tasks.map((task) => ({
        label: task.title,
        description: `${task.status} · ${task.id}`,
        task,
      })),
      { title },
    );

    if (!selected) {
      throw new Error("Task selection was cancelled.");
    }

    return selected.task;
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refreshState(false);
    }, 600);
  }

  private updateStatusBar(): void {
    const snapshot = this.stateStore.snapshot;
    const bindingLabel = snapshot.binding?.projectName ?? "unbound";
    const icon = snapshot.connected ? (snapshot.lastCliAt && Date.now() - snapshot.lastCliAt < 8_000 ? "$(sync~spin)" : "$(plug)") : "$(debug-disconnect)";
    this.statusBarItem.text = `${icon} Donggri ${bindingLabel} · ${snapshot.tasks.length} tasks`;
    this.statusBarItem.tooltip = snapshot.binding
      ? `${snapshot.binding.projectPath}\n${snapshot.binding.projectContext}`
      : "Bind the current workspace to Donggri.";
    this.statusBarItem.show();
  }

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  dispose(): void {
    clearTimeout(this.refreshTimer);
  }
}
