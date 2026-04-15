import * as vscode from "vscode";
import type { DonggriDecisionItem, DonggriRuntimeState, DonggriTaskRef, DonggriWsEvent, WorkspaceBinding } from "./types";
import { sortTasks } from "./util/task";

function upsertTask(tasks: DonggriTaskRef[], incoming: DonggriTaskRef): DonggriTaskRef[] {
  const next = tasks.filter((task) => task.id !== incoming.id);
  next.push(incoming);
  return sortTasks(next);
}

export function reduceWsEvent(state: DonggriRuntimeState, event: DonggriWsEvent): DonggriRuntimeState {
  if (event.type === "connected") {
    return {
      ...state,
      connected: true,
    };
  }

  if (event.type === "task_update" && event.payload && typeof event.payload === "object") {
    const payload = event.payload as Partial<DonggriTaskRef> & { id?: string; deleted?: boolean };
    if (!payload.id) {
      return state;
    }

    const tasks = payload.deleted
      ? state.tasks.filter((task) => task.id !== payload.id)
      : upsertTask(state.tasks, payload as DonggriTaskRef);

    return {
      ...state,
      tasks,
    };
  }

  if (event.type === "cli_output" && event.payload && typeof event.payload === "object") {
    const payload = event.payload as { task_id?: string; taskId?: string };
    const taskId = payload.task_id || payload.taskId;
    if (!taskId) {
      return state;
    }

    return {
      ...state,
      lastCliTaskId: taskId,
      lastCliAt: Date.now(),
    };
  }

  return state;
}

export class DonggriStateStore implements vscode.Disposable {
  private state: DonggriRuntimeState = {
    connected: false,
    tasks: [],
    decisions: [],
  };

  private readonly emitter = new vscode.EventEmitter<DonggriRuntimeState>();
  readonly onDidChange = this.emitter.event;

  get snapshot(): DonggriRuntimeState {
    return this.state;
  }

  setConnected(connected: boolean): void {
    this.state = {
      ...this.state,
      connected,
    };
    this.emitter.fire(this.state);
  }

  setBinding(binding: WorkspaceBinding | undefined): void {
    this.state = {
      ...this.state,
      binding,
    };
    this.emitter.fire(this.state);
  }

  setTasks(tasks: DonggriTaskRef[]): void {
    this.state = {
      ...this.state,
      tasks: sortTasks(tasks),
    };
    this.emitter.fire(this.state);
  }

  setDecisions(decisions: DonggriDecisionItem[]): void {
    this.state = {
      ...this.state,
      decisions: [...decisions].sort((left, right) => right.created_at - left.created_at),
    };
    this.emitter.fire(this.state);
  }

  applyEvent(event: DonggriWsEvent): void {
    this.state = reduceWsEvent(this.state, event);
    this.emitter.fire(this.state);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
