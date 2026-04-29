import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { GOAL_COMMAND_VERSION, listGoalCommandPresets } from "../../workflow/goal-commands.ts";

export function registerGoalCommandRoutes(ctx: Pick<RuntimeContext, "app">): void {
  ctx.app.get("/api/goal-commands", (_req, res) => {
    res.json({
      version: GOAL_COMMAND_VERSION,
      commands: listGoalCommandPresets(),
    });
  });
}
