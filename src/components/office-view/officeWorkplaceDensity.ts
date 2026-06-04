import type { OfficeRoleSpaceId } from "./officeActivitySpaces";
import type { SharedFacilityLayout } from "./officeFloorPlan";

export type OfficeWorkplacePropKind =
  | "desk"
  | "monitor"
  | "chair"
  | "partition"
  | "cable"
  | "ticketTray"
  | "whiteboard"
  | "nocWall"
  | "serverRack"
  | "projectBoard"
  | "archiveCabinet"
  | "lounge";

export type OfficeWorkplaceDensity = "compact" | "standard" | "dense" | "control";

export interface OfficeWorkplaceDensityZone {
  id: OfficeRoleSpaceId | SharedFacilityLayout["id"];
  density: OfficeWorkplaceDensity;
  props: OfficeWorkplacePropKind[];
  loungeAllowed: boolean;
}
const ROLE_SPACE_DENSITY: Record<OfficeRoleSpaceId, OfficeWorkplaceDensityZone> = {
  "work-bay": {
    id: "work-bay",
    density: "dense",
    loungeAllowed: false,
    props: ["desk", "monitor", "chair", "partition", "ticketTray", "cable"],
  },
  "meeting-room": {
    id: "meeting-room",
    density: "standard",
    loungeAllowed: false,
    props: ["desk", "chair", "whiteboard", "partition", "monitor"],
  },
  "ops-corner": {
    id: "ops-corner",
    density: "control",
    loungeAllowed: false,
    props: ["nocWall", "serverRack", "monitor", "projectBoard", "cable", "desk"],
  },
  "study-room": {
    id: "study-room",
    density: "standard",
    loungeAllowed: false,
    props: ["desk", "monitor", "whiteboard", "archiveCabinet", "chair"],
  },
  "memory-archive": {
    id: "memory-archive",
    density: "compact",
    loungeAllowed: false,
    props: ["archiveCabinet", "whiteboard", "ticketTray"],
  },
  "break-room": {
    id: "break-room",
    density: "compact",
    loungeAllowed: true,
    props: ["lounge"],
  },
};

const SHARED_FACILITY_DENSITY: Record<SharedFacilityLayout["id"], OfficeWorkplaceDensityZone> = {
  lobby: {
    id: "lobby",
    density: "standard",
    loungeAllowed: false,
    props: ["desk", "monitor", "chair", "whiteboard"],
  },
  break: {
    id: "break",
    density: "compact",
    loungeAllowed: true,
    props: ["lounge"],
  },
  memory: {
    id: "memory",
    density: "standard",
    loungeAllowed: false,
    props: ["archiveCabinet", "whiteboard", "ticketTray"],
  },
  "project-board": {
    id: "project-board",
    density: "control",
    loungeAllowed: false,
    props: ["projectBoard", "serverRack", "monitor", "cable"],
  },
  smoking: {
    id: "smoking",
    density: "compact",
    loungeAllowed: false,
    props: ["partition", "monitor"],
  },
  "roof-garden": {
    id: "roof-garden",
    density: "compact",
    loungeAllowed: false,
    props: ["whiteboard"],
  },
  "roof-lounge": {
    id: "roof-lounge",
    density: "standard",
    loungeAllowed: false,
    props: ["desk", "monitor", "chair"],
  },
};

export function getRoleSpaceWorkplaceDensity(id: OfficeRoleSpaceId): OfficeWorkplaceDensityZone {
  return ROLE_SPACE_DENSITY[id];
}

export function getSharedFacilityWorkplaceDensity(id: SharedFacilityLayout["id"]): OfficeWorkplaceDensityZone {
  return SHARED_FACILITY_DENSITY[id];
}

export function isLoungeFurnitureAllowed(id: OfficeRoleSpaceId | SharedFacilityLayout["id"]): boolean {
  return id in ROLE_SPACE_DENSITY
    ? ROLE_SPACE_DENSITY[id as OfficeRoleSpaceId].loungeAllowed
    : SHARED_FACILITY_DENSITY[id as SharedFacilityLayout["id"]].loungeAllowed;
}
