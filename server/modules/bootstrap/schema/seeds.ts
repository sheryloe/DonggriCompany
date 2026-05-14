import type { DatabaseSync } from "node:sqlite";
import { seedDefaultWorkflowPacks } from "./workflow-pack-seeds.ts";
import {
  DEFAULT_ROOM_THEMES,
  buildSeedAgentProfile,
  getDefaultSkillBundleForDepartment,
  mapLegacyDepartmentId,
  ORGANIZATION_AGENT_SEEDS,
  ORGANIZATION_DEPARTMENTS,
  ORGANIZATION_SEED_VERSION,
} from "./organization-manifest.ts";
import { upsertAgentGuideFile } from "../../routes/core/agents/agent-guide-files.ts";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

const STRATEGIC_MAINTENANCE_DEFAULT_SETTINGS = {
  enabled: false,
  cadence: "weekly",
  dayOfWeek: 1,
  hour: 9,
  timezone: "Asia/Seoul",
  createTasks: true,
  maxTasksPerRun: 5,
  emailEnabled: false,
  emailTo: [],
  emailCc: [],
};

function ensureSkillBundleHistory(db: DbLike, agentId: string, provider: string, departmentId: string): void {
  const skills = getDefaultSkillBundleForDepartment(departmentId);
  const now = Date.now();
  for (const skillId of skills) {
    db.prepare(
      `
      INSERT INTO skill_learning_history (
        id, job_id, provider, repo, skill_id, skill_label, status, command, run_started_at, run_completed_at, created_at, updated_at
      )
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
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
      `seed-skill:${agentId}:${skillId}`,
      provider,
      `builtin://${ORGANIZATION_SEED_VERSION}/${departmentId}`,
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

function syncSeedGuideFiles(
  db: DbLike,
  seed: (typeof ORGANIZATION_AGENT_SEEDS)[number],
  departmentId: string,
  workflowProfile: string,
): void {
  const row = db.prepare("SELECT stats_tasks_done, stats_xp FROM agents WHERE id = ? LIMIT 1").get(seed.id) as
    | { stats_tasks_done?: number; stats_xp?: number }
    | undefined;
  upsertAgentGuideFile({
    id: seed.id,
    name: seed.name,
    role: seed.role,
    departmentId,
    workflowProfileJson: workflowProfile,
    agentProfileJson: JSON.stringify(buildSeedAgentProfile(seed)),
    statsTasksDone: Number(row?.stats_tasks_done ?? 0),
    statsXp: Number(row?.stats_xp ?? 0),
    skillBundle: getDefaultSkillBundleForDepartment(departmentId),
  });
}

function insertMissingCanonicalDepartment(db: DbLike, department: (typeof ORGANIZATION_DEPARTMENTS)[number]): boolean {
  const result = db
    .prepare(
      `
      INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    )
    .run(
      department.id,
      department.name,
      department.name_ko,
      department.name_ja,
      department.name_zh,
      department.icon,
      department.color,
      department.sort_order,
    ) as { changes?: number };
  return Number(result.changes ?? 0) > 0;
}

function insertMissingCanonicalAgent(db: DbLike, seed: (typeof ORGANIZATION_AGENT_SEEDS)[number]): boolean {
  const workflowProfileJson = JSON.stringify(seed.workflow_profile);
  const departmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;
  const result = db
    .prepare(
      `
      INSERT INTO agents (
        id, name, name_ko, name_ja, name_zh, department_id, workflow_pack_key, role, cli_provider,
        family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile,
        agent_profile_json, avatar_emoji, sprite_number, personality
      )
      VALUES (?, ?, ?, ?, ?, ?, 'development', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    )
    .run(
      seed.id,
      seed.name,
      seed.name_ko,
      seed.name_ja,
      seed.name_zh,
      departmentId,
      seed.role,
      seed.cli_provider,
      seed.family,
      seed.career_stage,
      seed.specialization_key,
      seed.authority_level,
      seed.execution_capability_profile,
      workflowProfileJson,
      JSON.stringify(buildSeedAgentProfile(seed)),
      seed.avatar_emoji,
      seed.sprite_number,
      seed.personality,
    ) as { changes?: number };
  const inserted = Number(result.changes ?? 0) > 0;
  if (inserted) {
    ensureSkillBundleHistory(db, seed.id, seed.cli_provider, departmentId);
    syncSeedGuideFiles(db, seed, departmentId, workflowProfileJson);
  }
  return inserted;
}

function syncMissingCanonicalOrganizationSeeds(db: DbLike): void {
  let insertedDepartments = 0;
  let insertedAgents = 0;
  for (const department of ORGANIZATION_DEPARTMENTS) {
    if (insertMissingCanonicalDepartment(db, department)) insertedDepartments++;
  }
  for (const seed of ORGANIZATION_AGENT_SEEDS) {
    if (insertMissingCanonicalAgent(db, seed)) insertedAgents++;
  }
  if (insertedDepartments > 0 || insertedAgents > 0) {
    console.log(
      `[Claw-Empire] Backfilled ${insertedDepartments} canonical department(s), ${insertedAgents} canonical agent(s) for ${ORGANIZATION_SEED_VERSION}`,
    );
  }
}

export function applyDefaultSeeds(db: DbLike): void {
  seedDefaultWorkflowPacks(db);

  const departmentCount = (db.prepare("SELECT COUNT(*) AS cnt FROM departments").get() as { cnt: number }).cnt;
  if (departmentCount === 0) {
    for (const department of ORGANIZATION_DEPARTMENTS) {
      insertMissingCanonicalDepartment(db, department);
    }
    console.log("[Claw-Empire] Seeded canonical organization departments");
  }
  for (const department of ORGANIZATION_DEPARTMENTS) {
    insertMissingCanonicalDepartment(db, department);
  }

  const agentCount = (db.prepare("SELECT COUNT(*) AS cnt FROM agents").get() as { cnt: number }).cnt;
  if (agentCount === 0) {
    for (const seed of ORGANIZATION_AGENT_SEEDS) {
      insertMissingCanonicalAgent(db, seed);
    }
    console.log("[Claw-Empire] Seeded canonical organization agents");
  }

  syncMissingCanonicalOrganizationSeeds(db);

  const settingsCount = (db.prepare("SELECT COUNT(*) AS cnt FROM settings").get() as { cnt: number }).cnt;
  if (settingsCount === 0) {
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("companyName", "Claw-Empire");
    insertSetting.run("ceoName", "CEO");
    insertSetting.run("autoAssign", "true");
    insertSetting.run("yoloMode", "false");
    insertSetting.run("autoUpdateEnabled", "false");
    insertSetting.run("autoUpdateNoticePending", "false");
    insertSetting.run("oauthAutoSwap", "true");
    insertSetting.run("language", "en");
    insertSetting.run("defaultProvider", "codex");
    insertSetting.run(
      "providerModelConfig",
      JSON.stringify({
        claude: { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
        codex: {
          model: "gpt-5.3-codex",
          reasoningLevel: "high",
          subModel: "gpt-5.3-codex",
          subModelReasoningLevel: "high",
        },
        gemini: { model: "gemini-3-pro-preview" },
        opencode: { model: "github-copilot/claude-sonnet-4.6" },
        copilot: { model: "github-copilot/claude-sonnet-4.6" },
        antigravity: { model: "google/antigravity-gemini-3-pro" },
      }),
    );
    insertSetting.run("roomThemes", JSON.stringify(DEFAULT_ROOM_THEMES));
    insertSetting.run("organizationSeedVersion", ORGANIZATION_SEED_VERSION);
    insertSetting.run("strategicMaintenance", JSON.stringify(STRATEGIC_MAINTENANCE_DEFAULT_SETTINGS));
    console.log("[Claw-Empire] Seeded canonical default settings");
  } else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('defaultProvider', 'codex') ON CONFLICT(key) DO NOTHING",
    ).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('roomThemes', ?) ON CONFLICT(key) DO NOTHING").run(
      JSON.stringify(DEFAULT_ROOM_THEMES),
    );
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('organizationSeedVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(ORGANIZATION_SEED_VERSION);
    db.prepare("INSERT INTO settings (key, value) VALUES ('strategicMaintenance', ?) ON CONFLICT(key) DO NOTHING").run(
      JSON.stringify(STRATEGIC_MAINTENANCE_DEFAULT_SETTINGS),
    );
  }
}
