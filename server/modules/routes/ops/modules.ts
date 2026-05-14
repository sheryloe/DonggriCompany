import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../modules/donggri");
const MODULE_KEY_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;
const MODULE_CATEGORIES = new Set([
  "auth-provider",
  "image-generation",
  "game-asset",
  "project-template",
  "operations",
]);
const IMAGE_MODULE_TYPES = new Set(["image_prompt_pack", "game_asset_pipeline"]);
const DEPARTMENT_COMPONENT_IDS = new Set([
  "pmo",
  "planning",
  "dev",
  "design",
  "qa",
  "devsecops",
  "operations",
  "strategic_maintenance",
]);

export interface ModuleManifest {
  module_key: string;
  module_type: string;
  category_key: string;
  version: string;
  name: string;
  summary: string;
  capabilities: string[];
  required_secrets: string[];
  required_runtime: string[];
  artifact_contract: Record<string, unknown>;
  license_policy: Record<string, unknown>;
  risk_level: "low" | "medium" | "high";
  department_id?: string | null;
  component_kind?: string | null;
  entry_points?: string[];
  project_scoped?: boolean;
  default_config?: Record<string, unknown>;
  prompt_pack?: Record<string, unknown>;
}

interface ProjectRow {
  id: string;
  name: string;
  project_path: string;
  core_goal: string;
}

interface ArtifactDeltaEntry {
  path: string;
  action: "create" | "update" | "ensure_dir";
  purpose: string;
  content?: string;
  content_preview?: string;
}

interface ModulePreview {
  module_key: string;
  module_version: string;
  binding_name: string;
  project_id: string;
  project_path: string;
  secret_status: Record<string, "configured" | "missing">;
  artifact_delta: ArtifactDeltaEntry[];
  apply_required: boolean;
}

interface ProjectComponentEventRow {
  id: string;
  project_id: string;
  department_id: string;
  component_key: string;
  component_kind: string;
  event_type: string;
  title: string;
  summary: string | null;
  payload_json: string;
  related_task_id: string | null;
  created_by: string | null;
  created_at: number;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateModuleManifest(value: unknown, sourcePath: string): ModuleManifest {
  if (!value || typeof value !== "object") throw new Error(`invalid_module_manifest:${sourcePath}`);
  const manifest = value as Partial<ModuleManifest>;
  if (!manifest.module_key || !MODULE_KEY_RE.test(manifest.module_key)) {
    throw new Error(`invalid_module_key:${sourcePath}`);
  }
  if (!manifest.version || typeof manifest.version !== "string")
    throw new Error(`invalid_module_version:${sourcePath}`);
  if (!manifest.category_key || !MODULE_CATEGORIES.has(manifest.category_key)) {
    throw new Error(`invalid_module_category:${manifest.module_key}`);
  }
  if (!manifest.module_type || typeof manifest.module_type !== "string") {
    throw new Error(`invalid_module_type:${manifest.module_key}`);
  }
  if (
    manifest.department_id != null &&
    (typeof manifest.department_id !== "string" || !DEPARTMENT_COMPONENT_IDS.has(manifest.department_id))
  ) {
    throw new Error(`invalid_module_department:${manifest.module_key}`);
  }
  if (manifest.component_kind != null && typeof manifest.component_kind !== "string") {
    throw new Error(`invalid_module_component_kind:${manifest.module_key}`);
  }
  if (manifest.entry_points != null && !Array.isArray(manifest.entry_points)) {
    throw new Error(`invalid_module_entry_points:${manifest.module_key}`);
  }
  if (manifest.project_scoped != null && typeof manifest.project_scoped !== "boolean") {
    throw new Error(`invalid_module_project_scoped:${manifest.module_key}`);
  }
  if (!Array.isArray(manifest.capabilities)) throw new Error(`invalid_module_capabilities:${manifest.module_key}`);
  if (!Array.isArray(manifest.required_secrets)) throw new Error(`invalid_module_secrets:${manifest.module_key}`);
  if (!Array.isArray(manifest.required_runtime)) throw new Error(`invalid_module_runtime:${manifest.module_key}`);
  return {
    module_key: manifest.module_key,
    module_type: manifest.module_type,
    category_key: manifest.category_key,
    version: manifest.version,
    name: String(manifest.name ?? manifest.module_key),
    summary: String(manifest.summary ?? ""),
    capabilities: manifest.capabilities.map((item) => String(item)),
    required_secrets: manifest.required_secrets.map((item) => String(item)),
    required_runtime: manifest.required_runtime.map((item) => String(item)),
    artifact_contract: manifest.artifact_contract ?? {},
    license_policy: manifest.license_policy ?? { source: "pattern_reference_only" },
    risk_level: manifest.risk_level ?? "medium",
    department_id: manifest.department_id ?? null,
    component_kind: manifest.component_kind ?? null,
    entry_points: Array.isArray(manifest.entry_points) ? manifest.entry_points.map((item) => String(item)) : [],
    project_scoped: manifest.project_scoped ?? false,
    default_config: manifest.default_config ?? {},
    prompt_pack: manifest.prompt_pack,
  };
}

export function listDonggriModules(): ModuleManifest[] {
  if (!fs.existsSync(MODULE_ROOT)) return [];
  const manifests = fs
    .readdirSync(MODULE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(MODULE_ROOT, entry.name, "module.json");
      if (!fs.existsSync(filePath)) return null;
      return validateModuleManifest(readJsonFile(filePath), filePath);
    })
    .filter((manifest): manifest is ModuleManifest => Boolean(manifest))
    .sort((a, b) => a.module_key.localeCompare(b.module_key));

  const seen = new Set<string>();
  for (const manifest of manifests) {
    const key = `${manifest.module_key}@${manifest.version}`;
    if (seen.has(key)) throw new Error(`duplicate_module_version:${key}`);
    seen.add(key);
  }
  return manifests;
}

function findModule(moduleKey: string, version?: string): ModuleManifest | null {
  const modules = listDonggriModules();
  return modules.find((module) => module.module_key === moduleKey && (!version || module.version === version)) ?? null;
}

function normalizeBindingName(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizePathForCompare(value: string): string {
  return path
    .resolve(value)
    .replace(/[\\/]+$/g, "")
    .toLowerCase();
}

function ensureRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("invalid_artifact_path");
  return normalized;
}

function safeJoinProjectPath(projectPath: string, relativePath: string): string {
  const root = path.resolve(projectPath);
  const target = path.resolve(root, ensureRelativePath(relativePath));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("artifact_path_outside_project");
  return target;
}

function getProject(db: RuntimeContext["db"], projectId: string): ProjectRow | null {
  const row = db.prepare("SELECT id, name, project_path, core_goal FROM projects WHERE id = ?").get(projectId) as
    | ProjectRow
    | undefined;
  return row ?? null;
}

function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function redactSecretRefs(manifest: ModuleManifest, value: unknown): Record<string, "configured" | "missing"> {
  const refs = parseObject(value);
  const result: Record<string, "configured" | "missing"> = {};
  for (const secretName of manifest.required_secrets) {
    const configured = Boolean(process.env[secretName]) || Boolean(refs[secretName]);
    result[secretName] = configured ? "configured" : "missing";
  }
  return result;
}

function buildBindingConfig(manifest: ModuleManifest, inputConfig: unknown): Record<string, unknown> {
  return {
    ...(manifest.default_config ?? {}),
    ...parseObject(inputConfig),
  };
}

function buildModuleBindingDocument(params: {
  manifest: ModuleManifest;
  project: ProjectRow;
  bindingName: string;
  config: Record<string, unknown>;
  secretStatus: Record<string, "configured" | "missing">;
}): string {
  const document = {
    schema_version: "donggri_project_module_binding_v1",
    module_key: params.manifest.module_key,
    module_version: params.manifest.version,
    module_type: params.manifest.module_type,
    category_key: params.manifest.category_key,
    binding_name: params.bindingName,
    project_id: params.project.id,
    project_path: params.project.project_path,
    capabilities: params.manifest.capabilities,
    required_runtime: params.manifest.required_runtime,
    secret_status: params.secretStatus,
    config: params.config,
    artifact_contract: params.manifest.artifact_contract,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function buildAssetManifestDocument(params: {
  manifest: ModuleManifest;
  project: ProjectRow;
  bindingName: string;
}): string {
  const document = {
    schema_version: "donggri_asset_manifest_v1",
    project_id: params.project.id,
    source_of_truth: "workspace",
    generated_root: "assets/generated",
    published_root: "public/generated",
    modules: [
      {
        module_key: params.manifest.module_key,
        module_version: params.manifest.version,
        binding_name: params.bindingName,
        module_type: params.manifest.module_type,
        required_states: ["draft", "generated", "needs_review", "approved", "published"],
      },
    ],
    rules: {
      codex_home_outputs_are_sources_only: true,
      published_assets_require_workspace_copy: true,
    },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function buildPreview(params: {
  manifest: ModuleManifest;
  project: ProjectRow;
  bindingName: string;
  config: Record<string, unknown>;
  secretStatus: Record<string, "configured" | "missing">;
}): ModulePreview {
  const artifactDelta: ArtifactDeltaEntry[] = [
    {
      path: `.donggri/modules/${params.bindingName}.json`,
      action: "create",
      purpose: "project_module_binding_manifest",
      content: buildModuleBindingDocument(params),
      content_preview:
        "Donggri module binding manifest with canonical module key, version, config, and redacted secret status.",
    },
  ];

  if (IMAGE_MODULE_TYPES.has(params.manifest.module_type)) {
    artifactDelta.push({
      path: ".donggri/assets/manifest.json",
      action: "create",
      purpose: "asset_generation_manifest",
      content: buildAssetManifestDocument(params),
      content_preview: "Workspace asset manifest for generated, reviewed, approved, and published assets.",
    });
  }

  return {
    module_key: params.manifest.module_key,
    module_version: params.manifest.version,
    binding_name: params.bindingName,
    project_id: params.project.id,
    project_path: params.project.project_path,
    secret_status: params.secretStatus,
    artifact_delta: artifactDelta,
    apply_required: true,
  };
}

function insertBinding(
  ctx: Pick<RuntimeContext, "db" | "nowMs">,
  preview: ModulePreview,
  config: Record<string, unknown>,
) {
  const now = ctx.nowMs();
  const id = randomUUID();
  ctx.db
    .prepare(
      `
      INSERT INTO project_module_bindings (
        id, project_id, module_key, module_version, binding_name, project_path, project_context,
        config_json, secret_refs_json, preview_json, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bound', ?, ?)
    `,
    )
    .run(
      id,
      preview.project_id,
      preview.module_key,
      preview.module_version,
      preview.binding_name,
      preview.project_path,
      null,
      JSON.stringify(config),
      JSON.stringify(preview.secret_status),
      JSON.stringify(preview),
      now,
      now,
    );
  return id;
}

function rowToBinding(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    module_key: String(row.module_key),
    module_version: String(row.module_version),
    binding_name: String(row.binding_name),
    project_path: row.project_path ? String(row.project_path) : null,
    config: safeJson(row.config_json, {}),
    secret_status: safeJson(row.secret_refs_json, {}),
    preview: safeJson(row.preview_json, null),
    status: String(row.status),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
    applied_at: row.applied_at == null ? null : Number(row.applied_at),
  };
}

function rowToApplyRun(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    binding_id: String(row.binding_id),
    project_id: String(row.project_id),
    idempotency_key: String(row.idempotency_key),
    status: String(row.status),
    artifact_delta: safeJson(row.artifact_delta_json, []),
    message: row.message ? String(row.message) : null,
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function rowToAssetJob(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    project_id: row.project_id ? String(row.project_id) : null,
    module_key: String(row.module_key),
    module_type: String(row.module_type),
    asset_key: String(row.asset_key),
    status: String(row.status),
    engine: String(row.engine),
    request: safeJson(row.request_json, {}),
    prompt_markdown: String(row.prompt_markdown ?? ""),
    source_files: safeJson(row.source_files_json, []),
    published_files: safeJson(row.published_files_json, []),
    review: safeJson(row.review_json, {}),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
    approved_at: row.approved_at == null ? null : Number(row.approved_at),
    published_at: row.published_at == null ? null : Number(row.published_at),
  };
}

function rowToProjectComponentEvent(row: ProjectComponentEventRow | Record<string, unknown>) {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    department_id: String(row.department_id),
    component_key: String(row.component_key),
    component_kind: String(row.component_kind),
    event_type: String(row.event_type),
    title: String(row.title),
    summary: row.summary == null ? null : String(row.summary),
    payload: safeJson(row.payload_json, {}),
    related_task_id: row.related_task_id == null ? null : String(row.related_task_id),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: Number(row.created_at ?? 0),
  };
}

function safeJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeArtifactDelta(projectPath: string, artifactDelta: ArtifactDeltaEntry[]): void {
  for (const entry of artifactDelta) {
    const target = safeJoinProjectPath(projectPath, entry.path);
    if (entry.action === "ensure_dir") {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.path.endsWith(".donggri/assets/manifest.json") && fs.existsSync(target)) {
      const existing = safeJson(fs.readFileSync(target, "utf8"), {}) as Record<string, unknown>;
      const incoming = safeJson(entry.content, {}) as Record<string, unknown>;
      const existingModules = Array.isArray(existing.modules) ? existing.modules : [];
      const incomingModules = Array.isArray(incoming.modules) ? incoming.modules : [];
      const merged = {
        ...incoming,
        ...existing,
        modules: [...existingModules, ...incomingModules].filter((module, index, modules) => {
          const key = `${(module as Record<string, unknown>).module_key}:${(module as Record<string, unknown>).binding_name}`;
          return (
            modules.findIndex((candidate) => {
              const candidateRecord = candidate as Record<string, unknown>;
              return `${candidateRecord.module_key}:${candidateRecord.binding_name}` === key;
            }) === index
          );
        }),
      };
      fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      continue;
    }
    fs.writeFileSync(target, entry.content ?? "", "utf8");
  }
}

function makeAssetPromptPack(manifest: ModuleManifest, body: Record<string, unknown>): string {
  const assetBrief = typeof body.asset_brief === "string" && body.asset_brief.trim() ? body.asset_brief.trim() : "";
  const promptPack = manifest.prompt_pack ?? {};
  return [
    `# Donggri Asset Job`,
    ``,
    `Module: ${manifest.module_key}@${manifest.version}`,
    `Engine: imagegen_builtin`,
    ``,
    `## Asset Brief`,
    assetBrief || "No user brief provided.",
    ``,
    `## Prompt Pack`,
    "```json",
    JSON.stringify(promptPack, null, 2),
    "```",
    ``,
    `## Review Contract`,
    `Approved results must be copied into assets/generated/${manifest.module_type}/<asset_id>/ before publication.`,
    `Files that only exist under CODEX_HOME are source drafts and cannot be marked as published.`,
  ].join("\n");
}

function buildPreviewFromRequest(
  db: RuntimeContext["db"],
  projectId: string,
  body: Record<string, unknown>,
):
  | { project: ProjectRow; manifest: ModuleManifest; config: Record<string, unknown>; preview: ModulePreview }
  | { error: string; status: number } {
  const project = getProject(db, projectId);
  if (!project) return { error: "project_not_found", status: 404 };
  const moduleKey = typeof body.module_key === "string" ? body.module_key.trim() : "";
  if (!moduleKey || !MODULE_KEY_RE.test(moduleKey)) return { error: "module_key_required", status: 400 };
  const version = typeof body.module_version === "string" ? body.module_version.trim() : "";
  const manifest = findModule(moduleKey, version || undefined);
  if (!manifest) return { error: "module_not_found", status: 404 };
  const requestedProjectPath = typeof body.project_path === "string" ? body.project_path.trim() : "";
  if (
    requestedProjectPath &&
    normalizePathForCompare(requestedProjectPath) !== normalizePathForCompare(project.project_path)
  ) {
    return { error: "project_path_mismatch", status: 409 };
  }
  const bindingName = normalizeBindingName(body.binding_name, manifest.module_key);
  const config = buildBindingConfig(manifest, body.config);
  const secretStatus = redactSecretRefs(manifest, body.secret_refs);
  return {
    project,
    manifest,
    config,
    preview: buildPreview({ manifest, project, bindingName, config, secretStatus }),
  };
}

export function registerModuleRoutes(ctx: Pick<RuntimeContext, "app" | "db" | "nowMs">): void {
  const { app, db, nowMs } = ctx;

  app.get("/api/modules", (req, res) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
      const departmentId = typeof req.query.department_id === "string" ? req.query.department_id.trim() : "";
      const modules = listDonggriModules().filter((module) => {
        if (category && module.category_key !== category) return false;
        if (departmentId && module.department_id !== departmentId) return false;
        return true;
      });
      return res.json({ ok: true, modules });
    } catch (error) {
      return res.status(500).json({ error: "module_catalog_unavailable", detail: String(error) });
    }
  });

  app.get("/api/modules/:moduleKey", (req, res) => {
    const moduleKey = String(req.params.moduleKey ?? "").trim();
    const manifest = findModule(moduleKey);
    if (!manifest) return res.status(404).json({ error: "module_not_found" });
    const markdownPath = path.join(MODULE_ROOT, moduleKey, "MODULE.md");
    const markdown = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, "utf8") : "";
    return res.json({ ok: true, module: manifest, markdown });
  });

  app.post("/api/projects/:id/modules/preview", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    const result = buildPreviewFromRequest(db, projectId, (req.body ?? {}) as Record<string, unknown>);
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true, preview: result.preview });
  });

  app.post("/api/projects/:id/modules", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    const result = buildPreviewFromRequest(db, projectId, (req.body ?? {}) as Record<string, unknown>);
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    try {
      const bindingId = insertBinding(ctx, result.preview, result.config);
      const row = db.prepare("SELECT * FROM project_module_bindings WHERE id = ?").get(bindingId) as
        | Record<string, unknown>
        | undefined;
      return res.status(201).json({ ok: true, binding: row ? rowToBinding(row) : null });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes("unique")) return res.status(409).json({ error: "module_binding_exists" });
      return res.status(500).json({ error: "module_binding_failed" });
    }
  });

  app.get("/api/projects/:id/modules", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!getProject(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const bindings = db
      .prepare("SELECT * FROM project_module_bindings WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as Array<Record<string, unknown>>;
    const runs = db
      .prepare("SELECT * FROM project_module_apply_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(projectId) as Array<Record<string, unknown>>;
    return res.json({ ok: true, bindings: bindings.map(rowToBinding), apply_runs: runs.map(rowToApplyRun) });
  });

  app.get("/api/projects/:id/component-events", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!getProject(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const departmentId = typeof req.query.department_id === "string" ? req.query.department_id.trim() : "";
    const componentKey = typeof req.query.component_key === "string" ? req.query.component_key.trim() : "";
    const clauses = ["project_id = ?"];
    const values: string[] = [projectId];
    if (departmentId) {
      clauses.push("department_id = ?");
      values.push(departmentId);
    }
    if (componentKey) {
      clauses.push("component_key = ?");
      values.push(componentKey);
    }
    const rows = db
      .prepare(
        `
        SELECT * FROM project_component_events
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 100
      `,
      )
      .all(...values) as unknown as ProjectComponentEventRow[];
    return res.json({ ok: true, events: rows.map(rowToProjectComponentEvent) });
  });

  app.post("/api/projects/:id/component-events", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!getProject(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    const componentKey = typeof body.component_key === "string" ? body.component_key.trim() : "";
    const componentKind = typeof body.component_kind === "string" ? body.component_kind.trim() : "";
    const eventType = typeof body.event_type === "string" ? body.event_type.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!departmentId || !DEPARTMENT_COMPONENT_IDS.has(departmentId)) {
      return res.status(400).json({ error: "department_id_required" });
    }
    if (!componentKey || !MODULE_KEY_RE.test(componentKey))
      return res.status(400).json({ error: "component_key_required" });
    if (!componentKind) return res.status(400).json({ error: "component_kind_required" });
    if (!eventType) return res.status(400).json({ error: "event_type_required" });
    if (!title) return res.status(400).json({ error: "title_required" });

    const now = nowMs();
    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO project_component_events (
        id, project_id, department_id, component_key, component_kind, event_type, title, summary,
        payload_json, related_task_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      projectId,
      departmentId,
      componentKey,
      componentKind,
      eventType,
      title,
      typeof body.summary === "string" ? body.summary : null,
      JSON.stringify(parseObject(body.payload)),
      typeof body.related_task_id === "string" ? body.related_task_id : null,
      typeof body.created_by === "string" ? body.created_by : null,
      now,
    );
    const row = db.prepare("SELECT * FROM project_component_events WHERE id = ?").get(id) as
      | ProjectComponentEventRow
      | undefined;
    return res.status(201).json({ ok: true, event: row ? rowToProjectComponentEvent(row) : null });
  });

  app.post("/api/projects/:id/modules/:bindingId/apply", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    const bindingId = String(req.params.bindingId ?? "").trim();
    const idempotencyKey = String(req.get("Idempotency-Key") ?? req.body?.idempotency_key ?? "").trim();
    if (!idempotencyKey) return res.status(400).json({ error: "idempotency_key_required" });

    const bindingRow = db
      .prepare("SELECT * FROM project_module_bindings WHERE id = ? AND project_id = ?")
      .get(bindingId, projectId) as Record<string, unknown> | undefined;
    if (!bindingRow) return res.status(404).json({ error: "module_binding_not_found" });

    const existingRun = db
      .prepare("SELECT * FROM project_module_apply_runs WHERE binding_id = ? AND idempotency_key = ?")
      .get(bindingId, idempotencyKey) as Record<string, unknown> | undefined;
    if (existingRun) return res.json({ ok: true, apply_run: rowToApplyRun(existingRun), idempotent: true });

    const binding = rowToBinding(bindingRow);
    const projectPath = binding.project_path;
    if (!projectPath || !fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      return res.status(409).json({ error: "project_path_unavailable" });
    }
    const preview = binding.preview as ModulePreview | null;
    if (!preview?.artifact_delta?.length) return res.status(409).json({ error: "preview_required" });

    const now = nowMs();
    const runId = randomUUID();
    try {
      writeArtifactDelta(projectPath, preview.artifact_delta);
      db.prepare(
        `
        INSERT INTO project_module_apply_runs (
          id, binding_id, project_id, idempotency_key, status, artifact_delta_json, message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?)
      `,
      ).run(
        runId,
        bindingId,
        projectId,
        idempotencyKey,
        JSON.stringify(preview.artifact_delta.map(({ content: _content, ...entry }) => entry)),
        "module_artifacts_applied",
        now,
        now,
      );
      db.prepare(
        "UPDATE project_module_bindings SET status = 'applied', applied_at = ?, updated_at = ? WHERE id = ?",
      ).run(now, now, bindingId);
    } catch {
      db.prepare(
        `
        INSERT INTO project_module_apply_runs (
          id, binding_id, project_id, idempotency_key, status, artifact_delta_json, message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, ?)
      `,
      ).run(runId, bindingId, projectId, idempotencyKey, "[]", "module_artifact_apply_failed", now, now);
      return res.status(500).json({ error: "module_apply_failed" });
    }

    const row = db.prepare("SELECT * FROM project_module_apply_runs WHERE id = ?").get(runId) as
      | Record<string, unknown>
      | undefined;
    return res.status(201).json({ ok: true, apply_run: row ? rowToApplyRun(row) : null, idempotent: false });
  });

  app.get("/api/projects/:id/assets/jobs", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!getProject(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const rows = db
      .prepare("SELECT * FROM asset_jobs WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as Array<Record<string, unknown>>;
    return res.json({ ok: true, jobs: rows.map(rowToAssetJob) });
  });

  app.post("/api/projects/:id/assets/jobs", (req, res) => {
    const projectId = String(req.params.id ?? "").trim();
    if (!getProject(db, projectId)) return res.status(404).json({ error: "project_not_found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const moduleKey = typeof body.module_key === "string" ? body.module_key.trim() : "";
    const manifest = findModule(moduleKey);
    if (!manifest || !IMAGE_MODULE_TYPES.has(manifest.module_type)) {
      return res.status(400).json({ error: "image_module_required" });
    }
    const now = nowMs();
    const id = randomUUID();
    const assetKey = normalizeBindingName(body.asset_key, `${moduleKey}-${id.slice(0, 8)}`);
    const promptMarkdown = makeAssetPromptPack(manifest, body);
    db.prepare(
      `
      INSERT INTO asset_jobs (
        id, project_id, module_key, module_type, asset_key, status, engine,
        request_json, prompt_markdown, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', 'imagegen_builtin', ?, ?, ?, ?)
    `,
    ).run(
      id,
      projectId,
      manifest.module_key,
      manifest.module_type,
      assetKey,
      JSON.stringify(body),
      promptMarkdown,
      now,
      now,
    );
    const row = db.prepare("SELECT * FROM asset_jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return res.status(201).json({ ok: true, job: row ? rowToAssetJob(row) : null });
  });
}
