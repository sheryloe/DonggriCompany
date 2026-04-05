import type {
  AgentId,
  AgentModelAssignmentView,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

type AgentModelAssignmentRow = {
  agent_id: AgentId;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string;
  runtime_profile_id: string;
  created_at: string;
  updated_at: string;
};

export type AgentModelAssignmentInput = {
  agentId: AgentId;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  runtimeProfileId: string;
};

const mapRow = (row: AgentModelAssignmentRow): AgentModelAssignmentView => {
  return {
    agentId: row.agent_id,
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    runtimeProfileId: row.runtime_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export class AgentModelAssignmentRepository {
  listAll(db: DatabaseHandle): AgentModelAssignmentView[] {
    const rows = db
      .prepare(
        `
        SELECT
          agent_id,
          provider,
          account_pool_id,
          runtime_profile_id,
          created_at,
          updated_at
        FROM agent_model_assignments
        ORDER BY agent_id ASC
        `
      )
      .all() as AgentModelAssignmentRow[];

    return rows.map(mapRow);
  }

  getByAgentId(db: DatabaseHandle, agentId: AgentId): AgentModelAssignmentView | null {
    const row = db
      .prepare(
        `
        SELECT
          agent_id,
          provider,
          account_pool_id,
          runtime_profile_id,
          created_at,
          updated_at
        FROM agent_model_assignments
        WHERE agent_id = ?
        LIMIT 1
        `
      )
      .get(agentId) as AgentModelAssignmentRow | undefined;

    return row ? mapRow(row) : null;
  }

  upsert(
    db: DatabaseHandle,
    input: AgentModelAssignmentInput,
    nowIso: string
  ): AgentModelAssignmentView {
    db.prepare(
      `
      INSERT INTO agent_model_assignments (
        agent_id,
        provider,
        account_pool_id,
        runtime_profile_id,
        created_at,
        updated_at
      )
      VALUES (
        @agent_id,
        @provider,
        @account_pool_id,
        @runtime_profile_id,
        @created_at,
        @updated_at
      )
      ON CONFLICT(agent_id) DO UPDATE SET
        provider = excluded.provider,
        account_pool_id = excluded.account_pool_id,
        runtime_profile_id = excluded.runtime_profile_id,
        updated_at = excluded.updated_at
      `
    ).run({
      agent_id: input.agentId,
      provider: input.provider,
      account_pool_id: input.accountPoolId,
      runtime_profile_id: input.runtimeProfileId,
      created_at: nowIso,
      updated_at: nowIso
    });

    const updated = this.getByAgentId(db, input.agentId);
    if (!updated) {
      throw new Error("Failed to upsert agent model assignment");
    }
    return updated;
  }
}
