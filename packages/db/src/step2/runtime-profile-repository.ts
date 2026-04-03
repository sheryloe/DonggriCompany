import type { ProviderUsageProbeProvider, RuntimeCapabilityView, RuntimeProfileView } from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

export type RuntimeProfileCreateInput = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string | null;
  key: string;
  profilePath: string | null;
  status: string;
};

export type RuntimeProfileUpdateInput = {
  accountPoolId?: string | null;
  key?: string;
  profilePath?: string | null;
  status?: string;
};

type RuntimeProfileRow = {
  id: string;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string | null;
  profile_name: string;
  profile_path: string | null;
  status: string;
};

type RuntimeCapabilityRow = {
  runtime_profile_id: string;
  capability_key: string;
  capability_label: string;
  strength: number;
};

const toIsEnabled = (status: string): boolean => {
  const normalized = status.trim().toLowerCase();
  return normalized !== "disabled" && normalized !== "inactive";
};

export class RuntimeProfileRepository {
  listAll(db: DatabaseHandle): RuntimeProfileView[] {
    const rows = db
      .prepare(
        `
        SELECT id, provider, account_pool_id, profile_name, profile_path, status
        FROM runtime_profiles
        ORDER BY profile_name ASC
        `
      )
      .all() as RuntimeProfileRow[];

    return this.attachCapabilities(db, rows);
  }

  listByPoolIds(db: DatabaseHandle, poolIds: string[]): Map<string, RuntimeProfileView[]> {
    if (poolIds.length === 0) {
      return new Map();
    }

    const placeholders = poolIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `
        SELECT id, provider, account_pool_id, profile_name, profile_path, status
        FROM runtime_profiles
        WHERE account_pool_id IN (${placeholders})
        ORDER BY profile_name ASC
        `
      )
      .all(...poolIds) as RuntimeProfileRow[];

    const profiles = this.attachCapabilities(db, rows);
    const grouped = new Map<string, RuntimeProfileView[]>();

    for (const profile of profiles) {
      const accountPoolId = profile.accountPoolId;
      if (!accountPoolId) {
        continue;
      }
      const existing = grouped.get(accountPoolId) ?? [];
      existing.push(profile);
      grouped.set(accountPoolId, existing);
    }

    return grouped;
  }

  listByIds(db: DatabaseHandle, profileIds: string[]): Map<string, RuntimeProfileView> {
    if (profileIds.length === 0) {
      return new Map();
    }

    const placeholders = profileIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `
        SELECT id, provider, account_pool_id, profile_name, profile_path, status
        FROM runtime_profiles
        WHERE id IN (${placeholders})
        `
      )
      .all(...profileIds) as RuntimeProfileRow[];

    const profiles = this.attachCapabilities(db, rows);
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }

  getById(db: DatabaseHandle, id: string): RuntimeProfileView | null {
    const row = db
      .prepare(
        `
        SELECT id, provider, account_pool_id, profile_name, profile_path, status
        FROM runtime_profiles
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(id) as RuntimeProfileRow | undefined;

    if (!row) {
      return null;
    }

    return this.attachCapabilities(db, [row])[0] ?? null;
  }

  getByKey(db: DatabaseHandle, key: string): RuntimeProfileView | null {
    const row = db
      .prepare(
        `
        SELECT id, provider, account_pool_id, profile_name, profile_path, status
        FROM runtime_profiles
        WHERE profile_name = ?
        LIMIT 1
        `
      )
      .get(key) as RuntimeProfileRow | undefined;

    if (!row) {
      return null;
    }

    return this.attachCapabilities(db, [row])[0] ?? null;
  }

  create(db: DatabaseHandle, input: RuntimeProfileCreateInput, nowIso: string): RuntimeProfileView {
    db.prepare(
      `
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
      `
    ).run({
      id: input.id,
      provider: input.provider,
      account_pool_id: input.accountPoolId,
      profile_name: input.key,
      profile_path: input.profilePath,
      capabilities_json: "[]",
      status: input.status,
      created_at: nowIso,
      updated_at: nowIso
    });

    const created = this.getById(db, input.id);
    if (!created) {
      throw new Error("Failed to create runtime profile");
    }
    return created;
  }

  update(db: DatabaseHandle, id: string, input: RuntimeProfileUpdateInput, nowIso: string): RuntimeProfileView {
    const assignments: string[] = ["updated_at = @updated_at"];
    const params: Record<string, unknown> = {
      id,
      updated_at: nowIso
    };

    if (input.accountPoolId !== undefined) {
      assignments.push("account_pool_id = @account_pool_id");
      params.account_pool_id = input.accountPoolId;
    }
    if (input.key !== undefined) {
      assignments.push("profile_name = @profile_name");
      params.profile_name = input.key;
    }
    if (input.profilePath !== undefined) {
      assignments.push("profile_path = @profile_path");
      params.profile_path = input.profilePath;
    }
    if (input.status !== undefined) {
      assignments.push("status = @status");
      params.status = input.status;
    }

    db.prepare(
      `
      UPDATE runtime_profiles
      SET ${assignments.join(", ")}
      WHERE id = @id
      `
    ).run(params);

    const updated = this.getById(db, id);
    if (!updated) {
      throw new Error("Failed to update runtime profile");
    }
    return updated;
  }

  deleteById(db: DatabaseHandle, id: string): boolean {
    const result = db
      .prepare(
        `
        DELETE FROM runtime_profiles
        WHERE id = ?
        `
      )
      .run(id);

    return result.changes > 0;
  }

  private attachCapabilities(db: DatabaseHandle, rows: RuntimeProfileRow[]): RuntimeProfileView[] {
    if (rows.length === 0) {
      return [];
    }

    const profileIds = rows.map((row) => row.id);
    const placeholders = profileIds.map(() => "?").join(", ");
    const capabilityRows = db
      .prepare(
        `
        SELECT
          rpc.runtime_profile_id,
          rc.key AS capability_key,
          rc.label AS capability_label,
          rpc.strength
        FROM runtime_profile_capabilities rpc
        INNER JOIN runtime_capabilities rc ON rc.id = rpc.capability_id
        WHERE rpc.runtime_profile_id IN (${placeholders})
        `
      )
      .all(...profileIds) as RuntimeCapabilityRow[];

    const capabilityMap = new Map<string, RuntimeCapabilityView[]>();
    for (const row of capabilityRows) {
      const existing = capabilityMap.get(row.runtime_profile_id) ?? [];
      existing.push({
        key: row.capability_key,
        label: row.capability_label,
        strength: row.strength
      });
      capabilityMap.set(row.runtime_profile_id, existing);
    }

    return rows.map((row) => ({
      id: row.id,
      key: row.profile_name,
      provider: row.provider,
      accountPoolId: row.account_pool_id,
      profilePath: row.profile_path,
      status: row.status,
      isEnabled: toIsEnabled(row.status),
      capabilities: capabilityMap.get(row.id) ?? []
    }));
  }
}
