import type { AgentGuidanceMessage } from "../avatar/agent-copy";
import type { TycoonEventLogItem } from "../board/scene-types";
import type {
  BossCommandRecipient,
  BossCommandThreadStatus,
  BossCommandThreadView as BossCommandThread,
  BossCommandMessageView as BossCommandMessage
} from "@workspace/shared";

export type {
  BossCommandRecipient,
  BossCommandThreadStatus,
  BossCommandThread,
  BossCommandMessage
};

export type OfficeRightTab = "all-log" | "boss-command";
export type AgentConversationActor =
  | "all"
  | "boss"
  | "system"
  | "actor-main"
  | "actor-router"
  | "actor-runtime"
  | "actor-probe"
  | "actor-history"
  | "actor-pm";

export type AgentConversationEntry = {
  id: string;
  actorId: AgentConversationActor;
  speaker: string;
  title: string;
  body: string;
  meta: string;
  tone: "boss" | "system" | "agent" | "error";
};

export const BOSS_COMMAND_STORAGE_KEY = "donggri.office.boss-threads";

const recipientToActorIdMap: Record<BossCommandRecipient, AgentConversationActor> = {
  pm: "actor-pm",
  router: "actor-router",
  runtime: "actor-runtime",
  probe: "actor-probe",
  history: "actor-history"
};

const categoryToneMap: Record<TycoonEventLogItem["category"], AgentConversationEntry["tone"]> = {
  system: "system",
  agent: "agent",
  validation: "agent",
  error: "error"
};

const fallbackSpeaker = (event: TycoonEventLogItem): string => {
  if (event.category === "error") {
    return "System";
  }
  if (event.actorId === "boss") {
    return "Boss";
  }
  if (event.category === "agent") {
    return "Main Agent";
  }
  return "Operations";
};

export const recipientToActorId = (recipient: BossCommandRecipient): AgentConversationActor => {
  return recipientToActorIdMap[recipient];
};

export const buildConversationEntries = (
  events: TycoonEventLogItem[],
  guidanceMessage: AgentGuidanceMessage | null,
  mainAgentName: string
): AgentConversationEntry[] => {
  const guidanceEntries: AgentConversationEntry[] = guidanceMessage
    ? [
        {
          id: `guidance-${guidanceMessage.headline}`,
          actorId: "actor-main" as const,
          speaker: mainAgentName,
          title: guidanceMessage.headline,
          body: `${guidanceMessage.body} ${guidanceMessage.primaryAction}`,
          meta: guidanceMessage.supportingHint,
          tone: guidanceMessage.riskLevel === "high" ? "error" : "agent"
        }
      ]
    : [];

  const eventEntries = events.map((event) => ({
    id: event.id,
    actorId: (event.actorId as AgentConversationActor | undefined) ?? (event.category === "error" ? "system" : "actor-main"),
    speaker: event.speaker ?? fallbackSpeaker(event),
    title: event.category.toUpperCase(),
    body: event.message,
    meta: `tick ${event.tick.toString().padStart(4, "0")}`,
    tone: categoryToneMap[event.category]
  }));

  return [...guidanceEntries, ...eventEntries];
};

const makeId = (prefix: string): string => {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createBossCommandThread = (
  recipient: BossCommandRecipient,
  summary: string,
  body: string,
  createdAt = new Date().toISOString()
): BossCommandThread => {
  return {
    id: makeId("thread"),
    recipient,
    summary,
    status: "sent",
    createdAt,
    updatedAt: createdAt,
    messages: [
      {
        id: makeId("msg"),
        sender: "boss",
        body,
        createdAt
      }
    ]
  };
};

export const appendBossCommandFeedback = (
  thread: BossCommandThread,
  sender: BossCommandRecipient,
  body: string,
  createdAt = new Date().toISOString()
): BossCommandThread => {
  return {
    ...thread,
    status: "feedback",
    updatedAt: createdAt,
    messages: [
      ...thread.messages,
      {
        id: makeId("msg"),
        sender,
        body,
        createdAt
      }
    ]
  };
};

export const updateBossCommandStatus = (
  thread: BossCommandThread,
  status: BossCommandThreadStatus,
  updatedAt = new Date().toISOString()
): BossCommandThread => {
  return {
    ...thread,
    status,
    updatedAt
  };
};

export const loadBossCommandThreads = (
  storage?: Pick<Storage, "getItem">
): BossCommandThread[] => {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(BOSS_COMMAND_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BossCommandThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveBossCommandThreads = (
  threads: BossCommandThread[],
  storage?: Pick<Storage, "setItem">
): void => {
  if (!storage) {
    return;
  }
  storage.setItem(BOSS_COMMAND_STORAGE_KEY, JSON.stringify(threads));
};
