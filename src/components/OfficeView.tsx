import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, BriefcaseBusiness, Building2, FolderKanban, Gauge, ShieldCheck, type LucideIcon } from "lucide-react";
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
type OfficeMoveArea = "shared" | "rooftop" | "strategy" | "production" | "quality";
type StatTone = "cyan" | "green" | "amber" | "rose";

interface OfficeCommand {
  mode: OfficeFocusMode;
  label: string;
  caption: string;
  camera: OfficeMoveArea;
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
  { mode: "overview", label: "요약", caption: "전체 사무실", camera: "shared", icon: Building2 },
  { mode: "pipeline", label: "업무 흐름", caption: "기획-구현-검토", camera: "strategy", icon: BriefcaseBusiness },
  { mode: "build", label: "구현", caption: "개발 구역", camera: "production", icon: Gauge },
  { mode: "review", label: "검토", caption: "품질 구역", camera: "quality", icon: ShieldCheck },
  { mode: "ops", label: "운영", caption: "OPS 관제 코너", camera: "quality", icon: FolderKanban },
  { mode: "memory", label: "기억", caption: "기억 서고", camera: "shared", icon: Brain },
];

const PROJECT_SCOPES = ["BloggerGent", "DonggriCompany", "JasoSul"];

function compactCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

function countTasksByStatus(tasks: OfficeViewProps["tasks"], status: string): number {
  return tasks.filter((task) => task.status === status).length;
}

function buildHudPanel(mode: OfficeFocusMode, params: { tasks: OfficeViewProps["tasks"]; agents: OfficeViewProps["agents"]; subAgents: OfficeViewProps["subAgents"] }): HudPanel {
  const { tasks, agents, subAgents } = params;
  const activeTasks = countTasksByStatus(tasks, "in_progress");
  const reviewTasks = countTasksByStatus(tasks, "review");
  const doneTasks = countTasksByStatus(tasks, "done");
  const waitingTasks = tasks.filter((task) => task.status === "pending" || task.status === "inbox").length;
  const workingAgents = agents.filter((agent) => agent.status === "working").length;
  const activeSubAgents = subAgents.filter((subAgent) => subAgent.status === "working").length;

  const commonStats: HudPanel["stats"] = [
    { label: "진행", value: compactCount(activeTasks), tone: "green" },
    { label: "검토", value: compactCount(reviewTasks), tone: "amber" },
    { label: "대기", value: compactCount(waitingTasks), tone: "cyan" },
  ];

  if (mode === "pipeline") {
    return {
      eyebrow: "업무 흐름",
      title: "작업 라인 점검",
      body: "기획에서 구현, 검토, 운영, 기억 보관으로 이어지는 사무실 동선을 강조합니다.",
      primary: "업무 보드 열기",
      secondary: "Control Plane 보기",
      stats: commonStats,
    };
  }
  if (mode === "build") {
    return {
      eyebrow: "구현 구역",
      title: "개발 좌석과 구현 대기열",
      body: "개발 구역의 모니터, 책상, 작업 문서가 현재 구현 상태를 보여줍니다.",
      primary: "업무 보드 열기",
      stats: [
        { label: "구현 중", value: compactCount(activeTasks), tone: "green" },
        { label: "서브", value: compactCount(activeSubAgents), tone: "cyan" },
        { label: "완료", value: compactCount(doneTasks), tone: "amber" },
      ],
    };
  }
  if (mode === "review") {
    return {
      eyebrow: "품질 구역",
      title: "검토 게이트와 증거 확인",
      body: "품질 구역은 테스트, 리뷰, evidence, handoff가 막히는 지점을 빠르게 보게 합니다.",
      primary: "Control Plane 보기",
      stats: [
        { label: "검토 필요", value: compactCount(reviewTasks), tone: reviewTasks > 0 ? "rose" : "green" },
        { label: "완료", value: compactCount(doneTasks), tone: "green" },
        { label: "승인", value: "준비", tone: "cyan" },
      ],
    };
  }
  if (mode === "ops") {
    return {
      eyebrow: "운영 연결",
      title: "OPS 관제 코너와 프로젝트 보드",
      body: "OPS는 큰 방이 아니라 작은 서버 데스크와 프로젝트 보드로 표현됩니다.",
      primary: "프로젝트 열기",
      secondary: "Control Plane 보기",
      stats: [
        { label: "프로젝트", value: PROJECT_SCOPES.length, tone: "cyan" },
        { label: "실행 중", value: compactCount(activeTasks), tone: "green" },
        { label: "연결", value: "확인", tone: "amber" },
      ],
    };
  }
  if (mode === "memory") {
    return {
      eyebrow: "기억 준비",
      title: "AgentMemory 서고",
      body: "기억은 승인 기반 요약과 evidence 링크만 다루며, runtime과 hooks는 별도 승인 전까지 막혀 있습니다.",
      primary: "Memory 열기",
      stats: [
        { label: "모드", value: "안전", tone: "green" },
        { label: "저장", value: "요약", tone: "cyan" },
        { label: "런타임", value: "대기", tone: "amber" },
      ],
    };
  }
  return {
    eyebrow: "사무실 현황",
    title: "Dongri-grigri 운영실",
    body: "부서 좌석, 캐릭터, 업무 문서, 프로젝트 보드, 기억 서고가 한 화면에서 움직입니다.",
    primary: "Control Plane 보기",
    secondary: "업무 보드 열기",
    stats: [
      { label: "부서", value: 6, tone: "cyan" },
      { label: "근무", value: compactCount(workingAgents), tone: "green" },
      { label: "업무", value: compactCount(tasks.length), tone: "amber" },
    ],
  };
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
  const selectedCommand = OFFICE_COMMANDS.find((command) => command.mode === focusMode) ?? OFFICE_COMMANDS[0];
  const panel = useMemo(() => buildHudPanel(focusMode, { tasks, agents, subAgents }), [agents, focusMode, subAgents, tasks]);

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
  themeHighlightTargetIdRef.current = themeHighlightTargetId ?? null;
  const scrollHostXRef = useRef<HTMLElement | null>(null);
  const scrollHostYRef = useRef<HTMLElement | null>(null);
  const [showVirtualPad, setShowVirtualPad] = useState(false);
  const showVirtualPadRef = useRef(showVirtualPad);
  showVirtualPadRef.current = showVirtualPad;

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
    const departmentGroups: Record<OfficeMoveArea, string[]> = {
      shared: [],
      rooftop: [],
      strategy: ["pmo", "planning"],
      production: ["dev", "development", "design"],
      quality: ["qa", "quality", "devsecops", "operations", "ops", "strategic_maintenance", "instructor"],
    };
    const breakRoomRect = breakRoomRectRef.current;
    const roomTargets = roomRectsRef.current.filter((room) => departmentGroups[area].includes(room.dept.id));
    const targetY =
      area === "shared"
        ? (breakRoomRect?.y ?? 0)
        : area === "rooftop"
          ? (breakRoomRect?.y ?? 0) + Math.max(190, Math.floor((breakRoomRect?.h ?? 320) * 0.58))
          : Math.min(...roomTargets.map((room) => room.y));
    if (!Number.isFinite(targetY)) return;

    const destinationRoom = roomTargets[0] ?? roomRectsRef.current[0];
    const destinationX =
      area === "shared" || area === "rooftop"
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

    if (hostX && movedX && nextLeft !== null) hostX.scrollTo({ left: nextLeft, top: hostX.scrollTop, behavior: "auto" });
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
      if (command) moveCeoToOfficeArea(command.camera, "elevator");
    },
    [moveCeoToOfficeArea],
  );

  const primaryAction = useMemo(() => {
    if (focusMode === "pipeline" || focusMode === "build") return onOpenTasks;
    if (focusMode === "ops") return onOpenProjects;
    if (focusMode === "memory") return onOpenMemory;
    return onOpenControlPlane;
  }, [focusMode, onOpenControlPlane, onOpenMemory, onOpenProjects, onOpenTasks]);

  const secondaryAction = focusMode === "overview" || focusMode === "pipeline" || focusMode === "ops" ? onOpenTasks : undefined;

  return (
    <section
      className={`pixel-office-shell w-full ${pixelAgentMode?.enabled ? "pixel-agent-mode" : ""} ${
        pixelAgentMode?.enabled ? `pixel-agent-density-${pixelAgentMode.density}` : ""
      }`}
      data-focus={focusMode}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="사무실 렌즈">
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
              <span>검토 {compactCount(countTasksByStatus(tasks, "review"))}</span>
            </div>
          </div>
          <div
            ref={containerRef}
            data-testid="pixel-office-map"
            className="pixel-office-map mx-auto min-h-[500px] outline-none"
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
          style={{ borderColor: "var(--th-panel-border)", background: "var(--th-panel-bg)", color: "var(--th-text-primary)" }}
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
              <h3 className="text-sm font-black">프로젝트 보드</h3>
              <div className="mt-2 grid gap-2">
                {PROJECT_SCOPES.map((project) => (
                  <button
                    key={project}
                    type="button"
                    onClick={onOpenProjects}
                    className="rounded-lg border px-3 py-2 text-left text-sm font-bold transition hover:border-cyan-300 hover:bg-cyan-300/10 active:translate-y-px"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
                  >
                    {project}
                    <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--th-text-muted)" }}>
                      scope
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-black">기억 서고</h3>
              <button
                type="button"
                onClick={onOpenMemory}
                className="mt-2 w-full rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-left text-sm font-bold transition hover:bg-emerald-300/20 active:translate-y-px"
              >
                승인 기반 기억 상태 보기
              </button>
            </section>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-slate-100">
        <span>진행 업무 {compactCount(countTasksByStatus(tasks, "in_progress"))}</span>
        <span>승인 대기 {compactCount(countTasksByStatus(tasks, "review"))}</span>
        <span>프로젝트 보드 {PROJECT_SCOPES.length}</span>
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
