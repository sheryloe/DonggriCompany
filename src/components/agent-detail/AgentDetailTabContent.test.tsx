import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { createPresetAgentProfile } from "../../agent-profile";
import { AGENT_VISUAL_PROFILES } from "../../agent-visual-profiles";
import type { Agent, AgentMemoryResponse, Department } from "../../types";
import AgentDetailTabContent from "./AgentDetailTabContent";
import type { TFunction } from "./constants";

const t: TFunction = (entry) => entry.ko;

const department: Department = {
  id: "design",
  name: "Design",
  name_ko: "디자인",
  name_ja: "Design",
  name_zh: "Design",
  icon: "D",
  color: "#14b8a6",
  description: null,
  prompt: null,
  sort_order: 1,
  created_at: 1,
};

const currentVisualProfileKey = AGENT_VISUAL_PROFILES[0].agent_visual_profile_key;

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-design-1",
    name: "Design Lead",
    name_ko: "디자인 리드",
    name_ja: "Design Lead",
    name_zh: "Design Lead",
    department_id: "design",
    role: "team_leader",
    cli_provider: "codex",
    oauth_account_id: null,
    api_provider_id: null,
    api_model: null,
    cli_model: null,
    cli_reasoning_level: null,
    run_mode: "standard",
    cli_account_pool_id: null,
    workflow_profile: null,
    family: "frontend",
    career_stage: "team-lead",
    specialization_key: "web-design",
    authority_level: 3,
    execution_capability_profile: "design-review",
    canonical_identity_source: "stored",
    agent_profile: {
      ...createPresetAgentProfile("team_leader"),
      visual_profile_key: currentVisualProfileKey,
      preferred_subagents: ["ui-designer", "ux-researcher"],
    },
    avatar_emoji: "D",
    sprite_number: 12,
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 7,
    stats_xp: 420,
    created_at: 1,
    ...overrides,
  };
}

const memory: AgentMemoryResponse = {
  ok: true,
  memories: [
    {
      id: "memory-1",
      agent_id: "agent-design-1",
      project_id: null,
      memory_type: "lesson",
      scope_type: "agent",
      title: "Responsive review pattern",
      body: "Keep preview frames stable.",
      display_summary_ko: "프리뷰 프레임은 고정 비율로 검토한다.",
      tags_json: "[]",
      confidence: 0.9,
      strength: 0.8,
      source_type: "manual",
      source_id: null,
      external_ref: null,
      memory_layer: "core",
      thread_id: null,
      promotion_status: "candidate",
      retrieval_count: 2,
      last_retrieved_at: null,
      episode_json: null,
      status: "active",
      created_at: 1,
      updated_at: 1,
      last_used_at: null,
    },
  ],
  skill_usage: [
    {
      skill_id: "ui-designer",
      use_count: 3,
      success_count: 2,
      latest_at: 1,
      proficiency: 0.67,
    },
  ],
  growth_events: [
    {
      id: "growth-1",
      agent_id: "agent-design-1",
      project_id: null,
      task_id: null,
      event_type: "review",
      title: "Design critique improved",
      body: "More specific responsive checks.",
      episode_json: null,
      source_memory_id: null,
      xp_delta: 12,
      created_at: 1,
    },
  ],
};

function renderInfo(props: Partial<ComponentProps<typeof AgentDetailTabContent>> = {}) {
  const { agent: agentOverride, ...rest } = props;
  const agent = makeAgent(agentOverride as Partial<Agent>);
  return render(
    <AgentDetailTabContent
      tab="info"
      t={t}
      language="ko"
      agent={agent}
      departments={[department]}
      agentTasks={[]}
      agentSubAgents={[]}
      subtasksByTask={{}}
      expandedTaskId={null}
      setExpandedTaskId={() => {}}
      onChat={() => {}}
      onAssignTask={() => {}}
      agentMemory={memory}
      agentMemoryLoading={false}
      {...rest}
    />,
  );
}

describe("AgentDetailTabContent operational profile", () => {
  it("shows visual settings, generation history, memory growth, and recommended subagents together", () => {
    renderInfo();

    expect(screen.getByTestId("agent-operational-profile-panel")).toBeInTheDocument();
    expect(screen.getByText("운영 프로필 보드")).toBeInTheDocument();
    expect(screen.getByText("생성 이력")).toBeInTheDocument();
    expect(screen.getByText("스프라이트 설정")).toBeInTheDocument();
    expect(screen.getByTestId("agent-memory-growth-summary")).toBeInTheDocument();
    expect(screen.getByText("추천 subagent")).toBeInTheDocument();
    expect(screen.getByText("ui-designer")).toBeInTheDocument();
    expect(screen.getByText("ux-researcher")).toBeInTheDocument();
  });

  it("connects reserve profile approval to the supplied save callback", async () => {
    const user = userEvent.setup();
    const onApproveReserveProfile = vi.fn();
    renderInfo({ onApproveReserveProfile });

    await user.click(screen.getAllByRole("button", { name: /예비 프로필 승인/ })[0]);

    expect(onApproveReserveProfile).toHaveBeenCalledTimes(1);
    expect(onApproveReserveProfile.mock.calls[0][0]).not.toBe(currentVisualProfileKey);
  });
});
