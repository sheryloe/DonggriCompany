import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OAuthStatus, SkillDetail } from "../../api";
import type { Agent } from "../../types";
import SkillsGrid from "./SkillsGrid";
import type { CategorizedSkill, TFunction } from "./model";

vi.mock("../AgentAvatar", () => ({
  default: () => <span data-testid="agent-avatar" />,
}));

const t: TFunction = (message) => message.ko;

const TEST_AGENT: Agent = {
  id: "agent-1",
  name: "Atlas",
  name_ko: "아틀라스",
  department_id: "dep-1",
  role: "team_leader",
  cli_provider: "codex",
  avatar_emoji: "A",
  personality: null,
  status: "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: Date.now(),
};

const DONGGRI_SKILL: CategorizedSkill = {
  rank: 1,
  name: "donggri-codex-55-agentic-coding",
  skillId: "donggri-codex-55-agentic-coding",
  repo: "donggri/skill-system",
  installs: 0,
  installsDisplay: "0",
  isRanked: true,
  origin: "donggri",
  category: "codex-specialist",
  description: "Codex agentic coding workflow.",
  requiredOAuth: ["github-copilot"],
  supportedTargets: ["donggri", "codex"],
  codexInstallable: true,
  codexInstalled: false,
};

const DETAIL: SkillDetail = {
  title: "Codex agentic coding workflow",
  description: "Use Codex for long-horizon coding.",
  whenToUse: ["Use when implementing complex features."],
  weeklyInstalls: "12",
  firstSeen: "2026-01-01T00:00:00.000Z",
  installCommand: "codex skills install donggri-codex-55-agentic-coding",
  platforms: [{ name: "codex", installs: "12" }],
  audits: [{ name: "license", status: "pass" }],
};

function renderGrid(
  oauthStatus: OAuthStatus | null,
  codexInstallError: string | null = null,
  hoveredSkill: string | null = null,
) {
  render(
    <SkillsGrid
      t={t}
      localeTag="ko-KR"
      agents={[TEST_AGENT]}
      filtered={[DONGGRI_SKILL]}
      learnedProvidersBySkill={new Map()}
      learnedRepresentatives={new Map()}
      hoveredSkill={hoveredSkill}
      setHoveredSkill={vi.fn()}
      detailCache={{ "donggri/skill-system/donggri-codex-55-agentic-coding": DETAIL }}
      tooltipRef={{ current: null }}
      hoverTimerRef={{ current: null }}
      copiedSkill={null}
      installingCodexSkill={null}
      codexInstallError={codexInstallError}
      oauthStatus={oauthStatus}
      onHoverEnter={vi.fn()}
      onHoverLeave={vi.fn()}
      onOpenLearningModal={vi.fn()}
      onCopy={vi.fn()}
      onInstallToCodex={vi.fn()}
    />,
  );
}

describe("SkillsGrid", () => {
  it("renders Korean Donggri description and hides raw English description", () => {
    renderGrid({ storageReady: false, providers: {} });

    expect(screen.getByText("Codex 전문 기능")).toBeInTheDocument();
    expect(screen.getByText("Codex 장기 코딩 실행")).toBeInTheDocument();
    expect(screen.getByText(/긴 호흡의 코드 분석/)).toBeInTheDocument();
    expect(screen.queryByText("Codex agentic coding workflow.")).not.toBeInTheDocument();
  });

  it("renders OAuth storage unavailable state and Codex install button in Korean", () => {
    renderGrid({ storageReady: false, providers: {} });

    expect(screen.getByText("OAuth: GitHub Copilot · 저장소 확인 필요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Codex 앱에 설치" })).toBeEnabled();
  });

  it("renders OAuth execution ready state in Korean", () => {
    renderGrid({
      storageReady: true,
      providers: {
        "github-copilot": {
          connected: true,
          detected: true,
          executionReady: true,
          requiresWebOAuth: false,
          source: null,
          email: null,
          scope: null,
          expires_at: null,
          created_at: 0,
          updated_at: 0,
          webConnectable: true,
        },
      },
    });

    expect(screen.getByText("OAuth: GitHub Copilot · 실행 준비 완료")).toBeInTheDocument();
  });

  it("renders Codex install error banner in Korean", () => {
    renderGrid({ storageReady: true, providers: {} }, "install_failed");

    expect(screen.getByText("Codex 앱 설치 실패: install_failed")).toBeInTheDocument();
  });

  it("localizes tooltip detail text without leaking English description", () => {
    renderGrid({ storageReady: true, providers: {} }, null, "donggri/skill-system/donggri-codex-55-agentic-coding");

    expect(screen.getByText("사용 시점")).toBeInTheDocument();
    expect(screen.getByText("라이선스: 통과")).toBeInTheDocument();
    expect(screen.getByText("Codex 앱")).toBeInTheDocument();
    expect(screen.queryByText("Use Codex for long-horizon coding.")).not.toBeInTheDocument();
    expect(screen.queryByText("Use when implementing complex features.")).not.toBeInTheDocument();
  });
});
