import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import { registerSkillCatalogRoutes } from "./catalog-routes.ts";
import { registerSkillLearnRoutes } from "./learn-routes.ts";
import { registerWeeklySkillModuleReviewRoutes, startWeeklySkillModuleReviewScheduler } from "./weekly-review.ts";

export function registerSkillRoutes(ctx: RuntimeContext): {
  normalizeSkillLearnProviders: (input: unknown) => string[];
} {
  registerSkillCatalogRoutes(ctx);
  registerWeeklySkillModuleReviewRoutes(ctx);
  startWeeklySkillModuleReviewScheduler(ctx);
  return registerSkillLearnRoutes(ctx);
}
