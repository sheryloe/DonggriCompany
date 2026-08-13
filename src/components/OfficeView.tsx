import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  BriefcaseBusiness,
  Building2,
  FolderKanban,
  Gauge,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  type AnimatedSprite,
  type Application,
  type Container,
  type Graphics,
  type Sprite,
  type Text,
  type Texture,
} from "pixi.js";
import { useI18n } from "../i18n";
import { useTheme, type ThemeMode } from "../ThemeContext";
import CliUsagePanel from "./office-view/CliUsagePanel";
import VirtualPadOverlay from "./office-view/VirtualPadOverlay";
import {
  type Delivery,
  type MobileMoveDirection,
  type OfficeCeoTransit,
  type OfficeViewProps,
  type RoomRect,
  type SubCloneBurstParticle,
  type WallClockVisual,
  canScrollOnAxis,
  findScrollContainer,
  MIN_OFFICE_W,
  MOBILE_MOVE_CODES,
} from "./office-view/model";
import {
  countOfficeActivitySignals,
  deriveOfficeAgentActivityPlacements,
  type OfficeActivitySignals,
} from "./office-view/officeActivitySpaces";
import {
  deriveOfficeOpsDashboardSnapshot,
  type OfficeOpsDashboardSnapshot,
  type OfficeOpsTone,
} from "./office-view/officeOperationalRealism";
import { type SupportedLocale } from "./office-view/themes-locale";
import { useCliUsage } from "./office-view/useCliUsage";
import {
  useCeoOfficeCallAnimations,
  useCrossDeptDeliveryAnimations,
  useMeetingPresenceSync,
} from "./office-view/useOfficeDeliveryEffects";
import { useOfficePixiRuntime } from "./office-view/useOfficePixiRuntime";
import { buildOfficeScene } from "./office-view/buildScene";

type OfficeFocusMode = "overview" | "pipeline" | "build" | "review" | "ops" | "memory";
type OfficeMoveArea = "shared" | "activity" | "rooftop" | "strategy" | "production" | "quality";
type OfficeFocusTarget =
  | "whole-office"
  | "workflow-line"
  | "work-bay"
  | "meeting-room"
  | "review-room"
  | "ops-corner"
  | "study-room"
  | "memory-archive";
type StatTone = "cyan" | "green" | "amber" | "rose" | "violet";

interface OfficeCommand {
  mode: OfficeFocusMode;
  label: string;
  caption: string;
  camera: OfficeMoveArea;
  target: OfficeFocusTarget;
  highlightTargetId?: string;
  icon: LucideIcon;
}

interface HudPanel {
  eyebrow: string;
  title: string;
  body: string;
  primary: string;
  secondary?: string;
  stats: Array<{ label: string; value: string | number; tone: StatTone }>;
}

const OFFICE_COMMANDS: OfficeCommand[] = [
  {
    mode: "overview",
    label: "요약",
    caption: "전체 사무실",
    camera: "shared",
    target: "whole-office",
    icon: Building2,
  },
  {
    mode: "pipeline",
    label: "업무 흐름",
    caption: "작업 라인",
    camera: "activity",
    target: "workflow-line",
    highlightTargetId: "planning",
    icon: BriefcaseBusiness,
  },
  {
    mode: "build",
    label: "구현",
    caption: "업무 좌석",
    camera: "activity",
    target: "work-bay",
    highlightTargetId: "development",
    icon: Gauge,
  },
  {
    mode: "review",
    label: "검토",
    caption: "회의와 품질",
    camera: "quality",
    target: "review-room",
    highlightTargetId: "quality",
    icon: ShieldCheck,
  },
  {
    mode: "ops",
    label: "운영",
    caption: "운영 코너",
    camera: "activity",
    target: "ops-corner",
    highlightTargetId: "operations",
    icon: FolderKanban,
  },
  {
    mode: "memory",
    label: "기억",
    caption: "학습실과 서고",
    camera: "activity",
    target: "memory-archive",
    highlightTargetId: "breakRoom",
    icon: Brain,
  },
];

const PROJECT_SCOPES = ["BloggerGent", "DonggriCompany", "JasoSul"];

function compactCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

function countTasksByStatus(tasks: OfficeViewProps["tasks"], status: string): number {
  return tasks.filter((task) => task.status === status).length;
}

function buildActivitySignals(params: {
  agents: OfficeViewProps["agents"];
  tasks: OfficeViewProps["tasks"];
  subAgents: OfficeViewProps["subAgents"];
  meetingPresence?: OfficeViewProps["meetingPresence"];
}): OfficeActivitySignals {
  const placements = deriveOfficeAgentActivityPlacements({
    agents: params.agents,
    tasks: params.tasks,
    meetingPresence: params.meetingPresence,
  });
  return countOfficeActivitySignals({ placements, subAgents: params.subAgents });
}

function buildHudPanel(
  mode: OfficeFocusMode,
  params: {
    tasks: OfficeViewProps["tasks"];
    agents: OfficeViewProps["agents"];
    subAgents: OfficeViewProps["subAgents"];
    meetingPresence?: OfficeViewProps["meetingPresence"];
    opsSnapshot: OfficeOpsDashboardSnapshot;
  },
): HudPanel {
  const { tasks, agents, subAgents, meetingPresence, opsSnapshot } = params;
  const activeTasks = opsSnapshot.counts.active;
  const reviewTasks = opsSnapshot.counts.review;
  const doneTasks = opsSnapshot.counts.done;
  const waitingTasks = opsSnapshot.counts.waiting;
  const workingAgents = agents.filter((agent) => agent.status === "working").length;
  const signals = buildActivitySignals({ agents, tasks, subAgents, meetingPresence });

  const commonStats: HudPanel["stats"] = [
    { label: "작업 중", value: compactCount(signals.work), tone: "green" },
    { label: "회의 중", value: compactCount(signals.meeting), tone: "amber" },
    { label: "학습 중", value: compactCount(signals.study), tone: "violet" },
  ];

  if (mode === "pipeline") {
    return {
      eyebrow: "업무 흐름",
      title: "업무가 움직이는 작업 동선",
      body: "입구의 대기 문서가 업무 좌석, 회의실, 품질 게이트, 운영 코너로 이어지는 흐름을 강조합니다. 지금 막힌 곳은 티켓 더미와 상태등으로 바로 보입니다.",
      primary: "업무 보드 열기",
      secondary: "Control Plane 보기",
      stats: [
        { label: "대기", value: compactCount(waitingTasks), tone: "cyan" },
        { label: "진행", value: compactCount(activeTasks), tone: "green" },
        { label: "검토", value: compactCount(reviewTasks), tone: reviewTasks > 0 ? "rose" : "amber" },
      ],
    };
  }
  if (mode === "build") {
    return {
      eyebrow: "업무 좌석",
      title: "구현 워크스테이션",
      body: "배정된 에이전트가 책상 섬에서 작업하고, 분신 흐름은 보조 모니터와 티켓 트레이로 표시됩니다. 빈 장식보다 실제 작업 상태를 먼저 보여줍니다.",
      primary: "업무 보드 열기",
      stats: [
        { label: "작업 중", value: compactCount(signals.work), tone: "green" },
        { label: "분신", value: compactCount(signals.activeSubAgents), tone: "cyan" },
        { label: "완료", value: compactCount(doneTasks), tone: "amber" },
      ],
    };
  }
  if (mode === "review") {
    return {
      eyebrow: "검토 공간",
      title: "회의실과 품질 게이트",
      body: "회의 중인 에이전트, 리뷰 대기 업무, 승인 대기 신호를 한 화면에 묶어 보여줍니다. 검토가 쌓이면 품질 구역과 HUD가 먼저 경고합니다.",
      primary: "Control Plane 보기",
      stats: [
        { label: "회의 중", value: compactCount(signals.meeting), tone: "amber" },
        { label: "검토 필요", value: compactCount(reviewTasks), tone: reviewTasks > 0 ? "rose" : "green" },
        { label: "승인 대기", value: reviewTasks > 0 ? "확인" : "없음", tone: reviewTasks > 0 ? "amber" : "green" },
      ],
    };
  }
  if (mode === "ops") {
    return {
      eyebrow: "운영 연결",
      title: "작은 운영 관제 데스크",
      body: "OPS는 넓은 방이 아니라 모니터월, 서버랙, 프로젝트 보드를 갖춘 작은 관제 데스크입니다. 프로젝트 상태는 운영 보드와 신호등으로 읽힙니다.",
      primary: "프로젝트 열기",
      secondary: "업무 보드 열기",
      stats: [
        { label: "운영", value: compactCount(signals.ops), tone: "green" },
        { label: "프로젝트", value: PROJECT_SCOPES.length, tone: "cyan" },
        { label: "연결", value: "준비", tone: "amber" },
      ],
    };
  }
  if (mode === "memory") {
    return {
      eyebrow: "학습과 기억",
      title: "학습실과 기억 서고",
      body: "학습 대기, 외부강사 세션, 기억 준비 상태를 자료 책상과 기억 서고로 보여줍니다. 실제 기억 저장은 승인 기반 요약만 허용됩니다.",
      primary: "Memory 열기",
      stats: [
        { label: "학습 중", value: compactCount(signals.study), tone: "violet" },
        { label: "기억 준비", value: "안전", tone: "green" },
        { label: "오프라인", value: compactCount(signals.offline), tone: "cyan" },
      ],
    };
  }
  return {
    eyebrow: "사무실 현황",
    title: "Dongri-grigri 운영 사무실",
    body: "캐릭터, 책상, 회의실, 운영 관제 데스크, 학습실, 기억 서고가 실제 업무 상태와 연결되어 돌아갑니다. 장식용 방보다 오늘의 운영 상태가 먼저 보이게 정리했습니다.",
    primary: "Control Plane 보기",
    secondary: "업무 보드 열기",
    stats: [
      { label: "부서", value: 6, tone: "cyan" },
      { label: "근무", value: compactCount(workingAgents), tone: "green" },
      { label: "업무", value: compactCount(tasks.length), tone: "amber" },
    ],
  };
}

function toneClassName(tone: OfficeOpsTone): string {
  if (tone === "green") return "border-emerald-300/40 bg-emerald-300/10";
  if (tone === "amber") return "border-amber-300/40 bg-amber-300/10";
  if (tone === "rose") return "border-rose-300/40 bg-rose-300/10";
  if (tone === "violet") return "border-violet-300/40 bg-violet-300/10";
  if (tone === "slate") return "border-slate-300/30 bg-slate-300/10";
  return "border-cyan-300/40 bg-cyan-300/10";
}

function HudActionButton({ children, onClick }: { children: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-bold transition hover:bg-cyan-300/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onClick}
      disabled={!onClick}
      style={{ color: "var(--th-text-heading)" }}
    >
      {children}
    </button>
  );
}

export default function OfficeView({
  departments,
  agents,
  tasks,
  subAgents,
  meetingPresence,
  activeMeetingTaskId,
  unreadAgentIds,
  crossDeptDeliveries,
  onCrossDeptDeliveryProcessed,
  ceoOfficeCalls,
  onCeoOfficeCallProcessed,
  onOpenActiveMeetingMinutes,
  customDeptThemes,
  themeHighlightTargetId,
  pixelAgentMode,
  onOpenTasks,
  onOpenProjects,
  onOpenMemory,
  onOpenControlPlane,
  onSelectAgent,
  onSelectDepartment,
}: OfficeViewProps) {
  const { language, t } = useI18n();
  const { theme: currentTheme } = useTheme();
  const [focusMode, setFocusMode] = useState<OfficeFocusMode>("overview");
  const [focusTarget, setFocusTarget] = useState<OfficeFocusTarget>("whole-office");
  const selectedCommand = OFFICE_COMMANDS.find((command) => command.mode === focusMode) ?? OFFICE_COMMANDS[0];
  const opsSnapshot = useMemo(
    () => deriveOfficeOpsDashboardSnapshot({ agents, tasks, subAgents, meetingPresence }),
    [agents, meetingPresence, subAgents, tasks],
  );
  const panel = useMemo(
    () => buildHudPanel(focusMode, { tasks, agents, subAgents, meetingPresence, opsSnapshot }),
    [agents, focusMode, meetingPresence, opsSnapshot, subAgents, tasks],
  );
  const activitySignals = useMemo(
    () => buildActivitySignals({ agents, tasks, subAgents, meetingPresence }),
    [agents, meetingPresence, subAgents, tasks],
  );

  const themeRef = useRef<ThemeMode>(currentTheme);
  themeRef.current = currentTheme;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const texturesRef = useRef<Record<string, Texture>>({});
  const destroyedRef = useRef(false);
  const initIdRef = useRef(0);
  const initDoneRef = useRef(false);
  const [sceneRevision, setSceneRevision] = useState(0);

  const tickRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const ceoPosRef = useRef({ x: 180, y: 60 });
  const ceoSpriteRef = useRef<Container | null>(null);
  const ceoTransitRef = useRef<OfficeCeoTransit | null>(null);
  const crownRef = useRef<Text | null>(null);
  const highlightRef = useRef<Graphics | null>(null);
  const animItemsRef = useRef<
    Array<{
      sprite: Container;
      status: string;
      baseX: number;
      baseY: number;
      particles: Container;
      agentId?: string;
      cliProvider?: string;
      cliUsageKey?: string;
      deskG?: Graphics;
      bedG?: Graphics;
      blanketG?: Graphics;
    }>
  >([]);
  const roomRectsRef = useRef<RoomRect[]>([]);
  const deliveriesRef = useRef<Delivery[]>([]);
  const deliveryLayerRef = useRef<Container | null>(null);
  const prevAssignRef = useRef<Set<string>>(new Set());
  const agentPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const processedCrossDeptRef = useRef<Set<string>>(new Set());
  const processedCeoOfficeRef = useRef<Set<string>>(new Set());
  const spriteMapRef = useRef<Map<string, number>>(new Map());
  const ceoMeetingSeatsRef = useRef<Array<{ x: number; y: number }>>([]);
  const totalHRef = useRef(600);
  const officeWRef = useRef(MIN_OFFICE_W);
  const ceoOfficeRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const breakRoomRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const breakAnimItemsRef = useRef<Array<{ sprite: Container; baseX: number; baseY: number }>>([]);
  const subCloneAnimItemsRef = useRef<
    Array<{
      container: Container;
      aura: Graphics;
      cloneVisual: Sprite;
      animated?: AnimatedSprite;
      frameCount: number;
      baseScale: number;
      baseX: number;
      baseY: number;
      phase: number;
      fireworkOffset: number;
    }>
  >([]);
  const subCloneBurstParticlesRef = useRef<SubCloneBurstParticle[]>([]);
  const subCloneSnapshotRef = useRef<Map<string, { parentAgentId: string; x: number; y: number }>>(new Map());
  const breakSteamParticlesRef = useRef<Container | null>(null);
  const breakBubblesRef = useRef<Container[]>([]);
  const wallClocksRef = useRef<WallClockVisual[]>([]);
  const wallClockSecondRef = useRef(-1);
  const localeRef = useRef<SupportedLocale>(language);
  localeRef.current = language;
  const themeHighlightTargetIdRef = useRef<string | null>(themeHighlightTargetId ?? null);
  themeHighlightTargetIdRef.current = themeHighlightTargetId ?? selectedCommand.highlightTargetId ?? null;
  const scrollHostXRef = useRef<HTMLElement | null>(null);
  const scrollHostYRef = useRef<HTMLElement | null>(null);
  const [showVirtualPad, setShowVirtualPad] = useState(false);

  const dataRef = useRef({
    departments,
    agents,
    tasks,
    subAgents,
    unreadAgentIds,
    meetingPresence,
    customDeptThemes,
    pixelAgentMode,
  });
  dataRef.current = {
    departments,
    agents,
    tasks,
    subAgents,
    unreadAgentIds,
    meetingPresence,
    customDeptThemes,
    pixelAgentMode,
  };

  const cbRef = useRef({
    onSelectAgent,
    onSelectDepartment,
    onOpenTasks,
    onOpenProjects,
    onOpenMemory,
    onOpenControlPlane,
  });
  cbRef.current = { onSelectAgent, onSelectDepartment, onOpenTasks, onOpenProjects, onOpenMemory, onOpenControlPlane };
  const activeMeetingTaskIdRef = useRef<string | null>(activeMeetingTaskId ?? null);
  activeMeetingTaskIdRef.current = activeMeetingTaskId ?? null;
  const meetingMinutesOpenRef = useRef<typeof onOpenActiveMeetingMinutes>(onOpenActiveMeetingMinutes);
  meetingMinutesOpenRef.current = onOpenActiveMeetingMinutes;

  const triggerDepartmentInteract = useCallback(() => {
    const cx = ceoPosRef.current.x;
    const cy = ceoPosRef.current.y;
    for (const rect of roomRectsRef.current) {
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y - 10 && cy <= rect.y + rect.h) {
        cbRef.current.onSelectDepartment(rect.dept);
        break;
      }
    }
  }, []);

  const setMoveDirectionPressed = useCallback((direction: MobileMoveDirection, pressed: boolean) => {
    for (const code of MOBILE_MOVE_CODES[direction]) {
      keysRef.current[code] = pressed;
    }
  }, []);

  const clearVirtualMovement = useCallback(() => {
    (Object.keys(MOBILE_MOVE_CODES) as MobileMoveDirection[]).forEach((direction) => {
      setMoveDirectionPressed(direction, false);
    });
  }, [setMoveDirectionPressed]);

  const moveCeoToOfficeArea = useCallback((area: OfficeMoveArea, mode: "stairs" | "elevator") => {
    const departmentGroups: Record<Exclude<OfficeMoveArea, "shared" | "activity" | "rooftop">, string[]> = {
      strategy: ["pmo", "planning"],
      production: ["dev", "development", "design"],
      quality: ["qa", "quality", "devsecops", "operations", "ops", "strategic_maintenance", "instructor"],
    };
    const breakRoomRect = breakRoomRectRef.current;
    const roomTargets =
      area === "strategy" || area === "production" || area === "quality"
        ? roomRectsRef.current.filter((room) => departmentGroups[area].includes(room.dept.id))
        : [];
    const targetY =
      area === "shared"
        ? (breakRoomRect?.y ?? 0)
        : area === "activity"
          ? (breakRoomRect?.y ?? 0) + Math.max(190, Math.floor((breakRoomRect?.h ?? 520) * 0.33))
          : area === "rooftop"
            ? (breakRoomRect?.y ?? 0) + Math.max(260, Math.floor((breakRoomRect?.h ?? 520) * 0.62))
            : Math.min(...roomTargets.map((room) => room.y));
    if (!Number.isFinite(targetY)) return;

    const destinationRoom = roomTargets[0] ?? roomRectsRef.current[0];
    const destinationX =
      area === "shared" || area === "activity" || area === "rooftop"
        ? Math.max(96, Math.min(officeWRef.current - 120, Math.floor(officeWRef.current * 0.28)))
        : destinationRoom
          ? destinationRoom.x + Math.min(destinationRoom.w - 42, 74)
          : Math.max(96, Math.floor(officeWRef.current * 0.3));
    const destinationY = Math.max(42, targetY + 42);
    const coreX = Math.max(82, officeWRef.current - 74);
    const currentY = ceoPosRef.current.y;

    ceoTransitRef.current = {
      area,
      mode,
      phase: "walk_to_core",
      coreX,
      coreY: currentY,
      destinationX,
      destinationY,
      pauseTicks: 0,
    };
  }, []);

  const followCeoInView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const scaleX = officeWRef.current > 0 ? container.clientWidth / officeWRef.current : 1;
    const scaleY = totalHRef.current > 0 ? container.clientHeight / totalHRef.current : scaleX;

    let hostX = scrollHostXRef.current;
    if (!hostX || !canScrollOnAxis(hostX, "x")) {
      hostX = findScrollContainer(container, "x") ?? (document.scrollingElement as HTMLElement | null);
      scrollHostXRef.current = hostX;
    }

    let hostY = scrollHostYRef.current;
    if (!hostY || !canScrollOnAxis(hostY, "y")) {
      hostY = findScrollContainer(container, "y") ?? (document.scrollingElement as HTMLElement | null);
      scrollHostYRef.current = hostY;
    }

    let nextLeft: number | null = null;
    let movedX = false;
    if (hostX) {
      const hostRectX = hostX.getBoundingClientRect();
      const ceoInHostX = containerRect.left - hostRectX.left + ceoPosRef.current.x * scaleX;
      const ceoContentX = hostX.scrollLeft + ceoInHostX;
      const targetLeft = ceoContentX - hostX.clientWidth * 0.45;
      const maxLeft = Math.max(0, hostX.scrollWidth - hostX.clientWidth);
      nextLeft = Math.max(0, Math.min(maxLeft, targetLeft));
      movedX = Math.abs(hostX.scrollLeft - nextLeft) > 1;
    }

    let nextTop: number | null = null;
    let movedY = false;
    if (hostY) {
      const hostRectY = hostY.getBoundingClientRect();
      const ceoInHostY = containerRect.top - hostRectY.top + ceoPosRef.current.y * scaleY;
      const ceoContentY = hostY.scrollTop + ceoInHostY;
      const targetTop = ceoContentY - hostY.clientHeight * 0.45;
      const maxTop = Math.max(0, hostY.scrollHeight - hostY.clientHeight);
      nextTop = Math.max(0, Math.min(maxTop, targetTop));
      movedY = Math.abs(hostY.scrollTop - nextTop) > 1;
    }

    if (hostX && hostY && hostX === hostY) {
      if (movedX || movedY) {
        hostX.scrollTo({
          left: movedX && nextLeft !== null ? nextLeft : hostX.scrollLeft,
          top: movedY && nextTop !== null ? nextTop : hostX.scrollTop,
          behavior: "auto",
        });
      }
      return;
    }

    if (hostX && movedX && nextLeft !== null)
      hostX.scrollTo({ left: nextLeft, top: hostX.scrollTop, behavior: "auto" });
    if (hostY && movedY && nextTop !== null) hostY.scrollTo({ left: hostY.scrollLeft, top: nextTop, behavior: "auto" });
  }, []);

  const buildScene = useCallback(() => {
    buildOfficeScene({
      appRef,
      texturesRef,
      dataRef,
      cbRef,
      activeMeetingTaskIdRef,
      meetingMinutesOpenRef,
      localeRef,
      themeRef,
      animItemsRef,
      roomRectsRef,
      deliveriesRef,
      deliveryLayerRef,
      prevAssignRef,
      agentPosRef,
      spriteMapRef,
      ceoMeetingSeatsRef,
      totalHRef,
      officeWRef,
      ceoPosRef,
      ceoSpriteRef,
      crownRef,
      highlightRef,
      ceoOfficeRectRef,
      breakRoomRectRef,
      breakAnimItemsRef,
      subCloneAnimItemsRef,
      subCloneBurstParticlesRef,
      subCloneSnapshotRef,
      breakSteamParticlesRef,
      breakBubblesRef,
      wallClocksRef,
      wallClockSecondRef,
      setSceneRevision,
    });
  }, []);

  const { cliStatus, cliUsage, cliPoolUsage, cliSessionUsage, cliUsageRef, refreshing, handleRefreshUsage } =
    useCliUsage(tasks);

  const tickerContext = useMemo(
    () => ({
      tickRef,
      keysRef,
      ceoPosRef,
      ceoSpriteRef,
      crownRef,
      highlightRef,
      animItemsRef,
      cliUsageRef,
      roomRectsRef,
      deliveriesRef,
      breakAnimItemsRef,
      subCloneAnimItemsRef,
      subCloneBurstParticlesRef,
      breakSteamParticlesRef,
      breakBubblesRef,
      wallClocksRef,
      wallClockSecondRef,
      themeHighlightTargetIdRef,
      ceoOfficeRectRef,
      breakRoomRectRef,
      ceoTransitRef,
      officeWRef,
      totalHRef,
      dataRef,
      followCeoInView,
    }),
    [cliUsageRef, followCeoInView],
  );

  useOfficePixiRuntime({
    containerRef,
    appRef,
    texturesRef,
    destroyedRef,
    initIdRef,
    initDoneRef,
    officeWRef,
    scrollHostXRef,
    scrollHostYRef,
    deliveriesRef,
    dataRef,
    buildScene,
    followCeoInView,
    triggerDepartmentInteract,
    keysRef,
    tickerContext,
    departments,
    agents,
    tasks,
    subAgents,
    unreadAgentIds,
    language,
    activeMeetingTaskId,
    customDeptThemes,
    pixelAgentMode,
    currentTheme,
  });

  useMeetingPresenceSync({
    meetingPresence,
    language,
    sceneRevision,
    deliveryLayerRef,
    texturesRef,
    ceoMeetingSeatsRef,
    deliveriesRef,
    spriteMapRef,
  });

  useCrossDeptDeliveryAnimations({
    crossDeptDeliveries,
    language,
    onCrossDeptDeliveryProcessed,
    deliveryLayerRef,
    texturesRef,
    agentPosRef,
    spriteMapRef,
    processedCrossDeptRef,
    deliveriesRef,
  });

  useCeoOfficeCallAnimations({
    ceoOfficeCalls,
    agents,
    language,
    onCeoOfficeCallProcessed,
    deliveryLayerRef,
    texturesRef,
    ceoMeetingSeatsRef,
    deliveriesRef,
    spriteMapRef,
    agentPosRef,
    processedCeoOfficeRef,
  });

  useEffect(() => {
    const updateVirtualPadVisibility = () => {
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const isNarrowViewport = window.innerWidth <= 1024;
      setShowVirtualPad(isCoarsePointer || isNarrowViewport);
    };
    updateVirtualPadVisibility();
    window.addEventListener("resize", updateVirtualPadVisibility);
    return () => window.removeEventListener("resize", updateVirtualPadVisibility);
  }, []);

  useEffect(() => {
    if (!showVirtualPad) clearVirtualMovement();
  }, [showVirtualPad, clearVirtualMovement]);

  useEffect(
    () => () => {
      clearVirtualMovement();
    },
    [clearVirtualMovement],
  );

  const handleModeChange = useCallback(
    (mode: OfficeFocusMode) => {
      setFocusMode(mode);
      const command = OFFICE_COMMANDS.find((candidate) => candidate.mode === mode);
      if (command) {
        setFocusTarget(command.target);
        moveCeoToOfficeArea(command.camera, "elevator");
      }
    },
    [moveCeoToOfficeArea],
  );

  const handleOpenProjects = useCallback(() => {
    handleModeChange("ops");
    onOpenProjects?.();
  }, [handleModeChange, onOpenProjects]);

  const handleOpenMemory = useCallback(() => {
    handleModeChange("memory");
    onOpenMemory?.();
  }, [handleModeChange, onOpenMemory]);

  const primaryAction = useMemo(() => {
    if (focusMode === "pipeline" || focusMode === "build") return onOpenTasks;
    if (focusMode === "ops") return handleOpenProjects;
    if (focusMode === "memory") return handleOpenMemory;
    return onOpenControlPlane;
  }, [focusMode, handleOpenMemory, handleOpenProjects, onOpenControlPlane, onOpenTasks]);

  const secondaryAction =
    focusMode === "overview" || focusMode === "pipeline" || focusMode === "ops" ? onOpenTasks : undefined;

  return (
    <section
      className={`pixel-office-shell w-full ${pixelAgentMode?.enabled ? "pixel-agent-mode" : ""} ${
        pixelAgentMode?.enabled ? `pixel-agent-density-${pixelAgentMode.density}` : ""
      }`}
      data-focus={focusMode}
      data-focus-target={focusTarget}
      data-camera={selectedCommand.camera}
      aria-label="Dongri-grigri 8bit 사무실"
      style={{ color: "var(--th-text-primary)" }}
    >
      <header
        className="mb-3 rounded-xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        style={{ borderColor: "var(--th-panel-border)", background: "var(--th-panel-bg)" }}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 dark:text-cyan-300">
              8bit Office
            </div>
            <h1 className="mt-1 text-xl font-black tracking-normal" style={{ color: "var(--th-text-heading)" }}>
              Dongri-grigri 사무실
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="사무실 명령">
            {OFFICE_COMMANDS.map((command) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.mode}
                  type="button"
                  className="rounded-lg border px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10 active:translate-y-px"
                  style={{
                    borderColor: focusMode === command.mode ? "rgba(34, 211, 238, 0.72)" : "var(--th-border)",
                    background: focusMode === command.mode ? "rgba(34, 211, 238, 0.16)" : "var(--th-panel-bg)",
                    color: focusMode === command.mode ? "var(--th-text-heading)" : "var(--th-text-primary)",
                  }}
                  onClick={() => handleModeChange(command.mode)}
                  aria-pressed={focusMode === command.mode}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                    {command.label}
                  </span>
                  <span className="mt-1 block text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    {command.caption}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[520px] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="pointer-events-none absolute left-4 top-4 z-[1] rounded-lg border border-slate-100/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 backdrop-blur">
            <div className="font-black text-cyan-200">{panel.title}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span>업무 {compactCount(tasks.length)}</span>
              <span>근무 {compactCount(agents.filter((agent) => agent.status === "working").length)}</span>
              <span>검토 {compactCount(opsSnapshot.counts.review)}</span>
              <span>회의 {compactCount(opsSnapshot.counts.meetingAgents)}</span>
              <span>초점 {selectedCommand.label}</span>
            </div>
          </div>
          <div
            ref={containerRef}
            data-testid="pixel-office-map"
            className="pixel-office-map mx-auto min-h-[500px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
            tabIndex={0}
            aria-label="픽셀 사무실 canvas"
            style={{ lineHeight: 0 }}
          />

          <VirtualPadOverlay
            showVirtualPad={showVirtualPad}
            t={t}
            onInteract={triggerDepartmentInteract}
            onSetMoveDirectionPressed={setMoveDirectionPressed}
          />
        </div>

        <aside
          className="rounded-xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
          aria-label="선택된 운영 패널"
          style={{
            borderColor: "var(--th-panel-border)",
            background: "var(--th-panel-bg)",
            color: "var(--th-text-primary)",
          }}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
            {panel.eyebrow}
          </div>
          <h2 className="mt-2 text-lg font-black tracking-normal">{panel.title}</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
            {panel.body}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {panel.stats.map((stat) => (
              <div
                key={`${stat.label}-${stat.value}`}
                className={`rounded-lg border px-2 py-2 text-center ${
                  stat.tone === "green"
                    ? "border-emerald-300/40 bg-emerald-300/10"
                    : stat.tone === "amber"
                      ? "border-amber-300/40 bg-amber-300/10"
                      : stat.tone === "rose"
                        ? "border-rose-300/40 bg-rose-300/10"
                        : stat.tone === "violet"
                          ? "border-violet-300/40 bg-violet-300/10"
                          : "border-cyan-300/40 bg-cyan-300/10"
                }`}
              >
                <div className="text-[10px] font-semibold" style={{ color: "var(--th-text-muted)" }}>
                  {stat.label}
                </div>
                <div className="mt-1 font-mono text-lg font-black">{stat.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <HudActionButton onClick={primaryAction}>{panel.primary}</HudActionButton>
            {panel.secondary && <HudActionButton onClick={secondaryAction}>{panel.secondary}</HudActionButton>}
          </div>

          <div className="mt-5 space-y-3">
            <section>
              <h3 className="text-sm font-black">운영 실황</h3>
              <div className="mt-2 grid gap-2">
                {opsSnapshot.liveRows.length > 0 ? (
                  opsSnapshot.liveRows.map((row) => (
                    <div key={row.id} className={`rounded-lg border px-3 py-2 text-left ${toneClassName(row.tone)}`}>
                      <div className="text-[11px] font-black" style={{ color: "var(--th-text-heading)" }}>
                        {row.label}
                      </div>
                      <div
                        className="mt-1 line-clamp-2 text-xs leading-5"
                        style={{ color: "var(--th-text-secondary)" }}
                      >
                        {row.detail}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    className="rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    지금은 긴급한 운영 신호가 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-sm font-black">
                <UsersRound className="h-4 w-4" aria-hidden="true" />
                활동 공간
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {[
                  ["작업 중", activitySignals.work],
                  ["회의 중", activitySignals.meeting],
                  ["운영 연결", activitySignals.ops],
                  ["학습 중", activitySignals.study],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border px-2 py-2"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    <div className="font-semibold" style={{ color: "var(--th-text-muted)" }}>
                      {label}
                    </div>
                    <div className="mt-1 font-mono text-base font-black">{value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-black">프로젝트 보드</h3>
              <div className="mt-2 grid gap-2">
                {PROJECT_SCOPES.map((project) => (
                  <button
                    key={project}
                    type="button"
                    onClick={handleOpenProjects}
                    className="rounded-lg border px-3 py-2 text-left text-sm font-bold transition hover:border-cyan-300 hover:bg-cyan-300/10 active:translate-y-px"
                    style={{
                      borderColor: "var(--th-border)",
                      background: "var(--th-bg-surface)",
                      color: "var(--th-text-primary)",
                    }}
                  >
                    {project}
                    <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--th-text-muted)" }}>
                      운영 보드
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-black">기억 서고</h3>
              <button
                type="button"
                onClick={handleOpenMemory}
                className="mt-2 w-full rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-left text-sm font-bold transition hover:bg-emerald-300/20 active:translate-y-px"
              >
                승인 기반 기억 상태 보기
              </button>
            </section>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-slate-100">
        <span>진행 업무 {compactCount(opsSnapshot.counts.active)}</span>
        <span>검토 대기 {compactCount(opsSnapshot.counts.review)}</span>
        <span>회의 중 {compactCount(opsSnapshot.counts.meetingAgents)}</span>
        <span>운영 감시 {compactCount(opsSnapshot.counts.opsAgents)}</span>
        <span>학습 준비 {compactCount(opsSnapshot.counts.learningAgents)}</span>
        <span>기억 준비 안전 모드</span>
        <span>WASD/방향키 이동, Enter 상호작용</span>
      </div>

      <CliUsagePanel
        cliStatus={cliStatus}
        cliUsage={cliUsage}
        cliPoolUsage={cliPoolUsage}
        cliSessionUsage={cliSessionUsage}
        language={language}
        refreshing={refreshing}
        onRefreshUsage={handleRefreshUsage}
        t={t}
      />
    </section>
  );
}
