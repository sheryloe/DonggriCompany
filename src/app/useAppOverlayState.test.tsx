import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppOverlayState } from "./useAppOverlayState";

describe("useAppOverlayState", () => {
  it("keeps transient overlay state behind one hook boundary", () => {
    const { result } = renderHook(() => useAppOverlayState());

    expect(result.current.showChat).toBe(false);
    expect(result.current.selectedAgent).toBeNull();
    expect(result.current.taskPanel).toBeNull();
    expect(result.current.activeDepartmentComponentId).toBe("pmo");

    act(() => {
      result.current.setShowChat(true);
      result.current.setTaskPanel({ taskId: "task-1", tab: "terminal" });
      result.current.setActiveDepartmentComponentId("design");
      result.current.setMobileNavOpen(true);
    });

    expect(result.current.showChat).toBe(true);
    expect(result.current.taskPanel).toEqual({ taskId: "task-1", tab: "terminal" });
    expect(result.current.activeDepartmentComponentId).toBe("design");
    expect(result.current.mobileNavOpen).toBe(true);
  });
});
