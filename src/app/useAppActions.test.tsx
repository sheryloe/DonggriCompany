import { describe, expect, it, vi } from "vitest";
import { createTaskAndRefresh } from "./useAppActions";

describe("createTaskAndRefresh", () => {
  it("returns the created task id and refreshed state", async () => {
    const dependencies = {
      createTask: vi.fn().mockResolvedValue("task-141"),
      getTasks: vi.fn().mockResolvedValue([{ id: "task-141" }]),
      getStats: vi.fn().mockResolvedValue({ tasks: { total: 1 } }),
    } as never;

    await expect(createTaskAndRefresh({ title: "검증" }, dependencies)).resolves.toEqual(
      expect.objectContaining({ taskId: "task-141" }),
    );
  });

  it("propagates create failures and never reports a refreshed success", async () => {
    const failure = new Error("create failed");
    const dependencies = {
      createTask: vi.fn().mockRejectedValue(failure),
      getTasks: vi.fn(),
      getStats: vi.fn(),
    } as never;

    await expect(createTaskAndRefresh({ title: "실패" }, dependencies)).rejects.toBe(failure);
    expect((dependencies as { getTasks: ReturnType<typeof vi.fn> }).getTasks).not.toHaveBeenCalled();
  });
});
