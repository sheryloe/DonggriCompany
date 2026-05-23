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
  office: "Dongri-grigri 운영실",
  dashboard: "운영 대시보드",
  projects: "프로젝트 스코프",
  departments: "마스터 에이전트",
  controlPlane: "Control Plane 상세",
  tasks: "업무 관리",
  skills: "Skill",
  memory: "Memory",
  settings: "설정",
  agents: "호환 조직 보기",
  modules: "호환 모듈",
  departmentComponents: "호환 컴포넌트",
  manual: "도움말",
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
  const loadingTitle = "Dongri-grigri를 불러오는 중입니다.";
  const loadingSubtitle = "운영실, 마스터 에이전트, 메모리, Control Plane 상태를 준비하고 있습니다.";
  const viewTitle = VIEW_TITLE[view] ?? "";
  const announcementLabel = "공지";
  const roomManagerLabel = "대화방";
  const roomManagerDepartments = useMemo(
    () => [{ id: "ceoOffice", name: "운영실" }, ...departments, { id: "breakRoom", name: "휴게실" }],
    [departments],
  );

  const reportLabel = "보고서";
  const tasksPrimaryLabel = "업무";
  const agentStatusLabel = "부서 상태";
  const decisionLabel = "승인";

  const effectiveUpdateStatus = forceUpdateBanner
    ? {
        current_version: updateStatus?.current_version ?? "1.1.0",
        latest_version: updateStatus?.latest_version ?? "1.1.1-test",
        update_available: true,
        release_url: updateStatus?.release_url ?? "https://github.com/Dongri-grigri/DonggriCompany/releases/latest",
        checked_at: Date.now(),
        enabled: true,
        repo: updateStatus?.repo ?? "Dongri-grigri/DonggriCompany",
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
    `https://github.com/${effectiveUpdateStatus?.repo ?? "Dongri-grigri/DonggriCompany"}/releases/latest`;

  const updateTitle = updateBannerVisible
    ? `새 버전 v${effectiveUpdateStatus?.latest_version} 사용 가능 - 현재 v${effectiveUpdateStatus?.current_version}`
    : "";

  const updateHint =
    runtimeOs === "windows"
      ? "Windows PowerShell에서 업데이트 명령을 확인한 뒤 서버를 다시 시작하세요."
      : "업데이트 명령을 확인한 뒤 서버를 다시 시작하세요.";

  const updateReleaseLabel = "릴리스 노트";
  const updateDismissLabel = "닫기";

  const autoUpdateNoticeVisible = Boolean(settings.autoUpdateNoticePending);
  const autoUpdateNoticeTitle = "업데이트 안내: 자동 업데이트 설정 항목이 추가되었습니다.";
  const autoUpdateNoticeHint = "기존 설치는 기본값이 OFF입니다. 필요하면 설정에서 ON으로 전환하세요.";
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
    ? "테스트 표시 모드입니다. force_update_banner 값을 제거하면 정상 모드로 돌아갑니다."
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
