import { describe, expect, it } from "vitest";
import { buildReviewPrompt, buildTaskDescription } from "../local/promptBuilders";

describe("prompt builders", () => {
  it("builds review prompt with selection and diff context", () => {
    const prompt = buildReviewPrompt(
      {
        mode: "selection",
        prompt: "Review this change",
        responseLanguage: "ko",
      },
      {
        filePath: "D:/repo/src/app.ts",
        selectionText: "const value = foo();",
        workingDiff: "@@ -1 +1 @@",
        languageId: "typescript",
      },
    );

    expect(prompt).toContain("Respond in Korean.");
    expect(prompt).toContain("[Selection]");
    expect(prompt).toContain("[Working Diff]");
  });

  it("builds task description from binding and context", () => {
    const description = buildTaskDescription({
      title: "Fix build",
      prompt: "Fix the failing build.",
      binding: {
        workspaceFolderName: "repo",
        workspaceFolderPath: "D:/repo",
        projectId: "p1",
        projectName: "Repo",
        projectPath: "D:/repo",
        projectContext: "Ship repo",
        bindingSource: "matched",
        updatedAt: 1,
      },
      context: {
        filePath: "D:/repo/src/app.ts",
        relativePath: "src/app.ts",
        selectionText: "const value = foo();",
      },
    });

    expect(description).toContain("[Workspace Binding]");
    expect(description).toContain("Project: Repo");
    expect(description).toContain("[Selection]");
  });
});
