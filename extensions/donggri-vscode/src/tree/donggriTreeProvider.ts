import * as vscode from "vscode";
import type { DonggriDecisionItem, DonggriTaskRef } from "../types";
import { DonggriStateStore } from "../state";
import { formatTaskStatus } from "../util/task";

type RootNode =
  | { kind: "binding-root" }
  | { kind: "tasks-root" }
  | { kind: "decisions-root" };

type LeafNode =
  | { kind: "binding-leaf" }
  | { kind: "empty"; parent: "tasks" | "decisions"; label: string }
  | { kind: "task"; task: DonggriTaskRef }
  | { kind: "decision"; decision: DonggriDecisionItem };

type TreeNode = RootNode | LeafNode;

export class DonggriTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly store: DonggriStateStore) {
    this.store.onDidChange(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "binding-root") {
      const item = new vscode.TreeItem("Workspace", vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon("link");
      return item;
    }

    if (element.kind === "tasks-root") {
      const item = new vscode.TreeItem("Tasks", vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(this.store.snapshot.tasks.length);
      item.iconPath = new vscode.ThemeIcon("checklist");
      return item;
    }

    if (element.kind === "decisions-root") {
      const item = new vscode.TreeItem("Decision Inbox", vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(this.store.snapshot.decisions.length);
      item.iconPath = new vscode.ThemeIcon("inbox");
      return item;
    }

    if (element.kind === "binding-leaf") {
      const binding = this.store.snapshot.binding;
      const item = new vscode.TreeItem(
        binding ? binding.projectName : "Bind current workspace",
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = binding ? binding.bindingSource : "unbound";
      item.tooltip = binding
        ? `${binding.projectPath}\n${binding.projectContext}`
        : "Bind the current VS Code workspace to a Donggri project.";
      item.iconPath = new vscode.ThemeIcon(binding ? "pass-filled" : "warning");
      item.command = {
        command: "donggri.bindProject",
        title: "Bind Current Workspace",
      };
      return item;
    }

    if (element.kind === "empty") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("dash");
      return item;
    }

    if (element.kind === "task") {
      const item = new vscode.TreeItem(element.task.title, vscode.TreeItemCollapsibleState.None);
      item.description = formatTaskStatus(element.task.status);
      item.tooltip = `${element.task.id}\n${element.task.project_path ?? ""}`;
      item.iconPath = new vscode.ThemeIcon(
        this.store.snapshot.lastCliTaskId === element.task.id ? "sync~spin" : "terminal-view-icon",
      );
      item.command = {
        command: "donggri.runTask",
        title: "Run Donggri Task",
        arguments: [element.task.id],
      };
      return item;
    }

    const item = new vscode.TreeItem(element.decision.summary, vscode.TreeItemCollapsibleState.None);
    item.description = element.decision.kind;
    item.tooltip = `${element.decision.project_name ?? "No project"}\n${element.decision.task_title ?? ""}`;
    item.iconPath = new vscode.ThemeIcon("issue-opened");
    item.command = {
      command: "donggri.openDecisionInbox",
      title: "Open Decision Inbox",
      arguments: [element.decision.id],
    };
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return [{ kind: "binding-root" }, { kind: "tasks-root" }, { kind: "decisions-root" }];
    }

    if (element.kind === "binding-root") {
      return [{ kind: "binding-leaf" }];
    }

    if (element.kind === "tasks-root") {
      return this.store.snapshot.tasks.length > 0
        ? this.store.snapshot.tasks.slice(0, 20).map((task) => ({ kind: "task", task }))
        : [{ kind: "empty", parent: "tasks", label: "No tasks in the bound project" }];
    }

    if (element.kind === "decisions-root") {
      return this.store.snapshot.decisions.length > 0
        ? this.store.snapshot.decisions.slice(0, 10).map((decision) => ({ kind: "decision", decision }))
        : [{ kind: "empty", parent: "decisions", label: "No pending decisions" }];
    }

    return [];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
