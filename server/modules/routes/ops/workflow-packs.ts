import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { resolveSessionWorkflowPackFromDb } from "../../../messenger/session-agent-routing.ts";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../workflow/packs/definitions.ts";
import { CANONICAL_PACK_SOURCES } from "../../workflow/packs/canonical-profiles.ts";
import { classifyWorkflowPackText } from "../../workflow/packs/text-routing.ts";

export function registerWorkflowPackRoutes(
  ctx: Pick<RuntimeContext, "app" | "db" | "nowMs" | "normalizeTextField">,
): void {
  const { app, db, normalizeTextField } = ctx;

  app.get("/api/workflow-packs", (_req, res) => {
    const packs = CANONICAL_PACK_SOURCES.map((pack) => ({
      key: pack.key,
      name: pack.name,
      enabled: true,
      input_schema: pack.inputSchema,
      prompt_preset: pack.promptPreset,
      qa_rules: pack.qaRules,
      output_template: pack.outputTemplate,
      routing_keywords: pack.routingKeywords,
      cost_profile: pack.costProfile,
      required_artifacts: pack.requiredArtifacts,
      output_contract: pack.outputContract,
      base_key: pack.baseKey,
      derived_from: pack.derivedFrom,
      model_tier_preference: pack.modelTierPreference,
      source_layer: "compiler",
    }));
    return res.json({ packs, source: "canonical_projection", readOnly: true });
  });

  app.put("/api/workflow-packs/:key", (_req, res) => {
    return res.status(409).json({ error: "canonical_projection_read_only" });
  });

  app.patch("/api/workflow-packs/:key", (_req, res) => {
    return res.status(409).json({ error: "canonical_projection_read_only" });
  });

  app.post("/api/workflow-packs/:key", (_req, res) => {
    return res.status(409).json({ error: "canonical_projection_read_only" });
  });

  app.post("/api/workflow/route", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = normalizeTextField(body.text) ?? "";
    const explicitPackKey = normalizeTextField(body.workflow_pack_key ?? body.packKey);
    const sessionKey = normalizeTextField(body.session_key ?? body.sessionKey);
    const projectId = normalizeTextField(body.project_id ?? body.projectId);

    const enabledSet = new Set<WorkflowPackKey>(
      CANONICAL_PACK_SOURCES
        .map((pack) => pack.key)
        .filter((packKey): packKey is WorkflowPackKey => isWorkflowPackKey(packKey)),
    );
    const isEnabled = (packKey: WorkflowPackKey): boolean => enabledSet.has(packKey);

    if (explicitPackKey && isWorkflowPackKey(explicitPackKey) && isEnabled(explicitPackKey)) {
      return res.json({
        packKey: explicitPackKey,
        confidence: 1,
        reason: "explicit_request",
        candidates: [{ packKey: explicitPackKey, confidence: 1, reason: "explicit_request" }],
        requiresConfirmation: false,
      });
    }

    if (sessionKey) {
      const sessionPack = resolveSessionWorkflowPackFromDb({ db, sessionKey });
      if (sessionPack && isEnabled(sessionPack)) {
        return res.json({
          packKey: sessionPack,
          confidence: 0.95,
          reason: "session_default",
          candidates: [{ packKey: sessionPack, confidence: 0.95, reason: "session_default" }],
          requiresConfirmation: false,
        });
      }
    }

    if (projectId) {
      const row = db.prepare("SELECT default_pack_key FROM projects WHERE id = ?").get(projectId) as
        | { default_pack_key?: string | null }
        | undefined;
      const projectPack = normalizeTextField(row?.default_pack_key);
      if (projectPack && isWorkflowPackKey(projectPack) && isEnabled(projectPack)) {
        return res.json({
          packKey: projectPack,
          confidence: 0.9,
          reason: "project_default",
          candidates: [{ packKey: projectPack, confidence: 0.9, reason: "project_default" }],
          requiresConfirmation: false,
        });
      }
    }

    const inferred = classifyWorkflowPackText(text);
    const inferredEnabled = isEnabled(inferred.packKey)
      ? inferred
      : {
          ...inferred,
          packKey: DEFAULT_WORKFLOW_PACK_KEY,
          confidence: Math.min(inferred.confidence, 0.6),
          reason: "inferred_pack_disabled",
          requiresConfirmation: true,
        };
    return res.json(inferredEnabled);
  });
}
