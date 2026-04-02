import type {
  AccountPoolLatestFatigueView,
  FatiguePrecision,
  FatigueState,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

export type AccountPoolRecord = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  planTier: string | null;
  fatigueMode: FatiguePrecision;
  maxConcurrency: number | null;
  isEnabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountPoolCreateInput = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  planTier: string | null;
  fatigueMode: FatiguePrecision;
  maxConcurrency: number | null;
  isEnabled: boolean;
  notes: string | null;
};

export type AccountPoolUpdateInput = {
  label?: string;
  planTier?: string | null;
  fatigueMode?: FatiguePrecision;
  maxConcurrency?: number | null;
  isEnabled?: boolean;
  notes?: string | null;
};

type AccountPoolRow = {
  id: string;
  key: string;
  provider: ProviderUsageProbeProvider;
  label: string;
  plan_tier: string | null;
  fatigue_mode: FatiguePrecision;
  max_concurrency: number | null;
  is_enabled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LatestFatigueRow = {
  account_pool_id: string;
  source_type: FatiguePrecision;
  normalized_percent: number;
  fatigue_state: FatigueState;
  confidence_score: number;
  observed_at: string;
};

const mapAccountPoolRow = (row: AccountPoolRow): AccountPoolRecord => {
  return {
    id: row.id,
    key: row.key,
    provider: row.provider,
    label: row.label,
    planTier: row.plan_tier,
    fatigueMode: row.fatigue_mode,
    maxConcurrency: row.max_concurrency,
    isEnabled: row.is_enabled === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export class AccountPoolRepository {
  list(db: DatabaseHandle): AccountPoolRecord[] {
    const rows = db
      .prepare(
        `
        SELECT
          id,
          key,
          provider,
          label,
          plan_tier,
          fatigue_mode,
          max_concurrency,
          is_enabled,
          notes,
          created_at,
          updated_at
        FROM account_pools
        ORDER BY key ASC
        `
      )
      .all() as AccountPoolRow[];

    return rows.map(mapAccountPoolRow);
  }

  getById(db: DatabaseHandle, id: string): AccountPoolRecord | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          key,
          provider,
          label,
          plan_tier,
          fatigue_mode,
          max_concurrency,
          is_enabled,
          notes,
          created_at,
          updated_at
        FROM account_pools
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(id) as AccountPoolRow | undefined;

    return row ? mapAccountPoolRow(row) : null;
  }

  getByKey(db: DatabaseHandle, key: string): AccountPoolRecord | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          key,
          provider,
          label,
          plan_tier,
          fatigue_mode,
          max_concurrency,
          is_enabled,
          notes,
          created_at,
          updated_at
        FROM account_pools
        WHERE key = ?
        LIMIT 1
        `
      )
      .get(key) as AccountPoolRow | undefined;

    return row ? mapAccountPoolRow(row) : null;
  }

  create(db: DatabaseHandle, input: AccountPoolCreateInput, nowIso: string): AccountPoolRecord {
    db.prepare(
      `
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
      `
    ).run({
      id: input.id,
      provider: input.provider,
      display_name: input.label,
      auth_type: "oauth",
      fatigue_source_type: input.fatigueMode,
      config_dir: null,
      status: input.isEnabled ? "active" : "disabled",
      key: input.key,
      label: input.label,
      plan_tier: input.planTier,
      fatigue_mode: input.fatigueMode,
      max_concurrency: input.maxConcurrency,
      is_enabled: input.isEnabled ? 1 : 0,
      notes: input.notes,
      created_at: nowIso,
      updated_at: nowIso
    });

    const created = this.getById(db, input.id);
    if (!created) {
      throw new Error("Failed to create account pool");
    }
    return created;
  }

  update(db: DatabaseHandle, id: string, input: AccountPoolUpdateInput, nowIso: string): AccountPoolRecord {
    const assignments: string[] = ["updated_at = @updated_at"];
    const params: Record<string, unknown> = {
      id,
      updated_at: nowIso
    };

    if (input.label !== undefined) {
      assignments.push("label = @label");
      assignments.push("display_name = @label");
      params.label = input.label;
    }

    if (input.planTier !== undefined) {
      assignments.push("plan_tier = @plan_tier");
      params.plan_tier = input.planTier;
    }

    if (input.fatigueMode !== undefined) {
      assignments.push("fatigue_mode = @fatigue_mode");
      assignments.push("fatigue_source_type = @fatigue_source_type");
      params.fatigue_mode = input.fatigueMode;
      params.fatigue_source_type = input.fatigueMode;
    }

    if (input.maxConcurrency !== undefined) {
      assignments.push("max_concurrency = @max_concurrency");
      params.max_concurrency = input.maxConcurrency;
    }

    if (input.isEnabled !== undefined) {
      assignments.push("is_enabled = @is_enabled");
      assignments.push("status = @status");
      params.is_enabled = input.isEnabled ? 1 : 0;
      params.status = input.isEnabled ? "active" : "disabled";
    }

    if (input.notes !== undefined) {
      assignments.push("notes = @notes");
      params.notes = input.notes;
    }

    db.prepare(
      `
      UPDATE account_pools
      SET ${assignments.join(", ")}
      WHERE id = @id
      `
    ).run(params);

    const updated = this.getById(db, id);
    if (!updated) {
      throw new Error("Failed to update account pool");
    }
    return updated;
  }

  listLatestFatigueByPoolId(db: DatabaseHandle): Map<string, AccountPoolLatestFatigueView> {
    const rows = db
      .prepare(
        `
        SELECT s.account_pool_id, s.source_type, s.normalized_percent, s.fatigue_state, s.confidence_score, s.observed_at
        FROM fatigue_snapshots s
        INNER JOIN (
          SELECT account_pool_id, MAX(observed_at) AS max_observed_at
          FROM fatigue_snapshots
          GROUP BY account_pool_id
        ) latest
          ON latest.account_pool_id = s.account_pool_id
         AND latest.max_observed_at = s.observed_at
        `
      )
      .all() as LatestFatigueRow[];

    return new Map(
      rows.map((row) => [
        row.account_pool_id,
        {
          precision: row.source_type,
          normalizedPercent: row.normalized_percent,
          fatigueState: row.fatigue_state,
          confidenceScore: row.confidence_score,
          observedAt: row.observed_at
        }
      ])
    );
  }
}
