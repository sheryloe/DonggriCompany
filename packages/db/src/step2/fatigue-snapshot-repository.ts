import type {
  FatiguePrecision,
  FatigueSnapshotView,
  FatigueState,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

export type FatigueSnapshotCreateInput = {
  id: string;
  accountPoolId: string;
  sourceType: FatiguePrecision;
  rawPayloadJson: Record<string, unknown>;
  rawUsageValue: number | null;
  rawLimitValue: number | null;
  rawUnit: string | null;
  normalizedPercent: number;
  fatigueState: FatigueState;
  confidenceScore: number;
  observedAt: string;
};

type FatigueSnapshotRow = {
  id: string;
  account_pool_id: string;
  source_type: FatiguePrecision;
  raw_usage_value: number | null;
  raw_limit_value: number | null;
  raw_unit: string | null;
  normalized_percent: number;
  fatigue_state: FatigueState;
  confidence_score: number;
  observed_at: string;
};

export type LatestSnapshotByPool = {
  accountPoolId: string;
  precision: FatiguePrecision;
  normalizedPercent: number;
  fatigueState: FatigueState;
  confidenceScore: number;
  observedAt: string;
};

export type LatestSnapshotByPoolWithRaw = LatestSnapshotByPool & {
  rawUsageValue: number | null;
  rawLimitValue: number | null;
  rawUnit: string | null;
};

const mapRow = (row: FatigueSnapshotRow): FatigueSnapshotView => {
  return {
    id: row.id,
    accountPoolId: row.account_pool_id,
    precision: row.source_type,
    rawUsageValue: row.raw_usage_value,
    rawLimitValue: row.raw_limit_value,
    rawUnit: row.raw_unit,
    normalizedPercent: row.normalized_percent,
    fatigueState: row.fatigue_state,
    confidenceScore: row.confidence_score,
    observedAt: row.observed_at
  };
};

export class FatigueSnapshotRepository {
  insert(db: DatabaseHandle, input: FatigueSnapshotCreateInput): FatigueSnapshotView {
    db.prepare(
      `
      INSERT INTO fatigue_snapshots (
        id,
        account_pool_id,
        source_type,
        raw_payload_json,
        raw_usage_value,
        raw_limit_value,
        raw_unit,
        normalized_percent,
        fatigue_state,
        confidence_score,
        observed_at
      )
      VALUES (
        @id,
        @account_pool_id,
        @source_type,
        @raw_payload_json,
        @raw_usage_value,
        @raw_limit_value,
        @raw_unit,
        @normalized_percent,
        @fatigue_state,
        @confidence_score,
        @observed_at
      )
      `
    ).run({
      id: input.id,
      account_pool_id: input.accountPoolId,
      source_type: input.sourceType,
      raw_payload_json: JSON.stringify(input.rawPayloadJson),
      raw_usage_value: input.rawUsageValue,
      raw_limit_value: input.rawLimitValue,
      raw_unit: input.rawUnit,
      normalized_percent: input.normalizedPercent,
      fatigue_state: input.fatigueState,
      confidence_score: input.confidenceScore,
      observed_at: input.observedAt
    });

    return this.getById(db, input.id) as FatigueSnapshotView;
  }

  getById(db: DatabaseHandle, id: string): FatigueSnapshotView | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          account_pool_id,
          source_type,
          raw_usage_value,
          raw_limit_value,
          raw_unit,
          normalized_percent,
          fatigue_state,
          confidence_score,
          observed_at
        FROM fatigue_snapshots
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(id) as FatigueSnapshotRow | undefined;

    return row ? mapRow(row) : null;
  }

  listByAccountPoolId(db: DatabaseHandle, accountPoolId: string, limit = 100): FatigueSnapshotView[] {
    const rows = db
      .prepare(
        `
        SELECT
          id,
          account_pool_id,
          source_type,
          raw_usage_value,
          raw_limit_value,
          raw_unit,
          normalized_percent,
          fatigue_state,
          confidence_score,
          observed_at
        FROM fatigue_snapshots
        WHERE account_pool_id = ?
        ORDER BY observed_at DESC
        LIMIT ?
        `
      )
      .all(accountPoolId, limit) as FatigueSnapshotRow[];

    return rows.map(mapRow);
  }

  getLatestByAccountPoolId(db: DatabaseHandle, accountPoolId: string): LatestSnapshotByPoolWithRaw | null {
    const row = db
      .prepare(
        `
        SELECT
          account_pool_id,
          source_type,
          raw_usage_value,
          raw_limit_value,
          raw_unit,
          normalized_percent,
          fatigue_state,
          confidence_score,
          observed_at
        FROM fatigue_snapshots
        WHERE account_pool_id = ?
        ORDER BY observed_at DESC
        LIMIT 1
        `
      )
      .get(accountPoolId) as
      | {
          account_pool_id: string;
          source_type: FatiguePrecision;
          raw_usage_value: number | null;
          raw_limit_value: number | null;
          raw_unit: string | null;
          normalized_percent: number;
          fatigue_state: FatigueState;
          confidence_score: number;
          observed_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      accountPoolId: row.account_pool_id,
      precision: row.source_type,
      rawUsageValue: row.raw_usage_value,
      rawLimitValue: row.raw_limit_value,
      rawUnit: row.raw_unit,
      normalizedPercent: row.normalized_percent,
      fatigueState: row.fatigue_state,
      confidenceScore: row.confidence_score,
      observedAt: row.observed_at
    };
  }
}

export const providerToDefaultPrecision = (
  provider: ProviderUsageProbeProvider
): FatiguePrecision => {
  if (provider === "gemini") {
    return "official";
  }
  return "derived";
};
