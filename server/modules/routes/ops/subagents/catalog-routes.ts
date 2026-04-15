import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import { loadCodexSubagentCatalogSnapshot } from "./catalog-snapshot.ts";

export function registerCodexSubagentCatalogRoutes(ctx: RuntimeContext): void {
  const { app } = ctx;

  app.get("/api/subagents/catalog", (_req, res) => {
    const snapshot = loadCodexSubagentCatalogSnapshot();
    if (!snapshot) {
      return res.status(503).json({
        error: "codex_subagents_sync_needed",
        hint: "pnpm subagents:sync",
      });
    }

    res.json({ catalog: snapshot });
  });
}

