import { describe, expect, it } from "vitest";
import {
  buildGoalCommandPromptBlock,
  GOAL_COMMAND_VERSION,
  listGoalCommandPresets,
  parseGoalCommandSlash,
  resolveGoalCommandForTaskCreate,
} from "./goal-commands.ts";

describe("goal command presets", () => {
  it("lists the ten native Donggri goal commands", () => {
    const commands = listGoalCommandPresets();
    expect(commands).toHaveLength(10);
    expect(commands.map((command) => command.slashCommand)).toEqual([
      "/dg-feature",
      "/dg-fix",
      "/dg-review",
      "/dg-debug",
      "/dg-refactor",
      "/dg-design",
      "/dg-research",
      "/dg-security",
      "/dg-docs",
      "/dg-release",
    ]);
  });

  it("parses native slash commands and rejects unknown Donggri commands", () => {
    expect(parseGoalCommandSlash("/dg-fix login crash").preset?.key).toBe("fix");
    expect(parseGoalCommandSlash("/octo-fix login crash").preset).toBeNull();
    expect(parseGoalCommandSlash("/dg-unknown login crash").error).toBe("invalid_goal_command");
  });

  it("normalizes UI-selected goal metadata into canonical workflow meta", () => {
    const result = resolveGoalCommandForTaskCreate({
      title: "Investigate provider changes",
      description: "Find current docs",
      workflowMeta: { goal_command: "research" },
    });

    expect(result.error).toBeNull();
    expect(result.preset?.workflowPackKey).toBe("web_research_report");
    expect(result.workflowMeta).toMatchObject({
      goal_command: "research",
      goal_command_version: GOAL_COMMAND_VERSION,
      team_preset: "research_report",
      route_source: "task_create_goal_chooser",
      routing_reason: "user_selected_goal",
      required_departments: ["pmo", "api-research", "knowledge-docs"],
      max_parallel_workstreams: 2,
    });
  });

  it("builds an English runtime prompt block for selected goal commands", () => {
    const block = buildGoalCommandPromptBlock({
      goal_command: "release",
      team_preset: "release_gate",
      route_source: "task_create_goal_chooser",
      routing_reason: "user_selected_goal",
    });

    expect(block).toContain("[Goal Command Context]");
    expect(block).toContain("goal_command=release");
    expect(block).toContain("team_preset=release_gate");
    expect(block).toContain("required_departments=pmo,cicd-repo,qa,security-approval,knowledge-docs");
    expect(block).toContain("max_parallel_workstreams=3");
    expect(block).toContain("verification_gates=git_status,tests,ci_readiness,release_notes");
    expect(block).toContain("Bottleneck rule:");
  });
});
