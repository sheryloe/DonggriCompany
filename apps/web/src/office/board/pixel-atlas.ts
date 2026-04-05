import type { ProbeUiState } from "../lib/probe-ui-state";
import type { AgentWorkLoopState, SpriteAnimState, SpriteCharacterId } from "./scene-types";

export const spriteCharacterIds: readonly SpriteCharacterId[] = ["char_0", "char_1", "char_2", "char_3", "char_4", "char_5"] as const;

const leadSpriteByProbeState: Record<ProbeUiState, SpriteCharacterId> = {
  success: "char_0",
  partial: "char_1",
  stale: "char_2",
  "no-signal": "char_4",
  error: "char_3"
};

const npcSpriteByRole: Record<string, SpriteCharacterId> = {
  "Router Ops": "char_5",
  "Runtime Ops": "char_2",
  "Probe Watch": "char_1",
  "History Desk": "char_4",
  "PM Liaison": "char_3",
  "Builder Agent": "char_0"
};

const spriteAnimByLoopState: Record<AgentWorkLoopState, SpriteAnimState> = {
  idle: "idle",
  moving_to_task: "walk",
  working: "walk",
  moving_to_pm: "walk",
  reporting: "report",
  waiting_review: "report",
  blocked: "idle"
};

const spriteAnimByProbeState: Record<ProbeUiState, SpriteAnimState> = {
  success: "walk",
  partial: "walk",
  stale: "idle",
  "no-signal": "idle",
  error: "report"
};

const spriteRowByAnimState: Record<SpriteAnimState, number> = {
  idle: 0,
  report: 1,
  walk: 2
};

const spriteSpeedByAnimState: Record<SpriteAnimState, number> = {
  idle: 0.12,
  walk: 0.2,
  report: 0.17
};

type SpriteTimingProfile = "main" | "router" | "runtime" | "probe" | "history" | "pm" | "builder" | "default";

const timingProfileByRole: Record<string, SpriteTimingProfile> = {
  "Router Ops": "router",
  "Runtime Ops": "runtime",
  "Probe Watch": "probe",
  "History Desk": "history",
  "PM Liaison": "pm",
  "Builder Agent": "builder"
};

const spriteSpeedByTimingProfile: Record<SpriteTimingProfile, Record<SpriteAnimState, number>> = {
  main: { idle: 0.11, walk: 0.24, report: 0.22 },
  router: { idle: 0.1, walk: 0.2, report: 0.16 },
  runtime: { idle: 0.09, walk: 0.17, report: 0.14 },
  probe: { idle: 0.13, walk: 0.22, report: 0.2 },
  history: { idle: 0.08, walk: 0.15, report: 0.13 },
  pm: { idle: 0.1, walk: 0.18, report: 0.24 },
  builder: { idle: 0.11, walk: 0.21, report: 0.18 },
  default: spriteSpeedByAnimState
};

const animationFrameIndexes = [0, 1, 2] as const;

export type SpriteSheetFrameSet = Record<SpriteAnimState, import("pixi.js").Texture[]>;

export const SPRITE_FRAME_WIDTH = 16;
export const SPRITE_FRAME_HEIGHT = 32;
export const SPRITE_SCALE = 1.8;

export const getCharacterSpritePath = (spriteId: SpriteCharacterId): string => {
  return `/pixel-tycoon/characters/${spriteId}.png`;
};

export const getLeadSpriteId = (probeState: ProbeUiState): SpriteCharacterId => {
  return leadSpriteByProbeState[probeState];
};

export const getNpcSpriteId = (role: string): SpriteCharacterId => {
  return npcSpriteByRole[role] ?? "char_5";
};

export const getSpriteAnimStateFromLoop = (state: AgentWorkLoopState): SpriteAnimState => {
  return spriteAnimByLoopState[state];
};

export const getSpriteAnimStateFromProbeState = (probeState: ProbeUiState): SpriteAnimState => {
  return spriteAnimByProbeState[probeState];
};

export const getSpriteAnimationSpeed = (animState: SpriteAnimState): number => {
  return spriteSpeedByAnimState[animState];
};

export const getMainSpriteAnimationSpeed = (animState: SpriteAnimState): number => {
  return spriteSpeedByTimingProfile.main[animState];
};

export const getNpcSpriteAnimationSpeed = (role: string, animState: SpriteAnimState): number => {
  const profile = timingProfileByRole[role] ?? "default";
  return spriteSpeedByTimingProfile[profile][animState];
};

export const buildSpriteSheetFrames = (
  PIXI: typeof import("pixi.js"),
  spriteId: SpriteCharacterId
): SpriteSheetFrameSet => {
  const sheetTexture = PIXI.Texture.from(getCharacterSpritePath(spriteId));

  const frames = {
    idle: [] as import("pixi.js").Texture[],
    walk: [] as import("pixi.js").Texture[],
    report: [] as import("pixi.js").Texture[]
  };

  (Object.keys(spriteRowByAnimState) as SpriteAnimState[]).forEach((animState) => {
    const rowIndex = spriteRowByAnimState[animState];
    frames[animState] = animationFrameIndexes.map((frameIndex) => {
      return new PIXI.Texture({
        source: sheetTexture.source,
        frame: new PIXI.Rectangle(
          frameIndex * SPRITE_FRAME_WIDTH,
          rowIndex * SPRITE_FRAME_HEIGHT,
          SPRITE_FRAME_WIDTH,
          SPRITE_FRAME_HEIGHT
        )
      });
    });
  });

  return frames;
};
