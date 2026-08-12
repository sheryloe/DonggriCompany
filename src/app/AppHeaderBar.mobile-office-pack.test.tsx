import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import AppHeaderBar from "./AppHeaderBar";

function createBaseProps(): ComponentProps<typeof AppHeaderBar> {
  return {
    currentView: "office" as const,
    connected: true,
    viewTitle: "오피스",
    tasksPrimaryLabel: "업무",
    decisionLabel: "의사결정",
    decisionInboxLoading: false,
    decisionInboxCount: 0,
    agentStatusLabel: "직원 상태",
    reportLabel: "보고서",
    announcementLabel: "공지",
    roomManagerLabel: "오피스 관리",
    officePackControl: null,
    theme: "dark" as const,
    mobileHeaderMenuOpen: true,
    onOpenMobileNav: vi.fn(),
    onOpenTasks: vi.fn(),
    onOpenDecisionInbox: vi.fn(),
    onOpenAgentStatus: vi.fn(),
    onOpenReportHistory: vi.fn(),
    onOpenAnnouncement: vi.fn(),
    onOpenRoomManager: vi.fn(),
    onToggleTheme: vi.fn(),
    onToggleMobileHeaderMenu: vi.fn(),
    onCloseMobileHeaderMenu: vi.fn(),
  };
}

describe("AppHeaderBar mobile office pack selector", () => {
  it("모바일 더보기 메뉴에서 오피스 팩을 변경할 수 있다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCloseMobileHeaderMenu = vi.fn();
    const props = createBaseProps();
    props.officePackControl = {
      label: "오피스 팩",
      value: "development",
      onChange,
      options: [
        { key: "development", label: "개발", summary: "", slug: "DEV", accent: 0 },
        { key: "report", label: "보고", summary: "", slug: "REP", accent: 1 },
      ],
    };
    props.onCloseMobileHeaderMenu = onCloseMobileHeaderMenu;

    render(<AppHeaderBar {...props} />);

    const selector = document.getElementById("mobile-office-pack-selector") as HTMLSelectElement | null;
    expect(selector).not.toBeNull();
    if (!selector) return;
    await user.selectOptions(selector, "report");

    expect(onChange).toHaveBeenCalledWith("report");
    expect(onCloseMobileHeaderMenu).toHaveBeenCalled();
  });

  it("오피스 팩 컨트롤이 없으면 모바일 메뉴에 선택기를 표시하지 않는다", () => {
    const props = createBaseProps();
    render(<AppHeaderBar {...props} />);

    expect(screen.queryByLabelText("오피스 팩")).not.toBeInTheDocument();
  });

  it("메뉴얼 화면에서 검색 포커스 이벤트를 보낸다", async () => {
    const user = userEvent.setup();
    const props = createBaseProps();
    const listener = vi.fn();
    window.addEventListener("donggri:manual-search-focus", listener);

    render(<AppHeaderBar {...props} currentView="manual" viewTitle="메뉴얼" />);
    await user.click(screen.getByRole("button", { name: /매뉴얼 검색/i }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("donggri:manual-search-focus", listener);
  });
});
