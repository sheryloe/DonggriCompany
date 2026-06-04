import { Rectangle, Sprite, Texture, type Container } from "pixi.js";

export const OFFICE_PROP_ATLAS_URL = "/sprites/office-renewal-v2/office-props-atlas.png";
export const OFFICE_PROP_ATLAS_TEXTURE_KEY = "office-props-atlas";

export type OfficeAssetKey =
  | "desk"
  | "chair"
  | "workstation"
  | "plant"
  | "documents"
  | "stickyBoard"
  | "coffee"
  | "lounge"
  | "serverRack"
  | "projectBoard"
  | "archiveCabinet"
  | "memoryBoxes"
  | "reviewGate"
  | "warningBeacon"
  | "designBoard"
  | "lectureBoard";

export interface OfficePropFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OFFICE_PROP_ATLAS_SIZE = { width: 1254, height: 1254 } as const;

export const OFFICE_PROP_FRAMES: Record<OfficeAssetKey, OfficePropFrame> = {
  desk: { x: 30, y: 34, w: 302, h: 274 },
  chair: { x: 366, y: 26, w: 218, h: 286 },
  workstation: { x: 635, y: 36, w: 282, h: 274 },
  plant: { x: 1012, y: 28, w: 214, h: 288 },
  documents: { x: 42, y: 360, w: 264, h: 238 },
  stickyBoard: { x: 326, y: 358, w: 290, h: 232 },
  coffee: { x: 652, y: 352, w: 236, h: 242 },
  lounge: { x: 948, y: 362, w: 292, h: 232 },
  serverRack: { x: 42, y: 628, w: 232, h: 250 },
  projectBoard: { x: 322, y: 636, w: 322, h: 230 },
  archiveCabinet: { x: 684, y: 626, w: 168, h: 276 },
  memoryBoxes: { x: 914, y: 626, w: 316, h: 254 },
  reviewGate: { x: 28, y: 934, w: 286, h: 270 },
  warningBeacon: { x: 368, y: 930, w: 190, h: 250 },
  designBoard: { x: 590, y: 934, w: 286, h: 268 },
  lectureBoard: { x: 902, y: 928, w: 326, h: 282 },
};

interface AddOfficePropOptions {
  x: number;
  y: number;
  maxW: number;
  maxH: number;
  anchor?: { x: number; y: number };
  alpha?: number;
  rotation?: number;
}

export function createOfficePropSprite(textures: Record<string, Texture>, assetKey: OfficeAssetKey): Sprite | null {
  const atlas = textures[OFFICE_PROP_ATLAS_TEXTURE_KEY];
  const frame = OFFICE_PROP_FRAMES[assetKey];
  if (!atlas || !frame) return null;

  const croppedTexture = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
  });
  return new Sprite(croppedTexture);
}

export function addOfficePropSprite(
  parent: Container,
  textures: Record<string, Texture>,
  assetKey: OfficeAssetKey,
  options: AddOfficePropOptions,
): Sprite | null {
  const sprite = createOfficePropSprite(textures, assetKey);
  if (!sprite) return null;

  sprite.anchor.set(options.anchor?.x ?? 0.5, options.anchor?.y ?? 0.5);
  const scale = Math.min(options.maxW / sprite.texture.width, options.maxH / sprite.texture.height);
  sprite.scale.set(Math.max(0.01, scale));
  sprite.position.set(options.x, options.y);
  sprite.alpha = options.alpha ?? 1;
  if (options.rotation) sprite.rotation = options.rotation;
  parent.addChild(sprite);
  return sprite;
}

export function isOfficePropFrameInsideAtlas(frame: OfficePropFrame): boolean {
  return (
    frame.x >= 0 &&
    frame.y >= 0 &&
    frame.w > 0 &&
    frame.h > 0 &&
    frame.x + frame.w <= OFFICE_PROP_ATLAS_SIZE.width &&
    frame.y + frame.h <= OFFICE_PROP_ATLAS_SIZE.height
  );
}
