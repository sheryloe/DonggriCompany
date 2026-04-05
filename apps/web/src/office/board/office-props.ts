import type { RoomItemKind, RoomItemVariantId } from "./scene-types";

export type AssetLicense = "CC0" | "CC-BY-4.0" | "CC-BY-SA-4.0";
export type AssetStyleGroup = "lpc" | "oga";

export type AssetManifestEntry = {
  assetId: string;
  sourceUrl: string;
  license: AssetLicense;
  author: string;
  attributionRequired: boolean;
  pack: string;
  styleGroup: AssetStyleGroup;
  tileSize: number;
};

export type ToneNormalization = {
  saturation: number;
  brightness: number;
  contrast: number;
  tint: number;
  alpha: number;
};

export type RoomPropVariant = AssetManifestEntry & {
  id: RoomItemVariantId;
  label: string;
  path: string;
};

type RawRoomPropVariant = Omit<RoomPropVariant, "assetId">;

const toneByStyleGroup: Record<AssetStyleGroup, ToneNormalization> = {
  lpc: {
    saturation: 0.98,
    brightness: 1.02,
    contrast: 1.04,
    tint: 0xf2eee5,
    alpha: 1
  },
  oga: {
    saturation: 1.02,
    brightness: 1,
    contrast: 1.02,
    tint: 0xffffff,
    alpha: 1
  }
};

const withAssetId = (variant: RawRoomPropVariant): RoomPropVariant => ({
  ...variant,
  assetId: variant.id
});

export const roomPropVariants: Record<RoomItemKind, RoomPropVariant[]> = {
  desk: [
    withAssetId({
      id: "desk-lpc",
      label: "Desk (LPC)",
      path: "/pixel-tycoon/props/desk-lpc.png",
      sourceUrl: "https://opengameart.org/content/lpc-wooden-furniture",
      license: "CC-BY-SA-4.0",
      author: "bluecarrot16",
      attributionRequired: true,
      pack: "LPC Wooden Furniture",
      styleGroup: "lpc",
      tileSize: 32
    })
  ],
  terminal: [
    withAssetId({
      id: "terminal-lpc",
      label: "Terminal (LPC)",
      path: "/pixel-tycoon/props/terminal-lpc.png",
      sourceUrl: "https://opengameart.org/content/lpc-wooden-furniture",
      license: "CC-BY-SA-4.0",
      author: "bluecarrot16",
      attributionRequired: true,
      pack: "LPC Wooden Furniture",
      styleGroup: "lpc",
      tileSize: 32
    })
  ],
  plant: [
    withAssetId({
      id: "plant-oga-a",
      label: "Plant (OGA A)",
      path: "/pixel-tycoon/props/plant-oga-a.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    }),
    withAssetId({
      id: "plant-oga-b",
      label: "Plant (OGA B)",
      path: "/pixel-tycoon/props/plant-oga-b.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    })
  ],
  sofa: [
    withAssetId({
      id: "sofa-lpc",
      label: "Sofa (LPC)",
      path: "/pixel-tycoon/props/sofa-lpc.png",
      sourceUrl: "https://opengameart.org/content/lpc-wooden-furniture",
      license: "CC-BY-SA-4.0",
      author: "bluecarrot16",
      attributionRequired: true,
      pack: "LPC Wooden Furniture",
      styleGroup: "lpc",
      tileSize: 32
    })
  ],
  board: [
    withAssetId({
      id: "board-oga-arch",
      label: "Board (Arch)",
      path: "/pixel-tycoon/props/oga-arch-chart.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    }),
    withAssetId({
      id: "board-oga-risk",
      label: "Board (Risk)",
      path: "/pixel-tycoon/props/oga-risk-chart.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    }),
    withAssetId({
      id: "board-oga-validate",
      label: "Board (Validation)",
      path: "/pixel-tycoon/props/oga-product-validation.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    }),
    withAssetId({
      id: "board-oga-resources",
      label: "Board (Resources)",
      path: "/pixel-tycoon/props/oga-resources-planning.png",
      sourceUrl: "https://opengameart.org/content/office-objects",
      license: "CC0",
      author: "malek elsady",
      attributionRequired: false,
      pack: "Office Objects",
      styleGroup: "oga",
      tileSize: 32
    })
  ]
};

export const roomAssetManifest: AssetManifestEntry[] = Object.values(roomPropVariants)
  .flat()
  .map(({ id: _id, label: _label, path: _path, ...meta }) => meta);

const requiredManifestFields: Array<keyof AssetManifestEntry> = [
  "assetId",
  "sourceUrl",
  "license",
  "author",
  "attributionRequired",
  "pack",
  "styleGroup",
  "tileSize"
];

export const validateAssetManifest = (
  manifest: AssetManifestEntry[] = roomAssetManifest
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  manifest.forEach((entry, index) => {
    requiredManifestFields.forEach((field) => {
      if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
        errors.push(`manifest[${index}] missing ${field}`);
      }
    });
    if (seenIds.has(entry.assetId)) {
      errors.push(`duplicate assetId: ${entry.assetId}`);
    }
    seenIds.add(entry.assetId);
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

const licenseTitle = (license: AssetLicense): string => {
  if (license === "CC-BY-SA-4.0") {
    return "CC-BY-SA 4.0";
  }
  if (license === "CC-BY-4.0") {
    return "CC-BY 4.0";
  }
  return "CC0";
};

export const buildThirdPartyAssetsMarkdown = (
  manifest: AssetManifestEntry[] = roomAssetManifest
): string => {
  const lines: string[] = ["# Third-Party Assets", "", "_Generated from office asset manifest._", ""];

  manifest.forEach((entry) => {
    lines.push(`## ${entry.assetId}`);
    lines.push(`- Source: ${entry.sourceUrl}`);
    lines.push(`- License: ${licenseTitle(entry.license)}`);
    lines.push(`- Author: ${entry.author}`);
    lines.push(`- Attribution Required: ${entry.attributionRequired ? "yes" : "no"}`);
    lines.push(`- Pack: ${entry.pack}`);
    lines.push(`- Style Group: ${entry.styleGroup}`);
    lines.push(`- Tile Size: ${entry.tileSize}`);
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
};

export const getToneNormalizationByStyleGroup = (
  styleGroup: AssetStyleGroup
): ToneNormalization => {
  return toneByStyleGroup[styleGroup];
};

export const getToneNormalizationForVariant = (
  kind: RoomItemKind,
  variantId?: RoomItemVariantId
): ToneNormalization => {
  const variant = getRoomPropVariant(kind, variantId);
  return getToneNormalizationByStyleGroup(variant.styleGroup);
};

export const getDefaultRoomPropVariantId = (kind: RoomItemKind): RoomItemVariantId => {
  return roomPropVariants[kind][0]?.id ?? `${kind}-default`;
};

export const getRoomPropVariant = (
  kind: RoomItemKind,
  variantId?: RoomItemVariantId
): RoomPropVariant => {
  const variants = roomPropVariants[kind];
  const fallback = variants[0];
  if (!variantId) {
    return fallback;
  }
  return variants.find((variant) => variant.id === variantId) ?? fallback;
};

export const listRoomPropVariants = (kind: RoomItemKind): RoomPropVariant[] => {
  return roomPropVariants[kind];
};
