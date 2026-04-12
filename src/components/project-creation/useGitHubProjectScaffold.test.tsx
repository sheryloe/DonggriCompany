import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGitHubProjectScaffold } from "./useGitHubProjectScaffold";

const flowMocks = vi.hoisted(() => ({
  getDefaultProjectRoot: vi.fn(),
}));

vi.mock("./github-project-flow", async () => {
  const actual = await vi.importActual<typeof import("./github-project-flow")>("./github-project-flow");
  return {
    ...actual,
    getDefaultProjectRoot: flowMocks.getDefaultProjectRoot,
  };
});

describe("useGitHubProjectScaffold", () => {
  beforeEach(() => {
    flowMocks.getDefaultProjectRoot.mockResolvedValue("D:\\Projects");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs repo slug from project name and auto-fills project path", async () => {
    const onProjectPathChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ active, projectName }) =>
        useGitHubProjectScaffold({
          active,
          projectName,
          onProjectPathChange,
        }),
      {
        initialProps: {
          active: true,
          projectName: "My Demo App",
        },
      },
    );

    act(() => {
      result.current.setGitHubAutoCreateEnabled(true);
    });

    await waitFor(() => {
      expect(flowMocks.getDefaultProjectRoot).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onProjectPathChange).toHaveBeenLastCalledWith("D:\\Projects\\my-demo-app");
    });

    expect(result.current.githubRepoName).toBe("my-demo-app");

    rerender({
      active: true,
      projectName: "My Better App",
    });

    await waitFor(() => {
      expect(result.current.githubRepoName).toBe("my-better-app");
    });
    expect(onProjectPathChange).toHaveBeenLastCalledWith("D:\\Projects\\my-better-app");
  });

  it("stops slug auto-sync after manual repo name edit", async () => {
    const onProjectPathChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ projectName }) =>
        useGitHubProjectScaffold({
          active: true,
          projectName,
          onProjectPathChange,
        }),
      {
        initialProps: {
          projectName: "Alpha Project",
        },
      },
    );

    act(() => {
      result.current.setGitHubAutoCreateEnabled(true);
    });

    await waitFor(() => {
      expect(result.current.githubRepoName).toBe("alpha-project");
    });

    act(() => {
      result.current.setGitHubRepoName("custom-repo-name");
    });

    rerender({
      projectName: "Changed Project Name",
    });

    expect(result.current.githubRepoName).toBe("custom-repo-name");
  });
});
