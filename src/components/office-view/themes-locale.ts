import { type Graphics, type Text } from "pixi.js";
import type { UiLanguage } from "../../i18n";
import type { MeetingReviewDecision } from "../../types";
import type { RoomTheme } from "./model";

const OFFICE_PASTEL_LIGHT = {
  creamWhite: 0xf8f3ec,
  creamDeep: 0xebdfcf,
  softMint: 0xbfded5,
  softMintDeep: 0x8fbcb0,
  dustyRose: 0xd5a5ae,
  dustyRoseDeep: 0xb67d89,
  warmSand: 0xd6b996,
  warmWood: 0xb8906d,
  cocoa: 0x6f4d3a,
  ink: 0x2f2530,
  slate: 0x586378,
};

const OFFICE_PASTEL_DARK = {
  creamWhite: 0xf5ead7,
  creamDeep: 0xd9c4a5,
  softMint: 0x5fc7b8,
  softMintDeep: 0x2b8c80,
  dustyRose: 0xce7892,
  dustyRoseDeep: 0x964d64,
  warmSand: 0xe0b56f,
  warmWood: 0xad7643,
  cocoa: 0x5e3824,
  ink: 0xc8cee0,
  slate: 0x7888a8,
};

let OFFICE_PASTEL = OFFICE_PASTEL_LIGHT;

const DEFAULT_CEO_THEME_LIGHT: RoomTheme = {
  floor1: 0xe5d9b9,
  floor2: 0xdfd0a8,
  wall: 0x998243,
  accent: 0xa77d0c,
};
const DEFAULT_CEO_THEME_DARK: RoomTheme = {
  floor1: 0xd8c18a,
  floor2: 0xc9a96d,
  wall: 0x7b6130,
  accent: 0xe3aa28,
};

const DEFAULT_BREAK_THEME_LIGHT: RoomTheme = {
  floor1: 0xf7e2b7,
  floor2: 0xf6dead,
  wall: 0xa99c83,
  accent: 0xf0c878,
};
const DEFAULT_BREAK_THEME_DARK: RoomTheme = {
  floor1: 0xf0c87a,
  floor2: 0xdcae5a,
  wall: 0x8f7040,
  accent: 0xffcc57,
};

let DEFAULT_CEO_THEME = DEFAULT_CEO_THEME_LIGHT;
let DEFAULT_BREAK_THEME = DEFAULT_BREAK_THEME_LIGHT;

type SupportedLocale = UiLanguage;

const LOCALE_TEXT = {
  ceoOffice: {
    ko: "CEO 오피스",
    en: "CEO Office",
    ja: "CEO Office",
    zh: "CEO Office",
  },
  collabTable: {
    ko: "6인 협업 테이블",
    en: "6P Collab Table",
    ja: "6P Collab Table",
    zh: "6P Collab Table",
  },
  statsEmployees: { ko: "직원", en: "Staff", ja: "Staff", zh: "Staff" },
  statsWorking: { ko: "근무 중", en: "Working", ja: "Working", zh: "Working" },
  statsProgress: { ko: "진행", en: "In Progress", ja: "In Progress", zh: "In Progress" },
  statsDone: { ko: "완료", en: "Done", ja: "Done", zh: "Done" },
  hint: {
    ko: "WASD/방향키/가상패드: CEO 이동  |  Enter: 상호작용",
    en: "WASD/Arrow/Virtual Pad: CEO Move  |  Enter: Interact",
    ja: "WASD/Arrow/Virtual Pad: CEO Move  |  Enter: Interact",
    zh: "WASD/Arrow/Virtual Pad: CEO Move  |  Enter: Interact",
  },
  mobileEnter: {
    ko: "상호작용",
    en: "Interact",
    ja: "Interact",
    zh: "Interact",
  },
  noAssignedAgent: {
    ko: "배정된 직원 없음",
    en: "No assigned staff",
    ja: "No assigned staff",
    zh: "No assigned staff",
  },
  breakRoom: {
    ko: "휴게실",
    en: "Break Room",
    ja: "Break Room",
    zh: "Break Room",
  },
  role: {
    team_leader: { ko: "팀장", en: "Lead", ja: "Lead", zh: "Lead" },
    senior: { ko: "시니어", en: "Senior", ja: "Senior", zh: "Senior" },
    junior: { ko: "주니어", en: "Junior", ja: "Junior", zh: "Junior" },
    intern: { ko: "인턴", en: "Intern", ja: "Intern", zh: "Intern" },
    part_time: { ko: "파트타임", en: "Part-time", ja: "Part-time", zh: "Part-time" },
  },
  partTime: {
    ko: "파트타임",
    en: "Part-time",
    ja: "Part-time",
    zh: "Part-time",
  },
  collabBadge: {
    ko: "협업",
    en: "Collaboration",
    ja: "Collaboration",
    zh: "Collaboration",
  },
  meetingBadgeKickoff: {
    ko: "회의",
    en: "Meeting",
    ja: "Meeting",
    zh: "Meeting",
  },
  meetingBadgeReviewing: {
    ko: "검토 중",
    en: "Reviewing",
    ja: "Reviewing",
    zh: "Reviewing",
  },
  meetingBadgeApproved: {
    ko: "승인",
    en: "Approved",
    ja: "Approved",
    zh: "Approved",
  },
  meetingBadgeHold: {
    ko: "보류",
    en: "Hold",
    ja: "Hold",
    zh: "Hold",
  },
  kickoffLines: {
    ko: ["영향 범위 확인 중", "리스크와 의존성 공유 중", "일정과 우선순위 조율 중", "담당 경계 정의 중"],
    en: [
      "Checking cross-team impact",
      "Sharing risks and dependencies",
      "Aligning schedule and priorities",
      "Defining ownership boundaries",
    ],
    ja: [
      "Checking cross-team impact",
      "Sharing risks and dependencies",
      "Aligning schedule and priorities",
      "Defining ownership boundaries",
    ],
    zh: [
      "Checking cross-team impact",
      "Sharing risks and dependencies",
      "Aligning schedule and priorities",
      "Defining ownership boundaries",
    ],
  },
  reviewLines: {
    ko: ["보완사항 반영 확인 중", "최종 승인안 검토 중", "수정 아이디어 공유 중", "결과물 교차 검증 중"],
    en: [
      "Verifying follow-up updates",
      "Reviewing final approval draft",
      "Sharing revision ideas",
      "Cross-checking deliverables",
    ],
    ja: [
      "Verifying follow-up updates",
      "Reviewing final approval draft",
      "Sharing revision ideas",
      "Cross-checking deliverables",
    ],
    zh: [
      "Verifying follow-up updates",
      "Reviewing final approval draft",
      "Sharing revision ideas",
      "Cross-checking deliverables",
    ],
  },
  meetingTableHint: {
    ko: "회의 중: 테이블 클릭으로 회의록 보기",
    en: "Meeting live: click table for minutes",
    ja: "Meeting live: click table for minutes",
    zh: "Meeting live: click table for minutes",
  },
  cliUsageTitle: {
    ko: "CLI 사용량",
    en: "CLI Usage",
    ja: "CLI Usage",
    zh: "CLI Usage",
  },
  cliConnected: {
    ko: "연결됨",
    en: "connected",
    ja: "connected",
    zh: "connected",
  },
  cliRefreshTitle: {
    ko: "사용량 새로고침",
    en: "Refresh usage data",
    ja: "Refresh usage data",
    zh: "Refresh usage data",
  },
  cliNotSignedIn: {
    ko: "로그인 필요",
    en: "sign-in required",
    ja: "sign-in required",
    zh: "sign-in required",
  },
  cliNoApi: {
    ko: "사용량 API 없음",
    en: "no usage API",
    ja: "no usage API",
    zh: "no usage API",
  },
  cliUnavailable: {
    ko: "사용량 조회 불가",
    en: "usage unavailable",
    ja: "usage unavailable",
    zh: "usage unavailable",
  },
  cliLoading: {
    ko: "불러오는 중...",
    en: "loading...",
    ja: "loading...",
    zh: "loading...",
  },
  cliResets: {
    ko: "리셋까지",
    en: "resets",
    ja: "resets",
    zh: "resets",
  },
  cliNoData: {
    ko: "데이터 없음",
    en: "no data",
    ja: "no data",
    zh: "no data",
  },
  cliRetry: {
    ko: "재시도",
    en: "Retry",
    ja: "Retry",
    zh: "Retry",
  },
  soon: {
    ko: "곧",
    en: "soon",
    ja: "soon",
    zh: "soon",
  },
};

const BREAK_CHAT_MESSAGES = {
  ko: [
    "잠깐 쉬고 다시 합시다.",
    "커피 한 잔 하고 복귀합니다.",
    "리뷰 포인트 정리했어요.",
    "다음 실행 전에 로그 확인해요.",
    "오늘 빌드 흐름 괜찮네요.",
    "회의 전 핵심만 압축합시다.",
  ],
  en: [
    "Taking a short break.",
    "Coffee first, then back to work.",
    "Review points are ready.",
    "Check logs before the next run.",
    "The build flow looks stable today.",
    "Compress the key points before the meeting.",
  ],
  ja: [
    "Taking a short break.",
    "Coffee first, then back to work.",
    "Review points are ready.",
    "Check logs before the next run.",
    "The build flow looks stable today.",
    "Compress the key points before the meeting.",
  ],
  zh: [
    "Taking a short break.",
    "Coffee first, then back to work.",
    "Review points are ready.",
    "Check logs before the next run.",
    "The build flow looks stable today.",
    "Compress the key points before the meeting.",
  ],
};

function pickLocale<T>(locale: SupportedLocale, map: Record<SupportedLocale, T>): T {
  return map[locale] ?? map.ko;
}

function inferReviewDecision(line?: string | null): MeetingReviewDecision {
  const cleaned = line?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "reviewing";
  if (
    /(보류|보완|수정|미완|리스크|중단|hold|revise|revision|required|pending|risk|block|missing|incomplete|not\s+ready)/i.test(
      cleaned,
    )
  ) {
    return "hold";
  }
  if (/(승인|통과|진행 가능|배포 가능|approve|approved|lgtm|ship\s+it|go\s+ahead)/i.test(cleaned)) {
    return "approved";
  }
  return "reviewing";
}

function resolveMeetingDecision(
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision | null,
  line?: string,
): MeetingReviewDecision | undefined {
  if (phase !== "review") return undefined;
  return decision ?? inferReviewDecision(line);
}

function getMeetingBadgeStyle(
  locale: SupportedLocale,
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision,
): { fill: number; stroke: number; text: string } {
  if (phase !== "review") {
    return {
      fill: 0xf59e0b,
      stroke: 0x111111,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeKickoff),
    };
  }

  if (decision === "approved") {
    return {
      fill: 0x34d399,
      stroke: 0x14532d,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeApproved),
    };
  }
  if (decision === "hold") {
    return {
      fill: 0xf97316,
      stroke: 0x7c2d12,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeHold),
    };
  }
  return {
    fill: 0x60a5fa,
    stroke: 0x1e3a8a,
    text: pickLocale(locale, LOCALE_TEXT.meetingBadgeReviewing),
  };
}

function paintMeetingBadge(
  badge: Graphics,
  badgeText: Text,
  locale: SupportedLocale,
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision,
): void {
  const style = getMeetingBadgeStyle(locale, phase, decision);
  badge.clear();
  badge.roundRect(-24, 4, 48, 13, 4).fill({ color: style.fill, alpha: 0.9 });
  badge.roundRect(-24, 4, 48, 13, 4).stroke({ width: 1, color: style.stroke, alpha: 0.45 });
  badgeText.text = style.text;
}

const BREAK_SPOTS = [
  { x: 86, y: 72, dir: "D" },
  { x: 110, y: 72, dir: "D" },
  { x: 134, y: 72, dir: "D" },
  { x: 30, y: 58, dir: "R" },
  { x: -112, y: 72, dir: "D" },
  { x: -82, y: 72, dir: "D" },
  { x: -174, y: 56, dir: "L" },
  { x: -144, y: 56, dir: "R" },
];

const DEPT_THEME_LIGHT: Record<string, RoomTheme> = {
  pmo: { floor1: 0xd2f4ec, floor2: 0xbfeee3, wall: 0x3c9285, accent: 0x0ea58f },
  planning: { floor1: 0xffe6b8, floor2: 0xf8d89c, wall: 0xba8334, accent: 0xe0a53a },
  dev: { floor1: 0xcde7ff, floor2: 0xb9dcfb, wall: 0x4b86bd, accent: 0x2f8bd8 },
  design: { floor1: 0xe6d5ff, floor2: 0xdcc7fb, wall: 0x8461b4, accent: 0x9a70d8 },
  qa: { floor1: 0xffd7d7, floor2: 0xf8c4c4, wall: 0xb85e64, accent: 0xe25d63 },
  devsecops: { floor1: 0xffdec6, floor2: 0xf7c9ab, wall: 0xb56e41, accent: 0xe36f38 },
  operations: { floor1: 0xd3f4d6, floor2: 0xbff0c8, wall: 0x5d9a61, accent: 0x2eb86a },
  strategic_maintenance: { floor1: 0xd3f0ec, floor2: 0xc6ebe6, wall: 0x629e96, accent: 0x45b9aa },
};
const DEPT_THEME_DARK: Record<string, RoomTheme> = {
  pmo: { floor1: 0x59d0c1, floor2: 0x36afa0, wall: 0x18766c, accent: 0x2dd4bf },
  planning: { floor1: 0xffc96a, floor2: 0xe4a63e, wall: 0x9a6820, accent: 0xfbbf24 },
  dev: { floor1: 0x69bdf5, floor2: 0x3b91d1, wall: 0x276a9e, accent: 0x38bdf8 },
  design: { floor1: 0xc59bff, floor2: 0x9f72e6, wall: 0x6d4aa5, accent: 0xc084fc },
  qa: { floor1: 0xff8b96, floor2: 0xd86471, wall: 0x9c3e47, accent: 0xfb7185 },
  devsecops: { floor1: 0xffa060, floor2: 0xd8793b, wall: 0x9a4a20, accent: 0xfb923c },
  operations: { floor1: 0x71d88c, floor2: 0x45b765, wall: 0x2b7a43, accent: 0x4ade80 },
  strategic_maintenance: { floor1: 0x7ddbd0, floor2: 0x45b9aa, wall: 0x236f66, accent: 0x5eead4 },
};
let DEPT_THEME = DEPT_THEME_LIGHT;

function applyOfficeThemeMode(isDark: boolean): void {
  OFFICE_PASTEL = isDark ? OFFICE_PASTEL_DARK : OFFICE_PASTEL_LIGHT;
  DEFAULT_CEO_THEME = isDark ? DEFAULT_CEO_THEME_DARK : DEFAULT_CEO_THEME_LIGHT;
  DEFAULT_BREAK_THEME = isDark ? DEFAULT_BREAK_THEME_DARK : DEFAULT_BREAK_THEME_LIGHT;
  DEPT_THEME = isDark ? DEPT_THEME_DARK : DEPT_THEME_LIGHT;
}

export {
  OFFICE_PASTEL_LIGHT,
  OFFICE_PASTEL_DARK,
  OFFICE_PASTEL,
  DEFAULT_CEO_THEME_LIGHT,
  DEFAULT_CEO_THEME_DARK,
  DEFAULT_BREAK_THEME_LIGHT,
  DEFAULT_BREAK_THEME_DARK,
  DEFAULT_CEO_THEME,
  DEFAULT_BREAK_THEME,
  type SupportedLocale,
  LOCALE_TEXT,
  BREAK_CHAT_MESSAGES,
  pickLocale,
  inferReviewDecision,
  resolveMeetingDecision,
  getMeetingBadgeStyle,
  paintMeetingBadge,
  BREAK_SPOTS,
  DEPT_THEME_LIGHT,
  DEPT_THEME_DARK,
  DEPT_THEME,
  applyOfficeThemeMode,
};
