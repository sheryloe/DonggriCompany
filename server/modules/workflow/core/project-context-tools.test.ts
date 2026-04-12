import { describe, expect, it } from "vitest";
import { createProjectContextTools } from "./project-context-tools.ts";

function createDbStub() {
  return {
    prepare() {
      return {
        get() {
          return undefined;
        },
        all() {
          return [];
        },
      };
    },
  };
}

describe("buildTaskExecutionPrompt", () => {
  it("injects the Codex plan mode block for eligible task agents", () => {
    const tools = createProjectContextTools({
      db: createDbStub() as any,
      isGitRepo: () => false,
      taskWorktrees: new Map(),
    });

    const prompt = tools.buildTaskExecutionPrompt(["[Task] Test"], {
      agent: {
        cli_provider: "codex",
        cli_model: "gpt-5.4",
        run_mode: "plan",
      },
      lang: "en",
    });

    expect(prompt).toContain("[Codex Plan Mode]");
    expect(prompt).toContain("Before execution, form an internal checklist");
  });

  it("omits the Codex plan mode block for non-eligible agents", () => {
    const tools = createProjectContextTools({
      db: createDbStub() as any,
      isGitRepo: () => false,
      taskWorktrees: new Map(),
    });

    const prompt = tools.buildTaskExecutionPrompt(["[Task] Test"], {
      agent: {
        cli_provider: "codex",
        cli_model: "",
        run_mode: "plan",
      },
      lang: "en",
    });

    expect(prompt).not.toContain("[Codex Plan Mode]");
  });
});
