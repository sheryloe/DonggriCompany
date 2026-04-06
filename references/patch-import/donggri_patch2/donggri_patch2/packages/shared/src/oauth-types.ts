export type OAuthProvider = "github" | "google";

export type OAuthAccount = {
  id: string;
  provider: OAuthProvider;
  label: string | null;
  email: string | null;
  status: "active" | "disabled";
  priority: number;
  hasRefreshToken: boolean;
  executionReady: boolean;
  active: boolean;
  failureCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type OAuthProviderStatus = {
  connected: boolean;
  detected: boolean;
  executionReady: boolean;
  email: string | null;
  scope: string | null;
  expiresAt: number | null;
  activeAccountId: string | null;
  accounts: OAuthAccount[];
};

export type OAuthStatusResponse = {
  ok: true;
  storageReady: boolean;
  providers: {
    github: OAuthProviderStatus;
    google: OAuthProviderStatus;
  };
};

export type OAuthStartResponse = {
  ok: true;
  provider: OAuthProvider;
  authorizeUrl: string;
};

export type MeetingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type MeetingType = "planned" | "ad_hoc" | "review";

export type Meeting = {
  id: string;
  taskId: string | null;
  title: string;
  status: MeetingStatus;
  meetingType: MeetingType;
  departmentId: string | null;
  agenda: string | null;
  summary: string | null;
  scheduledAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MeetingsListResponse = { ok: true; meetings: Meeting[] };
export type MeetingCreateResponse = { ok: true; meeting: Meeting };

export type KanbanColumn = {
  status: string;
  icon: string;
  label: string;
  color: string;
};

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { status: "inbox",         icon: "📥", label: "Inbox",        color: "#64748b" },
  { status: "planned",       icon: "📋", label: "Planned",      color: "#3b82f6" },
  { status: "collaborating", icon: "🤝", label: "Collaborating",color: "#6366f1" },
  { status: "in_progress",   icon: "⚡", label: "In Progress",  color: "#f59e0b" },
  { status: "review",        icon: "🔍", label: "Review",       color: "#8b5cf6" },
  { status: "done",          icon: "✅", label: "Done",         color: "#10b981" },
];
