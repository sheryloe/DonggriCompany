import type { OfficeTranslator } from "../i18n/office-i18n";
import type { AgentId, BossCommandRecipient } from "@workspace/shared";
import {
  getLeadSpriteId,
  getNpcSpriteId,
  getSpriteAnimStateFromLoop
} from "./pixel-atlas";
import type {
  AgentMonitorEntry,
  AgentWorkLoopState,
  NpcRoleProfile,
  SceneSyncState,
  TileCoord
} from "./scene-types";

export const MAIN_ACTOR_ID = "actor-main";

type MonitorActorDescriptor = {
  id: AgentId;
  actorId: string;
  actorRole: string;
  displayName: string;
  roleLabel: string;
  defaultRoomLabel: string;
  defaultTile: TileCoord;
  defaultModelLabel: string;
  useLeadSpriteFromProbe?: boolean;
};

type TileZone = {
  key: "work" | "pm" | "infra" | "history";
  x: [number, number];
  y: [number, number];
};

const tileZones: TileZone[] = [
  { key: "work", x: [2, 11], y: [2, 7] },
  { key: "pm", x: [18, 27], y: [2, 7] },
  { key: "infra", x: [2, 11], y: [10, 15] },
  { key: "history", x: [18, 27], y: [10, 15] }
];

export const officeNpcProfiles: Record<string, NpcRoleProfile> = {
  router: {
    role: "router",
    displayName: "Rook",
    roleLabel: "Router Ops",
    spriteId: getNpcSpriteId("Router Ops"),
    modelLabel: "Route Planner v2",
    roomLabel: "Task Floor",
    scheduler: "patrol",
    interruptOnError: true,
    phaseDurations: {
      moving_to_task: 3,
      working: 3,
      moving_to_pm: 2,
      reporting: 2,
      waiting_review: 2
    },
    patrolRoute: [
      { x: 12, y: 6 },
      { x: 12, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 6 }
    ]
  },
  runtime: {
    role: "runtime",
    displayName: "Mina",
    roleLabel: "Runtime Ops",
    spriteId: getNpcSpriteId("Runtime Ops"),
    modelLabel: "Runtime Guard 4x",
    roomLabel: "Infra Bay",
    scheduler: "stationary",
    interruptOnError: true,
    phaseDurations: {
      moving_to_task: 2,
      working: 5,
      moving_to_pm: 2,
      reporting: 2,
      waiting_review: 1
    },
    patrolRoute: [{ x: 12, y: 12 }, { x: 10, y: 12 }]
  },
  probe: {
    role: "probe",
    displayName: "Taro",
    roleLabel: "Probe Watch",
    spriteId: getNpcSpriteId("Probe Watch"),
    modelLabel: "Signal Watcher",
    roomLabel: "Probe Deck",
    scheduler: "patrol",
    interruptOnError: true,
    phaseDurations: {
      moving_to_task: 2,
      working: 4,
      moving_to_pm: 3,
      reporting: 2,
      waiting_review: 1
    },
    patrolRoute: [
      { x: 14, y: 6 },
      { x: 16, y: 6 },
      { x: 16, y: 8 },
      { x: 14, y: 8 }
    ]
  },
  history: {
    role: "history",
    displayName: "Sora",
    roleLabel: "History Desk",
    spriteId: getNpcSpriteId("History Desk"),
    modelLabel: "Replay Clerk",
    roomLabel: "Archive Wing",
    scheduler: "stationary",
    interruptOnError: false,
    phaseDurations: {
      moving_to_task: 2,
      working: 4,
      moving_to_pm: 2,
      reporting: 2,
      waiting_review: 2
    },
    patrolRoute: [{ x: 17, y: 12 }]
  },
  "pm-liaison": {
    role: "pm-liaison",
    displayName: "Ari",
    roleLabel: "PM Liaison",
    spriteId: getNpcSpriteId("PM Liaison"),
    modelLabel: "PM Relay Desk",
    roomLabel: "PM Desk",
    scheduler: "review",
    interruptOnError: false,
    phaseDurations: {
      moving_to_task: 2,
      working: 2,
      moving_to_pm: 2,
      reporting: 3,
      waiting_review: 3
    },
    patrolRoute: [{ x: 18, y: 9 }, { x: 20, y: 9 }]
  }
};

export const monitorActorDescriptors: MonitorActorDescriptor[] = [
  {
    id: "main",
    actorId: MAIN_ACTOR_ID,
    actorRole: "main-agent",
    displayName: "Main Agent",
    roleLabel: "Lead Agent",
    defaultRoomLabel: "Task Floor",
    defaultTile: { x: 15, y: 9 },
    defaultModelLabel: "Lead Profile",
    useLeadSpriteFromProbe: true
  },
  {
    id: "router",
    actorId: "actor-router",
    actorRole: "router",
    displayName: officeNpcProfiles.router.displayName,
    roleLabel: officeNpcProfiles.router.roleLabel,
    defaultRoomLabel: officeNpcProfiles.router.roomLabel,
    defaultTile: { x: 12, y: 7 },
    defaultModelLabel: officeNpcProfiles.router.modelLabel
  },
  {
    id: "runtime",
    actorId: "actor-runtime",
    actorRole: "runtime",
    displayName: officeNpcProfiles.runtime.displayName,
    roleLabel: officeNpcProfiles.runtime.roleLabel,
    defaultRoomLabel: officeNpcProfiles.runtime.roomLabel,
    defaultTile: { x: 12, y: 12 },
    defaultModelLabel: officeNpcProfiles.runtime.modelLabel
  },
  {
    id: "probe",
    actorId: "actor-probe",
    actorRole: "probe",
    displayName: officeNpcProfiles.probe.displayName,
    roleLabel: officeNpcProfiles.probe.roleLabel,
    defaultRoomLabel: officeNpcProfiles.probe.roomLabel,
    defaultTile: { x: 15, y: 7 },
    defaultModelLabel: officeNpcProfiles.probe.modelLabel
  },
  {
    id: "history",
    actorId: "actor-history",
    actorRole: "history",
    displayName: officeNpcProfiles.history.displayName,
    roleLabel: officeNpcProfiles.history.roleLabel,
    defaultRoomLabel: officeNpcProfiles.history.roomLabel,
    defaultTile: { x: 17, y: 12 },
    defaultModelLabel: officeNpcProfiles.history.modelLabel
  },
  {
    id: "pm",
    actorId: "actor-pm",
    actorRole: "pm-liaison",
    displayName: officeNpcProfiles["pm-liaison"].displayName,
    roleLabel: officeNpcProfiles["pm-liaison"].roleLabel,
    defaultRoomLabel: officeNpcProfiles["pm-liaison"].roomLabel,
    defaultTile: { x: 18, y: 9 },
    defaultModelLabel: officeNpcProfiles["pm-liaison"].modelLabel
  }
];

export const officeAgentIds: AgentId[] = monitorActorDescriptors.map((item) => item.id);

export const bossCommandRecipients: Array<{
  value: BossCommandRecipient;
  actorId: string;
  label: string;
}> = [
  { value: "pm", actorId: "actor-pm", label: officeNpcProfiles["pm-liaison"].roleLabel },
  { value: "router", actorId: "actor-router", label: officeNpcProfiles.router.roleLabel },
  { value: "runtime", actorId: "actor-runtime", label: officeNpcProfiles.runtime.roleLabel },
  { value: "probe", actorId: "actor-probe", label: officeNpcProfiles.probe.roleLabel },
  { value: "history", actorId: "actor-history", label: officeNpcProfiles.history.roleLabel }
];

export const getLoopLabel = (
  state: AgentWorkLoopState,
  t?: OfficeTranslator
): string => {
  if (!t) {
    switch (state) {
      case "moving_to_task":
        return "Moving to task";
      case "working":
        return "Working";
      case "moving_to_pm":
        return "Moving to PM";
      case "reporting":
        return "Reporting";
      case "waiting_review":
        return "Waiting review";
      case "blocked":
        return "Blocked";
      default:
        return "Idle";
    }
  }

  const keyMap: Record<AgentWorkLoopState, Parameters<OfficeTranslator>[0]> = {
    idle: "board.state.idle",
    moving_to_task: "board.state.movingToTask",
    working: "board.state.working",
    moving_to_pm: "board.state.movingToPm",
    reporting: "board.state.reporting",
    waiting_review: "board.state.waitingReview",
    blocked: "board.state.blocked"
  };

  return t(keyMap[state]);
};

const clampPercent = (value: number): number => {
  return Math.max(0, Math.min(100, Math.round(value)));
};

const resolveZoneKey = (tile: TileCoord): TileZone["key"] | "transit" => {
  for (const zone of tileZones) {
    if (tile.x >= zone.x[0] && tile.x <= zone.x[1] && tile.y >= zone.y[0] && tile.y <= zone.y[1]) {
      return zone.key;
    }
  }
  return "transit";
};

export const getLocationLabel = (tile: TileCoord, t: OfficeTranslator): string => {
  const zoneKey = resolveZoneKey(tile);
  const keyMap = {
    transit: "board.location.transit",
    work: "board.location.work",
    pm: "board.location.pm",
    infra: "board.location.infra",
    history: "board.location.history"
  } as const;
  return t(keyMap[zoneKey]);
};

const getRoleLabel = (descriptor: MonitorActorDescriptor, t: OfficeTranslator): string => {
  const keyMap: Record<string, Parameters<OfficeTranslator>[0]> = {
    "main-agent": "board.role.main",
    router: "board.role.router",
    runtime: "board.role.runtime",
    probe: "board.role.probe",
    history: "board.role.history",
    "pm-liaison": "board.role.pm"
  };
  return t(keyMap[descriptor.actorRole] ?? "board.role.main");
};

export const getMonitorEntries = (
  sceneSync: SceneSyncState,
  mainAgentName: string,
  t: OfficeTranslator
): AgentMonitorEntry[] => {
  const actorById = new Map(sceneSync.actors.map((actor) => [actor.id, actor]));

  return monitorActorDescriptors.map((descriptor) => {
    const actor = actorById.get(descriptor.actorId);
    const loopState = actor?.fsmState ?? (descriptor.actorId === MAIN_ACTOR_ID ? sceneSync.loopState : "idle");
    const usagePercent = clampPercent(sceneSync.agentLoadById[descriptor.actorId] ?? 0);
    const tile = actor?.tile ?? descriptor.defaultTile;
    const assignedModel = sceneSync.agentModelById[descriptor.id];
    const modelLabel = assignedModel
      ? assignedModel.modelLabel
      : descriptor.actorId === MAIN_ACTOR_ID
        ? `${sceneSync.selectedProvider.toUpperCase()} / ${sceneSync.selectedProfileKey || "default"}`
        : descriptor.defaultModelLabel;

    return {
      id: descriptor.id,
      name: descriptor.actorId === MAIN_ACTOR_ID ? mainAgentName : descriptor.displayName,
      role: descriptor.roleLabel,
      roleLabel: getRoleLabel(descriptor, t),
      stateLabel: getLoopLabel(loopState, t),
      fatigue: usagePercent,
      usagePercent,
      modelLabel,
      locationLabel: getLocationLabel(tile, t),
      spriteId: descriptor.useLeadSpriteFromProbe ? getLeadSpriteId(sceneSync.probeState) : officeNpcProfiles[descriptor.actorRole]?.spriteId ?? getNpcSpriteId(descriptor.roleLabel),
      animState: getSpriteAnimStateFromLoop(loopState)
    };
  });
};
