import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  getCanonicalPolicy,
  getCanonicalSnapshot,
  getCurrentCanonicalVersion,
  getCanonicalSpecializationRegistry,
  previewCanonicalRouting,
  reloadCanonicalSnapshot,
} from "../../company/canonical-policy.ts";
import {
  applyCanonicalResetOrganization,
  previewCanonicalResetOrganization,
} from "../../bootstrap/schema/organization-reset.ts";
import { resolveProjectRoutingConstraint } from "../shared/project-staffing-policy.ts";

type RegisterCompanyRoutesDeps = Pick<RuntimeContext, "app" | "db">;

function readJsonSetting<T>(db: RegisterCompanyRoutesDeps["db"], key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
    | { value?: unknown }
    | undefined;
  if (!row || typeof row.value !== "string") return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function readStringSetting(db: RegisterCompanyRoutesDeps["db"], key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
    | { value?: unknown }
    | undefined;
  if (!row || typeof row.value !== "string") return fallback;
  const normalized = row.value.trim();
  return normalized || fallback;
}

export function registerCompanyRoutes({ app, db }: RegisterCompanyRoutesDeps): void {
  app.post("/api/ops/canonical-reset-organization", (req, res) => {
    const body = (req.body as { mode?: string; target_seed_version?: string } | undefined) ?? {};
    const mode = String(body.mode ?? "preview")
      .trim()
      .toLowerCase();
    const targetSeedVersion = String(body.target_seed_version ?? "").trim();
    if (targetSeedVersion && targetSeedVersion !== "org-v2") {
      return res.status(400).json({ error: "unsupported_seed_version", target_seed_version: targetSeedVersion });
    }
    if (mode !== "preview" && mode !== "apply") {
      return res.status(400).json({ error: "invalid_mode" });
    }
    try {
      const result = mode === "apply" ? applyCanonicalResetOrganization(db) : previewCanonicalResetOrganization(db);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({
        error: "canonical_reset_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/company/canonical-policy", (_req, res) => {
    const snapshot = getCanonicalSnapshot();
    res.json({
      currentVersion: getCurrentCanonicalVersion(),
      policy: getCanonicalPolicy(),
      diagnostics: snapshot.diagnostics,
    });
  });

  app.get("/api/company/specialization-registry", (_req, res) => {
    const snapshot = getCanonicalSnapshot();
    res.json({
      registry: getCanonicalSpecializationRegistry(),
      diagnostics: snapshot.diagnostics,
    });
  });

  app.post("/api/company/reload-canonical-rules", (req, res) => {
    const body = (req.body as { mode?: string; target_version?: string } | undefined) ?? {};
    const mode = String(body.mode ?? "dry-run")
      .trim()
      .toLowerCase();
    if (mode !== "dry-run" && mode !== "apply" && mode !== "rollback") {
      return res.status(400).json({ error: "invalid_reload_mode" });
    }
    const targetVersion = typeof body.target_version === "string" ? body.target_version.trim() : "";
    const result = reloadCanonicalSnapshot(mode, targetVersion || null);
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/company/routing/preview", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = String(body.text ?? "").trim();
    if (!text) {
      return res.status(400).json({ error: "text_required" });
    }
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
    const explicitProjectPath = typeof body.project_path === "string" ? body.project_path.trim() : "";
    const workflowPackKey = typeof body.workflow_pack_key === "string" ? body.workflow_pack_key.trim() : "";
    const providerModelConfig = readJsonSetting<
      Record<
        string,
        {
          model?: string;
          subModel?: string;
          reasoningLevel?: string;
          subModelReasoningLevel?: string;
        }
      >
    >(db, "providerModelConfig", {});
    const defaultProvider = readStringSetting(db, "defaultProvider", "claude");
    const projectPath =
      explicitProjectPath ||
      (projectId
        ? ((
            db.prepare("SELECT project_path FROM projects WHERE id = ? LIMIT 1").get(projectId) as
              | { project_path?: string }
              | undefined
          )?.project_path ?? "")
        : "");
    const projectConstraint = resolveProjectRoutingConstraint(db, projectId || null);

    const resolved = previewCanonicalRouting({
      text,
      projectPath: projectPath || null,
      workflowPackKey: workflowPackKey || null,
      providerModelConfig,
      defaultProvider,
      projectConstraint:
        projectConstraint && projectConstraint.allowlistFamilies.length > 0
          ? { allowlistFamilies: projectConstraint.allowlistFamilies as any }
          : null,
    });
    return res.json({
      policy: resolved,
      snapshot_scope: "current",
      currentVersion: getCurrentCanonicalVersion(),
      selectedBy: resolved.selectedBy,
      blockedBy: resolved.blockedBy,
      whyNot: resolved.whyNot,
      snapshotScope: resolved.snapshotScope,
      policyVersion: resolved.policyVersion,
    });
  });
}
