import type { ProbeUiState } from "../lib/probe-ui-state";

export type AgentWorkLoopState = "idle" | "moving_to_task" | "working" | "moving_to_pm" | "reporting" | "waiting_review" | "blocked";
export type SimulationSpeed = "1x" | "2x" | "4x";
export type AgentSimFsmState = AgentWorkLoopState;
export type SpriteCharacterId = "char_0" | "char_1" | "char_2" | "char_3" | "char_4" | "char_5";
export type SpriteAnimState = "idle" | "walk" | "report";
export type FacingDir = "left" | "right";

export type RoomItemKind = "desk" | "terminal" | "plant" | "sofa" | "board";
export type RoomItemVariantId = string;

export type TileCoord = {
  x: number;
  y: number;
};

export type NpcRoleProfile = {
  role: string;
  displayName: string;
  roleLabel: string;
  spriteId: SpriteCharacterId;
  modelLabel: string;
  roomLabel: string;
  scheduler: "patrol" | "stationary" | "review";
  interruptOnError: boolean;
  phaseDurations: {
    moving_to_task: number;
    working: number;
    moving_to_pm: number;
    reporting: number;
    waiting_review: number;
  };
  patrolRoute: TileCoord[];
};

export type LoopEventType =
  | "tick"
  | "runProbe"
  | "refreshHistory"
  | "setSimSpeed"
  | "pauseSim"
  | "resumeSim"
  | "resetSimulation"
  | "probeError"
  | "probeRecovered";

export type LoopEventPhase = "pending" | "committed" | "rejected";

export type LoopEvent = {
  type: LoopEventType;
  atTick: number;
  source: "hud" | "system";
  phase: LoopEventPhase;
  detail?: string;
};

export type RoomTileItem = {
  id: string;
  kind: RoomItemKind;
  variantId: RoomItemVariantId;
  label: string;
  tile: TileCoord;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
};

export type TileOccupancy = {
  width: number;
  height: number;
  blocked: Set<string>;
};

export type NpcActorState = {
  id: string;
  name: string;
  role: string;
  tone: "mint" | "amber" | "violet" | "indigo" | "rose" | "slate";
  spriteId: SpriteCharacterId;
  state: AgentWorkLoopState;
  facing: FacingDir;
  tile: TileCoord;
  target: TileCoord | null;
  path: TileCoord[];
};

export type AgentMonitorEntry = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  stateLabel: string;
  fatigue: number;
  usagePercent: number;
  modelLabel: string;
  locationLabel: string;
  spriteId: SpriteCharacterId;
  animState: SpriteAnimState;
};

export type TycoonKpi = {
  throughput: number;
  queueDepth: number;
  slaRisk: "low" | "medium" | "high";
  probeConfidence: "high" | "medium" | "low" | "none";
  avgAgentLoad: number;
};

export type AgentSimActor = {
  id: string;
  role: string;
  fsmState: AgentSimFsmState;
  facing: FacingDir;
  tile: TileCoord;
  path: TileCoord[];
  taskId: string | null;
  eta: number;
};

export type TycoonSimState = {
  tick: number;
  seed: number;
  simSpeed: SimulationSpeed;
  isPaused: boolean;
  loopState: AgentWorkLoopState;
  jobQueue: number;
  completedJobs: number;
  pmReports: number;
  agentLoad: Record<string, number>;
  agents: AgentSimActor[];
  phaseTicks: number;
  lastLoopEvent: LoopEvent | null;
};

export type RoomEditorState = {
  mode: "select" | "place" | "move";
  selection: string | null;
  history: {
    undoDepth: number;
    redoDepth: number;
  };
  palette: RoomItemKind;
};

export type HudCommandEvent = "runProbe" | "refreshHistory" | "setSimSpeed" | "pauseSim" | "resumeSim" | "resetSimulation";

export type TycoonEventLogItem = {
  id: string;
  tick: number;
  category: "system" | "agent" | "validation" | "error";
  message: string;
  actorId?: string;
  speaker?: string;
};

export type SceneSyncState = {
  loopState: AgentWorkLoopState;
  lastLoopEvent: LoopEvent | null;
  activeAgents: number;
  actors: AgentSimActor[];
  agentLoadById: Record<string, number>;
  selectedProvider: string;
  selectedPoolKey: string;
  selectedProfileKey: string;
  probeState: ProbeUiState;
  lastActionAt: string;
  kpi: TycoonKpi;
  simSpeed: SimulationSpeed;
  isPaused: boolean;
};

export type SceneEditorAction =
  | { type: "select"; itemId: string }
  | { type: "add"; itemId: string; kind: RoomItemKind; tile: TileCoord }
  | { type: "add-blocked"; kind: RoomItemKind; tile: TileCoord }
  | { type: "move"; itemId: string; from: TileCoord; to: TileCoord }
  | { type: "remove"; itemId: string }
  | { type: "toggle-lock"; itemId: string; locked: boolean }
  | { type: "reset" };
