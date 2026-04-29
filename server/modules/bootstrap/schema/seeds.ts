import type { DatabaseSync } from "node:sqlite";
import { seedDefaultWorkflowPacks } from "./workflow-pack-seeds.ts";
import {
  DEFAULT_ROOM_THEMES,
  getDefaultSkillBundleForDepartment,
  ORGANIZATION_AGENT_SEEDS,
  ORGANIZATION_DEPARTMENTS,
} from "./organization-manifest.ts";
import { upsertAgentGuideFile } from "../../routes/core/agents/agent-guide-files.ts";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

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
      `builtin://org-v2/${departmentId}`,
      skillId,
      skillId.replace(/[-_.]+/g, " "),
      "canonical-seed-sync org-v2",
      now,
      now,
      now,
      now,
    );
  }
}

function syncSeedGuideFiles(
  db: DbLike,
  agentId: string,
  agentName: string,
  role: string,
  departmentId: string,
  workflowProfile: string,
): void {
  const row = db.prepare("SELECT stats_tasks_done, stats_xp FROM agents WHERE id = ? LIMIT 1").get(agentId) as
    | { stats_tasks_done?: number; stats_xp?: number }
    | undefined;
  upsertAgentGuideFile({
    id: agentId,
    name: agentName,
    role,
    departmentId,
    workflowProfileJson: workflowProfile,
    statsTasksDone: Number(row?.stats_tasks_done ?? 0),
    statsXp: Number(row?.stats_xp ?? 0),
    skillBundle: getDefaultSkillBundleForDepartment(departmentId),
  });
}

export function applyDefaultSeeds(db: DbLike): void {
  seedDefaultWorkflowPacks(db);

  const departmentCount = (db.prepare("SELECT COUNT(*) AS cnt FROM departments").get() as { cnt: number }).cnt;
  if (departmentCount === 0) {
    const insertDepartment = db.prepare(
      `
      INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    console.log("[Claw-Empire] Seeded canonical organization departments");
  }

  const agentCount = (db.prepare("SELECT COUNT(*) AS cnt FROM agents").get() as { cnt: number }).cnt;
  if (agentCount === 0) {
    const insertAgent = db.prepare(
      `
      INSERT INTO agents (
        id, name, name_ko, name_ja, name_zh, department_id, workflow_pack_key, role, cli_provider,
        family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile,
        avatar_emoji, personality
      )
      VALUES (?, ?, ?, ?, ?, ?, 'development', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const seed of ORGANIZATION_AGENT_SEEDS) {
      const workflowProfileJson = JSON.stringify(seed.workflow_profile);
      insertAgent.run(
        seed.id,
        seed.name,
        seed.name_ko,
        seed.name_ja,
        seed.name_zh,
        seed.department_id,
        seed.role,
        seed.cli_provider,
        seed.family,
        seed.career_stage,
        seed.specialization_key,
        seed.authority_level,
        seed.execution_capability_profile,
        workflowProfileJson,
        seed.avatar_emoji,
        seed.personality,
      );
      ensureSkillBundleHistory(db, seed.id, seed.cli_provider, seed.department_id);
      syncSeedGuideFiles(db, seed.id, seed.name, seed.role, seed.department_id, workflowProfileJson);
    }
    console.log("[Claw-Empire] Seeded canonical organization agents");
  }

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
    console.log("[Claw-Empire] Seeded canonical default settings");
  } else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('defaultProvider', 'codex') ON CONFLICT(key) DO NOTHING",
    ).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('roomThemes', ?) ON CONFLICT(key) DO NOTHING").run(
      JSON.stringify(DEFAULT_ROOM_THEMES),
    );
  }
}
