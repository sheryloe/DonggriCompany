import type { Agent, Department } from "../../types";

const CEO_ZONE_H = 110;
const HALLWAY_H = 32;
const COLS_PER_ROW = 3;
const SLOT_H = 120;
const SHARED_FLOOR_H = 176;
const ROOFTOP_FLOOR_H = 132;
const BREAK_ROOM_GAP = 32;
const FLOOR_GAP = 24;
const FLOOR_LABEL_H = 26;
const ROOM_GAP = 24;
const SIDE_PAD = 22;
const MIN_ROOM_W = 304;
const DESKTOP_TRANSPORT_CORE_W = 112;
const MIN_WIDE_OFFICE_W = 1180;

export type OfficeFloorId = "shared" | "rooftop" | "strategy" | "production" | "quality";

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
  id:
    | "lobby"
    | "break"
    | "memory"
    | "project-board"
    | "smoking"
    | "roof-garden"
    | "roof-lounge";
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
  accent: number;
}

export interface OfficeTransportCoreLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OfficeFloorPlan {
  totalH: number;
  sharedFloorY: number;
  transportCore: OfficeTransportCoreLayout | null;
  roomLayouts: Map<string, OfficeRoomLayout>;
  sharedFacilities: SharedFacilityLayout[];
  floorBands: OfficeFloorBand[];
}

const FLOOR_DEPARTMENTS: Array<{
  id: Exclude<OfficeFloorId, "shared" | "rooftop">;
  label: string;
  level: string;
  departments: string[];
  accent: number;
}> = [
  { id: "strategy", label: "기획 구역", level: "기획", departments: ["pmo", "planning"], accent: 0x14b8a6 },
  {
    id: "production",
    label: "제작 구역",
    level: "제작",
    departments: ["dev", "development", "design"],
    accent: 0x3b82f6,
  },
  {
    id: "quality",
    label: "검토/운영 구역",
    level: "검토",
    departments: ["qa", "quality", "operations", "ops", "instructor", "devsecops", "strategic_maintenance"],
    accent: 0xf97316,
  },
];

function countRows(itemCount: number, cols: number): number {
  return Math.max(1, Math.ceil(Math.max(1, itemCount) / Math.max(1, cols)));
}

function getTransportCoreWidth(officeW: number): number {
  return officeW >= 560 ? DESKTOP_TRANSPORT_CORE_W : 0;
}

export function estimateOfficeSceneWidth(params: { viewportW: number; departments: Department[] }): number {
  const { viewportW, departments } = params;
  const knownDepartmentIds = new Set(departments.map((department) => department.id));
  const maxDepartmentsOnFloor = Math.max(
    1,
    ...FLOOR_DEPARTMENTS.map(
      (floor) => floor.departments.filter((departmentId) => knownDepartmentIds.has(departmentId)).length,
    ),
  );
  const transportWidth = Math.max(Math.floor(viewportW), MIN_WIDE_OFFICE_W) >= 560 ? DESKTOP_TRANSPORT_CORE_W : 0;
  const minimumFloorWidth =
    SIDE_PAD * 2 + transportWidth + maxDepartmentsOnFloor * MIN_ROOM_W + (maxDepartmentsOnFloor - 1) * ROOM_GAP + 48;
  return Math.max(Math.floor(viewportW), MIN_WIDE_OFFICE_W, minimumFloorWidth);
}

function computeCols(usableW: number, itemCount: number): number {
  const maxColsByWidth = Math.max(1, Math.floor((usableW - SIDE_PAD * 2 + ROOM_GAP) / (MIN_ROOM_W + ROOM_GAP)));
  return Math.max(1, Math.min(itemCount, maxColsByWidth));
}

function roomHeightForAgents(agents: Agent[]): number {
  const rows = countRows(agents.length, COLS_PER_ROW);
  return Math.max(188, rows * SLOT_H + 62);
}

function createFacilityLayouts(
  facilities: Array<Pick<SharedFacilityLayout, "id" | "label">>,
  params: {
    usableW: number;
    floorY: number;
    floorH: number;
    columns: number;
  },
): SharedFacilityLayout[] {
  const { usableW, floorY, floorH, columns } = params;
  const cols = Math.max(1, Math.min(columns, facilities.length));
  const rows = countRows(facilities.length, cols);
  const facilityGap = 12;
  const facilityW = Math.floor((usableW - SIDE_PAD * 2 - (cols - 1) * facilityGap) / cols);
  const facilityH = Math.floor((floorH - FLOOR_LABEL_H - 16 - (rows - 1) * facilityGap) / rows);

  return facilities.map((facility, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      ...facility,
      x: SIDE_PAD + col * (facilityW + facilityGap),
      y: floorY + FLOOR_LABEL_H + 10 + row * (facilityH + facilityGap),
      w: facilityW,
      h: facilityH,
    };
  });
}

export function buildOfficeFloorPlan(params: {
  officeW: number;
  departments: Department[];
  agents: Agent[];
}): OfficeFloorPlan {
  const { officeW, departments, agents } = params;
  const transportCoreWidth = getTransportCoreWidth(officeW);
  const usableW = officeW - transportCoreWidth;
  const roomLayouts = new Map<string, OfficeRoomLayout>();
  const floorBands: OfficeFloorBand[] = [];
  const sharedFloorY = CEO_ZONE_H + HALLWAY_H + 4;
  const sharedFloorH = SHARED_FLOOR_H;
  const rooftopFloorY = sharedFloorY + sharedFloorH + 18;
  const rooftopFloorH = ROOFTOP_FLOOR_H;
  const baseSharedFacilities: Array<Pick<SharedFacilityLayout, "id" | "label">> = [
    { id: "lobby", label: "입구" },
    { id: "break", label: "휴게실" },
    { id: "memory", label: "기억 서고" },
    { id: "project-board", label: "프로젝트 보드" },
  ];
  const baseRooftopFacilities: Array<Pick<SharedFacilityLayout, "id" | "label">> = [
    { id: "smoking", label: "전망 휴게" },
    { id: "roof-garden", label: "식물 정원" },
    { id: "roof-lounge", label: "리뷰 테라스" },
  ];
  const sharedFacilities: SharedFacilityLayout[] = [
    ...createFacilityLayouts(baseSharedFacilities, {
      usableW,
      floorY: sharedFloorY,
      floorH: sharedFloorH,
      columns: usableW >= 760 ? 4 : 2,
    }),
    ...createFacilityLayouts(baseRooftopFacilities, {
      usableW,
      floorY: rooftopFloorY,
      floorH: rooftopFloorH,
      columns: usableW >= 720 ? 3 : 1,
    }),
  ];

  floorBands.push({
    id: "shared",
    label: "공용 사무 구역",
    level: "공용",
    y: sharedFloorY,
    h: sharedFloorH,
    accent: 0xf59e0b,
  });
  floorBands.push({
    id: "rooftop",
    label: "옥상 휴게 구역",
    level: "옥상",
    y: rooftopFloorY,
    h: rooftopFloorH,
    accent: 0x22c55e,
  });

  let cursorY = rooftopFloorY + rooftopFloorH + BREAK_ROOM_GAP;
  const knownDepartmentIds = new Set(departments.map((department) => department.id));
  for (const floor of FLOOR_DEPARTMENTS) {
    const floorDepartments = floor.departments.filter((departmentId) => knownDepartmentIds.has(departmentId));
    if (floorDepartments.length === 0) continue;

    const cols = computeCols(usableW, floorDepartments.length);
    const roomW = Math.max(MIN_ROOM_W, Math.floor((usableW - SIDE_PAD * 2 - (cols - 1) * ROOM_GAP) / cols));
    const rows = countRows(floorDepartments.length, cols);
    const rowHeights = Array.from({ length: rows }, (_, rowIndex) => {
      const rowDepartmentIds = floorDepartments.slice(rowIndex * cols, rowIndex * cols + cols);
      return Math.max(
        188,
        ...rowDepartmentIds.map((departmentId) =>
          roomHeightForAgents(agents.filter((agent) => agent.department_id === departmentId)),
        ),
      );
    });

    const floorY = cursorY;
    for (let index = 0; index < floorDepartments.length; index += 1) {
      const departmentId = floorDepartments[index];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const rowH = rowHeights[row] ?? 188;
      const rowStartY =
        floorY + FLOOR_LABEL_H + 10 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + ROOM_GAP, 0);
      roomLayouts.set(departmentId, {
        deptId: departmentId,
        floorId: floor.id,
        floorLabel: floor.label,
        x: SIDE_PAD + col * (roomW + ROOM_GAP),
        y: rowStartY,
        w: roomW,
        h: rowH,
      });
    }

    const floorH =
      FLOOR_LABEL_H + 10 + rowHeights.reduce((sum, height, index) => sum + height + (index > 0 ? ROOM_GAP : 0), 0);
    floorBands.push({
      id: floor.id,
      label: floor.label,
      level: floor.level,
      y: floorY,
      h: floorH,
      accent: floor.accent,
    });
    cursorY = floorY + floorH + FLOOR_GAP;
  }

  const overflowDepartments = departments.filter((department) => !roomLayouts.has(department.id));
  if (overflowDepartments.length > 0) {
    const cols = computeCols(usableW, overflowDepartments.length);
    const roomW = Math.max(MIN_ROOM_W, Math.floor((usableW - SIDE_PAD * 2 - (cols - 1) * ROOM_GAP) / cols));
    const roomH = Math.max(
      188,
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
        floorLabel: "확장 구역",
        x: SIDE_PAD + col * (roomW + ROOM_GAP),
        y: floorY + FLOOR_LABEL_H + 10 + row * (roomH + ROOM_GAP),
        w: roomW,
        h: roomH,
      });
    });
    const rows = countRows(overflowDepartments.length, cols);
    const floorH = FLOOR_LABEL_H + 10 + rows * roomH + (rows - 1) * ROOM_GAP;
    floorBands.push({ id: "quality", label: "확장 구역", level: "확장", y: floorY, h: floorH, accent: 0xf97316 });
    cursorY = floorY + floorH + FLOOR_GAP;
  }

  const firstBandY = floorBands[0]?.y ?? sharedFloorY;
  const lastBand = floorBands[floorBands.length - 1];
  const transportCore =
    transportCoreWidth > 0 && lastBand
      ? {
          x: usableW + 8,
          y: firstBandY - 10,
          w: Math.max(72, transportCoreWidth - 16),
          h: lastBand.y + lastBand.h - firstBandY + 22,
        }
      : null;

  return {
    totalH: cursorY + 20,
    sharedFloorY,
    transportCore,
    roomLayouts,
    sharedFacilities,
    floorBands,
  };
}
