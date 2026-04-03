import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const accountPools = sqliteTable('account_pools', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  planLabel: text('plan_label').notNull(),
  authProfileDir: text('auth_profile_dir'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const accountLanes = sqliteTable('account_lanes', {
  id: text('id').primaryKey(),
  accountPoolId: text('account_pool_id').notNull().references(() => accountPools.id),
  laneKey: text('lane_key').notNull(),
  allocationPct: integer('allocation_pct').notNull(),
  hardFloorPct: integer('hard_floor_pct').notNull(),
  softFloorPct: integer('soft_floor_pct').notNull(),
});

export const loadouts = sqliteTable('loadouts', {
  id: text('id').primaryKey(),
  accountPoolId: text('account_pool_id').notNull().references(() => accountPools.id),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  modelHint: text('model_hint'),
  effort: text('effort'),
  sandboxPolicy: text('sandbox_policy'),
  toolPolicy: text('tool_policy'),
  defaultRoleIds: text('default_role_ids', { mode: 'json' }),
});

export const sharedRoles = sqliteTable('shared_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  summary: text('summary'),
  roleYaml: text('role_yaml').notNull(),
  version: integer('version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
});

export const roleCompiledArtifacts = sqliteTable('role_compiled_artifacts', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => sharedRoles.id),
  provider: text('provider').notNull(),
  artifactPath: text('artifact_path').notNull(),
  artifactHash: text('artifact_hash').notNull(),
  compiledAt: integer('compiled_at', { mode: 'timestamp' }).notNull(),
});

export const missions = sqliteTable('missions', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  priority: text('priority').notNull(),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  missionId: text('mission_id').notNull().references(() => missions.id),
  parentTaskId: text('parent_task_id'),
  title: text('title').notNull(),
  roleId: text('role_id').notNull().references(() => sharedRoles.id),
  desiredLoadoutId: text('desired_loadout_id'),
  assignedAgentInstanceId: text('assigned_agent_instance_id'),
  state: text('state').notNull(),
  blockedReason: text('blocked_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const agentInstances = sqliteTable('agent_instances', {
  id: text('id').primaryKey(),
  missionId: text('mission_id').notNull().references(() => missions.id),
  taskId: text('task_id').notNull().references(() => tasks.id),
  roleId: text('role_id').notNull().references(() => sharedRoles.id),
  loadoutId: text('loadout_id').references(() => loadouts.id),
  accountPoolId: text('account_pool_id').notNull().references(() => accountPools.id),
  provider: text('provider').notNull(),
  externalSessionId: text('external_session_id'),
  state: text('state').notNull(),
  cwd: text('cwd'),
  worktreePath: text('worktree_path'),
  avatarSkinId: text('avatar_skin_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
});

export const fatigueSnapshots = sqliteTable('fatigue_snapshots', {
  id: text('id').primaryKey(),
  accountPoolId: text('account_pool_id').notNull().references(() => accountPools.id),
  capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull(),
  effectiveRemainingPct: integer('effective_remaining_pct').notNull(),
  effectiveFatiguePct: integer('effective_fatigue_pct').notNull(),
  status: text('status').notNull(),
  rawJson: text('raw_json', { mode: 'json' }),
});

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  agentInstanceId: text('agent_instance_id').notNull().references(() => agentInstances.id),
  kind: text('kind').notNull(),
  summary: text('summary'),
  payloadJson: text('payload_json', { mode: 'json' }),
  state: text('state').notNull(),
  requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  eventType: text('event_type').notNull(),
  ts: integer('ts', { mode: 'timestamp' }).notNull(),
  payloadJson: text('payload_json', { mode: 'json' }),
});

export const avatarSkins = sqliteTable('avatar_skins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  imageUrl: text('image_url').notNull(),
  themeColor: text('theme_color').notNull(),
  tags: text('tags', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
