import fs from "node:fs";

import { withDatabase } from "./database.js";
import { getDbPath } from "./paths.js";

const REQUIRED_TABLES = [
  "_migrations",
  "workspaces",
  "bootstrap_state",
  "account_pools",
  "runtime_profiles",
  "runtime_capabilities",
  "runtime_profile_capabilities",
  "fatigue_snapshots",
  "routing_rules",
  "routing_rule_targets",
  "routing_decisions",
  "provider_probe_runs",
  "role_packs",
  "employees",
  "provider_probe_results"
] as const;

export type VerifyResult = {
  dbPath: string;
  missingTables: string[];
  rolePackCount: number;
  employeeCount: number;
  accountPoolCount: number;
  runtimeProfileCount: number;
  routingRuleCount: number;
};

const requireCondition = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const verifyDatabase = (dbPath = getDbPath()): VerifyResult => {
  requireCondition(fs.existsSync(dbPath), `Database file does not exist: ${dbPath}`);

  return withDatabase((db) => {
    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const tableSet = new Set(tableRows.map((row) => row.name));
    const missingTables = REQUIRED_TABLES.filter((tableName) => !tableSet.has(tableName));
    requireCondition(missingTables.length === 0, `Missing required tables: ${missingTables.join(", ")}`);

    const rolePackCountRow = db.prepare("SELECT COUNT(1) as count FROM role_packs").get() as { count: number };
    const employeeCountRow = db.prepare("SELECT COUNT(1) as count FROM employees").get() as { count: number };
    const accountPoolCountRow = db.prepare("SELECT COUNT(1) as count FROM account_pools").get() as {
      count: number;
    };
    const runtimeProfileCountRow = db.prepare("SELECT COUNT(1) as count FROM runtime_profiles").get() as {
      count: number;
    };
    const routingRuleCountRow = db.prepare("SELECT COUNT(1) as count FROM routing_rules").get() as {
      count: number;
    };
    requireCondition(rolePackCountRow.count >= 2, "Expected at least 2 role_packs seed rows");
    requireCondition(employeeCountRow.count >= 2, "Expected at least 2 employees seed rows");
    requireCondition(accountPoolCountRow.count >= 4, "Expected at least 4 account_pools seed rows");
    requireCondition(runtimeProfileCountRow.count >= 5, "Expected at least 5 runtime_profiles seed rows");
    requireCondition(routingRuleCountRow.count >= 2, "Expected at least 2 routing_rules seed rows");

    return {
      dbPath,
      missingTables,
      rolePackCount: rolePackCountRow.count,
      employeeCount: employeeCountRow.count,
      accountPoolCount: accountPoolCountRow.count,
      runtimeProfileCount: runtimeProfileCountRow.count,
      routingRuleCount: routingRuleCountRow.count
    };
  }, dbPath);
};
