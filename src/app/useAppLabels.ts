import { useMemo } from "react";
import type * as api from "../api";
import { normalizeLanguage, pickLang } from "../i18n";
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
  const uiLanguage = normalizeLanguage(settings.language);
  const tr = (ko: string, en: string, ja = en, zh = en) => pickLang(uiLanguage, { ko, en, ja, zh });

  const loadingTitle = tr("Claw-Empire 불러오는 중...", "Loading Claw-Empire...", "Claw-Empire を読み込み中...", "正在加载 Claw-Empire...");
  const loadingSubtitle = tr(
    "AI 에이전트 시스템을 준비하고 있습니다",
    "Preparing your AI agent system",
    "AI エージェントシステムを準備しています",
    "正在准备 AI 代理系统",
  );

  const viewTitle = (() => {
    switch (view) {
      case "office":
        return `O ${tr("오피스", "Office", "オフィス", "办公室")}`;
      case "dashboard":
        return `D ${tr("대시보드", "Dashboard", "ダッシュボード", "仪表盘")}`;
      case "tasks":
        return `T ${tr("업무", "Tasks", "タスク", "任务")}`;
      case "agents":
        return tr("직원 관리", "Agents", "エージェント管理", "代理管理");
      case "skills":
        return `S ${tr("문서/스킬", "Skills", "ドキュメント/スキル", "文档/技能")}`;
      case "settings":
        return `G ${tr("설정", "Settings", "設定", "设置")}`;
      default:
        return "";
    }
  })();

  const announcementLabel = `A ${tr("공지", "Announcement", "お知らせ", "公告")}`;
  const roomManagerLabel = `O ${tr("오피스 관리", "Office Manager", "オフィス管理", "办公室管理")}`;
  const roomManagerDepartments = useMemo(
    () => [
      {
        id: "ceoOffice",
        name: tr("CEO 오피스", "CEO Office", "CEO オフィス", "CEO 办公室"),
      },
      ...departments,
      {
        id: "breakRoom",
        name: tr("휴게실", "Break Room", "休憩室", "休息室"),
      },
    ],
    [departments, uiLanguage],
  );

  const reportLabel = `R ${tr("보고서", "Reports", "レポート", "报告")}`;
  const tasksPrimaryLabel = tr("업무", "Tasks", "タスク", "任务");
  const agentStatusLabel = tr("에이전트", "Agents", "エージェント", "代理");
  const decisionLabel = tr("의사결정", "Decisions", "意思決定", "决策");

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
    ? tr(
        `새 버전 v${effectiveUpdateStatus?.latest_version} 사용 가능 (현재 v${effectiveUpdateStatus?.current_version})`,
        `New version v${effectiveUpdateStatus?.latest_version} is available (current v${effectiveUpdateStatus?.current_version})`,
        `新しいバージョン v${effectiveUpdateStatus?.latest_version} が利用可能です (現在 v${effectiveUpdateStatus?.current_version})`,
        `新版本 v${effectiveUpdateStatus?.latest_version} 可用（当前 v${effectiveUpdateStatus?.current_version}）`,
      )
    : "";

  const updateHint =
    runtimeOs === "windows"
      ? tr(
          "Windows PowerShell에서 `git pull; pnpm install` 실행 후 서버를 재시작하세요.",
          "In Windows PowerShell, run `git pull; pnpm install`, then restart the server.",
          "Windows PowerShell で `git pull; pnpm install` 実行後にサーバーを再起動してください。",
          "在 Windows PowerShell 中运行 `git pull; pnpm install`，然后重启服务器。",
        )
      : tr(
          "macOS/Linux에서 `git pull && pnpm install` 실행 후 서버를 재시작하세요.",
          "On macOS/Linux, run `git pull && pnpm install`, then restart the server.",
          "macOS/Linux で `git pull && pnpm install` 実行後にサーバーを再起動してください。",
          "在 macOS/Linux 上运行 `git pull && pnpm install`，然后重启服务器。",
        );

  const updateReleaseLabel = tr("릴리즈 노트", "Release Notes", "リリースノート", "发行说明");
  const updateDismissLabel = tr("닫기", "Dismiss", "閉じる", "关闭");

  const autoUpdateNoticeVisible = Boolean(settings.autoUpdateNoticePending);
  const autoUpdateNoticeTitle = tr(
    "업데이트 안내: 자동 업데이트 토글이 추가되었습니다.",
    "Update notice: Auto Update toggle has been added.",
    "更新のお知らせ: 自動アップデートトグルが追加されました。",
    "更新通知：已新增自动更新开关。",
  );
  const autoUpdateNoticeHint = tr(
    "기존 설치(1.1.3 이하)는 기본값이 OFF입니다. 필요하면 Settings > General에서 ON으로 전환하세요.",
    "For existing installs (v1.1.3 and below), the default remains OFF. Enable it in Settings > General when needed.",
    "既存インストール（v1.1.3 以下）は既定値が OFF です。必要に応じて Settings > General で ON にしてください。",
    "已有安装（v1.1.3 及以下）默认值为 OFF。需要时请在 Settings > General 中开启。",
  );
  const autoUpdateNoticeActionLabel = tr("확인", "Got it", "確認", "知道了");

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
    ? tr(
        "테스트 표시 모드입니다. `?force_update_banner=1`을 제거하면 정상 모드로 돌아갑니다.",
        "Test display mode is enabled. Remove `?force_update_banner=1` to return to normal behavior.",
        "テスト表示モードです。`?force_update_banner=1` を削除すると通常モードに戻ります。",
        "当前为测试展示模式。移除 `?force_update_banner=1` 后将恢复正常模式。",
      )
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
