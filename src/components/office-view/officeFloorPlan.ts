import type { Agent, Department } from "../../types";

const CEO_ZONE_H = 110;
const HALLWAY_H = 32;
const COLS_PER_ROW = 3;
const SLOT_H = 120;
const BREAK_ROOM_H = 150;
const BREAK_ROOM_GAP = 32;

export type OfficeFloorId = "shared" | "strategy" | "production" | "quality";

export interface OfficeRoomLayout {
  deptId: string;
  floorId: OfficeFloorId;
  floorLabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SharedFacilityLayout {
  id: "lobby" | "break" | "study" | "after-hours";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OfficeFloorBand {
  id: OfficeFloorId;
  label: string;
  level: string;
  y: number;
  h: number;
}

export interface OfficeFloorPlan {
  totalH: number;
  sharedFloorY: number;
  roomLayouts: Map<string, OfficeRoomLayout>;
  sharedFacilities: SharedFacilityLayout[];
  floorBands: OfficeFloorBand[];
}

const FLOOR_GAP = 20;
const FLOOR_LABEL_H = 24;
const ROOM_GAP = 12;
const SIDE_PAD = 12;
const MIN_ROOM_W = 220;

const FLOOR_DEPARTMENTS: Array<{
  id: Exclude<OfficeFloorId, "shared">;
  label: string;
  level: string;
  departments: string[];
}> = [
  { id: "strategy", label: "전략층", level: "2F", departments: ["pmo", "planning"] },
  { id: "production", label: "제작층", level: "3F", departments: ["dev", "design"] },
  { id: "quality", label: "품질/운영층", level: "4F", departments: ["qa", "devsecops", "operations"] },
];

function countRows(itemCount: number, cols: number): number {
  return Math.max(1, Math.ceil(Math.max(1, itemCount) / Math.max(1, cols)));
}

function computeCols(officeW: number, itemCount: number): number {
  const maxColsByWidth = Math.max(1, Math.floor((officeW - SIDE_PAD * 2 + ROOM_GAP) / (MIN_ROOM_W + ROOM_GAP)));
  return Math.max(1, Math.min(itemCount, maxColsByWidth));
}

function roomHeightForAgents(agents: Agent[]): number {
  const rows = countRows(agents.length, COLS_PER_ROW);
  return Math.max(174, rows * SLOT_H + 54);
}

export function buildOfficeFloorPlan(params: {
  officeW: number;
  departments: Department[];
  agents: Agent[];
}): OfficeFloorPlan {
  const { officeW, departments, agents } = params;
  const roomLayouts = new Map<string, OfficeRoomLayout>();
  const floorBands: OfficeFloorBand[] = [];
  const sharedFloorY = CEO_ZONE_H + HALLWAY_H + 4;
  const sharedFloorH = BREAK_ROOM_H;
  const sharedCols = officeW >= 760 ? 4 : 2;
  const sharedRows = countRows(4, sharedCols);
  const facilityGap = 10;
  const facilityW = Math.floor((officeW - SIDE_PAD * 2 - (sharedCols - 1) * facilityGap) / sharedCols);
  const facilityH = Math.floor((sharedFloorH - FLOOR_LABEL_H - 16 - (sharedRows - 1) * facilityGap) / sharedRows);
  const baseFacilities: Array<Pick<SharedFacilityLayout, "id" | "label">> = [
    { id: "lobby", label: "로비" },
    { id: "break", label: "휴게실" },
    { id: "study", label: "학습실" },
    { id: "after-hours", label: "퇴근 공부실" },
  ];
  const sharedFacilities: SharedFacilityLayout[] = baseFacilities.map((facility, index) => {
    const col = index % sharedCols;
    const row = Math.floor(index / sharedCols);
    return {
      ...facility,
      x: SIDE_PAD + col * (facilityW + facilityGap),
      y: sharedFloorY + FLOOR_LABEL_H + 10 + row * (facilityH + facilityGap),
      w: facilityW,
      h: facilityH,
    };
  });

  floorBands.push({ id: "shared", label: "공용층", level: "1F", y: sharedFloorY, h: sharedFloorH });

  let cursorY = sharedFloorY + sharedFloorH + BREAK_ROOM_GAP;
  const knownDepartmentIds = new Set(departments.map((department) => department.id));
  for (const floor of FLOOR_DEPARTMENTS) {
    const floorDepartments = floor.departments.filter((departmentId) => knownDepartmentIds.has(departmentId));
    if (floorDepartments.length === 0) continue;

    const cols = computeCols(officeW, floorDepartments.length);
    const roomW = Math.max(MIN_ROOM_W, Math.floor((officeW - SIDE_PAD * 2 - (cols - 1) * ROOM_GAP) / cols));
    const rows = countRows(floorDepartments.length, cols);
    const rowHeights = Array.from({ length: rows }, (_, rowIndex) => {
      const rowDepartmentIds = floorDepartments.slice(rowIndex * cols, rowIndex * cols + cols);
      return Math.max(
        174,
        ...rowDepartmentIds.map((departmentId) =>
          roomHeightForAgents(agents.filter((agent) => agent.department_id === departmentId)),
        ),
      );
    });

    const floorY = cursorY;
    let rowY = floorY + FLOOR_LABEL_H + 8;
    for (let index = 0; index < floorDepartments.length; index += 1) {
      const departmentId = floorDepartments[index];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const rowH = rowHeights[row] ?? 174;
      const rowStartY = floorY + FLOOR_LABEL_H + 8 + rowHeights.slice(0, row).reduce((sum, h) => sum + h + ROOM_GAP, 0);
      roomLayouts.set(departmentId, {
        deptId: departmentId,
        floorId: floor.id,
        floorLabel: `${floor.level} ${floor.label}`,
        x: SIDE_PAD + col * (roomW + ROOM_GAP),
        y: rowStartY,
        w: roomW,
        h: rowH,
      });
      rowY = Math.max(rowY, rowStartY + rowH);
    }

    const floorH = FLOOR_LABEL_H + 8 + rowHeights.reduce((sum, h, index) => sum + h + (index > 0 ? ROOM_GAP : 0), 0);
    floorBands.push({ id: floor.id, label: floor.label, level: floor.level, y: floorY, h: floorH });
    cursorY = floorY + floorH + FLOOR_GAP;
  }

  const overflowDepartments = departments.filter((department) => !roomLayouts.has(department.id));
  if (overflowDepartments.length > 0) {
    const cols = computeCols(officeW, overflowDepartments.length);
    const roomW = Math.max(MIN_ROOM_W, Math.floor((officeW - SIDE_PAD * 2 - (cols - 1) * ROOM_GAP) / cols));
    const roomH = Math.max(
      174,
      ...overflowDepartments.map((department) =>
        roomHeightForAgents(agents.filter((agent) => agent.department_id === department.id)),
      ),
    );
    const floorY = cursorY;
    overflowDepartments.forEach((department, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      roomLayouts.set(department.id, {
        deptId: department.id,
        floorId: "quality",
        floorLabel: "4F 품질/운영층",
        x: SIDE_PAD + col * (roomW + ROOM_GAP),
        y: floorY + FLOOR_LABEL_H + 8 + row * (roomH + ROOM_GAP),
        w: roomW,
        h: roomH,
      });
    });
    const rows = countRows(overflowDepartments.length, cols);
    const floorH = FLOOR_LABEL_H + 8 + rows * roomH + (rows - 1) * ROOM_GAP;
    floorBands.push({ id: "quality", label: "확장 구역", level: "4F", y: floorY, h: floorH });
    cursorY = floorY + floorH + FLOOR_GAP;
  }

  return {
    totalH: cursorY + 16,
    sharedFloorY,
    roomLayouts,
    sharedFacilities,
    floorBands,
  };
}
