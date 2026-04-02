import type { DatabaseHandle } from "../database.js";

export type RoutingRuleRecord = {
  id: string;
  key: string;
  label: string;
  taskType: string | null;
  roleKey: string | null;
  workspaceMode: string | null;
  priority: number;
  isEnabled: boolean;
  matchJson: Record<string, unknown>;
  targets: RoutingRuleTargetRecord[];
};

export type RoutingRuleTargetRecord = {
  id: string;
  runtimeProfileId: string;
  runtimeProfileKey: string;
  targetOrder: number;
  minConfidence: number;
  maxFatiguePercent: number | null;
  fallbackOnly: boolean;
};

type RoutingRuleRow = {
  id: string;
  key: string;
  label: string;
  task_type: string | null;
  role_key: string | null;
  workspace_mode: string | null;
  priority: number;
  is_enabled: number;
  match_json: string | null;
};

type RoutingRuleTargetRow = {
  id: string;
  routing_rule_id: string;
  runtime_profile_id: string;
  runtime_profile_key: string;
  target_order: number;
  min_confidence: number;
  max_fatigue_percent: number | null;
  fallback_only: number;
};

const parseMatchJson = (raw: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
};

export class RoutingRuleRepository {
  listEnabled(db: DatabaseHandle): RoutingRuleRecord[] {
    const ruleRows = db
      .prepare(
        `
        SELECT
          id,
          key,
          label,
          task_type,
          role_key,
          workspace_mode,
          priority,
          is_enabled,
          match_json
        FROM routing_rules
        WHERE is_enabled = 1
        ORDER BY priority ASC, key ASC
        `
      )
      .all() as RoutingRuleRow[];

    if (ruleRows.length === 0) {
      return [];
    }

    const ruleIds = ruleRows.map((row) => row.id);
    const placeholders = ruleIds.map(() => "?").join(", ");
    const targetRows = db
      .prepare(
        `
        SELECT
          t.id,
          t.routing_rule_id,
          t.runtime_profile_id,
          rp.profile_name AS runtime_profile_key,
          t.target_order,
          t.min_confidence,
          t.max_fatigue_percent,
          t.fallback_only
        FROM routing_rule_targets t
        INNER JOIN runtime_profiles rp ON rp.id = t.runtime_profile_id
        WHERE t.routing_rule_id IN (${placeholders})
        ORDER BY t.routing_rule_id ASC, t.target_order ASC
        `
      )
      .all(...ruleIds) as RoutingRuleTargetRow[];

    const targetMap = new Map<string, RoutingRuleTargetRecord[]>();
    for (const targetRow of targetRows) {
      const existing = targetMap.get(targetRow.routing_rule_id) ?? [];
      existing.push({
        id: targetRow.id,
        runtimeProfileId: targetRow.runtime_profile_id,
        runtimeProfileKey: targetRow.runtime_profile_key,
        targetOrder: targetRow.target_order,
        minConfidence: targetRow.min_confidence,
        maxFatiguePercent: targetRow.max_fatigue_percent,
        fallbackOnly: targetRow.fallback_only === 1
      });
      targetMap.set(targetRow.routing_rule_id, existing);
    }

    return ruleRows.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      taskType: row.task_type,
      roleKey: row.role_key,
      workspaceMode: row.workspace_mode,
      priority: row.priority,
      isEnabled: row.is_enabled === 1,
      matchJson: parseMatchJson(row.match_json),
      targets: targetMap.get(row.id) ?? []
    }));
  }
}
