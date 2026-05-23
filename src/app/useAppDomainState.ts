import { useRef, useState } from "react";
import type { TaskReportDetail, UpdateStatus } from "../api";
import { detectBrowserLanguage } from "../i18n";
import type {
  Agent,
  CeoOfficeCall,
  CliStatusMap,
  CompanySettings,
  CompanyStats,
  CrossDeptDelivery,
  Department,
  MeetingPresence,
  Message,
  SubAgent,
  SubTask,
  Task,
} from "../types";
import { UPDATE_BANNER_DISMISS_STORAGE_KEY } from "./constants";
import type { OAuthCallbackResult, RoomThemeMap, View } from "./types";
import { mergeSettingsWithDefaults } from "./utils";

export type AppDomainInitialRoomThemes = {
  themes: RoomThemeMap;
};

export function useAppDomainState({ initialRoomThemes }: { initialRoomThemes: AppDomainInitialRoomThemes }) {
  const [view, setView] = useState<View>("office");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(() =>
    mergeSettingsWithDefaults({ language: detectBrowserLanguage() }),
  );
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set());
  const [crossDeptDeliveries, setCrossDeptDeliveries] = useState<CrossDeptDelivery[]>([]);
  const [ceoOfficeCalls, setCeoOfficeCalls] = useState<CeoOfficeCall[]>([]);
  const [meetingPresence, setMeetingPresence] = useState<MeetingPresence[]>([]);
  const [oauthResult, setOauthResult] = useState<OAuthCallbackResult | null>(null);
  const [taskReport, setTaskReport] = useState<TaskReportDetail | null>(null);
  const [customRoomThemes, setCustomRoomThemes] = useState<RoomThemeMap>(() => initialRoomThemes.themes);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY) ?? "";
  });
  const [streamingMessage, setStreamingMessage] = useState<{
    message_id: string;
    agent_id: string;
    agent_name: string;
    agent_avatar: string;
    content: string;
  } | null>(null);

  const viewRef = useRef<View>("office");
  viewRef.current = view;
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;
  const subAgentsRef = useRef<SubAgent[]>(subAgents);
  subAgentsRef.current = subAgents;

  return {
    view,
    setView,
    departments,
    setDepartments,
    agents,
    setAgents,
    tasks,
    setTasks,
    messages,
    setMessages,
    stats,
    setStats,
    settings,
    setSettings,
    cliStatus,
    setCliStatus,
    subAgents,
    setSubAgents,
    subtasks,
    setSubtasks,
    loading,
    setLoading,
    unreadAgentIds,
    setUnreadAgentIds,
    crossDeptDeliveries,
    setCrossDeptDeliveries,
    ceoOfficeCalls,
    setCeoOfficeCalls,
    meetingPresence,
    setMeetingPresence,
    oauthResult,
    setOauthResult,
    taskReport,
    setTaskReport,
    customRoomThemes,
    setCustomRoomThemes,
    updateStatus,
    setUpdateStatus,
    dismissedUpdateVersion,
    setDismissedUpdateVersion,
    streamingMessage,
    setStreamingMessage,
    viewRef,
    agentsRef,
    tasksRef,
    subAgentsRef,
  };
}
