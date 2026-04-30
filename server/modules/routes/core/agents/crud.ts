import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { MeetingReviewDecision } from "../../shared/types.ts";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../../workflow/packs/definitions.ts";
import { resolveConstrainedAgentScopeForTask } from "../tasks/execution-run-auto-assign.ts";
import { getDepartmentForPack, parseWorkflowPackKeyInput } from "../../../workflow/packs/department-scope.ts";
import {
  parseWorkflowProfilePayload,
  resolveAgentWorkflowProfile,
  serializeWorkflowProfile,
} from "../../../workflow/agents/workflow-profile.ts";
import {
  buildAgentPromptProfileBlock,
  normalizeAgentProfile,
  resolveAgentProfileFromRow,
  serializeAgentProfile,
} from "../../../workflow/agents/agent-profile.ts";
import { parseAgentRunModePayload, resolveAgentRunMode } from "../../../workflow/agents/run-mode.ts";
import { archiveAgentGuideFile, upsertAgentGuideFile } from "./agent-guide-files.ts";
import { resolveCanonicalIdentity } from "../../../company/canonical-identity.ts";
import { mapLegacyDepartmentId } from "../../../bootstrap/schema/organization-manifest.ts";

export function registerAgentCrudRoutes(ctx: RuntimeContext): void {
  const {
    app,
    db,
    broadcast,
    runInTransaction,
    nowMs,
    meetingPresenceUntil,
    meetingSeatIndexByAgent,
    meetingPhaseByAgent,
    meetingTaskIdByAgent,
    meetingReviewDecisionByAgent,
  } = ctx;
  const agentTableColumns = (() => {
    try {
      const cols = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name?: unknown }>;
      return new Set(cols.map((col) => String(col.name ?? "").trim()).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  })();
  const hasAgentWorkflowPackColumn = agentTableColumns.has("workflow_pack_key");
  const hasAgentCliAccountPoolColumn = agentTableColumns.has("cli_account_pool_id");
  const hasAgentWorkflowProfileColumn = agentTableColumns.has("workflow_profile");
  const hasAgentRunModeColumn = agentTableColumns.has("run_mode");
  const hasAgentProfileJsonColumn = agentTableColumns.has("agent_profile_json");
  const hasAgentFamilyColumn = agentTableColumns.has("family");
  const hasAgentCareerStageColumn = agentTableColumns.has("career_stage");
  const hasAgentSpecializationKeyColumn = agentTableColumns.has("specialization_key");
  const hasAgentAuthorityLevelColumn = agentTableColumns.has("authority_level");
  const hasAgentExecutionCapabilityProfileColumn = agentTableColumns.has("execution_capability_profile");
  const hasCliAccountPoolsTable = (() => {
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cli_account_pools' LIMIT 1")
        .get() as { name?: unknown } | undefined;
      return String(row?.name ?? "") === "cli_account_pools";
    } catch {
      return false;
    }
  })();
  const CLI_ACCOUNT_POOL_PROVIDERS = new Set(["codex", "gemini", "jules"]);
  const agentPackExpr = hasAgentWorkflowPackColumn ? "COALESCE(a.workflow_pack_key, 'development')" : "'development'";
  const workflowProfileExpr = hasAgentWorkflowProfileColumn ? "workflow_profile" : "NULL AS workflow_profile";
  const agentProfileExpr = hasAgentProfileJsonColumn ? "agent_profile_json" : "NULL AS agent_profile_json";

  try {
    db.prepare("UPDATE agents SET role = 'junior' WHERE role = 'intern'").run();
  } catch (err) {
    console.warn("[agents] intern->junior migration skipped:", err);
  }

  try {
    const existingAgents = db
      .prepare(
        `SELECT id, name, role, department_id, ${workflowProfileExpr}, ${agentProfileExpr}, stats_tasks_done, stats_xp FROM agents ORDER BY created_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    for (const row of existingAgents) {
      upsertAgentGuideFile({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.id ?? "agent"),
        role: row.role as string | null | undefined,
        departmentId:
          typeof row.department_id === "string" && row.department_id.trim()
            ? mapLegacyDepartmentId(row.department_id.trim())
            : null,
        workflowProfileJson: row.workflow_profile as string | null | undefined,
        agentProfileJson: row.agent_profile_json as string | null | undefined,
        statsTasksDone: Number(row.stats_tasks_done ?? 0),
        statsXp: Number(row.stats_xp ?? 0),
      });
    }
  } catch (err) {
    console.warn("[agents] initial guide sync skipped:", err);
  }

  function parseIncludeSeedParam(input: unknown): boolean {
    if (Array.isArray(input)) input = input[0];
    const raw = String(input ?? "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  }

  function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeIncomingRole(
    value: unknown,
    fallback: "team_leader" | "senior" | "junior" = "junior",
  ): "team_leader" | "senior" | "junior" | "__invalid__" {
    if (typeof value !== "string") return fallback;
    const role = value.trim();
    if (role === "team_leader" || role === "senior" || role === "junior") return role;
    if (role === "intern") return "junior";
    return "__invalid__";
  }

  function resolveCompatibilityRoleFromCanonical(params: {
    career_stage?: unknown;
    authority_level?: unknown;
  }): "team_leader" | "senior" | "junior" {
    const stage = typeof params.career_stage === "string" ? params.career_stage.trim() : "";
    if (stage === "team-lead") return "team_leader";
    if (stage === "senior" || stage === "advancement-2" || stage === "pro-senior" || stage === "advancement-3") {
      return "senior";
    }

    const authority =
      typeof params.authority_level === "number"
        ? params.authority_level
        : typeof params.authority_level === "string"
          ? Number.parseInt(params.authority_level.trim(), 10)
          : Number.NaN;

    if (Number.isFinite(authority) && authority >= 3) return "team_leader";
    if (Number.isFinite(authority) && authority >= 2) return "senior";
    return "junior";
  }

  function normalizeCliAccountPoolId(value: unknown): string | null | "__invalid__" {
    if (value === null || value === "" || typeof value === "undefined") return null;
    if (typeof value !== "string") return "__invalid__";
    const trimmed = value.trim();
    return trimmed || null;
  }

  function parseAgentProfilePayload(value: unknown, fallbackRole: unknown) {
    if (value === undefined) return { profile: null as ReturnType<typeof normalizeAgentProfile> | null, json: null };
    if (value === null || value === "") return { profile: null, json: null };
    const fallbackRoleValue = normalizeIncomingRole(fallbackRole, "junior");
    const fallback = fallbackRoleValue === "__invalid__" ? "junior" : fallbackRoleValue;
    const profile = normalizeAgentProfile(value, fallback);
    return {
      profile,
      json: serializeAgentProfile(profile),
    };
  }

  function hasCliAccountPool(provider: string, accountPoolId: string): boolean {
    if (!hasCliAccountPoolsTable) return false;
    try {
      const row = db
        .prepare("SELECT 1 AS ok FROM cli_account_pools WHERE provider = ? AND account_pool_id = ? LIMIT 1")
        .get(provider, accountPoolId) as { ok?: number } | undefined;
      return Number(row?.ok ?? 0) === 1;
    } catch {
      return false;
    }
  }

  function parseWorkflowPackKey(value: unknown): WorkflowPackKey | null {
    return parseWorkflowPackKeyInput(value);
  }

  function normalizeAgentRecord(record: unknown): unknown {
    if (!record || typeof record !== "object") return record;
    const row = record as Record<string, unknown>;
    const canonicalIdentity = resolveCanonicalIdentity({
      department_id: row.department_id,
      role: row.role,
      family: hasAgentFamilyColumn ? row.family : null,
      career_stage: hasAgentCareerStageColumn ? row.career_stage : null,
      specialization_key: hasAgentSpecializationKeyColumn ? row.specialization_key : null,
      authority_level: hasAgentAuthorityLevelColumn ? row.authority_level : null,
      execution_capability_profile: hasAgentExecutionCapabilityProfileColumn ? row.execution_capability_profile : null,
      workflow_profile: row.workflow_profile,
    });
    if (canonicalIdentity.canonical_identity_source === "derived" && row.id) {
      console.info("[agents] canonical_identity_backfilled_runtime", { agentId: String(row.id) });
    }
    return {
      ...row,
      ...canonicalIdentity,
      run_mode: resolveAgentRunMode({
        runMode: row.run_mode,
        cliProvider: row.cli_provider,
        cliModel: row.cli_model,
      }),
      workflow_profile: resolveAgentWorkflowProfile({
        workflowProfileRaw: row.workflow_profile ?? null,
        agentName: row.name,
        cliProvider: row.cli_provider,
        departmentId: row.department_id,
      }),
      agent_profile: resolveAgentProfileFromRow({
        role: row.role,
        agent_profile: row.agent_profile,
        agent_profile_json: row.agent_profile_json,
      }),
      agent_prompt_profile_block: buildAgentPromptProfileBlock({
        role: row.role,
        agent_profile: row.agent_profile,
        agent_profile_json: row.agent_profile_json,
        personality: row.personality,
        workflow_profile: row.workflow_profile,
      }),
    };
  }

  function readActiveOfficeWorkflowPackKey(): WorkflowPackKey {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack' LIMIT 1").get() as
      | { value?: unknown }
      | undefined;
    const parsed = parseWorkflowPackKey(row?.value);
    return parsed ?? DEFAULT_WORKFLOW_PACK_KEY;
  }

  function readNonDevelopmentProfileAgentIds(): Set<string> {
    return new Set<string>();
  }

  function resolvePlanningLeaderScopeAgentIds(packKey: WorkflowPackKey): string[] {
    const constrained = resolveConstrainedAgentScopeForTask(db, {
      workflow_pack_key: packKey,
      department_id: "planning",
      project_id: null,
    });
    if (Array.isArray(constrained) && constrained.length > 0) {
      return Array.from(new Set(constrained.map((id) => normalizeText(id)).filter((id) => id.length > 0)));
    }

    if (packKey !== DEFAULT_WORKFLOW_PACK_KEY) {
      const prefixed = db.prepare("SELECT id FROM agents WHERE id LIKE ?").all(`${packKey}-%`) as Array<{
        id?: unknown;
      }>;
      return prefixed.map((row) => normalizeText(row.id)).filter((id): id is string => id.length > 0);
    }

    const excludeIds = [...readNonDevelopmentProfileAgentIds()];
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => "?").join(", ");
      const rows = db
        .prepare(`SELECT id FROM agents WHERE id NOT LIKE '%-seed-%' AND id NOT IN (${placeholders})`)
        .all(...(excludeIds as SQLInputValue[])) as Array<{ id?: unknown }>;
      return rows.map((row) => normalizeText(row.id)).filter((id): id is string => id.length > 0);
    }

    const rows = db.prepare("SELECT id FROM agents WHERE id NOT LIKE '%-seed-%'").all() as Array<{ id?: unknown }>;
    return rows.map((row) => normalizeText(row.id)).filter((id): id is string => id.length > 0);
  }

  function syncPlanningLeadFlagToPackProfile(params: {
    packKey: WorkflowPackKey;
    targetAgentId: string;
    enabled: boolean;
    scopeAgentIds: string[];
  }): void {
    void params;
  }

  app.get("/api/agents", (req, res) => {
    const includeSeed = parseIncludeSeedParam(req.query?.include_seed);
    const seedFilterClause = includeSeed ? "" : "WHERE a.id NOT LIKE '%-seed-%'";
    let agents: unknown[];
    try {
      agents = db
        .prepare(
          `
      SELECT
        a.*,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.name_ko, d.name_ko) AS department_name_ko,
        COALESCE(opd.color, d.color) AS department_color
      FROM agents a
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = ${agentPackExpr}
       AND opd.department_id = a.department_id
      LEFT JOIN departments d ON a.department_id = d.id
      ${seedFilterClause}
      ORDER BY a.department_id, a.role, a.name
    `,
        )
        .all();
    } catch {
      agents = db
        .prepare(
          `
      SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
      FROM agents a
      LEFT JOIN departments d ON a.department_id = d.id
      ${seedFilterClause}
      ORDER BY a.department_id, a.role, a.name
    `,
        )
        .all();
    }
    const normalizedAgents = Array.isArray(agents) ? agents.map((entry) => normalizeAgentRecord(entry)) : agents;
    res.json({ agents: normalizedAgents });
  });

  app.get("/api/meeting-presence", (_req, res) => {
    const now = nowMs();
    const presence: Array<{
      agent_id: string;
      seat_index: number;
      phase: "kickoff" | "review";
      task_id: string | null;
      decision: MeetingReviewDecision | null;
      until: number;
    }> = [];

    for (const [agentId, until] of meetingPresenceUntil.entries()) {
      if (until < now) {
        meetingPresenceUntil.delete(agentId);
        meetingSeatIndexByAgent.delete(agentId);
        meetingPhaseByAgent.delete(agentId);
        meetingTaskIdByAgent.delete(agentId);
        meetingReviewDecisionByAgent.delete(agentId);
        continue;
      }
      const phase = meetingPhaseByAgent.get(agentId) ?? "kickoff";
      presence.push({
        agent_id: agentId,
        seat_index: meetingSeatIndexByAgent.get(agentId) ?? 0,
        phase,
        task_id: meetingTaskIdByAgent.get(agentId) ?? null,
        decision: phase === "review" ? (meetingReviewDecisionByAgent.get(agentId) ?? "reviewing") : null,
        until,
      });
    }

    presence.sort((a, b) => a.seat_index - b.seat_index);
    res.json({ presence });
  });

  app.get("/api/agents/:id", (req, res) => {
    const id = String(req.params.id);
    let agent: unknown;
    try {
      agent = db
        .prepare(
          `
      SELECT
        a.*,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.name_ko, d.name_ko) AS department_name_ko,
        COALESCE(opd.color, d.color) AS department_color
      FROM agents a
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = ${agentPackExpr}
       AND opd.department_id = a.department_id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(id);
    } catch {
      agent = db
        .prepare(
          `
      SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
      FROM agents a
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(id);
    }
    if (!agent) return res.status(404).json({ error: "not_found" });

    const recentTasks = db
      .prepare("SELECT * FROM tasks WHERE assigned_agent_id = ? ORDER BY updated_at DESC LIMIT 10")
      .all(id);

    res.json({ agent: normalizeAgentRecord(agent), recent_tasks: recentTasks });
  });

  app.post("/api/agents", (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const warnings: string[] = [];
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const name_ko = typeof body.name_ko === "string" ? body.name_ko.trim() : "";
      const name_ja = typeof body.name_ja === "string" ? body.name_ja.trim() : "";
      const name_zh = typeof body.name_zh === "string" ? body.name_zh.trim() : "";
      if (!name) return res.status(400).json({ error: "name_required" });
      const activePackKey = readActiveOfficeWorkflowPackKey();
      const workflowPackKey = activePackKey;
      if ("role" in body) {
        warnings.push("role_ignored_compatibility_only");
        delete body.role;
      }
      if ("workflow_role" in body) {
        warnings.push("workflow_role_ignored_compatibility_only");
        delete body.workflow_role;
      }
      if ("workflow_pack_key" in body) {
        warnings.push("workflow_pack_key_ignored_projection_only");
        delete body.workflow_pack_key;
      }
      if ("acts_as_planning_leader" in body) {
        warnings.push("acts_as_planning_leader_ignored_canonical_authority_only");
        delete body.acts_as_planning_leader;
      }
      if ("force_planning_leader_override" in body) {
        warnings.push("force_planning_leader_override_ignored");
        delete body.force_planning_leader_override;
      }

      if (body.department_id !== undefined && body.department_id !== null && typeof body.department_id !== "string") {
        return res.status(400).json({ error: "invalid_department_id" });
      }
      const department_id =
        typeof body.department_id === "string"
          ? body.department_id.trim()
            ? mapLegacyDepartmentId(body.department_id.trim())
            : null
          : null;
      if (department_id) {
        const deptExists = getDepartmentForPack(db as any, workflowPackKey, department_id);
        if (!deptExists) return res.status(400).json({ error: "department_not_found" });
      }

      const cli_provider =
        typeof body.cli_provider === "string" &&
        ["claude", "codex", "gemini", "jules", "opencode", "kimi", "copilot", "antigravity", "api"].includes(
          body.cli_provider,
        )
          ? body.cli_provider
          : "claude";
      const supportsCliModelOverride = ["claude", "codex", "gemini", "opencode", "kimi"].includes(cli_provider);
      const supportsCliReasoningOverride = cli_provider === "codex";
      let cli_model: string | null = null;
      if ("cli_model" in body) {
        if (body.cli_model === "" || typeof body.cli_model === "undefined") {
          cli_model = null;
        } else if (body.cli_model !== null && typeof body.cli_model !== "string") {
          return res.status(400).json({ error: "invalid_cli_model" });
        } else if (body.cli_model && !supportsCliModelOverride) {
          return res.status(400).json({ error: "cli_model_requires_cli_provider" });
        } else {
          cli_model = body.cli_model as string | null;
        }
      }
      let cli_reasoning_level: string | null = null;
      if ("cli_reasoning_level" in body) {
        if (body.cli_reasoning_level === "" || typeof body.cli_reasoning_level === "undefined") {
          cli_reasoning_level = null;
        } else if (body.cli_reasoning_level !== null && typeof body.cli_reasoning_level !== "string") {
          return res.status(400).json({ error: "invalid_cli_reasoning_level" });
        } else if (body.cli_reasoning_level && !supportsCliReasoningOverride) {
          return res.status(400).json({ error: "cli_reasoning_requires_codex_provider" });
        } else {
          cli_reasoning_level = body.cli_reasoning_level as string | null;
        }
      }
      const parsedRunMode = parseAgentRunModePayload(body.run_mode);
      if (parsedRunMode === "__invalid__") {
        return res.status(400).json({ error: "invalid_run_mode" });
      }
      if (!hasAgentRunModeColumn && "run_mode" in body) {
        return res.status(400).json({ error: "run_mode_not_supported" });
      }
      const runMode = resolveAgentRunMode({
        runMode: parsedRunMode ?? "standard",
        cliProvider: cli_provider,
        cliModel: cli_model,
      });
      if (parsedRunMode === "plan" && runMode !== "plan") {
        return res.status(400).json({ error: "run_mode_requires_codex_model" });
      }
      let cli_account_pool_id: string | null = null;
      if (hasAgentCliAccountPoolColumn) {
        const normalizedPool = normalizeCliAccountPoolId(body.cli_account_pool_id);
        if (normalizedPool === "__invalid__") {
          return res.status(400).json({ error: "invalid_cli_account_pool_id" });
        }
        cli_account_pool_id = CLI_ACCOUNT_POOL_PROVIDERS.has(cli_provider) ? normalizedPool : null;
        if (cli_account_pool_id && !hasCliAccountPool(cli_provider, cli_account_pool_id)) {
          return res.status(400).json({ error: "cli_account_pool_not_found" });
        }
      } else if ("cli_account_pool_id" in body) {
        return res.status(400).json({ error: "cli_account_pool_not_supported" });
      }
      const avatar_emoji =
        typeof body.avatar_emoji === "string" && body.avatar_emoji.trim() ? body.avatar_emoji.trim() : "🤖";
      const sprite_number =
        typeof body.sprite_number === "number" && body.sprite_number > 0 ? body.sprite_number : null;
      const personality = typeof body.personality === "string" ? body.personality.trim() || null : null;
      const parsedWorkflowProfile = parseWorkflowProfilePayload(body.workflow_profile);
      if (parsedWorkflowProfile === "__invalid__") {
        return res.status(400).json({ error: "invalid_workflow_profile" });
      }
      if (!hasAgentWorkflowProfileColumn && "workflow_profile" in body) {
        return res.status(400).json({ error: "workflow_profile_not_supported" });
      }
      const workflowProfileJson =
        parsedWorkflowProfile && hasAgentWorkflowProfileColumn ? serializeWorkflowProfile(parsedWorkflowProfile) : null;
      if (!hasAgentProfileJsonColumn && "agent_profile" in body) {
        return res.status(400).json({ error: "agent_profile_not_supported" });
      }
      const parsedAgentProfile = parseAgentProfilePayload(body.agent_profile, "junior");
      const profileOverride =
        typeof parsedAgentProfile.profile?.custom_prompt_override === "string"
          ? parsedAgentProfile.profile.custom_prompt_override.trim() || null
          : null;
      const effectivePersonality = "agent_profile" in body ? profileOverride : personality;
      const agentProfileJson = hasAgentProfileJsonColumn ? parsedAgentProfile.json : null;
      if ("family" in body && body.family !== null && typeof body.family !== "string") {
        return res.status(400).json({ error: "invalid_family" });
      }
      if ("career_stage" in body && body.career_stage !== null && typeof body.career_stage !== "string") {
        return res.status(400).json({ error: "invalid_career_stage" });
      }
      if (
        "specialization_key" in body &&
        body.specialization_key !== null &&
        typeof body.specialization_key !== "string"
      ) {
        return res.status(400).json({ error: "invalid_specialization_key" });
      }
      if (
        "execution_capability_profile" in body &&
        body.execution_capability_profile !== null &&
        typeof body.execution_capability_profile !== "string"
      ) {
        return res.status(400).json({ error: "invalid_execution_capability_profile" });
      }
      const authorityLevelInput =
        typeof body.authority_level === "number" ||
        typeof body.authority_level === "string" ||
        body.authority_level === null
          ? body.authority_level
          : undefined;
      if ("authority_level" in body && authorityLevelInput === undefined) {
        return res.status(400).json({ error: "invalid_authority_level" });
      }
      const canonicalIdentity = resolveCanonicalIdentity({
        department_id,
        role: "junior",
        family: body.family,
        career_stage: body.career_stage,
        specialization_key: body.specialization_key,
        authority_level: authorityLevelInput,
        execution_capability_profile: body.execution_capability_profile,
        workflow_profile: parsedWorkflowProfile ?? body.workflow_profile,
      });
      const role = resolveCompatibilityRoleFromCanonical({
        career_stage: canonicalIdentity.career_stage,
        authority_level: canonicalIdentity.authority_level,
      });

      const id = randomUUID();
      try {
        const insertFields = ["id", "name", "name_ko", "name_ja", "name_zh", "department_id"];
        const insertValues: unknown[] = [id, name, name_ko, name_ja, name_zh, department_id];
        if (hasAgentWorkflowPackColumn) {
          insertFields.push("workflow_pack_key");
          insertValues.push(workflowPackKey);
        }
        insertFields.push("role", "cli_provider");
        insertValues.push(role, cli_provider);
        if (hasAgentCliAccountPoolColumn) {
          insertFields.push("cli_account_pool_id");
          insertValues.push(cli_account_pool_id);
        }
        if (hasAgentFamilyColumn) {
          insertFields.push("family");
          insertValues.push(canonicalIdentity.family);
        }
        if (hasAgentCareerStageColumn) {
          insertFields.push("career_stage");
          insertValues.push(canonicalIdentity.career_stage);
        }
        if (hasAgentSpecializationKeyColumn) {
          insertFields.push("specialization_key");
          insertValues.push(canonicalIdentity.specialization_key);
        }
        if (hasAgentAuthorityLevelColumn) {
          insertFields.push("authority_level");
          insertValues.push(canonicalIdentity.authority_level);
        }
        if (hasAgentExecutionCapabilityProfileColumn) {
          insertFields.push("execution_capability_profile");
          insertValues.push(canonicalIdentity.execution_capability_profile);
        }
        insertFields.push("avatar_emoji", "sprite_number", "personality");
        insertValues.push(avatar_emoji, sprite_number, effectivePersonality);
        db.prepare(
          `INSERT INTO agents (${insertFields.join(", ")}) VALUES (${insertFields.map(() => "?").join(", ")})`,
        ).run(...(insertValues as SQLInputValue[]));
        if (hasAgentWorkflowProfileColumn && workflowProfileJson) {
          db.prepare("UPDATE agents SET workflow_profile = ? WHERE id = ?").run(workflowProfileJson, id);
        }
        if (hasAgentProfileJsonColumn && agentProfileJson !== null) {
          db.prepare("UPDATE agents SET agent_profile_json = ? WHERE id = ?").run(agentProfileJson, id);
        }
        db.prepare("UPDATE agents SET cli_model = ?, cli_reasoning_level = ? WHERE id = ?").run(
          cli_model,
          cli_reasoning_level,
          id,
        );
        if (hasAgentRunModeColumn) {
          db.prepare("UPDATE agents SET run_mode = ? WHERE id = ?").run(runMode, id);
        }
        console.info("[agents] canonical_identity_persisted", {
          agentId: id,
          source: canonicalIdentity.canonical_identity_source,
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.includes("FOREIGN KEY constraint failed")) {
          return res.status(400).json({ error: "department_not_found" });
        }
        throw err;
      }

      let created: unknown;
      try {
        created = db
          .prepare(
            `
        SELECT
          a.*,
          COALESCE(opd.name, d.name) AS department_name,
          COALESCE(opd.name_ko, d.name_ko) AS department_name_ko,
          COALESCE(opd.color, d.color) AS department_color
        FROM agents a
        LEFT JOIN office_pack_departments opd
          ON opd.workflow_pack_key = ${agentPackExpr}
         AND opd.department_id = a.department_id
        LEFT JOIN departments d ON a.department_id = d.id
        WHERE a.id = ?
      `,
          )
          .get(id);
      } catch {
        created = db
          .prepare(
            `
        SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
        FROM agents a LEFT JOIN departments d ON a.department_id = d.id
        WHERE a.id = ?
      `,
          )
          .get(id);
      }
      const createdRow = created as Record<string, unknown> | undefined;
      if (createdRow) {
        upsertAgentGuideFile({
          id: String(createdRow.id ?? id),
          name: String(createdRow.name ?? name),
          role: (createdRow.role as string | null | undefined) ?? role,
          departmentId: (createdRow.department_id as string | null | undefined) ?? department_id,
          workflowProfileJson:
            (createdRow.workflow_profile as string | null | undefined) ?? workflowProfileJson ?? null,
          agentProfileJson: (createdRow.agent_profile_json as string | null | undefined) ?? agentProfileJson ?? null,
          statsTasksDone: Number(createdRow.stats_tasks_done ?? 0),
          statsXp: Number(createdRow.stats_xp ?? 0),
        });
      }
      const normalizedCreated = normalizeAgentRecord(created);
      broadcast("agent_created", normalizedCreated);
      res.status(201).json({ ok: true, agent: normalizedCreated, warnings });
    } catch (err) {
      console.error("[agents] POST failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.delete("/api/agents/:id", (req, res) => {
    try {
      const id = String(req.params.id);
      const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!existing) return res.status(404).json({ error: "not_found" });
      if (existing.status === "working") return res.status(400).json({ error: "cannot_delete_working_agent" });

      archiveAgentGuideFile(id);

      runInTransaction(() => {
        db.prepare("UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?").run(id);
        db.prepare("UPDATE subtasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?").run(id);
        db.prepare("UPDATE meeting_minute_entries SET speaker_agent_id = NULL WHERE speaker_agent_id = ?").run(id);
        db.prepare("UPDATE task_report_archives SET generated_by_agent_id = NULL WHERE generated_by_agent_id = ?").run(
          id,
        );
        db.prepare("UPDATE project_review_decision_states SET planner_agent_id = NULL WHERE planner_agent_id = ?").run(
          id,
        );
        db.prepare("UPDATE review_round_decision_states SET planner_agent_id = NULL WHERE planner_agent_id = ?").run(
          id,
        );
        db.prepare("DELETE FROM agents WHERE id = ?").run(id);
      });

      broadcast("agent_deleted", { id });
      res.json({ ok: true, id });
    } catch (err) {
      console.error("[agents] DELETE failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.patch("/api/agents/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const body = { ...((req.body ?? {}) as Record<string, unknown>) };
    const warnings: string[] = [];
    const nextProviderRaw = ("cli_provider" in body ? body.cli_provider : existing.cli_provider) as
      | string
      | null
      | undefined;
    const nextProvider = nextProviderRaw ?? "claude";
    const nextOAuthProvider =
      nextProvider === "copilot" ? "github" : nextProvider === "antigravity" ? "google_antigravity" : null;
    const supportsCliModelOverride = ["claude", "codex", "gemini", "opencode", "kimi"].includes(nextProvider);
    const supportsCliReasoningOverride = nextProvider === "codex";
    const providerChanged = "cli_provider" in body && nextProvider !== String(existing.cli_provider ?? "claude");
    const nextProviderSupportsPool = CLI_ACCOUNT_POOL_PROVIDERS.has(nextProvider);

    if (!nextOAuthProvider && !("oauth_account_id" in body) && "cli_provider" in body) {
      body.oauth_account_id = null;
    }
    if (nextProvider !== "api" && !("api_provider_id" in body) && "cli_provider" in body) {
      body.api_provider_id = null;
      body.api_model = null;
    }
    if ((!supportsCliModelOverride || providerChanged) && !("cli_model" in body)) {
      body.cli_model = null;
    }
    if ((!supportsCliReasoningOverride || providerChanged) && !("cli_reasoning_level" in body)) {
      body.cli_reasoning_level = null;
    }
    if ("cli_model" in body && !("cli_reasoning_level" in body) && supportsCliReasoningOverride) {
      body.cli_reasoning_level = null;
    }
    if (hasAgentCliAccountPoolColumn) {
      if (!("cli_account_pool_id" in body) && "cli_provider" in body) {
        if (!nextProviderSupportsPool) {
          body.cli_account_pool_id = null;
        } else {
          const existingPool = normalizeCliAccountPoolId(existing.cli_account_pool_id);
          if (existingPool === "__invalid__" || !existingPool) {
            body.cli_account_pool_id = null;
          } else if (!hasCliAccountPool(nextProvider, existingPool)) {
            body.cli_account_pool_id = null;
          }
        }
      }
    } else if ("cli_account_pool_id" in body) {
      return res.status(400).json({ error: "cli_account_pool_not_supported" });
    }

    if ("oauth_account_id" in body) {
      if (body.oauth_account_id === "" || typeof body.oauth_account_id === "undefined") {
        body.oauth_account_id = null;
      }
      if (body.oauth_account_id !== null && typeof body.oauth_account_id !== "string") {
        return res.status(400).json({ error: "invalid_oauth_account_id" });
      }
      if (body.oauth_account_id && !nextOAuthProvider) {
        return res.status(400).json({ error: "oauth_account_requires_oauth_provider" });
      }
      if (body.oauth_account_id && nextOAuthProvider) {
        const oauthAccount = db
          .prepare("SELECT id, status FROM oauth_accounts WHERE id = ? AND provider = ?")
          .get(body.oauth_account_id, nextOAuthProvider) as { id: string; status: "active" | "disabled" } | undefined;
        if (!oauthAccount) {
          return res.status(400).json({ error: "oauth_account_not_found_for_provider" });
        }
        if (oauthAccount.status !== "active") {
          return res.status(400).json({ error: "oauth_account_disabled" });
        }
      }
    }

    if ("cli_model" in body) {
      if (body.cli_model === "" || typeof body.cli_model === "undefined") {
        body.cli_model = null;
      }
      if (body.cli_model !== null && typeof body.cli_model !== "string") {
        return res.status(400).json({ error: "invalid_cli_model" });
      }
      if (body.cli_model && !supportsCliModelOverride) {
        return res.status(400).json({ error: "cli_model_requires_cli_provider" });
      }
    }

    if ("cli_reasoning_level" in body) {
      if (body.cli_reasoning_level === "" || typeof body.cli_reasoning_level === "undefined") {
        body.cli_reasoning_level = null;
      }
      if (body.cli_reasoning_level !== null && typeof body.cli_reasoning_level !== "string") {
        return res.status(400).json({ error: "invalid_cli_reasoning_level" });
      }
      if (body.cli_reasoning_level && !supportsCliReasoningOverride) {
        return res.status(400).json({ error: "cli_reasoning_requires_codex_provider" });
      }
    }

    const parsedRunMode = parseAgentRunModePayload(body.run_mode);
    if (parsedRunMode === "__invalid__") {
      return res.status(400).json({ error: "invalid_run_mode" });
    }
    if ("run_mode" in body && !hasAgentRunModeColumn) {
      return res.status(400).json({ error: "run_mode_not_supported" });
    }
    const nextCliModel =
      "cli_model" in body
        ? (body.cli_model as string | null)
        : ((existing.cli_model as string | null | undefined) ?? null);
    const resolvedRunMode = resolveAgentRunMode({
      runMode: parsedRunMode ?? existing.run_mode ?? "standard",
      cliProvider: nextProvider,
      cliModel: nextCliModel,
    });
    if (parsedRunMode === "plan" && resolvedRunMode !== "plan") {
      return res.status(400).json({ error: "run_mode_requires_codex_model" });
    }
    if (
      hasAgentRunModeColumn &&
      (providerChanged ||
        "cli_model" in body ||
        "run_mode" in body ||
        resolvedRunMode !==
          resolveAgentRunMode({
            runMode: existing.run_mode,
            cliProvider: existing.cli_provider,
            cliModel: existing.cli_model,
          }))
    ) {
      body.run_mode = resolvedRunMode;
    }

    if (hasAgentCliAccountPoolColumn && "cli_account_pool_id" in body) {
      const normalizedPool = normalizeCliAccountPoolId(body.cli_account_pool_id);
      if (normalizedPool === "__invalid__") {
        return res.status(400).json({ error: "invalid_cli_account_pool_id" });
      }
      const nextPoolId = nextProviderSupportsPool ? normalizedPool : null;
      if (nextPoolId && !hasCliAccountPool(nextProvider, nextPoolId)) {
        return res.status(400).json({ error: "cli_account_pool_not_found" });
      }
      body.cli_account_pool_id = nextPoolId;
    }

    if ("acts_as_planning_leader" in body) {
      warnings.push("acts_as_planning_leader_ignored_canonical_authority_only");
      delete body.acts_as_planning_leader;
    }
    if ("workflow_role" in body) {
      warnings.push("workflow_role_ignored_compatibility_only");
      delete body.workflow_role;
    }

    if ("workflow_pack_key" in body) {
      warnings.push("workflow_pack_key_ignored_projection_only");
      delete body.workflow_pack_key;
    }
    if ("force_planning_leader_override" in body) {
      warnings.push("force_planning_leader_override_ignored");
      delete body.force_planning_leader_override;
    }
    const existingPackKey = hasAgentWorkflowPackColumn ? parseWorkflowPackKey(existing.workflow_pack_key) : null;
    const officePackKey = existingPackKey ?? readActiveOfficeWorkflowPackKey();

    if ("department_id" in body) {
      if (body.department_id === "" || body.department_id === undefined) {
        body.department_id = null;
      } else if (body.department_id !== null && typeof body.department_id !== "string") {
        return res.status(400).json({ error: "invalid_department_id" });
      } else if (typeof body.department_id === "string") {
        const trimmedDepartmentId = body.department_id.trim();
        if (!trimmedDepartmentId) {
          body.department_id = null;
        } else {
          const normalizedDepartmentId = mapLegacyDepartmentId(trimmedDepartmentId);
          const deptExists = getDepartmentForPack(db as any, officePackKey, normalizedDepartmentId);
          if (!deptExists) return res.status(400).json({ error: "department_not_found" });
          body.department_id = normalizedDepartmentId;
        }
      }
    }

    if ("role" in body) {
      warnings.push("role_ignored_compatibility_only");
      delete body.role;
    }

    if ("family" in body && body.family !== null && typeof body.family !== "string") {
      return res.status(400).json({ error: "invalid_family" });
    }
    if ("career_stage" in body && body.career_stage !== null && typeof body.career_stage !== "string") {
      return res.status(400).json({ error: "invalid_career_stage" });
    }
    if ("specialization_key" in body) {
      if (body.specialization_key === "" || body.specialization_key === undefined) {
        body.specialization_key = null;
      } else if (body.specialization_key !== null && typeof body.specialization_key !== "string") {
        return res.status(400).json({ error: "invalid_specialization_key" });
      } else if (typeof body.specialization_key === "string") {
        body.specialization_key = body.specialization_key.trim() || null;
      }
    }
    if ("execution_capability_profile" in body) {
      if (body.execution_capability_profile === "" || body.execution_capability_profile === undefined) {
        body.execution_capability_profile = null;
      } else if (body.execution_capability_profile !== null && typeof body.execution_capability_profile !== "string") {
        return res.status(400).json({ error: "invalid_execution_capability_profile" });
      } else if (typeof body.execution_capability_profile === "string") {
        body.execution_capability_profile = body.execution_capability_profile.trim() || null;
      }
    }
    if ("authority_level" in body) {
      if (body.authority_level === "" || body.authority_level === undefined || body.authority_level === null) {
        body.authority_level = null;
      } else if (typeof body.authority_level === "number" && Number.isFinite(body.authority_level)) {
        body.authority_level = Math.max(0, Math.trunc(body.authority_level));
      } else if (typeof body.authority_level === "string" && body.authority_level.trim()) {
        const parsedAuthorityLevel = Number.parseInt(body.authority_level.trim(), 10);
        if (!Number.isFinite(parsedAuthorityLevel)) {
          return res.status(400).json({ error: "invalid_authority_level" });
        }
        body.authority_level = Math.max(0, parsedAuthorityLevel);
      } else {
        return res.status(400).json({ error: "invalid_authority_level" });
      }
    }

    let parsedWorkflowProfileForCanonical: ReturnType<typeof parseWorkflowProfilePayload> | null = null;
    if ("workflow_profile" in body) {
      if (!hasAgentWorkflowProfileColumn) {
        return res.status(400).json({ error: "workflow_profile_not_supported" });
      }
      parsedWorkflowProfileForCanonical = parseWorkflowProfilePayload(body.workflow_profile);
      if (parsedWorkflowProfileForCanonical === "__invalid__") {
        return res.status(400).json({ error: "invalid_workflow_profile" });
      }
      body.workflow_profile = serializeWorkflowProfile(parsedWorkflowProfileForCanonical);
    }

    if ("agent_profile" in body) {
      if (!hasAgentProfileJsonColumn) {
        return res.status(400).json({ error: "agent_profile_not_supported" });
      }
      const parsedAgentProfile = parseAgentProfilePayload(body.agent_profile, body.role ?? existing.role);
      body.agent_profile_json = parsedAgentProfile.json;
      body.personality = parsedAgentProfile.profile?.custom_prompt_override ?? null;
      delete body.agent_profile;
    }

    const canonicalIdentity = resolveCanonicalIdentity({
      department_id: "department_id" in body ? body.department_id : existing.department_id,
      role: "role" in body ? body.role : existing.role,
      family: "family" in body ? body.family : hasAgentFamilyColumn ? existing.family : null,
      career_stage:
        "career_stage" in body ? body.career_stage : hasAgentCareerStageColumn ? existing.career_stage : null,
      specialization_key:
        "specialization_key" in body
          ? body.specialization_key
          : hasAgentSpecializationKeyColumn
            ? existing.specialization_key
            : null,
      authority_level:
        "authority_level" in body
          ? body.authority_level
          : hasAgentAuthorityLevelColumn
            ? existing.authority_level
            : null,
      execution_capability_profile:
        "execution_capability_profile" in body
          ? body.execution_capability_profile
          : hasAgentExecutionCapabilityProfileColumn
            ? existing.execution_capability_profile
            : null,
      workflow_profile:
        "workflow_profile" in body
          ? (parsedWorkflowProfileForCanonical ?? body.workflow_profile)
          : existing.workflow_profile,
    });
    if (hasAgentFamilyColumn) body.family = canonicalIdentity.family;
    if (hasAgentCareerStageColumn) body.career_stage = canonicalIdentity.career_stage;
    if (hasAgentSpecializationKeyColumn) body.specialization_key = canonicalIdentity.specialization_key;
    if (hasAgentAuthorityLevelColumn) body.authority_level = canonicalIdentity.authority_level;
    if (hasAgentExecutionCapabilityProfileColumn) {
      body.execution_capability_profile = canonicalIdentity.execution_capability_profile;
    }
    body.role = resolveCompatibilityRoleFromCanonical({
      career_stage: canonicalIdentity.career_stage,
      authority_level: canonicalIdentity.authority_level,
    });

    const allowedFields = [
      "name",
      "name_ko",
      "name_ja",
      "name_zh",
      "department_id",
      "role",
      "cli_provider",
      "oauth_account_id",
      "api_provider_id",
      "api_model",
      "cli_model",
      "cli_reasoning_level",
      ...(hasAgentRunModeColumn ? (["run_mode"] as const) : []),
      ...(hasAgentCliAccountPoolColumn ? (["cli_account_pool_id"] as const) : []),
      ...(hasAgentWorkflowProfileColumn ? (["workflow_profile"] as const) : []),
      ...(hasAgentProfileJsonColumn ? (["agent_profile_json"] as const) : []),
      ...(hasAgentFamilyColumn ? (["family"] as const) : []),
      ...(hasAgentCareerStageColumn ? (["career_stage"] as const) : []),
      ...(hasAgentSpecializationKeyColumn ? (["specialization_key"] as const) : []),
      ...(hasAgentAuthorityLevelColumn ? (["authority_level"] as const) : []),
      ...(hasAgentExecutionCapabilityProfileColumn ? (["execution_capability_profile"] as const) : []),
      "avatar_emoji",
      "sprite_number",
      "personality",
      "status",
      "current_task_id",
    ];

    const updates: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "no_fields_to_update" });
    }

    try {
      runInTransaction(() => {
        params.push(id);
        db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
        console.info("[agents] canonical_identity_persisted", {
          agentId: id,
          source: canonicalIdentity.canonical_identity_source,
        });
      });
    } catch (err: any) {
      console.error("[agents] canonical update failed:", err);
      return res.status(500).json({ error: "internal_error" });
    }

    const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    const updatedRow = updated as Record<string, unknown> | undefined;
    if (updatedRow) {
      upsertAgentGuideFile({
        id: String(updatedRow.id ?? id),
        name: String(updatedRow.name ?? ""),
        role: updatedRow.role as string | null | undefined,
        departmentId: updatedRow.department_id as string | null | undefined,
        workflowProfileJson: updatedRow.workflow_profile as string | null | undefined,
        agentProfileJson: updatedRow.agent_profile_json as string | null | undefined,
        statsTasksDone: Number(updatedRow.stats_tasks_done ?? 0),
        statsXp: Number(updatedRow.stats_xp ?? 0),
      });
    }
    const normalizedUpdated = normalizeAgentRecord(updated);
    broadcast("agent_status", normalizedUpdated);
    res.json({ ok: true, agent: normalizedUpdated, warnings });
  });
}
