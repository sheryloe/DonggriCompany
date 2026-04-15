import { describe, expect, it } from "vitest";
import { findMatchingProject, normalizeFsPath, pathsEqual } from "../util/path";

describe("path utils", () => {
  it("normalizes windows paths for matching", () => {
    expect(normalizeFsPath("D:\\Work\\Repo\\")).toBe("d:/Work/Repo");
    expect(pathsEqual("D:\\Work\\Repo", "d:/Work/Repo/")).toBe(true);
  });

  it("finds a matching project by workspace path", () => {
    const project = findMatchingProject(
      [
        {
          id: "1",
          name: "repo",
          project_path: "D:/Work/Repo",
          core_goal: "ship repo",
        },
      ],
      "D:\\Work\\Repo\\",
    );

    expect(project?.id).toBe("1");
  });
});
