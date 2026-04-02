import type { DatabaseHandle } from "./database.js";
import { withDatabase } from "./database.js";
import { getDbPath } from "./paths.js";
import { STEP1_SEED_DATA, type Step1SeedData } from "../seeds/step1.seed.js";
import { STEP2_SEED_DATA, type Step2SeedData } from "../seeds/step2.seed.js";

type Step1SeedRunner = (db: DatabaseHandle, nowIso: string, seedData: Step1SeedData) => void;
type Step2SeedRunner = (db: DatabaseHandle, nowIso: string, seedData: Step2SeedData) => void;

export type SeedResult = {
  dbPath: string;
  insertedRolePacks: number;
  insertedEmployees: number;
  insertedAccountPools: number;
  insertedRuntimeProfiles: number;
  insertedRoutingRules: number;
};

const runRolePackSeed: Step1SeedRunner = (db, nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO role_packs
      (id, slug, title, description, root_dir, manifest_json, is_enabled, created_at, updated_at)
    VALUES
      (@id, @slug, @title, @description, @root_dir, @manifest_json, @is_enabled, @created_at, @updated_at)
  `);

  for (const rolePack of seedData.rolePacks) {
    statement.run({
      id: rolePack.id,
      slug: rolePack.slug,
      title: rolePack.title,
      description: rolePack.description,
      root_dir: rolePack.rootDir,
      manifest_json: JSON.stringify(rolePack.manifestJson),
      is_enabled: rolePack.isEnabled,
      created_at: nowIso,
      updated_at: nowIso
    });
  }
};

const runEmployeeSeed: Step1SeedRunner = (db, nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO employees
      (id, name, role_pack_id, avatar_type, avatar_asset, visual_preset, status, created_at, updated_at)
    VALUES
      (@id, @name, @role_pack_id, @avatar_type, @avatar_asset, @visual_preset, @status, @created_at, @updated_at)
  `);

  for (const employee of seedData.employees) {
    statement.run({
      id: employee.id,
      name: employee.name,
      role_pack_id: employee.rolePackId,
      avatar_type: employee.avatarType,
      avatar_asset: employee.avatarAsset,
      visual_preset: employee.visualPreset,
      status: employee.status,
      created_at: nowIso,
      updated_at: nowIso
    });
  }
};

const runAccountPoolSeed: Step2SeedRunner = (db, nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT INTO account_pools (
      id,
      provider,
      display_name,
      auth_type,
      fatigue_source_type,
      config_dir,
      status,
      key,
      label,
      plan_tier,
      fatigue_mode,
      max_concurrency,
      is_enabled,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @provider,
      @display_name,
      @auth_type,
      @fatigue_source_type,
      @config_dir,
      @status,
      @key,
      @label,
      @plan_tier,
      @fatigue_mode,
      @max_concurrency,
      @is_enabled,
      @notes,
      @created_at,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      display_name = excluded.display_name,
      fatigue_source_type = excluded.fatigue_source_type,
      key = excluded.key,
      label = excluded.label,
      plan_tier = excluded.plan_tier,
      fatigue_mode = excluded.fatigue_mode,
      max_concurrency = excluded.max_concurrency,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  for (const accountPool of seedData.accountPools) {
    statement.run({
      id: accountPool.id,
      provider: accountPool.provider,
      display_name: accountPool.label,
      auth_type: "oauth",
      fatigue_source_type: accountPool.fatigueMode,
      config_dir: null,
      status: "active",
      key: accountPool.key,
      label: accountPool.label,
      plan_tier: accountPool.planTier,
      fatigue_mode: accountPool.fatigueMode,
      max_concurrency: accountPool.maxConcurrency,
      is_enabled: accountPool.isEnabled,
      notes: accountPool.notes,
      created_at: nowIso,
      updated_at: nowIso
    });
  }
};

const runRuntimeCapabilitySeed: Step2SeedRunner = (db, _nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT INTO runtime_capabilities (id, key, label, description)
    VALUES (@id, @key, @label, @description)
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      label = excluded.label,
      description = excluded.description
  `);

  for (const capability of seedData.runtimeCapabilities) {
    statement.run({
      id: capability.id,
      key: capability.key,
      label: capability.label,
      description: capability.description
    });
  }
};

const runRuntimeProfileSeed: Step2SeedRunner = (db, nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT INTO runtime_profiles (
      id,
      provider,
      account_pool_id,
      profile_name,
      profile_path,
      capabilities_json,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @provider,
      @account_pool_id,
      @profile_name,
      @profile_path,
      @capabilities_json,
      @status,
      @created_at,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      account_pool_id = excluded.account_pool_id,
      profile_name = excluded.profile_name,
      profile_path = excluded.profile_path,
      capabilities_json = excluded.capabilities_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);

  for (const profile of seedData.runtimeProfiles) {
    statement.run({
      id: profile.id,
      provider: profile.provider,
      account_pool_id: profile.accountPoolId,
      profile_name: profile.profileName,
      profile_path: profile.profilePath,
      capabilities_json: JSON.stringify(profile.capabilitiesJson),
      status: profile.status,
      created_at: nowIso,
      updated_at: nowIso
    });
  }
};

const runRuntimeProfileCapabilitySeed: Step2SeedRunner = (db, nowIso, seedData) => {
  const statement = db.prepare(`
    INSERT INTO runtime_profile_capabilities (
      id,
      runtime_profile_id,
      capability_id,
      strength,
      created_at
    )
    VALUES (
      @id,
      @runtime_profile_id,
      @capability_id,
      @strength,
      @created_at
    )
    ON CONFLICT(runtime_profile_id, capability_id) DO UPDATE SET
      strength = excluded.strength
  `);

  for (const item of seedData.runtimeProfileCapabilities) {
    statement.run({
      id: item.id,
      runtime_profile_id: item.runtimeProfileId,
      capability_id: item.capabilityId,
      strength: item.strength,
      created_at: nowIso
    });
  }
};

const runRoutingRuleSeed: Step2SeedRunner = (db, nowIso, seedData) => {
  const ruleStatement = db.prepare(`
    INSERT INTO routing_rules (
      id,
      key,
      label,
      task_type,
      role_key,
      workspace_mode,
      priority,
      is_enabled,
      match_json,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @key,
      @label,
      @task_type,
      @role_key,
      @workspace_mode,
      @priority,
      @is_enabled,
      @match_json,
      @created_at,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      label = excluded.label,
      task_type = excluded.task_type,
      role_key = excluded.role_key,
      workspace_mode = excluded.workspace_mode,
      priority = excluded.priority,
      is_enabled = excluded.is_enabled,
      match_json = excluded.match_json,
      updated_at = excluded.updated_at
  `);

  const clearTargetStatement = db.prepare("DELETE FROM routing_rule_targets WHERE routing_rule_id = ?");
  const targetStatement = db.prepare(`
    INSERT INTO routing_rule_targets (
      id,
      routing_rule_id,
      runtime_profile_id,
      target_order,
      min_confidence,
      max_fatigue_percent,
      fallback_only,
      created_at
    )
    VALUES (
      @id,
      @routing_rule_id,
      @runtime_profile_id,
      @target_order,
      @min_confidence,
      @max_fatigue_percent,
      @fallback_only,
      @created_at
    )
    ON CONFLICT(routing_rule_id, runtime_profile_id, target_order) DO UPDATE SET
      min_confidence = excluded.min_confidence,
      max_fatigue_percent = excluded.max_fatigue_percent,
      fallback_only = excluded.fallback_only
  `);

  const profileIdByName = new Map(
    (db.prepare("SELECT id, profile_name FROM runtime_profiles").all() as { id: string; profile_name: string }[]).map(
      (row) => [row.profile_name, row.id] as const
    )
  );

  for (const rule of seedData.routingRules) {
    ruleStatement.run({
      id: rule.id,
      key: rule.key,
      label: rule.label,
      task_type: rule.taskType,
      role_key: rule.roleKey,
      workspace_mode: rule.workspaceMode,
      priority: rule.priority,
      is_enabled: rule.isEnabled,
      match_json: JSON.stringify(rule.matchJson),
      created_at: nowIso,
      updated_at: nowIso
    });

    clearTargetStatement.run(rule.id);

    for (const target of rule.targets) {
      const runtimeProfileId = profileIdByName.get(target.runtimeProfileKey);
      if (!runtimeProfileId) {
        continue;
      }

      targetStatement.run({
        id: target.id,
        routing_rule_id: rule.id,
        runtime_profile_id: runtimeProfileId,
        target_order: target.targetOrder,
        min_confidence: target.minConfidence,
        max_fatigue_percent: target.maxFatiguePercent,
        fallback_only: target.fallbackOnly,
        created_at: nowIso
      });
    }
  }
};

const STEP1_TABLE_SEED_RUNNERS: Step1SeedRunner[] = [runRolePackSeed, runEmployeeSeed];
const STEP2_TABLE_SEED_RUNNERS: Step2SeedRunner[] = [
  runAccountPoolSeed,
  runRuntimeCapabilitySeed,
  runRuntimeProfileSeed,
  runRuntimeProfileCapabilitySeed,
  runRoutingRuleSeed
];

const readInsertedCounts = (db: DatabaseHandle): Omit<SeedResult, "dbPath"> => {
  const rolePackCount = db.prepare("SELECT COUNT(1) as count FROM role_packs").get() as { count: number };
  const employeeCount = db.prepare("SELECT COUNT(1) as count FROM employees").get() as { count: number };
  const accountPoolCount = db.prepare("SELECT COUNT(1) as count FROM account_pools").get() as { count: number };
  const runtimeProfileCount = db.prepare("SELECT COUNT(1) as count FROM runtime_profiles").get() as {
    count: number;
  };
  const routingRuleCount = db.prepare("SELECT COUNT(1) as count FROM routing_rules").get() as { count: number };

  return {
    insertedRolePacks: rolePackCount.count,
    insertedEmployees: employeeCount.count,
    insertedAccountPools: accountPoolCount.count,
    insertedRuntimeProfiles: runtimeProfileCount.count,
    insertedRoutingRules: routingRuleCount.count
  };
};

export const runSeed = (dbPath = getDbPath()): SeedResult => {
  return withDatabase((db) => {
    const nowIso = new Date().toISOString();

    const seedTransaction = db.transaction(() => {
      for (const seedRunner of STEP1_TABLE_SEED_RUNNERS) {
        seedRunner(db, nowIso, STEP1_SEED_DATA);
      }
      for (const seedRunner of STEP2_TABLE_SEED_RUNNERS) {
        seedRunner(db, nowIso, STEP2_SEED_DATA);
      }
    });

    seedTransaction();
    return {
      dbPath,
      ...readInsertedCounts(db)
    };
  }, dbPath);
};
