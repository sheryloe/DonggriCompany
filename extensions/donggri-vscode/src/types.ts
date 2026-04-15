export type DefaultProjectBindingMode = "match-only" | "match-or-create";

export type DonggriTaskStatus =
  | "inbox"
  | "planned"
  | "collaborating"
  | "in_progress"
  | "review"
  | "done"
  | "pending"
  | "cancelled";

export type DonggriTaskAction = "run" | "pause" | "resume";

export type DonggriWsEventType =
  | "task_update"
  | "agent_status"
  | "new_message"
  | "chat_stream"
  | "cli_output"
  | "subtask_update"
  | "task_report"
  | "connected";

export interface DonggriServerConfig {
  serverUrl: string;
  apiToken: string;
  autoConnect: boolean;
  defaultProjectBindingMode: DefaultProjectBindingMode;
}

export interface DonggriProject {
  id: string;
  name: string;
  project_path: string;
  core_goal: string;
  assignment_mode?: string;
  last_used_at?: number | null;
  updated_at?: number;
}

export interface WorkspaceBinding {
  workspaceFolderName: string;
  workspaceFolderPath: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  projectContext: string;
  bindingSource: "cached" | "matched" | "created" | "manual";
  updatedAt: number;
}

export interface DonggriTaskRef {
  id: string;
  title: string;
  description: string | null;
  project_id?: string | null;
  project_path: string | null;
  status: DonggriTaskStatus;
  priority?: number;
  task_type?: string;
  assigned_agent_id?: string | null;
  updated_at: number;
}

export interface DonggriMessage {
  id: string;
  content: string;
  message_type: string;
  created_at: number;
}

export interface DonggriDecisionOption {
  number: number;
  action: string;
  label: string;
}

export interface DonggriDecisionItem {
  id: string;
  kind: "project_review_ready" | "task_timeout_resume" | "review_round_pick";
  created_at: number;
  summary: string;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  project_name: string | null;
  project_path: string | null;
  options: DonggriDecisionOption[];
}

export interface DonggriTerminalTaskLog {
  id: number;
  kind: string;
  message: string;
  created_at: number;
}

export interface DonggriTerminalResponse {
  ok: boolean;
  exists: boolean;
  text: string;
  task_logs: DonggriTerminalTaskLog[];
  progress_hints?: {
    hints?: string[];
  } | null;
  interrupt?: {
    session_id: string;
    control_token: string;
    requires_csrf: boolean;
  } | null;
}

export interface DonggriWsEvent<T = unknown> {
  type: DonggriWsEventType | (string & {});
  payload: T;
  ts: number;
}

export interface PromptContextSnapshot {
  workspaceFolderName?: string;
  workspaceFolderPath?: string;
  filePath?: string;
  relativePath?: string;
  languageId?: string;
  selectionText?: string;
  activeFileText?: string;
  activeFileTextTruncated?: boolean;
  workingDiff?: string;
  workingDiffTruncated?: boolean;
}

export interface LocalReviewRequest {
  mode: "selection" | "file" | "diff";
  prompt: string;
  responseLanguage: "ko" | "en" | "ja" | "zh";
}

export interface PromoteToTaskInput {
  title: string;
  prompt: string;
  binding: WorkspaceBinding;
  context: PromptContextSnapshot;
  runAfterCreate?: boolean;
}

export interface FixSuggestion {
  summary: string;
  replacement?: string;
  why: string[];
  rawText: string;
  applyable: boolean;
}

export interface DonggriRuntimeState {
  connected: boolean;
  binding?: WorkspaceBinding;
  tasks: DonggriTaskRef[];
  decisions: DonggriDecisionItem[];
  lastCliTaskId?: string;
  lastCliAt?: number;
}
