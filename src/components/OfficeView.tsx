import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  type Application,
  type Container,
  type Graphics,
  type Text,
  type Sprite,
  type Texture,
  type AnimatedSprite,
} from "pixi.js";
import { useI18n } from "../i18n";
import { useTheme, type ThemeMode } from "../ThemeContext";
import CliUsagePanel from "./office-view/CliUsagePanel";
import VirtualPadOverlay from "./office-view/VirtualPadOverlay";
import {
  type OfficeViewProps,
  type Delivery,
  type OfficeCeoTransit,
  type RoomRect,
  type WallClockVisual,
  canScrollOnAxis,
  findScrollContainer,
  MIN_OFFICE_W,
  MOBILE_MOVE_CODES,
  type MobileMoveDirection,
  type SubCloneBurstParticle,
} from "./office-view/model";
import { type SupportedLocale } from "./office-view/themes-locale";
import { useCliUsage } from "./office-view/useCliUsage";
import {
  useMeetingPresenceSync,
  useCrossDeptDeliveryAnimations,
  useCeoOfficeCallAnimations,
} from "./office-view/useOfficeDeliveryEffects";
import { useOfficePixiRuntime } from "./office-view/useOfficePixiRuntime";
import { buildOfficeScene } from "./office-view/buildScene";

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
  onSelectAgent,
  onSelectDepartment,
}: OfficeViewProps) {
  const { language, t } = useI18n();
  const { theme: currentTheme } = useTheme();
  const themeRef = useRef<ThemeMode>(currentTheme);
  themeRef.current = currentTheme;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const texturesRef = useRef<Record<string, Texture>>({});
  const destroyedRef = useRef(false);
  const initIdRef = useRef(0);
  const initDoneRef = useRef(false);
  const [sceneRevision, setSceneRevision] = useState(0);

  // Animation state refs
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
  const breakAnimItemsRef = useRef<
    Array<{
      sprite: Container;
      baseX: number;
      baseY: number;
    }>
  >([]);
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

  // Latest data via refs (avoids stale closures)
  const dataRef = useRef({ departments, agents, tasks, subAgents, unreadAgentIds, meetingPresence, customDeptThemes });
  dataRef.current = { departments, agents, tasks, subAgents, unreadAgentIds, meetingPresence, customDeptThemes };
  const cbRef = useRef({ onSelectAgent, onSelectDepartment });
  cbRef.current = { onSelectAgent, onSelectDepartment };
  const activeMeetingTaskIdRef = useRef<string | null>(activeMeetingTaskId ?? null);
  activeMeetingTaskIdRef.current = activeMeetingTaskId ?? null;
  const meetingMinutesOpenRef = useRef<typeof onOpenActiveMeetingMinutes>(onOpenActiveMeetingMinutes);
  meetingMinutesOpenRef.current = onOpenActiveMeetingMinutes;
  const [showVirtualPad, setShowVirtualPad] = useState(false);
  const showVirtualPadRef = useRef(showVirtualPad);
  showVirtualPadRef.current = showVirtualPad;
  const scrollHostXRef = useRef<HTMLElement | null>(null);
  const scrollHostYRef = useRef<HTMLElement | null>(null);

  const triggerDepartmentInteract = useCallback(() => {
    const cx = ceoPosRef.current.x;
    const cy = ceoPosRef.current.y;
    for (const r of roomRectsRef.current) {
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y - 10 && cy <= r.y + r.h) {
        cbRef.current.onSelectDepartment(r.dept);
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

  type OfficeMoveArea = "shared" | "rooftop" | "strategy" | "production" | "quality";

  const moveCeoToOfficeArea = useCallback((area: OfficeMoveArea, mode: "stairs" | "elevator") => {
    const departmentGroups: Record<OfficeMoveArea, string[]> = {
      shared: [],
      rooftop: [],
      strategy: ["pmo", "planning"],
      production: ["dev", "design"],
      quality: ["qa", "devsecops", "operations"],
    };
    const breakRoomRect = breakRoomRectRef.current;
    const targetY =
      area === "shared"
        ? (breakRoomRect?.y ?? 0)
        : area === "rooftop"
          ? (breakRoomRect?.y ?? 0) + Math.max(190, Math.floor((breakRoomRect?.h ?? 320) * 0.58))
          : Math.min(
              ...roomRectsRef.current
                .filter((room) => departmentGroups[area].includes(room.dept.id))
                .map((room) => room.y),
            );
    if (!Number.isFinite(targetY)) return;

    const targetRooms = roomRectsRef.current.filter((room) => departmentGroups[area].includes(room.dept.id));
    const destinationRoom = targetRooms[0] ?? roomRectsRef.current[0];
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

  const officeSummaryCards = useMemo(() => {
    const inProgressTasks = tasks.filter((task) => task.status === "in_progress").length;
    const reviewTasks = tasks.filter((task) => task.status === "review").length;
    const workingAgents = agents.filter((agent) => agent.status === "working").length;
    const activeSubAgents = subAgents.filter((subAgent) => subAgent.status === "working").length;
    return [
      { label: "진행 업무", value: inProgressTasks, detail: `검토 대기 ${reviewTasks}` },
      { label: "근무 직원", value: workingAgents, detail: `전체 ${agents.length}` },
      { label: "호출 Subagent", value: activeSubAgents, detail: "전문 실행 풀" },
      { label: "운영 층", value: 5, detail: "공용·옥상·전략·제작·품질" },
    ];
  }, [agents, subAgents, tasks]);

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

    if (hostX && movedX && nextLeft !== null) {
      hostX.scrollTo({ left: nextLeft, top: hostX.scrollTop, behavior: "auto" });
    }
    if (hostY && movedY && nextTop !== null) {
      hostY.scrollTo({ left: hostY.scrollLeft, top: nextTop, behavior: "auto" });
    }
  }, []);

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

  /* BUILD SCENE (no app destroy, just stage clear + rebuild) */
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
    [followCeoInView, cliUsageRef],
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

  return (
    <div className="w-full overflow-auto" style={{ minHeight: "100%" }}>
      <div className="mx-auto mb-3 flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/15 bg-slate-950/45 px-3 py-2 text-xs text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
        <span className="mr-1 font-semibold text-cyan-100">층 이동</span>
        {[
          ["shared", "1F 공용층"],
          ["rooftop", "RF 옥상층"],
          ["strategy", "2F 전략층"],
          ["production", "3F 제작층"],
          ["quality", "4F 품질/운영층"],
        ].map(([area, label]) => (
          <button
            key={area}
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 active:translate-y-px"
            onClick={() => moveCeoToOfficeArea(area as OfficeMoveArea, "elevator")}
          >
            {label} · 엘리베이터
          </button>
        ))}
        {[
          ["shared", "1F"],
          ["rooftop", "RF"],
          ["strategy", "2F"],
          ["production", "3F"],
          ["quality", "4F"],
        ].map(([area, label]) => (
          <button
            key={`${area}-stairs`}
            type="button"
            className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-2.5 py-1.5 font-medium text-amber-100 transition hover:border-amber-200/50 hover:bg-amber-300/15 active:translate-y-px"
            onClick={() => moveCeoToOfficeArea(area as OfficeMoveArea, "stairs")}
          >
            {label} 계단
          </button>
        ))}
        <span className="ml-auto hidden text-slate-400 md:inline">
          WASD/방향키로 CEO 이동 · Enter/Space 상호작용 · 22명 운영
        </span>
      </div>
      <div className="mx-auto mb-3 grid w-full max-w-5xl grid-cols-2 gap-2 md:grid-cols-4">
        {officeSummaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-700/70 bg-slate-950/45 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="text-[11px] font-semibold text-slate-400">{card.label}</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-cyan-100">{card.value}</span>
              <span className="pb-1 text-[11px] text-slate-500">{card.detail}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="relative mx-auto w-full">
        <div
          ref={containerRef}
          className="mx-auto"
          style={{ maxWidth: "100%", lineHeight: 0, outline: "none" }}
          tabIndex={0}
        />

        <VirtualPadOverlay
          showVirtualPad={showVirtualPad}
          t={t}
          onInteract={triggerDepartmentInteract}
          onSetMoveDirectionPressed={setMoveDirectionPressed}
        />
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
    </div>
  );
}
