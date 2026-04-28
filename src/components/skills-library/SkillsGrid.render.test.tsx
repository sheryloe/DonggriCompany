import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OAuthStatus } from "../../api";
import type { Agent } from "../../types";
import SkillsGrid from "./SkillsGrid";
import type { CategorizedSkill, TFunction } from "./model";

vi.mock("../AgentAvatar", () => ({
  default: () => <span data-testid="agent-avatar" />,
}));

const t: TFunction = (message) => message.en;

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

function renderGrid(oauthStatus: OAuthStatus | null, codexInstallError: string | null = null) {
  render(
    <SkillsGrid
      t={t}
      localeTag="en"
      agents={[TEST_AGENT]}
      filtered={[DONGGRI_SKILL]}
      learnedProvidersBySkill={new Map()}
      learnedRepresentatives={new Map()}
      hoveredSkill={null}
      setHoveredSkill={vi.fn()}
      detailCache={{}}
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
  it("renders OAuth storage unavailable state and Codex install button", () => {
    renderGrid({ storageReady: false, providers: {} });

    expect(screen.getByText("Codex Specialist")).toBeInTheDocument();
    expect(screen.getByText("OAuth: github-copilot · storage unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install to Codex" })).toBeEnabled();
  });

  it("renders OAuth execution ready state", () => {
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

    expect(screen.getByText("OAuth: github-copilot · execution ready")).toBeInTheDocument();
  });

  it("renders Codex install error banner", () => {
    renderGrid({ storageReady: true, providers: {} }, "install_failed");

    expect(screen.getByText("Codex app install failed: install_failed")).toBeInTheDocument();
  });
});
