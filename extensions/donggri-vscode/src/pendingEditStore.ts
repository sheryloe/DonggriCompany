import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

export interface PendingWorkspaceEdit {
  id: string;
  uri: vscode.Uri;
  range: vscode.Range;
  replacement: string;
  summary: string;
  createdAt: number;
}

export class PendingEditStore {
  private readonly edits = new Map<string, PendingWorkspaceEdit>();

  create(input: Omit<PendingWorkspaceEdit, "id" | "createdAt">): PendingWorkspaceEdit {
    const edit: PendingWorkspaceEdit = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.edits.set(edit.id, edit);
    return edit;
  }

  consume(id: string): PendingWorkspaceEdit | undefined {
    const edit = this.edits.get(id);
    if (!edit) {
      return undefined;
    }

    this.edits.delete(id);
    return edit;
  }
}
