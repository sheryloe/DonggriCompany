import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  getCanonicalPolicy,
  getCanonicalSnapshot,
  getCurrentCanonicalVersion,
  getCanonicalSpecializationRegistry,
  previewCanonicalRouting,
  reloadCanonicalSnapshot,
} from "../../company/canonical-policy.ts";
import { resolveCanonicalIdentity } from "../../company/canonical-identity.ts";

type RegisterCompanyRoutesDeps = Pick<RuntimeContext, "app" | "db">;

function readJsonSetting<T>(db: RegisterCompanyRoutesDeps["db"], key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as { value?: unknown } | undefined;
  if (!row || typeof row.value !== "string") return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function readStringSetting(db: RegisterCompanyRoutesDeps["db"], key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as { value?: unknown } | undefined;
  if (!row || typeof row.value !== "string") return fallback;
  const normalized = row.value.trim();
  return normalized || fallback;
}

export function registerCompanyRoutes({ app, db }: RegisterCompanyRoutesDeps): void {
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
    const mode = String(body.mode ?? "dry-run").trim().toLowerCase();
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
        ? (db.prepare("SELECT project_path FROM projects WHERE id = ? LIMIT 1").get(projectId) as { project_path?: string } | undefined)
            ?.project_path ?? ""
        : "");
    let allowlistFamilies: string[] = [];
    if (projectId) {
      try {
        const project = db
          .prepare("SELECT assignment_mode FROM projects WHERE id = ? LIMIT 1")
          .get(projectId) as { assignment_mode?: string } | undefined;
        if (String(project?.assignment_mode ?? "").trim() === "manual") {
          const projectAgents = db
            .prepare(
              `
              SELECT a.department_id, a.role, a.family, a.career_stage, a.specialization_key, a.authority_level, a.execution_capability_profile, a.workflow_profile
              FROM project_agents pa
              JOIN agents a ON a.id = pa.agent_id
              WHERE pa.project_id = ?
            `,
            )
            .all(projectId) as Array<Record<string, unknown>>;
          allowlistFamilies = [...new Set(projectAgents.map((agent) => resolveCanonicalIdentity(agent).family))];
        }
      } catch {
        allowlistFamilies = [];
      }
    }

    const resolved = previewCanonicalRouting({
      text,
      projectPath: projectPath || null,
      workflowPackKey: workflowPackKey || null,
      providerModelConfig,
      defaultProvider,
      projectConstraint: allowlistFamilies.length > 0 ? { allowlistFamilies: allowlistFamilies as any } : null,
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
