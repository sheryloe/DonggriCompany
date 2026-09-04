import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import type { ContinuityCheckpoint } from "./checkpoint-contract.js";

export type ProviderReadinessState = "ready" | "auth_required" | "install_required" | "degraded" | "observed_exhausted";

export interface ProviderReadiness {
  provider: ContinuityCheckpoint["target_provider"];
  account_pool_id: string;
  account_label: string | null;
  state: ProviderReadinessState;
  observed_at: string | null;
  reason: string | null;
}

type Row = Record<string, SQLOutputValue>;
export const PROVIDER_READINESS_MAX_AGE_MS = 5 * 60 * 1_000;

export function readProviderReadiness(
  db: Pick<DatabaseSync, "prepare">,
  provider: ContinuityCheckpoint["target_provider"],
  accountPoolId: string,
  nowMs = Date.now(),
): ProviderReadiness {
  const row = db
    .prepare(
      `SELECT account_pool_id, label, status, last_verified_at, last_error
       FROM cli_account_pools
       WHERE provider = ? AND account_pool_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(provider, accountPoolId) as Row | undefined;
  if (!row)
    return {
      provider,
      account_pool_id: accountPoolId,
      account_label: null,
      state: "install_required",
      observed_at: null,
      reason: null,
    };

  const error = typeof row.last_error === "string" ? row.last_error : "";
  const verifiedAt = typeof row.last_verified_at === "number" ? row.last_verified_at : null;
  const observedAt = verifiedAt === null ? null : new Date(verifiedAt).toISOString();
  const accountLabel = typeof row.label === "string" ? row.label : null;
  if (row.status === "connected" && (verifiedAt === null || nowMs - verifiedAt > PROVIDER_READINESS_MAX_AGE_MS)) {
    return {
      provider,
      account_pool_id: accountPoolId,
      account_label: accountLabel,
      state: "degraded",
      observed_at: observedAt,
      reason: "readiness_observation_stale",
    };
  }
  if (/quota|usage limit|rate limit.*exhaust/i.test(error)) {
    return {
      provider,
      account_pool_id: accountPoolId,
      account_label: accountLabel,
      state: "observed_exhausted",
      observed_at: observedAt,
      reason: error,
    };
  }
  const state: ProviderReadinessState =
    row.status === "connected"
      ? "ready"
      : row.status === "auth_required"
        ? "auth_required"
        : row.status === "install_required"
          ? "install_required"
          : "degraded";
  return {
    provider,
    account_pool_id: accountPoolId,
    account_label: accountLabel,
    state,
    observed_at: observedAt,
    reason: error || null,
  };
}
