import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  DEFAULT_ROOM_THEMES,
  getDefaultSkillBundleForDepartment,
  getOrganizationAgentSeedById,
  LEGACY_BUILTIN_AGENT_SIGNATURES,
  LEGACY_DEPARTMENT_ID_MAP,
  mapLegacyDepartmentId,
  ORGANIZATION_AGENT_SEEDS,
  ORGANIZATION_DEPARTMENTS,
  ORGANIZATION_SEED_VERSION,
  type OrganizationAgentSeed,
} from "./organization-manifest.ts";
import { upsertAgentGuideFile } from "../../routes/core/agents/agent-guide-files.ts";

type DbLike = Pick<DatabaseSync, "prepare" | "exec">;

type LegacyBuiltinMatch = {
  source_agent_id: string;
  seed_agent_id: string;
  name: string;
};

export interface CanonicalResetPreview {
  ok: true;
  seed_version: string;
  department_migrations: Array<{ from: string; to: string }>;
  legacy_builtin_agents_matched: LegacyBuiltinMatch[];
  new_departments_to_create: string[];
  new_agents_to_create: string[];
  warnings: string[];
}

export interface CanonicalResetApplyResult extends CanonicalResetPreview {
  applied: true;
  migrated_departments: number;
  migrated_agents: number;
  inserted_agents: number;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function collectLegacyBuiltinMatches(db: DbLike): LegacyBuiltinMatch[] {
  const rows = db.prepare("SELECT * FROM agents").all() as Array<Record<string, unknown>>;
  const out: LegacyBuiltinMatch[] = [];
  const usedSourceIds = new Set<string>();
  const usedSeedIds = new Set<string>();
  for (const signature of LEGACY_BUILTIN_AGENT_SIGNATURES) {
    const mappedDepartmentId = LEGACY_DEPARTMENT_ID_MAP[signature.department_id] ?? signature.department_id;
    const match = rows.find((row) => {
      const id = normalizeText(row.id);
      if (!id || usedSourceIds.has(id) || usedSeedIds.has(signature.seed_agent_id)) return false;
      const rowDepartmentId = normalizeText(row.department_id);
      return (
        normalizeText(row.name) === signature.name &&
        (rowDepartmentId === signature.department_id || rowDepartmentId === mappedDepartmentId) &&
        normalizeText(row.role) === signature.role &&
        normalizeText(row.cli_provider) === signature.cli_provider &&
        normalizeText(row.personality) === signature.personality
      );
    });
    if (!match) continue;
    const sourceAgentId = normalizeText(match.id);
    usedSourceIds.add(sourceAgentId);
    usedSeedIds.add(signature.seed_agent_id);
    out.push({
      source_agent_id: sourceAgentId,
      seed_agent_id: signature.seed_agent_id,
      name: signature.name,
    });
  }
  return out;
}

function syncDefaultSkillHistory(db: DbLike, seed: OrganizationAgentSeed): void {
  const canonicalDepartmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;
  const skills = getDefaultSkillBundleForDepartment(canonicalDepartmentId);
  const now = Date.now();
  for (const skillId of skills) {
    const jobId = `seed-skill:${seed.id}:${skillId}`;
    const id =
      (
        db
          .prepare("SELECT id FROM skill_learning_history WHERE job_id = ? AND provider = ? LIMIT 1")
          .get(jobId, seed.cli_provider) as { id?: string } | undefined
      )?.id ?? randomUUID();
    db.prepare(
      `
      INSERT INTO skill_learning_history (
        id, job_id, provider, repo, skill_id, skill_label, status, command, run_started_at, run_completed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, provider) DO UPDATE SET
        repo = excluded.repo,
        skill_label = excluded.skill_label,
        status = 'succeeded',
        command = excluded.command,
        run_started_at = excluded.run_started_at,
        run_completed_at = excluded.run_completed_at,
        updated_at = excluded.updated_at
    `,
    ).run(
      id,
      jobId,
      seed.cli_provider,
      `builtin://${ORGANIZATION_SEED_VERSION}/${canonicalDepartmentId}`,
      skillId,
      skillId.replace(/[-_.]+/g, " "),
      `canonical-seed-sync ${ORGANIZATION_SEED_VERSION}`,
      now,
      now,
      now,
      now,
    );
  }
}

function syncSeedAgentArtifacts(seed: OrganizationAgentSeed, statsTasksDone = 0, statsXp = 0): void {
  const canonicalDepartmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;
  upsertAgentGuideFile({
    id: seed.id,
    name: seed.name,
    role: seed.role,
    departmentId: canonicalDepartmentId,
    workflowProfileJson: JSON.stringify(seed.workflow_profile),
    statsTasksDone,
    statsXp,
    skillBundle: getDefaultSkillBundleForDepartment(canonicalDepartmentId),
  });
}

function upsertDepartmentSeed(db: DbLike): void {
  const insertDepartment = db.prepare(
    `
    INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      name_zh = excluded.name_zh,
      icon = excluded.icon,
      color = excluded.color,
      sort_order = excluded.sort_order
  `,
  );
  for (const department of ORGANIZATION_DEPARTMENTS) {
    insertDepartment.run(
      department.id,
      department.name,
      department.name_ko,
      department.name_ja,
      department.name_zh,
      department.icon,
      department.color,
      department.sort_order,
    );
  }
}

function reserveCanonicalDepartmentSortOrders(db: DbLike): void {
  const rows = db.prepare("SELECT id, sort_order FROM departments ORDER BY sort_order, id").all() as Array<{
    id?: unknown;
    sort_order?: unknown;
  }>;
  const maxSortOrderRow = db.prepare("SELECT MAX(sort_order) AS max_sort_order FROM departments").get() as
    | { max_sort_order?: number | null }
    | undefined;
  let offset = Number(maxSortOrderRow?.max_sort_order ?? 0) + 10_000;
  for (const row of rows) {
    const departmentId = normalizeText(row.id);
    if (!departmentId) continue;
    db.prepare("UPDATE departments SET sort_order = ? WHERE id = ?").run(offset, departmentId);
    offset += 1;
  }
}

function updateDepartmentForeignKeys(db: DbLike, fromDepartmentId: string, toDepartmentId: string): void {
  if (!fromDepartmentId || !toDepartmentId || fromDepartmentId === toDepartmentId) return;
  db.prepare("UPDATE agents SET department_id = ? WHERE department_id = ?").run(toDepartmentId, fromDepartmentId);
  db.prepare("UPDATE tasks SET department_id = ? WHERE department_id = ?").run(toDepartmentId, fromDepartmentId);
  db.prepare("UPDATE subtasks SET target_department_id = ? WHERE target_department_id = ?").run(
    toDepartmentId,
    fromDepartmentId,
  );
  db.prepare("UPDATE office_pack_departments SET department_id = ? WHERE department_id = ?").run(
    toDepartmentId,
    fromDepartmentId,
  );
  db.prepare("DELETE FROM departments WHERE id = ?").run(fromDepartmentId);
}

function updateAgentReferenceTables(db: DbLike, fromAgentId: string, toAgentId: string): void {
  db.prepare("UPDATE tasks SET assigned_agent_id = ? WHERE assigned_agent_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE subtasks SET assigned_agent_id = ? WHERE assigned_agent_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE messages SET sender_id = ? WHERE sender_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE project_agents SET agent_id = ? WHERE agent_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE conversation_project_contexts SET agent_id = ? WHERE agent_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE meeting_minute_entries SET speaker_agent_id = ? WHERE speaker_agent_id = ?").run(
    toAgentId,
    fromAgentId,
  );
  db.prepare("UPDATE review_round_feedback_items SET agent_id = ? WHERE agent_id = ?").run(toAgentId, fromAgentId);
  db.prepare("UPDATE task_report_archives SET generated_by_agent_id = ? WHERE generated_by_agent_id = ?").run(
    toAgentId,
    fromAgentId,
  );
  db.prepare("UPDATE project_review_decision_states SET planner_agent_id = ? WHERE planner_agent_id = ?").run(
    toAgentId,
    fromAgentId,
  );
  db.prepare("UPDATE review_round_decision_states SET planner_agent_id = ? WHERE planner_agent_id = ?").run(
    toAgentId,
    fromAgentId,
  );
}

function upsertSeedAgent(db: DbLike, seed: OrganizationAgentSeed, agentId?: string): void {
  const id = agentId ?? seed.id;
  const canonicalDepartmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;
  db.prepare(
    `
    INSERT INTO agents (
      id, name, name_ko, name_ja, name_zh, department_id, workflow_pack_key, role, cli_provider,
      family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile,
      avatar_emoji, personality
    )
    VALUES (?, ?, ?, ?, ?, ?, 'development', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      name_zh = excluded.name_zh,
      department_id = excluded.department_id,
      workflow_pack_key = 'development',
      role = excluded.role,
      cli_provider = excluded.cli_provider,
      family = excluded.family,
      career_stage = excluded.career_stage,
      specialization_key = excluded.specialization_key,
      authority_level = excluded.authority_level,
      execution_capability_profile = excluded.execution_capability_profile,
      workflow_profile = excluded.workflow_profile,
      avatar_emoji = excluded.avatar_emoji,
      personality = excluded.personality
  `,
  ).run(
    id,
    seed.name,
    seed.name_ko,
    seed.name_ja,
    seed.name_zh,
    canonicalDepartmentId,
    seed.role,
    seed.cli_provider,
    seed.family,
    seed.career_stage,
    seed.specialization_key,
    seed.authority_level,
    seed.execution_capability_profile,
    JSON.stringify(seed.workflow_profile),
    seed.avatar_emoji,
    seed.personality,
  );
  syncDefaultSkillHistory(db, seed);
  const statsRow = db.prepare("SELECT stats_tasks_done, stats_xp FROM agents WHERE id = ? LIMIT 1").get(id) as
    | { stats_tasks_done?: number; stats_xp?: number }
    | undefined;
  syncSeedAgentArtifacts(seed, Number(statsRow?.stats_tasks_done ?? 0), Number(statsRow?.stats_xp ?? 0));
}

function buildPreview(db: DbLike): CanonicalResetPreview {
  const existingDepartments = new Set(
    (db.prepare("SELECT id FROM departments").all() as Array<{ id?: unknown }>)
      .map((row) => normalizeText(row.id))
      .filter(Boolean),
  );
  const existingAgents = new Set(
    (db.prepare("SELECT id FROM agents").all() as Array<{ id?: unknown }>)
      .map((row) => normalizeText(row.id))
      .filter(Boolean),
  );
  const department_migrations = Object.entries(LEGACY_DEPARTMENT_ID_MAP)
    .filter(
      ([fromDepartmentId, toDepartmentId]) =>
        fromDepartmentId !== toDepartmentId && existingDepartments.has(fromDepartmentId),
    )
    .map(([fromDepartmentId, toDepartmentId]) => ({ from: fromDepartmentId, to: toDepartmentId }));
  const legacy_builtin_agents_matched = collectLegacyBuiltinMatches(db);
  const matchedSeedIds = new Set(legacy_builtin_agents_matched.map((match) => match.seed_agent_id));
  const new_departments_to_create = ORGANIZATION_DEPARTMENTS.map((department) => department.id).filter(
    (departmentId) => !existingDepartments.has(departmentId),
  );
  const new_agents_to_create = ORGANIZATION_AGENT_SEEDS.map((seed) => seed.id).filter(
    (seedAgentId) => !existingAgents.has(seedAgentId) && !matchedSeedIds.has(seedAgentId),
  );
  const warnings: string[] = [];
  for (const departmentId of existingDepartments) {
    if (
      !ORGANIZATION_DEPARTMENTS.some((department) => department.id === departmentId) &&
      !LEGACY_DEPARTMENT_ID_MAP[departmentId]
    ) {
      warnings.push(`unknown_department:${departmentId}`);
    }
  }
  return {
    ok: true,
    seed_version: ORGANIZATION_SEED_VERSION,
    department_migrations,
    legacy_builtin_agents_matched,
    new_departments_to_create,
    new_agents_to_create,
    warnings,
  };
}

export function previewCanonicalResetOrganization(db: DbLike): CanonicalResetPreview {
  return buildPreview(db);
}

export function applyCanonicalResetOrganization(db: DbLike): CanonicalResetApplyResult {
  const preview = buildPreview(db);
  let migratedDepartments = 0;
  let migratedAgents = 0;
  let insertedAgents = 0;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");

    for (const migration of preview.department_migrations) {
      updateDepartmentForeignKeys(db, migration.from, migration.to);
      migratedDepartments += 1;
    }

    reserveCanonicalDepartmentSortOrders(db);
    upsertDepartmentSeed(db);

    for (const match of preview.legacy_builtin_agents_matched) {
      const seed = getOrganizationAgentSeedById(match.seed_agent_id);
      if (!seed) continue;
      const targetExists = db.prepare("SELECT 1 AS ok FROM agents WHERE id = ? LIMIT 1").get(seed.id) as
        | { ok?: number }
        | undefined;
      if (targetExists?.ok === 1 && match.source_agent_id !== seed.id) {
        updateAgentReferenceTables(db, match.source_agent_id, seed.id);
        db.prepare("DELETE FROM agents WHERE id = ?").run(match.source_agent_id);
        migratedAgents += 1;
        continue;
      }
      if (match.source_agent_id !== seed.id) {
        updateAgentReferenceTables(db, match.source_agent_id, seed.id);
        db.prepare("UPDATE agents SET id = ? WHERE id = ?").run(seed.id, match.source_agent_id);
      }
      upsertSeedAgent(db, seed, seed.id);
      migratedAgents += 1;
    }

    for (const seed of ORGANIZATION_AGENT_SEEDS) {
      const exists = db.prepare("SELECT 1 AS ok FROM agents WHERE id = ? LIMIT 1").get(seed.id) as
        | { ok?: number }
        | undefined;
      if (exists?.ok === 1) {
        upsertSeedAgent(db, seed, seed.id);
        continue;
      }
      upsertSeedAgent(db, seed);
      insertedAgents += 1;
    }

    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('defaultProvider', 'codex') ON CONFLICT(key) DO UPDATE SET value = 'codex'",
    ).run();
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('roomThemes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(JSON.stringify(DEFAULT_ROOM_THEMES));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }

  return {
    ...preview,
    applied: true,
    migrated_departments: migratedDepartments,
    migrated_agents: migratedAgents,
    inserted_agents: insertedAgents,
  };
}
