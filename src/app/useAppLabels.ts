import { useMemo } from "react";
import type * as api from "../api";
import type { CompanySettings, Department } from "../types";
import type { RuntimeOs, View } from "./types";

interface UseAppLabelsParams {
  view: View;
  settings: CompanySettings;
  departments: Department[];
  theme: "light" | "dark";
  runtimeOs: RuntimeOs;
  forceUpdateBanner: boolean;
  updateStatus: api.UpdateStatus | null;
  dismissedUpdateVersion: string;
}

const VIEW_TITLE: Record<View, string> = {
  office: "오피스",
  agents: "직원 관리",
  dashboard: "대시보드",
  tasks: "업무 관리",
  skills: "Skill 문서고",
  modules: "모듈",
  manual: "메뉴얼",
  settings: "설정",
};

export function useAppLabels({
  view,
  settings,
  departments,
  theme,
  runtimeOs,
  forceUpdateBanner,
  updateStatus,
  dismissedUpdateVersion,
}: UseAppLabelsParams) {
  const uiLanguage = "ko" as const;
  const loadingTitle = "Donggri를 불러오는 중입니다.";
  const loadingSubtitle = "AI 운영 시스템을 준비하고 있습니다.";
  const viewTitle = VIEW_TITLE[view] ?? "";
  const announcementLabel = "공지";
  const roomManagerLabel = "오피스 관리";
  const roomManagerDepartments = useMemo(
    () => [{ id: "ceoOffice", name: "CEO 오피스" }, ...departments, { id: "breakRoom", name: "휴게실" }],
    [departments],
  );

  const reportLabel = "보고서";
  const tasksPrimaryLabel = "업무";
  const agentStatusLabel = "직원 상태";
  const decisionLabel = "의사결정";

  const effectiveUpdateStatus = forceUpdateBanner
    ? {
        current_version: updateStatus?.current_version ?? "1.1.0",
        latest_version: updateStatus?.latest_version ?? "1.1.1-test",
        update_available: true,
        release_url: updateStatus?.release_url ?? "https://github.com/GreenSheep01201/claw-empire/releases/latest",
        checked_at: Date.now(),
        enabled: true,
        repo: updateStatus?.repo ?? "GreenSheep01201/claw-empire",
        error: null,
      }
    : updateStatus;

  const updateBannerVisible = Boolean(
    effectiveUpdateStatus?.enabled &&
    effectiveUpdateStatus.update_available &&
    effectiveUpdateStatus.latest_version &&
    (forceUpdateBanner || effectiveUpdateStatus.latest_version !== dismissedUpdateVersion),
  );

  const updateReleaseUrl =
    effectiveUpdateStatus?.release_url ??
    `https://github.com/${effectiveUpdateStatus?.repo ?? "GreenSheep01201/claw-empire"}/releases/latest`;

  const updateTitle = updateBannerVisible
    ? `새 버전 v${effectiveUpdateStatus?.latest_version} 사용 가능 (현재 v${effectiveUpdateStatus?.current_version})`
    : "";

  const updateHint =
    runtimeOs === "windows"
      ? "Windows PowerShell에서 `git pull; pnpm install` 실행 후 서버를 다시 시작하세요."
      : "macOS/Linux에서 `git pull && pnpm install` 실행 후 서버를 다시 시작하세요.";

  const updateReleaseLabel = "릴리스 노트";
  const updateDismissLabel = "닫기";

  const autoUpdateNoticeVisible = Boolean(settings.autoUpdateNoticePending);
  const autoUpdateNoticeTitle = "업데이트 안내: 자동 업데이트 토글이 추가되었습니다.";
  const autoUpdateNoticeHint = "기존 설치는 기본값이 OFF입니다. 필요하면 설정 > 일반에서 ON으로 전환하세요.";
  const autoUpdateNoticeActionLabel = "확인";

  const autoUpdateNoticeContainerClass =
    theme === "light"
      ? "border-b border-sky-200 bg-sky-50 px-3 py-2.5 sm:px-4 lg:px-6"
      : "border-b border-sky-500/30 bg-sky-500/10 px-3 py-2.5 sm:px-4 lg:px-6";
  const autoUpdateNoticeTextClass = theme === "light" ? "min-w-0 text-xs text-sky-900" : "min-w-0 text-xs text-sky-100";
  const autoUpdateNoticeHintClass =
    theme === "light" ? "mt-0.5 text-[11px] text-sky-800" : "mt-0.5 text-[11px] text-sky-200/90";
  const autoUpdateNoticeButtonClass =
    theme === "light"
      ? "rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] text-sky-900 transition hover:bg-sky-100"
      : "rounded-md border border-sky-300/40 bg-sky-200/10 px-2.5 py-1 text-[11px] text-sky-100 transition hover:bg-sky-200/20";

  const updateTestModeHint = forceUpdateBanner
    ? "테스트 표시 모드입니다. `?force_update_banner=1`을 제거하면 정상 모드로 돌아갑니다."
    : "";

  return {
    uiLanguage,
    loadingTitle,
    loadingSubtitle,
    viewTitle,
    announcementLabel,
    roomManagerLabel,
    roomManagerDepartments,
    reportLabel,
    tasksPrimaryLabel,
    agentStatusLabel,
    decisionLabel,
    effectiveUpdateStatus,
    updateBannerVisible,
    updateReleaseUrl,
    updateTitle,
    updateHint,
    updateReleaseLabel,
    updateDismissLabel,
    autoUpdateNoticeVisible,
    autoUpdateNoticeTitle,
    autoUpdateNoticeHint,
    autoUpdateNoticeActionLabel,
    autoUpdateNoticeContainerClass,
    autoUpdateNoticeTextClass,
    autoUpdateNoticeHintClass,
    autoUpdateNoticeButtonClass,
    updateTestModeHint,
  };
}
