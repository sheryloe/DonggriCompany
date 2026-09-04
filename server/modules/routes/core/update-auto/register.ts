import type { Request, Response } from "express";

import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import { PKG_VERSION, RELEASE_IDENTITY } from "../../../../config/runtime.ts";
import { isAuthenticated } from "../../../../security/auth.ts";
import { discoverGitHubReleaseIdentity } from "../../../release/github-release-discovery.ts";
import type { ReleaseComparison, ReleaseIdentity } from "../../../release/release-identity.ts";
import type { AutoUpdateChannel } from "../../update-auto-utils.ts";
import { parseAutoUpdateChannel } from "../../update-auto-policy.ts";
import { createAutoUpdateLock } from "../../update-auto-lock.ts";
import { createCommandCaptureTools } from "./command-capture.ts";
import {
  applyUpdateNow,
  type AutoUpdateRestartMode,
  type UpdateApplyResult,
  type UpdateStatusPayload,
} from "./apply-update.ts";

export type RuntimeDependencyReadiness = {
  ready: boolean;
  reason?: string;
};

export type RuntimeHealthOptions = {
  supervisorReadiness?: () => RuntimeDependencyReadiness;
  reconciliationReadiness?: () => RuntimeDependencyReadiness;
};

type RuntimeReadinessCheck = {
  ok: boolean;
  reason?: string;
};

const SAFE_READINESS_REASON_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SAFE_DEPENDENCY_READINESS_REASONS = {
  supervisor: new Set([
    "runner_supervisor_unbound",
    "runner_supervisor_boot_reconcile_pending",
    "runner_supervisor_boot_reconcile_failed",
    "runner_supervisor_child_state_uncertain",
    "runner_supervisor_shutting_down",
  ]),
  reconciliation: new Set([
    "boot_reconciliation_pending",
    "boot_reconciliation_failed",
    "runner_supervisor_boot_reconcile_pending",
    "runner_supervisor_boot_reconcile_failed",
  ]),
} satisfies Record<"supervisor" | "reconciliation", ReadonlySet<string>>;

type RequiredColumnContract = {
  type: "TEXT" | "INTEGER";
  notnull: 0 | 1;
  pk: 0 | 1 | 2;
  defaultValue: string | null;
};

const textColumn = (
  notnull: RequiredColumnContract["notnull"],
  pk: RequiredColumnContract["pk"] = 0,
): RequiredColumnContract => ({ type: "TEXT", notnull, pk, defaultValue: null });
const integerColumn = (
  notnull: RequiredColumnContract["notnull"],
  pk: RequiredColumnContract["pk"] = 0,
  defaultValue: string | null = null,
): RequiredColumnContract => ({ type: "INTEGER", notnull, pk, defaultValue });

const REQUIRED_CONTINUITY_COLUMNS = {
  continuity_checkpoints: {
    checkpoint_id: textColumn(0, 1),
    previous_checkpoint_id: textColumn(0),
    sequence: integerColumn(1),
    project_id: textColumn(1),
    task_id: textColumn(1),
    source_run_id: textColumn(1),
    source_provider: textColumn(1),
    source_account_label: textColumn(1),
    target_provider: textColumn(1),
    target_account_label: textColumn(1),
    status: textColumn(1),
    workspace_digest: textColumn(1),
    payload_json: textColumn(1),
    payload_sha256: textColumn(1),
    idempotency_key: textColumn(1),
    schema_version: integerColumn(1),
    captured_at: textColumn(1),
    created_at: textColumn(1),
  },
  continuity_runs: {
    run_id: textColumn(0, 1),
    project_id: textColumn(1),
    task_id: textColumn(1),
    checkpoint_id: textColumn(0),
    parent_run_id: textColumn(0),
    provider: textColumn(1),
    account_pool_id: textColumn(1),
    provider_native_session_id: textColumn(0),
    dispatch_id: textColumn(1),
    pid: integerColumn(0),
    process_started_at: textColumn(0),
    process_fingerprint: textColumn(0),
    owner_instance_id: textColumn(0),
    lease_expires_at: textColumn(0),
    status: textColumn(1),
    state_version: integerColumn(1, 0, "0"),
    heartbeat_at: textColumn(0),
    last_event_sequence: integerColumn(1, 0, "0"),
    created_at: textColumn(1),
    updated_at: textColumn(1),
  },
  continuity_run_events: {
    run_id: textColumn(1, 1),
    sequence: integerColumn(1, 2),
    event_type: textColumn(1),
    payload_json: textColumn(1),
    payload_sha256: textColumn(1),
    occurred_at: textColumn(1),
    created_at: textColumn(1),
  },
} as const satisfies Record<string, Record<string, RequiredColumnContract>>;

const REQUIRED_TABLE_SQL_FRAGMENTS = {
  continuity_checkpoints: [
    "checkpoint_id text primary key",
    "sequence integer not null check(sequence>0)",
    "source_provider text not null check(source_provider in('codex','claude'))",
    "target_provider text not null check(target_provider in('codex','claude'))",
    "status text not null check(status in('ready_for_transfer','target_validating','approval_required','accepted','resuming','running','completed','checkpoint_conflict','provider_unavailable','auth_required','dispatch_uncertain','stale','failed','canceled'))",
    "workspace_digest text not null check(length(workspace_digest)=64)",
    "payload_sha256 text not null check(length(payload_sha256)=64)",
    "idempotency_key text not null unique",
    "schema_version integer not null check(schema_version=1)",
    "unique(task_id,sequence)",
    "foreign key(previous_checkpoint_id) references continuity_checkpoints(checkpoint_id)",
  ],
  continuity_runs: [
    "run_id text primary key",
    "project_id text not null check(length(trim(project_id))>0)",
    "task_id text not null check(length(trim(task_id))>0)",
    "checkpoint_id text references continuity_checkpoints(checkpoint_id) on delete restrict",
    "parent_run_id text references continuity_runs(run_id) on delete restrict",
    "provider text not null check(provider in('codex','claude'))",
    "account_pool_id text not null check(length(trim(account_pool_id))>0)",
    "dispatch_id text not null unique check(length(trim(dispatch_id))>0)",
    "pid integer check(pid is null or pid>0)",
    "process_fingerprint text check(process_fingerprint is null or length(process_fingerprint)=64)",
    "owner_instance_id text check(owner_instance_id is null or length(trim(owner_instance_id))>0)",
    "status text not null check(status in('reserved','starting','running','pause_requested','paused','dispatch_uncertain','stale','completed','failed','canceled'))",
    "state_version integer not null default 0 check(state_version>=0)",
    "last_event_sequence integer not null default 0 check(last_event_sequence>=0)",
  ],
  continuity_run_events: [
    "run_id text not null references continuity_runs(run_id) on delete restrict",
    "sequence integer not null check(sequence>0)",
    "event_type text not null check(length(trim(event_type))>0)",
    "payload_json text not null check(json_valid(payload_json))",
    "payload_sha256 text not null check(length(payload_sha256)=64)",
    "primary key(run_id,sequence)",
  ],
} as const;

type RequiredIndexContract = {
  table: keyof typeof REQUIRED_CONTINUITY_COLUMNS;
  unique: boolean;
  partial?: boolean;
  columns: ReadonlyArray<{ name: string; desc?: boolean }>;
  sqlFragments?: readonly string[];
};

const REQUIRED_INDEX_CONTRACTS: Record<string, RequiredIndexContract> = {
  idx_continuity_checkpoints_task_sequence: {
    table: "continuity_checkpoints",
    unique: false,
    columns: [{ name: "task_id" }, { name: "sequence", desc: true }],
  },
  idx_continuity_checkpoints_project_created: {
    table: "continuity_checkpoints",
    unique: false,
    columns: [{ name: "project_id" }, { name: "created_at", desc: true }],
  },
  idx_continuity_checkpoints_status_created: {
    table: "continuity_checkpoints",
    unique: false,
    columns: [{ name: "status" }, { name: "created_at", desc: true }],
  },
  uq_continuity_runs_dispatch: {
    table: "continuity_runs",
    unique: true,
    columns: [{ name: "dispatch_id" }],
  },
  uq_continuity_runs_active_root_owner: {
    table: "continuity_runs",
    unique: true,
    partial: true,
    columns: [{ name: "project_id" }, { name: "task_id" }],
    sqlFragments: [
      "create unique index uq_continuity_runs_active_root_owner on continuity_runs(project_id,task_id)",
      "where parent_run_id is null and status in('reserved','starting','running','pause_requested','paused','dispatch_uncertain','stale')",
    ],
  },
  idx_continuity_runs_checkpoint_created: {
    table: "continuity_runs",
    unique: false,
    columns: [{ name: "checkpoint_id" }, { name: "created_at", desc: true }],
  },
  idx_continuity_runs_task_created: {
    table: "continuity_runs",
    unique: false,
    columns: [{ name: "project_id" }, { name: "task_id" }, { name: "created_at", desc: true }],
  },
  idx_continuity_runs_parent_created: {
    table: "continuity_runs",
    unique: false,
    columns: [{ name: "parent_run_id" }, { name: "created_at", desc: true }],
  },
  idx_continuity_runs_status_heartbeat: {
    table: "continuity_runs",
    unique: false,
    columns: [{ name: "status" }, { name: "heartbeat_at" }],
  },
  idx_continuity_runs_owner_lease: {
    table: "continuity_runs",
    unique: false,
    columns: [{ name: "owner_instance_id" }, { name: "lease_expires_at" }],
  },
  idx_continuity_run_events_cursor: {
    table: "continuity_run_events",
    unique: false,
    columns: [{ name: "run_id" }, { name: "sequence" }],
  },
};

const REQUIRED_UNIQUE_CONTRACTS = [
  { table: "continuity_checkpoints", columns: ["idempotency_key"] },
  { table: "continuity_checkpoints", columns: ["task_id", "sequence"] },
  { table: "continuity_runs", columns: ["dispatch_id"] },
  { table: "continuity_run_events", columns: ["run_id", "sequence"] },
] as const;

const REQUIRED_FOREIGN_KEYS = [
  {
    table: "continuity_checkpoints",
    from: "previous_checkpoint_id",
    parentTable: "continuity_checkpoints",
    to: "checkpoint_id",
    onDelete: "NO ACTION",
  },
  {
    table: "continuity_runs",
    from: "checkpoint_id",
    parentTable: "continuity_checkpoints",
    to: "checkpoint_id",
    onDelete: "RESTRICT",
  },
  {
    table: "continuity_runs",
    from: "parent_run_id",
    parentTable: "continuity_runs",
    to: "run_id",
    onDelete: "RESTRICT",
  },
  {
    table: "continuity_run_events",
    from: "run_id",
    parentTable: "continuity_runs",
    to: "run_id",
    onDelete: "RESTRICT",
  },
] as const;

type RequiredTriggerContract = {
  table: keyof typeof REQUIRED_CONTINUITY_COLUMNS;
  fragments: readonly string[];
};

const REQUIRED_TRIGGER_CONTRACTS: Record<string, RequiredTriggerContract> = {
  continuity_checkpoints_no_update: {
    table: "continuity_checkpoints",
    fragments: ["before update on continuity_checkpoints", "select raise(abort,'continuity_checkpoints_append_only')"],
  },
  continuity_checkpoints_no_delete: {
    table: "continuity_checkpoints",
    fragments: ["before delete on continuity_checkpoints", "select raise(abort,'continuity_checkpoints_append_only')"],
  },
  continuity_runs_no_delete: {
    table: "continuity_runs",
    fragments: ["before delete on continuity_runs", "select raise(abort,'continuity_runs_persistent')"],
  },
  continuity_runs_state_version_guard: {
    table: "continuity_runs",
    fragments: [
      "before update of status on continuity_runs",
      "when new.status<>old.status and new.state_version<>old.state_version+1",
      "select raise(abort,'continuity_run_state_version_required')",
    ],
  },
  continuity_run_events_next_sequence: {
    table: "continuity_run_events",
    fragments: [
      "before insert on continuity_run_events",
      "not exists(select 1 from continuity_runs where run_id=new.run_id)",
      "then raise(abort,'continuity_run_missing')",
      "new.sequence<>(select last_event_sequence+1 from continuity_runs where run_id=new.run_id)",
      "then raise(abort,'continuity_run_event_sequence_non_monotonic')",
    ],
  },
  continuity_run_events_advance_cursor: {
    table: "continuity_run_events",
    fragments: [
      "after insert on continuity_run_events",
      "update continuity_runs set last_event_sequence=new.sequence,updated_at=new.occurred_at where run_id=new.run_id",
    ],
  },
  continuity_run_events_no_update: {
    table: "continuity_run_events",
    fragments: ["before update on continuity_run_events", "select raise(abort,'continuity_run_events_append_only')"],
  },
  continuity_run_events_no_delete: {
    table: "continuity_run_events",
    fragments: ["before delete on continuity_run_events", "select raise(abort,'continuity_run_events_append_only')"],
  },
};

function normalizeSchemaSql(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/["`[\]]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=<>+])\s*/g, "$1")
    .trim()
    .toLowerCase();
}

function readSchemaObject(
  db: RuntimeContext["db"],
  type: "table" | "index" | "trigger",
  name: string,
): { tableName: string; sql: string } | null {
  const row = db.prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = ? AND name = ?").get(type, name) as
    | { tbl_name?: unknown; sql?: unknown }
    | undefined;
  if (!row?.sql) return null;
  return { tableName: String(row.tbl_name ?? ""), sql: normalizeSchemaSql(row.sql) };
}

function readIndexColumns(db: RuntimeContext["db"], indexName: string): Array<{ name: string; desc: boolean }> {
  const quotedIndexName = `'${indexName.replaceAll("'", "''")}'`;
  return (
    db.prepare(`PRAGMA index_xinfo(${quotedIndexName})`).all() as Array<{
      seqno?: unknown;
      name?: unknown;
      desc?: unknown;
      key?: unknown;
    }>
  )
    .filter((row) => Number(row.key) === 1)
    .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    .map((row) => ({ name: String(row.name ?? ""), desc: Number(row.desc) === 1 }));
}

function indexColumnsMatch(
  actual: ReadonlyArray<{ name: string; desc: boolean }>,
  expected: ReadonlyArray<{ name: string; desc?: boolean }>,
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (column, index) => column.name === expected[index]?.name && column.desc === Boolean(expected[index]?.desc),
    )
  );
}

function hasUniqueColumns(db: RuntimeContext["db"], tableName: string, expectedColumns: readonly string[]): boolean {
  const indexes = db.prepare(`PRAGMA index_list(${tableName})`).all() as Array<{
    name?: unknown;
    unique?: unknown;
    partial?: unknown;
  }>;
  return indexes.some((index) => {
    if (Number(index.unique) !== 1 || Number(index.partial) !== 0) return false;
    const name = String(index.name ?? "");
    if (!name) return false;
    return indexColumnsMatch(
      readIndexColumns(db, name),
      expectedColumns.map((column) => ({ name: column })),
    );
  });
}

function validateContinuitySchemaContracts(db: RuntimeContext["db"]): RuntimeReadinessCheck {
  for (const [tableName, fragments] of Object.entries(REQUIRED_TABLE_SQL_FRAGMENTS)) {
    const schema = readSchemaObject(db, "table", tableName);
    const missingFragmentIndex = schema
      ? fragments.findIndex((fragment) => !schema.sql.includes(normalizeSchemaSql(fragment)))
      : 0;
    if (!schema || missingFragmentIndex >= 0) {
      return {
        ok: false,
        reason: `continuity_schema_contract_invalid:${tableName}:${missingFragmentIndex}`,
      };
    }
  }

  for (const contract of REQUIRED_UNIQUE_CONTRACTS) {
    if (!hasUniqueColumns(db, contract.table, contract.columns)) {
      return {
        ok: false,
        reason: `continuity_schema_unique_missing:${contract.table}:${contract.columns.join(",")}`,
      };
    }
  }

  for (const [indexName, contract] of Object.entries(REQUIRED_INDEX_CONTRACTS)) {
    const index = (
      db.prepare(`PRAGMA index_list(${contract.table})`).all() as Array<{
        name?: unknown;
        unique?: unknown;
        partial?: unknown;
      }>
    ).find((candidate) => String(candidate.name ?? "") === indexName);
    if (
      !index ||
      Number(index.unique) !== Number(contract.unique) ||
      Number(index.partial) !== Number(Boolean(contract.partial)) ||
      !indexColumnsMatch(readIndexColumns(db, indexName), contract.columns)
    ) {
      return { ok: false, reason: `continuity_schema_index_invalid:${indexName}` };
    }
    if (contract.sqlFragments) {
      const schema = readSchemaObject(db, "index", indexName);
      if (
        !schema ||
        schema.tableName !== contract.table ||
        contract.sqlFragments.some((fragment) => !schema.sql.includes(normalizeSchemaSql(fragment)))
      ) {
        return { ok: false, reason: `continuity_schema_index_invalid:${indexName}` };
      }
    }
  }

  for (const contract of REQUIRED_FOREIGN_KEYS) {
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${contract.table})`).all() as Array<{
      table?: unknown;
      from?: unknown;
      to?: unknown;
      on_delete?: unknown;
    }>;
    const matches = foreignKeys.some(
      (foreignKey) =>
        String(foreignKey.table ?? "") === contract.parentTable &&
        String(foreignKey.from ?? "") === contract.from &&
        String(foreignKey.to ?? "") === contract.to &&
        String(foreignKey.on_delete ?? "").toUpperCase() === contract.onDelete,
    );
    if (!matches) {
      return {
        ok: false,
        reason: `continuity_schema_foreign_key_missing:${contract.table}:${contract.from}`,
      };
    }
  }

  for (const [triggerName, contract] of Object.entries(REQUIRED_TRIGGER_CONTRACTS)) {
    const trigger = readSchemaObject(db, "trigger", triggerName);
    if (
      !trigger ||
      trigger.tableName !== contract.table ||
      contract.fragments.some((fragment) => !trigger.sql.includes(normalizeSchemaSql(fragment)))
    ) {
      return { ok: false, reason: `continuity_schema_trigger_invalid:${triggerName}` };
    }
  }

  return { ok: true };
}

function readDependencyReadiness(
  dependency: "supervisor" | "reconciliation",
  probe: (() => RuntimeDependencyReadiness) | undefined,
): RuntimeReadinessCheck {
  if (!probe) return { ok: false, reason: `${dependency}_readiness_unbound` };

  try {
    const result = probe();
    if (!result || typeof result.ready !== "boolean") {
      return { ok: false, reason: `${dependency}_readiness_invalid` };
    }
    if (result.ready) {
      return result.reason == null ? { ok: true } : { ok: false, reason: `${dependency}_readiness_invalid` };
    }

    const reason = result.reason;
    if (
      typeof reason !== "string" ||
      !SAFE_READINESS_REASON_CODE.test(reason) ||
      !SAFE_DEPENDENCY_READINESS_REASONS[dependency].has(reason)
    ) {
      return { ok: false, reason: `${dependency}_readiness_invalid` };
    }
    return { ok: false, reason };
  } catch {
    return { ok: false, reason: `${dependency}_readiness_probe_failed` };
  }
}

export function evaluateDatabaseReadiness(db: RuntimeContext["db"]): RuntimeReadinessCheck {
  try {
    const quickCheckRows = db.prepare("PRAGMA quick_check(1)").all() as Array<Record<string, unknown>>;
    const quickCheckValues = quickCheckRows.flatMap((row) => Object.values(row));
    if (quickCheckValues.length !== 1 || String(quickCheckValues[0]).toLowerCase() !== "ok") {
      return { ok: false, reason: "database_integrity_check_failed" };
    }

    const queryOnlyState = db.prepare("PRAGMA query_only").get() as { query_only?: unknown } | undefined;
    if (Number(queryOnlyState?.query_only) !== 0) {
      return { ok: false, reason: "database_query_only_enabled" };
    }

    const foreignKeyState = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: unknown } | undefined;
    if (Number(foreignKeyState?.foreign_keys) !== 1) {
      return { ok: false, reason: "database_foreign_keys_disabled" };
    }

    if (db.prepare("PRAGMA foreign_key_check").get()) {
      return { ok: false, reason: "database_foreign_key_violation" };
    }

    for (const [tableName, requiredColumns] of Object.entries(REQUIRED_CONTINUITY_COLUMNS)) {
      const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name?: unknown;
        type?: unknown;
        notnull?: unknown;
        dflt_value?: unknown;
        pk?: unknown;
      }>;
      if (rows.length === 0) return { ok: false, reason: `continuity_schema_missing:${tableName}` };

      const actualColumns = new Map(rows.map((row) => [String(row.name ?? ""), row]));
      const requiredEntries = Object.entries(requiredColumns) as Array<[string, RequiredColumnContract]>;
      const missingColumns = requiredEntries.map(([column]) => column).filter((column) => !actualColumns.has(column));
      if (missingColumns.length > 0) {
        return {
          ok: false,
          reason: `continuity_schema_columns_missing:${tableName}:${missingColumns.join(",")}`,
        };
      }

      for (const [columnName, required] of requiredEntries) {
        const actual = actualColumns.get(columnName);
        const actualDefault = actual?.dflt_value == null ? null : String(actual.dflt_value).trim();
        const mismatch =
          String(actual?.type ?? "")
            .trim()
            .toUpperCase() !== required.type
            ? "type"
            : Number(actual?.notnull) !== required.notnull
              ? "notnull"
              : Number(actual?.pk) !== required.pk
                ? "pk"
                : actualDefault !== required.defaultValue
                  ? "default"
                  : null;
        if (mismatch) {
          return {
            ok: false,
            reason: `continuity_schema_column_contract_invalid:${tableName}:${columnName}:${mismatch}`,
          };
        }
      }
    }

    const schemaContracts = validateContinuitySchemaContracts(db);
    if (!schemaContracts.ok) return schemaContracts;

    return { ok: true };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

export function evaluateRuntimeReadiness(
  db: RuntimeContext["db"],
  options: RuntimeHealthOptions = {},
): {
  ok: boolean;
  status: "ready" | "not_ready";
  checks: {
    database: RuntimeReadinessCheck;
    supervisor: RuntimeReadinessCheck;
    reconciliation: RuntimeReadinessCheck;
  };
} {
  const database = evaluateDatabaseReadiness(db);
  const supervisor = readDependencyReadiness("supervisor", options.supervisorReadiness);
  const reconciliation = readDependencyReadiness("reconciliation", options.reconciliationReadiness);
  const ok = database.ok && supervisor.ok && reconciliation.ok;

  return {
    ok,
    status: ok ? "ready" : "not_ready",
    checks: { database, supervisor, reconciliation },
  };
}

export function registerUpdateAutoRoutes(ctx: RuntimeContext, healthOptions: RuntimeHealthOptions = {}): void {
  const __ctx: RuntimeContext = ctx;
  const app = __ctx.app;
  const db = __ctx.db;
  const appendTaskLog = __ctx.appendTaskLog;
  const activeProcesses = __ctx.activeProcesses;
  const notifyCeo = __ctx.notifyCeo;
  const readSettingString = __ctx.readSettingString;
  const killPidTree = __ctx.killPidTree;

  const UPDATE_CHECK_ENABLED = String(process.env.UPDATE_CHECK_ENABLED ?? "1").trim() !== "0";
  const UPDATE_CHECK_REPO = String(process.env.UPDATE_CHECK_REPO ?? RELEASE_IDENTITY.source_repository).trim();
  const UPDATE_CHECK_TTL_MS = Math.max(
    60_000,
    Number(process.env.UPDATE_CHECK_TTL_MS ?? 30 * 60 * 1000) || 30 * 60 * 1000,
  );
  const UPDATE_CHECK_TIMEOUT_MS = Math.max(1_000, Number(process.env.UPDATE_CHECK_TIMEOUT_MS ?? 4_000) || 4_000);

  let updateStatusCache: UpdateStatusPayload | null = null;
  let updateStatusCachedAt = 0;
  let updateStatusInFlight: Promise<UpdateStatusPayload> | null = null;

  const AUTO_UPDATE_DEFAULT_ENABLED = String(process.env.AUTO_UPDATE_ENABLED ?? "0").trim() === "1";
  const AUTO_UPDATE_ENABLED_SETTING_KEY = "autoUpdateEnabled";
  const parsedAutoUpdateChannel = parseAutoUpdateChannel(process.env.AUTO_UPDATE_CHANNEL);
  const AUTO_UPDATE_CHANNEL = parsedAutoUpdateChannel.channel;
  if (parsedAutoUpdateChannel.warning) {
    console.warn(`[auto-update] ${parsedAutoUpdateChannel.warning}`);
  }
  const AUTO_UPDATE_IDLE_ONLY = String(process.env.AUTO_UPDATE_IDLE_ONLY ?? "1").trim() !== "0";
  const AUTO_UPDATE_CHECK_INTERVAL_MS = Math.max(
    60_000,
    Number(process.env.AUTO_UPDATE_CHECK_INTERVAL_MS ?? UPDATE_CHECK_TTL_MS) || UPDATE_CHECK_TTL_MS,
  );
  // Delay before first automatic update check after startup (AUTO_UPDATE_INITIAL_DELAY_MS, default/minimum 60s).
  const AUTO_UPDATE_INITIAL_DELAY_MS = Math.max(
    60_000,
    Number(process.env.AUTO_UPDATE_INITIAL_DELAY_MS ?? 60_000) || 60_000,
  );
  const AUTO_UPDATE_TARGET_BRANCH = String(process.env.AUTO_UPDATE_TARGET_BRANCH ?? "main").trim() || "main";
  const AUTO_UPDATE_RESTART_MODE = (() => {
    const raw = String(process.env.AUTO_UPDATE_RESTART_MODE ?? "notify")
      .trim()
      .toLowerCase();
    if (raw === "exit" || raw === "command") return raw as AutoUpdateRestartMode;
    return "notify";
  })();
  const AUTO_UPDATE_RESTART_COMMAND = String(process.env.AUTO_UPDATE_RESTART_COMMAND ?? "").trim();
  const AUTO_UPDATE_EXIT_DELAY_MS = Math.max(1_200, Number(process.env.AUTO_UPDATE_EXIT_DELAY_MS ?? 10_000) || 10_000);
  const AUTO_UPDATE_TOTAL_TIMEOUT_MS = Math.max(
    60_000,
    Number(process.env.AUTO_UPDATE_TOTAL_TIMEOUT_MS ?? 900_000) || 900_000,
  );

  const updateCommandTimeoutMs = {
    // AUTO_UPDATE_GIT_FETCH_TIMEOUT_MS / AUTO_UPDATE_GIT_PULL_TIMEOUT_MS / AUTO_UPDATE_INSTALL_TIMEOUT_MS
    gitFetch: Math.max(10_000, Number(process.env.AUTO_UPDATE_GIT_FETCH_TIMEOUT_MS ?? 120_000) || 120_000),
    gitPull: Math.max(10_000, Number(process.env.AUTO_UPDATE_GIT_PULL_TIMEOUT_MS ?? 180_000) || 180_000),
    pnpmInstall: Math.max(20_000, Number(process.env.AUTO_UPDATE_INSTALL_TIMEOUT_MS ?? 300_000) || 300_000),
  };

  let autoUpdateActive = AUTO_UPDATE_DEFAULT_ENABLED;
  let autoUpdateSchedulerReady = false;
  const autoUpdateState: {
    running: boolean;
    last_checked_at: number | null;
    last_result: UpdateApplyResult | null;
    last_error: string | null;
    last_runtime_error: string | null;
    next_check_at: number | null;
  } = {
    running: false,
    last_checked_at: null,
    last_result: null,
    last_error: null,
    last_runtime_error: null,
    next_check_at: null,
  };

  let autoUpdateInFlight: Promise<unknown> | null = null;
  const autoUpdateLock = createAutoUpdateLock();
  let autoUpdateBootTimer: ReturnType<typeof setTimeout> | null = null;
  let autoUpdateInterval: ReturnType<typeof setInterval> | null = null;
  let autoUpdateExitTimer: ReturnType<typeof setTimeout> | null = null;

  const { runCommandCaptureSync, runCommandCapture } = createCommandCaptureTools({ killPidTree });

  function stopAutoUpdateTimers(): void {
    if (autoUpdateBootTimer) {
      clearTimeout(autoUpdateBootTimer);
      autoUpdateBootTimer = null;
    }
    if (autoUpdateInterval) {
      clearInterval(autoUpdateInterval);
      autoUpdateInterval = null;
    }
    if (autoUpdateExitTimer) {
      clearTimeout(autoUpdateExitTimer);
      autoUpdateExitTimer = null;
    }
  }

  function maybeUnrefTimer(timer: { unref?: () => void } | null): void {
    timer?.unref?.();
  }

  function tryAcquireAutoUpdateLock(): boolean {
    return autoUpdateLock.tryAcquire();
  }

  function releaseAutoUpdateLock(): void {
    autoUpdateLock.release();
  }

  function getInProgressTaskCount(): number {
    try {
      const row = db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'in_progress'").get() as
        | { cnt?: number }
        | undefined;
      return Number(row?.cnt ?? 0);
    } catch {
      return 0;
    }
  }

  function validateAutoUpdateDependencies(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const cmd of ["git", "pnpm"]) {
      const check = runCommandCaptureSync(cmd, ["--version"], 5_000);
      if (!check.ok) missing.push(cmd);
    }
    return { ok: missing.length === 0, missing };
  }

  function logAutoUpdate(message: string): void {
    try {
      appendTaskLog(null, "system", `[auto-update] ${message}`);
    } catch {
      // ignore log failures
    }
  }

  function parseUpdateBooleanFlag(body: any, key: string): boolean {
    const raw = body?.[key];
    if (raw === true || raw === false) return raw;

    const value = String(raw ?? "").trim();
    if (!value || value === "0") return false;
    if (value === "1") return true;

    logAutoUpdate(
      `warning: invalid boolean value for "${key}" in /api/update-apply: ${JSON.stringify(raw)}; treating as false`,
    );
    return false;
  }

  function parseStoredBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw == null) return fallback;
    const value = String(raw).trim().toLowerCase();
    if (!value) return fallback;
    if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
    if (value === "0" || value === "false" || value === "no" || value === "off") return false;
    return fallback;
  }

  function readAutoUpdateEnabledSetting(): boolean {
    return parseStoredBoolean(readSettingString(AUTO_UPDATE_ENABLED_SETTING_KEY), AUTO_UPDATE_DEFAULT_ENABLED);
  }

  function writeAutoUpdateEnabledSetting(enabled: boolean): void {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(AUTO_UPDATE_ENABLED_SETTING_KEY, enabled ? "true" : "false");
  }

  function refreshAutoUpdateActiveState(): boolean {
    autoUpdateActive = readAutoUpdateEnabledSetting();
    return autoUpdateActive;
  }

  function isLikelyManagedRuntime(): boolean {
    return Boolean(
      process.env.pm_id ||
      process.env.PM2_HOME ||
      process.env.INVOCATION_ID ||
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.CONTAINER ||
      process.env.DOCKER_CONTAINER,
    );
  }

  async function fetchUpdateStatus(forceRefresh = false): Promise<UpdateStatusPayload> {
    const now = Date.now();
    if (!UPDATE_CHECK_ENABLED) {
      return {
        current_version: PKG_VERSION,
        latest_version: null,
        latest_revision: null,
        update_available: false,
        comparison_state: "disabled",
        auto_apply_allowed: false,
        current_release_identity: RELEASE_IDENTITY,
        latest_release_identity: null,
        release_url: null,
        checked_at: now,
        enabled: false,
        repo: UPDATE_CHECK_REPO,
        error: null,
      };
    }

    const cacheValid = updateStatusCache && now - updateStatusCachedAt < UPDATE_CHECK_TTL_MS;
    if (!forceRefresh && cacheValid && updateStatusCache) return updateStatusCache;
    if (!forceRefresh && updateStatusInFlight) return updateStatusInFlight;

    updateStatusInFlight = (async () => {
      let latestVersion: string | null = null;
      let latestRevision: string | null = null;
      let latestReleaseIdentity: ReleaseIdentity | null = null;
      let releaseUrl: string | null = null;
      let error: string | null = null;
      let comparison: ReleaseComparison = {
        state: "invalid_remote",
        update_available: false,
        auto_apply_allowed: false,
        reason: "release_identity_not_loaded",
      };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
        try {
          const discovered = await discoverGitHubReleaseIdentity({
            repository: UPDATE_CHECK_REPO,
            localIdentity: RELEASE_IDENTITY,
            signal: controller.signal,
          });
          latestReleaseIdentity = discovered.identity;
          latestVersion = latestReleaseIdentity.product_version;
          latestRevision = latestReleaseIdentity.target_revision;
          releaseUrl = discovered.release_url;
          comparison = discovered.comparison;
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      const next = {
        current_version: PKG_VERSION,
        latest_version: latestVersion,
        latest_revision: latestRevision,
        update_available: comparison.update_available,
        comparison_state: comparison.state,
        auto_apply_allowed: comparison.auto_apply_allowed,
        current_release_identity: RELEASE_IDENTITY,
        latest_release_identity: latestReleaseIdentity,
        release_url: releaseUrl,
        checked_at: Date.now(),
        enabled: true,
        repo: UPDATE_CHECK_REPO,
        error,
      };
      updateStatusCache = next;
      updateStatusCachedAt = Date.now();
      return next;
    })().finally(() => {
      updateStatusInFlight = null;
    });

    return updateStatusInFlight;
  }

  const scheduleExit = (delayMs: number) => {
    if (autoUpdateExitTimer) clearTimeout(autoUpdateExitTimer);
    autoUpdateExitTimer = setTimeout(() => {
      logAutoUpdate("auto-update initiating graceful shutdown (mode=exit); shutdown handlers should listen to SIGTERM");
      process.exitCode = 0;
      let gracefulDelayMs = 0;
      if (process.listenerCount("SIGTERM") > 0) {
        try {
          process.kill(process.pid, "SIGTERM");
          gracefulDelayMs = 1500;
        } catch {
          // ignore and fallback to hard exit below
        }
      }
      setTimeout(() => process.exit(0), gracefulDelayMs);
    }, delayMs);
    maybeUnrefTimer(autoUpdateExitTimer);
  };

  async function runAutoUpdateCycle(): Promise<void> {
    if (!autoUpdateSchedulerReady) return;
    refreshAutoUpdateActiveState();
    if (!autoUpdateActive) {
      autoUpdateState.next_check_at = Date.now() + AUTO_UPDATE_CHECK_INTERVAL_MS;
      return;
    }
    if (autoUpdateInFlight) return;
    if (!tryAcquireAutoUpdateLock()) return;

    autoUpdateInFlight = (async () => {
      autoUpdateState.running = true;
      const now = Date.now();
      autoUpdateState.last_checked_at = now;
      autoUpdateState.next_check_at = now + AUTO_UPDATE_CHECK_INTERVAL_MS;
      autoUpdateState.last_runtime_error = null;
      logAutoUpdate("auto check started");

      try {
        const result = await applyUpdateNow(
          {
            AUTO_UPDATE_CHANNEL,
            AUTO_UPDATE_IDLE_ONLY,
            AUTO_UPDATE_TARGET_BRANCH,
            AUTO_UPDATE_RESTART_MODE,
            AUTO_UPDATE_RESTART_COMMAND,
            AUTO_UPDATE_EXIT_DELAY_MS,
            AUTO_UPDATE_TOTAL_TIMEOUT_MS,
            updateCommandTimeoutMs,
            activeProcesses,
            getInProgressTaskCount,
            fetchUpdateStatus,
            runCommandCapture,
            logAutoUpdate,
            notifyCeo,
            scheduleExit,
          },
          { trigger: "auto", dryRun: false },
        );
        autoUpdateState.last_result = result;
        autoUpdateState.last_error = result.error;
      } catch (err) {
        autoUpdateState.last_runtime_error = err instanceof Error ? err.message : String(err);
        logAutoUpdate(`auto check runtime error (${autoUpdateState.last_runtime_error})`);
      } finally {
        autoUpdateState.running = false;
        autoUpdateInFlight = null;
        releaseAutoUpdateLock();
      }
    })();

    await autoUpdateInFlight;
  }

  const buildLivenessPayload = () => ({
    ok: true,
    status: "alive" as const,
    version: PKG_VERSION,
    release_identity: RELEASE_IDENTITY,
    app: "Dongri-grigri",
  });

  const buildReadinessPayload = () => ({
    ...evaluateRuntimeReadiness(db, healthOptions),
    version: PKG_VERSION,
    release_identity: RELEASE_IDENTITY,
    app: "Dongri-grigri",
  });

  const buildHealthPayload = () => {
    const readiness = buildReadinessPayload();
    return {
      ok: readiness.ok,
      alive: true,
      ready: readiness.ok,
      status: readiness.status,
      version: PKG_VERSION,
      release_identity: RELEASE_IDENTITY,
      app: "Dongri-grigri",
      checks: readiness.checks,
    };
  };

  {
    const dep = validateAutoUpdateDependencies();
    if (!dep.ok) {
      autoUpdateSchedulerReady = false;
      autoUpdateActive = false;
      autoUpdateState.last_error = `missing_dependencies:${dep.missing.join(",")}`;
      logAutoUpdate(`disabled - missing dependencies (${dep.missing.join(",")})`);
    } else {
      autoUpdateSchedulerReady = true;
      refreshAutoUpdateActiveState();
      autoUpdateState.next_check_at = Date.now() + AUTO_UPDATE_INITIAL_DELAY_MS;
      logAutoUpdate(
        `scheduler ready (enabled=${autoUpdateActive ? "1" : "0"}, first_check_in_ms=${AUTO_UPDATE_INITIAL_DELAY_MS}, interval_ms=${AUTO_UPDATE_CHECK_INTERVAL_MS})`,
      );
      if (AUTO_UPDATE_RESTART_MODE === "exit" && !isLikelyManagedRuntime()) {
        logAutoUpdate(
          "warning: restart_mode=exit is enabled but no process manager was detected; process may stop after update",
        );
      }

      autoUpdateBootTimer = setTimeout(() => {
        void runAutoUpdateCycle();
      }, AUTO_UPDATE_INITIAL_DELAY_MS);
      maybeUnrefTimer(autoUpdateBootTimer);

      autoUpdateInterval = setInterval(() => {
        void runAutoUpdateCycle();
      }, AUTO_UPDATE_CHECK_INTERVAL_MS);
      maybeUnrefTimer(autoUpdateInterval);

      process.once("SIGTERM", stopAutoUpdateTimers);
      process.once("SIGINT", stopAutoUpdateTimers);
      process.once("beforeExit", stopAutoUpdateTimers);
    }
  }

  app.get("/livez", (_req, res) => res.json(buildLivenessPayload()));
  app.get("/readyz", (_req, res) => {
    const payload = buildReadinessPayload();
    return res.status(payload.ok ? 200 : 503).json(payload);
  });
  const sendHealth = (_req: Request, res: Response) => {
    const payload = buildHealthPayload();
    return res.status(payload.ready ? 200 : 503).json(payload);
  };
  app.get("/health", sendHealth);
  app.get("/healthz", sendHealth);
  app.get("/api/health", sendHealth);
  app.get("/api/update-status", async (req, res) => {
    const refresh = String(req.query?.refresh ?? "").trim() === "1";
    const status = await fetchUpdateStatus(refresh);
    res.json({ ok: true, ...status });
  });

  app.get("/api/update-auto-status", async (req, res) => {
    // This endpoint is also protected by global /api auth middleware.
    // Keep an explicit guard here because it exposes operational update state.
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const settingsEnabled = readAutoUpdateEnabledSetting();
    autoUpdateActive = autoUpdateSchedulerReady ? settingsEnabled : false;
    const status = await fetchUpdateStatus(false);
    res.json({
      ok: true,
      auto_update: {
        enabled: autoUpdateActive,
        configured_enabled: AUTO_UPDATE_DEFAULT_ENABLED,
        settings_enabled: settingsEnabled,
        scheduler_ready: autoUpdateSchedulerReady,
        channel: AUTO_UPDATE_CHANNEL as AutoUpdateChannel,
        idle_only: AUTO_UPDATE_IDLE_ONLY,
        interval_ms: AUTO_UPDATE_CHECK_INTERVAL_MS,
        restart_mode: AUTO_UPDATE_RESTART_MODE as AutoUpdateRestartMode,
        restart_command_configured: Boolean(AUTO_UPDATE_RESTART_COMMAND),
      },
      runtime: {
        running: autoUpdateState.running,
        lock_held: autoUpdateLock.isHeld(),
        last_checked_at: autoUpdateState.last_checked_at,
        last_result: autoUpdateState.last_result,
        last_error: autoUpdateState.last_error,
        last_runtime_error: autoUpdateState.last_runtime_error,
        next_check_at: autoUpdateState.next_check_at,
      },
      update_status: status,
    });
  });

  app.post("/api/update-auto-config", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const body = req.body ?? {};
    const enabled = parseUpdateBooleanFlag(body, "enabled");
    writeAutoUpdateEnabledSetting(enabled);
    autoUpdateActive = autoUpdateSchedulerReady ? enabled : false;

    if (autoUpdateSchedulerReady && enabled) {
      autoUpdateState.next_check_at = Date.now();
      setTimeout(() => {
        void runAutoUpdateCycle();
      }, 250);
    } else {
      autoUpdateState.next_check_at = Date.now() + AUTO_UPDATE_CHECK_INTERVAL_MS;
    }

    logAutoUpdate(
      `runtime toggle updated (enabled=${autoUpdateActive ? "1" : "0"}, scheduler_ready=${autoUpdateSchedulerReady ? "1" : "0"})`,
    );
    return res.json({
      ok: true,
      auto_update: {
        enabled: autoUpdateActive,
        configured_enabled: AUTO_UPDATE_DEFAULT_ENABLED,
        settings_enabled: enabled,
        scheduler_ready: autoUpdateSchedulerReady,
      },
    });
  });

  app.post("/api/update-apply", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const body = req.body ?? {};
    const dryRun = parseUpdateBooleanFlag(body, "dry_run");
    const force = parseUpdateBooleanFlag(body, "force");
    const forceConfirm = parseUpdateBooleanFlag(body, "force_confirm");

    if (!tryAcquireAutoUpdateLock()) {
      return res.status(409).json({ ok: false, error: "update_already_running" });
    }

    let inFlight: Promise<UpdateApplyResult>;
    try {
      autoUpdateInFlight = (async () => {
        autoUpdateState.running = true;
        autoUpdateState.last_checked_at = Date.now();
        autoUpdateState.last_runtime_error = null;
        logAutoUpdate(`manual apply requested (dry_run=${dryRun ? "1" : "0"}, force=${force ? "1" : "0"})`);

        const result = await applyUpdateNow(
          {
            AUTO_UPDATE_CHANNEL,
            AUTO_UPDATE_IDLE_ONLY,
            AUTO_UPDATE_TARGET_BRANCH,
            AUTO_UPDATE_RESTART_MODE,
            AUTO_UPDATE_RESTART_COMMAND,
            AUTO_UPDATE_EXIT_DELAY_MS,
            AUTO_UPDATE_TOTAL_TIMEOUT_MS,
            updateCommandTimeoutMs,
            activeProcesses,
            getInProgressTaskCount,
            fetchUpdateStatus,
            runCommandCapture,
            logAutoUpdate,
            notifyCeo,
            scheduleExit,
          },
          { trigger: "manual", dryRun, force, forceConfirmed: forceConfirm },
        );
        autoUpdateState.last_result = result;
        autoUpdateState.last_error = result.error;
        return result;
      })()
        .catch((err) => {
          autoUpdateState.last_runtime_error = err instanceof Error ? err.message : String(err);
          throw err;
        })
        .finally(() => {
          autoUpdateState.running = false;
          autoUpdateInFlight = null;
          updateStatusCachedAt = 0;
          updateStatusCache = null;
          releaseAutoUpdateLock();
        });
      inFlight = autoUpdateInFlight as Promise<UpdateApplyResult>;
    } catch (err: any) {
      autoUpdateState.running = false;
      autoUpdateInFlight = null;
      updateStatusCachedAt = 0;
      updateStatusCache = null;
      releaseAutoUpdateLock();
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }

    try {
      const result = await inFlight;
      if (result.reasons.includes("force_confirmation_required")) {
        return res.status(400).json({
          ok: false,
          error: "force_confirmation_required",
          message: "force=true requires force_confirm=true because it bypasses safety guards",
          result,
        });
      }
      const code = result.status === "failed" ? 500 : 200;
      return res.status(code).json({ ok: result.status !== "failed", result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}
