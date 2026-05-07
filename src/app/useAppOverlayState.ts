import { useState } from "react";
import type { DecisionInboxItem } from "../components/chat/decision-inbox";
import type { Agent } from "../types";
import type { TaskPanelTab } from "./types";

export function useAppOverlayState() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [taskPanel, setTaskPanel] = useState<{ taskId: string; tab: TaskPanelTab } | null>(null);
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [showAgentStatus, setShowAgentStatus] = useState(false);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [showDecisionInbox, setShowDecisionInbox] = useState(false);
  const [decisionInboxLoading, setDecisionInboxLoading] = useState(false);
  const [decisionInboxItems, setDecisionInboxItems] = useState<DecisionInboxItem[]>([]);
  const [decisionReplyBusyKey, setDecisionReplyBusyKey] = useState<string | null>(null);
  const [activeRoomThemeTargetId, setActiveRoomThemeTargetId] = useState<string | null>(null);
  const [activeDepartmentComponentId, setActiveDepartmentComponentId] = useState("pmo");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);

  return {
    selectedAgent,
    setSelectedAgent,
    chatAgent,
    setChatAgent,
    showChat,
    setShowChat,
    taskPanel,
    setTaskPanel,
    showReportHistory,
    setShowReportHistory,
    showAgentStatus,
    setShowAgentStatus,
    showRoomManager,
    setShowRoomManager,
    showDecisionInbox,
    setShowDecisionInbox,
    decisionInboxLoading,
    setDecisionInboxLoading,
    decisionInboxItems,
    setDecisionInboxItems,
    decisionReplyBusyKey,
    setDecisionReplyBusyKey,
    activeRoomThemeTargetId,
    setActiveRoomThemeTargetId,
    activeDepartmentComponentId,
    setActiveDepartmentComponentId,
    mobileNavOpen,
    setMobileNavOpen,
    mobileHeaderMenuOpen,
    setMobileHeaderMenuOpen,
  };
}
