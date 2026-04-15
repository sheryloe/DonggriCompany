import { describe, expect, it } from "vitest";
import { reduceWsEvent } from "../state";

describe("state reducer", () => {
  it("upserts tasks from websocket events", () => {
    const next = reduceWsEvent(
      {
        connected: false,
        tasks: [],
        decisions: [],
      },
      {
        type: "task_update",
        payload: {
          id: "task-1",
          title: "Fix bug",
          description: null,
          project_path: "D:/repo",
          status: "planned",
          updated_at: 10,
        },
        ts: 10,
      },
    );

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]?.id).toBe("task-1");
  });

  it("tracks cli output activity", () => {
    const next = reduceWsEvent(
      {
        connected: true,
        tasks: [],
        decisions: [],
      },
      {
        type: "cli_output",
        payload: {
          task_id: "task-2",
        },
        ts: 20,
      },
    );

    expect(next.lastCliTaskId).toBe("task-2");
  });
});
