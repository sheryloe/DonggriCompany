import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { commandCenterHref, useCommandCenterNavigation } from "./useCommandCenterNavigation";

describe("useCommandCenterNavigation", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("creates canonical URLs for every native view and detail", () => {
    expect(commandCenterHref("today")).toBe("/");
    expect(commandCenterHref("projects", "DonggriCompany")).toBe("/?view=projects&project=DonggriCompany");
  });

  it("updates state through history and restores it on popstate", () => {
    const { result } = renderHook(() => useCommandCenterNavigation());

    act(() => result.current.navigate("tasks", "task-1"));
    expect(result.current).toMatchObject({ view: "tasks", selectedId: "task-1" });
    expect(window.location.search).toBe("?view=tasks&task=task-1");

    act(() => {
      window.history.pushState({}, "", "/?view=system");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current).toMatchObject({ view: "system", selectedId: null });
  });
});
