import { describe, expect, it } from "vitest";
import {
  isValidGitHubRepoFullName,
  isValidGitHubRepoName,
  normalizeGitHubRepoFullName,
  normalizeGitHubRepoName,
} from "./github-validation.ts";

describe("github validation", () => {
  it("normalizes and validates repository names", () => {
    expect(normalizeGitHubRepoName(" Demo_Repo-1 ")).toBe("demo_repo-1");
    expect(isValidGitHubRepoName("demo_repo-1")).toBe(true);
    expect(isValidGitHubRepoName("../demo")).toBe(false);
    expect(isValidGitHubRepoName("demo.git")).toBe(false);
    expect(isValidGitHubRepoName("demo/repo")).toBe(false);
    expect(isValidGitHubRepoName("")).toBe(false);
  });

  it("validates owner/repo project metadata", () => {
    expect(normalizeGitHubRepoFullName(" octocat/demo-repo ")).toBe("octocat/demo-repo");
    expect(isValidGitHubRepoFullName("octocat/demo-repo")).toBe(true);
    expect(isValidGitHubRepoFullName("octo-cat/demo_repo")).toBe(true);
    expect(isValidGitHubRepoFullName("octocat")).toBe(false);
    expect(isValidGitHubRepoFullName("octocat/demo.git")).toBe(false);
    expect(isValidGitHubRepoFullName("octocat/demo/repo")).toBe(false);
  });
});
