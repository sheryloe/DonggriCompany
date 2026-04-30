import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isExecutionProvider, type ExecutionProvider } from "./oauth-gate-service.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

export type CliAccountPoolStatus = "connected" | "auth_required" | "install_required" | "profile_error";

export type CliAccountPoolRow = {
  id: string;
  provider: string;
  account_pool_id: string;
  label: string;
  profile_home: string;
  status: CliAccountPoolStatus;
  last_verified_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export type CliAccountPoolView = {
  id: string;
  provider: string;
  accountPoolId: string;
  label: string;
  profileHome: string;
  status: CliAccountPoolStatus;
  lastVerifiedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

type CodexForecastAccount = {
  index?: number;
  label?: string;
  isCurrent?: boolean;
  availability?: string;
  riskScore?: number;
  waitMs?: number;
  primaryReason?: string;
  reasons?: unknown;
  liveQuota?: {
    summary?: string;
  };
};

type CodexAuthReportAccount = {
  enabled?: boolean;
  accountLabel?: string;
  email?: string;
  lastUsed?: number;
  expiresAt?: number;
};

type CodexAuthReport = {
  accounts?: CodexAuthReportAccount[];
  activeIndex?: number;
  forecast?: {
    accounts?: CodexForecastAccount[];
  };
};

type CodexStorageAccount = {
  enabled?: boolean;
  accountLabel?: string;
  email?: string;
  lastUsed?: number;
  expiresAt?: number;
};

type CodexStorageSnapshot = {
  accounts?: CodexStorageAccount[];
  activeIndex?: number;
};

export type CodexSyncedAccountView = {
  index: number;
  poolId: string;
  label: string;
  accountDetected?: boolean;
  usageReady?: boolean;
  executionReady?: boolean;
  executionIssue?: "none" | "profile_sync_required" | "auth_required" | "install_required" | "unknown";
  isCurrent: boolean;
  availability: string;
  riskScore: number;
  waitMs: number;
  usageSummary: string | null;
  lastUsedAt: number | null;
  expiresAt: number | null;
  source: "auth_report" | "storage_fallback";
};

export type SyncCodexPoolsResult = {
  pools: CliAccountPoolView[];
  accounts: CodexSyncedAccountView[];
};

export type CliAccountVerifyResponse = {
  pool: CliAccountPoolView;
  binaryInstalled: boolean;
  authArtifactFound: boolean;
};

export type CliLoginCommandResponse = {
  provider: string;
  accountPoolId: string;
  profileHome: string;
  binaryInstalled: boolean;
  command: string;
  note: string | null;
};

type CliAccountGateServiceDeps = {
  db: DbLike;
  nowMs: () => number;
  profileRoot?: string;
  containerName?: string;
};

export class CliAccountGateError extends Error {
  readonly code:
    | "cli_not_connected"
    | "cli_auth_required"
    | "cli_install_required"
    | "cli_profile_error"
    | "cli_sync_failed"
    | "unsupported_provider";
  readonly status: number;

  constructor(code: CliAccountGateError["code"], status: number, message: string) {
    super(message);
    this.name = "CliAccountGateError";
    this.code = code;
    this.status = status;
  }
}

export class CliAccountGateService {
  private readonly db: DbLike;
  private readonly nowMs: () => number;
  private readonly profileRoot: string;
  private readonly containerName: string;

  constructor(deps: CliAccountGateServiceDeps) {
    this.db = deps.db;
    this.nowMs = deps.nowMs;
    this.profileRoot = (deps.profileRoot ?? process.env.OFFICE_CLI_PROFILE_ROOT ?? "/app/.office-accounts").trim();
    this.containerName = (deps.containerName ?? process.env.OFFICE_APP_CONTAINER_NAME ?? "donggricompany").trim();
  }

  listPools(): CliAccountPoolView[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, label, profile_home, status, last_verified_at, last_error, created_at, updated_at
         FROM cli_account_pools
         ORDER BY provider ASC, account_pool_id ASC`,
      )
      .all() as CliAccountPoolRow[];
    return rows.map((row) => this.toView(row));
  }

  syncCodexPoolsFromMultiAuth(options?: { live?: boolean }): SyncCodexPoolsResult {
    if (!isBinaryInstalled("codex")) {
      throw new CliAccountGateError("cli_install_required", 412, "Codex CLI is not installed");
    }
    const now = this.nowMs();
    const reportErrors: string[] = [];

    const fromAuthReport = this.trySyncCodexFromAuthReport(options, now, reportErrors);
    if (fromAuthReport) return fromAuthReport;

    const fromStorage = this.trySyncCodexFromStorage(now, reportErrors);
    if (fromStorage) return fromStorage;

    throw new CliAccountGateError(
      "cli_sync_failed",
      502,
      reportErrors.length > 0
        ? `codex_multi_auth_sync_failed:${reportErrors.join("|")}`
        : "codex_multi_auth_accounts_empty",
    );
  }

  private trySyncCodexFromAuthReport(
    options: { live?: boolean } | undefined,
    now: number,
    reportErrors: string[],
  ): SyncCodexPoolsResult | null {
    const reportArgs = ["auth", "report", "--json"];
    if (options?.live !== false) reportArgs.push("--live");

    let report: CodexAuthReport | null = null;
    const reportCommands = ["codex-multi-auth", "codex"];
    for (const command of reportCommands) {
      try {
        const output = execFileSync(command, reportArgs, {
          stdio: "pipe",
          timeout: 30_000,
          encoding: "utf8",
          shell: process.platform === "win32",
        });
        report = parseCodexAuthReportJson(output);
        break;
      } catch (error) {
        const commandKey = command.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
        reportErrors.push(`auth_report_${commandKey}:${normalizeCodexSyncReason(error)}`);
      }
    }
    if (!report) {
      return null;
    }

    const forecastAccounts = Array.isArray(report.forecast?.accounts) ? report.forecast?.accounts : [];
    if (forecastAccounts.length === 0) {
      reportErrors.push("auth_report_accounts_empty");
      return null;
    }

    const reportAccounts = Array.isArray(report.accounts) ? report.accounts : [];
    const activeIndex = normalizeCodexIndex(report.activeIndex, forecastAccounts.length);
    const syncedAccounts: CodexSyncedAccountView[] = [];

    let mappedIndex = 0;
    for (let index = 0; index < forecastAccounts.length; index += 1) {
      const forecast = forecastAccounts[index] ?? {};
      const accountMeta = reportAccounts[index] ?? {};
      if (accountMeta.enabled === false) continue;

      const poolId = mappedIndex === 0 ? "codex-main" : `codex-main-${mappedIndex + 1}`;
      const fallbackLabel = mappedIndex === 0 ? "Codex Main" : `Codex Account ${mappedIndex + 1}`;
      const preferredLabel = normalizeCodexLabel(
        forecast.label ?? accountMeta.accountLabel ?? accountMeta.email,
        fallbackLabel,
      );
      this.ensureCodexPoolExists(poolId, preferredLabel, now);

      const verified = this.verifyPool("codex", poolId).pool;
      syncedAccounts.push({
        index: mappedIndex,
        poolId,
        label: verified.label,
        accountDetected: true,
        usageReady: Boolean(extractCodexUsageSummary(forecast)),
        executionReady: verified.status === "connected",
        executionIssue: mapCodexExecutionIssue(verified.status, verified.lastError),
        isCurrent: Boolean(forecast.isCurrent || index === activeIndex),
        availability: normalizeCodexAvailability(forecast.availability),
        riskScore: normalizeCodexNumber(forecast.riskScore),
        waitMs: normalizeCodexNumber(forecast.waitMs),
        usageSummary: extractCodexUsageSummary(forecast),
        lastUsedAt: normalizeCodexNullableNumber(accountMeta.lastUsed),
        expiresAt: normalizeCodexNullableNumber(accountMeta.expiresAt),
        source: "auth_report",
      });
      mappedIndex += 1;
    }

    if (syncedAccounts.length === 0) {
      reportErrors.push("auth_report_all_accounts_disabled");
      return null;
    }

    return {
      pools: this.listPools().filter((pool) => pool.provider === "codex"),
      accounts: syncedAccounts,
    };
  }

  private trySyncCodexFromStorage(now: number, reportErrors: string[]): SyncCodexPoolsResult | null {
    const storagePath = resolveCodexMultiAuthStoragePath();
    if (!storagePath || !fs.existsSync(storagePath)) {
      reportErrors.push("storage_snapshot_missing");
      return null;
    }

    let snapshot: CodexStorageSnapshot;
    try {
      snapshot = parseCodexStorageSnapshot(fs.readFileSync(storagePath, "utf8"));
    } catch {
      reportErrors.push("storage_snapshot_parse_failed");
      return null;
    }

    const rawAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    if (rawAccounts.length === 0) {
      reportErrors.push("storage_snapshot_accounts_empty");
      return null;
    }

    const activeIndex = normalizeCodexIndex(snapshot.activeIndex, rawAccounts.length);
    const enabledRows: Array<{ rawIndex: number; account: CodexStorageAccount }> = [];
    for (let rawIndex = 0; rawIndex < rawAccounts.length; rawIndex += 1) {
      const account = rawAccounts[rawIndex] ?? {};
      if (account.enabled === false) continue;
      enabledRows.push({ rawIndex, account });
    }
    if (enabledRows.length === 0) {
      reportErrors.push("storage_snapshot_all_accounts_disabled");
      return null;
    }

    const syncedAccounts: CodexSyncedAccountView[] = [];
    for (let index = 0; index < enabledRows.length; index += 1) {
      const { rawIndex, account } = enabledRows[index];
      const poolId = index === 0 ? "codex-main" : `codex-main-${index + 1}`;
      const fallbackLabel = index === 0 ? "Codex Main" : `Codex Account ${index + 1}`;
      const preferredLabel = normalizeCodexLabel(account.accountLabel ?? account.email, fallbackLabel);
      this.ensureCodexPoolExists(poolId, preferredLabel, now);

      const verified = this.verifyPool("codex", poolId).pool;
      syncedAccounts.push({
        index,
        poolId,
        label: verified.label,
        accountDetected: true,
        usageReady: false,
        executionReady: verified.status === "connected",
        executionIssue: mapCodexExecutionIssue(verified.status, verified.lastError),
        isCurrent: rawIndex === activeIndex,
        availability: "unknown",
        riskScore: 0,
        waitMs: 0,
        usageSummary: null,
        lastUsedAt: normalizeCodexNullableNumber(account.lastUsed),
        expiresAt: normalizeCodexNullableNumber(account.expiresAt),
        source: "storage_fallback",
      });
    }

    return {
      pools: this.listPools().filter((pool) => pool.provider === "codex"),
      accounts: syncedAccounts,
    };
  }

  private ensureCodexPoolExists(accountPoolId: string, label: string, now: number): void {
    const existing = this.getPoolRow("codex", accountPoolId);
    if (existing) return;
    const profileHome = this.buildProfileHome("codex", accountPoolId);
    this.db
      .prepare(
        `INSERT INTO cli_account_pools (
           id, provider, account_pool_id, label, profile_home, status, last_verified_at, last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'auth_required', NULL, NULL, ?, ?)`,
      )
      .run(randomUUID(), "codex", accountPoolId, label, profileHome, now, now);
  }

  createPool(provider: string, accountPoolId: string, label?: string): CliAccountPoolView {
    const normalizedProvider = normalizeProvider(provider);
    if (!isExecutionProvider(normalizedProvider)) {
      throw new CliAccountGateError("unsupported_provider", 400, `Unsupported provider: ${provider}`);
    }
    const normalizedPool = normalizePool(accountPoolId);
    if (!normalizedPool) {
      throw new CliAccountGateError("cli_not_connected", 400, "accountPoolId is required");
    }

    const now = this.nowMs();
    const existing = this.getPoolRow(normalizedProvider, normalizedPool);
    const id = existing?.id ?? randomUUID();
    const nextLabel = (label ?? existing?.label ?? `${normalizedProvider}-${normalizedPool}`).trim();
    const profileHome = existing?.profile_home ?? this.buildProfileHome(normalizedProvider, normalizedPool);
    this.db
      .prepare(
        `INSERT INTO cli_account_pools (
           id, provider, account_pool_id, label, profile_home, status, last_verified_at, last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'auth_required', NULL, NULL, ?, ?)
         ON CONFLICT(provider, account_pool_id) DO UPDATE SET
           label = excluded.label,
           profile_home = excluded.profile_home,
           updated_at = excluded.updated_at`,
      )
      .run(id, normalizedProvider, normalizedPool, nextLabel, profileHome, existing?.created_at ?? now, now);

    return this.toView(this.mustGetPoolRow(normalizedProvider, normalizedPool));
  }

  updatePool(provider: string, accountPoolId: string, patch: { label?: string }): CliAccountPoolView {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedPool = normalizePool(accountPoolId);
    const row = this.mustGetPoolRow(normalizedProvider, normalizedPool);
    const nextLabel = typeof patch.label === "string" ? patch.label.trim() : row.label;
    const now = this.nowMs();
    this.db
      .prepare("UPDATE cli_account_pools SET label = ?, updated_at = ? WHERE provider = ? AND account_pool_id = ?")
      .run(nextLabel || row.label, now, normalizedProvider, normalizedPool);
    return this.toView(this.mustGetPoolRow(normalizedProvider, normalizedPool));
  }

  deletePool(provider: string, accountPoolId: string): void {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedPool = normalizePool(accountPoolId);
    this.db
      .prepare("DELETE FROM cli_account_pools WHERE provider = ? AND account_pool_id = ?")
      .run(normalizedProvider, normalizedPool);
  }

  verifyPool(provider: string, accountPoolId: string): CliAccountVerifyResponse {
    const normalizedProvider = normalizeProvider(provider);
    if (!isExecutionProvider(normalizedProvider)) {
      throw new CliAccountGateError("unsupported_provider", 400, `Unsupported provider: ${provider}`);
    }
    const normalizedPool = normalizePool(accountPoolId);
    const row = this.mustGetPoolRow(normalizedProvider, normalizedPool);
    const now = this.nowMs();

    try {
      fs.mkdirSync(row.profile_home, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updatePoolStatus(row.provider, row.account_pool_id, "profile_error", now, message.slice(0, 500));
      return {
        pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
        binaryInstalled: false,
        authArtifactFound: false,
      };
    }

    const binaryInstalled = isBinaryInstalled(normalizedProvider);
    if (!binaryInstalled) {
      this.updatePoolStatus(
        row.provider,
        row.account_pool_id,
        "install_required",
        now,
        `${normalizedProvider}_not_installed`,
      );
      return {
        pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
        binaryInstalled: false,
        authArtifactFound: false,
      };
    }

    const authArtifactFound = hasAuthArtifact(normalizedProvider, row.profile_home);
    if (!authArtifactFound) {
      if (normalizedProvider === "codex" && isCodexGlobalAccountDetected()) {
        this.updatePoolStatus(
          row.provider,
          row.account_pool_id,
          "profile_error",
          now,
          "codex_account_detected_profile_sync_required",
        );
        return {
          pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
          binaryInstalled: true,
          authArtifactFound: false,
        };
      }
      this.updatePoolStatus(row.provider, row.account_pool_id, "auth_required", now, "auth_artifact_missing");
      return {
        pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
        binaryInstalled: true,
        authArtifactFound: false,
      };
    }

    if (normalizedProvider === "jules") {
      const health = verifyJulesRemoteSessionHealth(row.profile_home);
      if (!health.ok) {
        this.updatePoolStatus(row.provider, row.account_pool_id, "auth_required", now, health.error);
        return {
          pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
          binaryInstalled: true,
          authArtifactFound: true,
        };
      }
    }

    this.updatePoolStatus(row.provider, row.account_pool_id, "connected", now, null);
    return {
      pool: this.toView(this.mustGetPoolRow(row.provider, row.account_pool_id)),
      binaryInstalled: true,
      authArtifactFound: true,
    };
  }

  getLoginCommand(provider: string, accountPoolId: string): CliLoginCommandResponse {
    const normalizedProvider = normalizeProvider(provider);
    if (!isExecutionProvider(normalizedProvider)) {
      throw new CliAccountGateError("unsupported_provider", 400, `Unsupported provider: ${provider}`);
    }
    const normalizedPool = normalizePool(accountPoolId);
    const row = this.mustGetPoolRow(normalizedProvider, normalizedPool);

    const commandMap: Record<ExecutionProvider, string> = {
      codex: "codex login --device-auth",
      gemini: "gemini",
      claude: "claude",
      // In Docker, localhost callback ports from browser cannot reach container process.
      // Force manual code flow to avoid redirect failures on 127.0.0.1:<random-port>.
      jules: "jules login --no-launch-browser",
    };
    const noteMap: Record<ExecutionProvider, string | null> = {
      codex: null,
      gemini: "Interactive shell opens. Complete Gemini login in that session.",
      claude: "Interactive shell opens. Complete Claude authentication in that session.",
      jules: "Manual code login mode is used to avoid localhost callback issues in Docker.",
    };
    const binaryInstalled = isBinaryInstalled(normalizedProvider);
    const loginCommand = commandMap[normalizedProvider];
    const command = `docker exec -it ${this.containerName} sh -lc 'mkdir -p "${row.profile_home}" && HOME="${row.profile_home}" ${loginCommand}'`;
    return {
      provider: normalizedProvider,
      accountPoolId: normalizedPool,
      profileHome: row.profile_home,
      binaryInstalled,
      command,
      note: noteMap[normalizedProvider],
    };
  }

  ensureProviderPoolReady(provider: string, accountPoolId: string): CliAccountPoolView | null {
    const normalizedProvider = normalizeProvider(provider);
    if (!isExecutionProvider(normalizedProvider)) return null;
    const normalizedPool = normalizePool(accountPoolId);
    if (!normalizedPool) {
      throw new CliAccountGateError("cli_not_connected", 400, "accountPoolId is required");
    }
    const existing = this.getPoolRow(normalizedProvider, normalizedPool);
    if (!existing) {
      throw new CliAccountGateError(
        "cli_not_connected",
        412,
        `CLI account pool is not registered for ${normalizedProvider}:${normalizedPool}`,
      );
    }
    const verified = this.verifyPool(normalizedProvider, normalizedPool);
    const status = verified.pool.status;
    if (status === "connected") return verified.pool;
    if (status === "install_required") {
      throw new CliAccountGateError(
        "cli_install_required",
        412,
        `CLI binary is not installed for ${normalizedProvider}`,
      );
    }
    if (status === "profile_error") {
      throw new CliAccountGateError(
        "cli_profile_error",
        412,
        `Profile error for ${normalizedProvider}:${normalizedPool}`,
      );
    }
    throw new CliAccountGateError(
      "cli_auth_required",
      412,
      `CLI authentication is required for ${normalizedProvider}:${normalizedPool}`,
    );
  }

  private updatePoolStatus(
    provider: string,
    accountPoolId: string,
    status: CliAccountPoolStatus,
    verifiedAt: number,
    lastError: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE cli_account_pools
         SET status = ?, last_verified_at = ?, last_error = ?, updated_at = ?
         WHERE provider = ? AND account_pool_id = ?`,
      )
      .run(status, verifiedAt, lastError, this.nowMs(), provider, accountPoolId);
  }

  private getPoolRow(provider: string, accountPoolId: string): CliAccountPoolRow | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, account_pool_id, label, profile_home, status, last_verified_at, last_error, created_at, updated_at
         FROM cli_account_pools
         WHERE provider = ? AND account_pool_id = ?`,
      )
      .get(provider, accountPoolId) as CliAccountPoolRow | undefined;
    return row ?? null;
  }

  private mustGetPoolRow(provider: string, accountPoolId: string): CliAccountPoolRow {
    const row = this.getPoolRow(provider, accountPoolId);
    if (!row) {
      throw new CliAccountGateError(
        "cli_not_connected",
        404,
        `CLI account pool not found: ${provider}:${accountPoolId}`,
      );
    }
    return row;
  }

  private buildProfileHome(provider: string, accountPoolId: string): string {
    const safeProvider = sanitizeToken(provider) || "provider";
    const safePool = sanitizeToken(accountPoolId) || "pool";
    return path.posix.join(this.profileRoot, safeProvider, safePool);
  }

  private toView(row: CliAccountPoolRow): CliAccountPoolView {
    return {
      id: row.id,
      provider: row.provider,
      accountPoolId: row.account_pool_id,
      label: row.label,
      profileHome: row.profile_home,
      status: row.status,
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function normalizeProvider(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function normalizePool(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function sanitizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isBinaryInstalled(provider: string): boolean {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(command, [provider], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function verifyJulesRemoteSessionHealth(profileHome: string): { ok: true } | { ok: false; error: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: profileHome };
  if (process.platform === "win32") {
    env.USERPROFILE = profileHome;
  }
  try {
    execFileSync("jules", ["remote", "list", "--session"], {
      stdio: "pipe",
      timeout: 8_000,
      env,
      shell: process.platform === "win32",
    });
    return { ok: true };
  } catch (error) {
    const details = extractExecErrorDetails(error);
    const normalized = details.toLowerCase();
    if (
      normalized.includes("not logged in") ||
      normalized.includes("please run /login") ||
      normalized.includes("login required")
    ) {
      return { ok: false, error: `jules_remote_health_auth_required:${details}` };
    }
    return { ok: false, error: `jules_remote_health_failed:${details}` };
  }
}

function extractExecErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  const withOutput = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
  if (withOutput.stdout) {
    const stdout = Buffer.isBuffer(withOutput.stdout) ? withOutput.stdout.toString("utf8") : String(withOutput.stdout);
    if (stdout.trim()) parts.push(stdout.trim());
  }
  if (withOutput.stderr) {
    const stderr = Buffer.isBuffer(withOutput.stderr) ? withOutput.stderr.toString("utf8") : String(withOutput.stderr);
    if (stderr.trim()) parts.push(stderr.trim());
  }
  return parts.join(" | ").slice(0, 500);
}

function parseCodexAuthReportJson(raw: string): CodexAuthReport {
  const trimmed = normalizeCodexJsonText(raw);
  if (!trimmed) {
    throw new Error("empty_output");
  }
  try {
    return JSON.parse(trimmed) as CodexAuthReport;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("invalid_json_output");
    }
    const segment = trimmed.slice(start, end + 1);
    return JSON.parse(segment) as CodexAuthReport;
  }
}

function parseCodexStorageSnapshot(raw: string): CodexStorageSnapshot {
  const trimmed = normalizeCodexJsonText(raw);
  if (!trimmed) {
    throw new Error("empty_storage_snapshot");
  }
  return JSON.parse(trimmed) as CodexStorageSnapshot;
}

function normalizeCodexJsonText(raw: string): string {
  return raw.replace(/^\uFEFF/, "").trim();
}

function resolveCodexMultiAuthStoragePath(): string {
  const fromEnv = String(process.env.CODEX_MULTI_AUTH_STORAGE_PATH ?? "").trim();
  if (fromEnv) return fromEnv;
  return "/home/app/.codex/multi-auth/openai-codex-accounts.json";
}

function normalizeCodexNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function normalizeCodexNullableNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeCodexIndex(value: unknown, accountCount: number): number {
  const n = normalizeCodexNumber(value);
  if (!Number.isInteger(n)) return -1;
  if (n < 0 || n >= accountCount) return -1;
  return n;
}

function normalizeCodexAvailability(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return normalized || "unknown";
}

function normalizeCodexLabel(value: unknown, fallback: string): string {
  const label = typeof value === "string" ? value.trim() : "";
  return label || fallback;
}

function normalizeCodexSyncReason(error: unknown): string {
  const details = extractExecErrorDetails(error).toLowerCase();
  if (!details) return "unknown";
  if (details.includes("unrecognized subcommand")) return "unsupported_subcommand";
  if (details.includes("not logged in") || details.includes("login")) return "auth_required";
  if (details.includes("timed out") || details.includes("timeout")) return "timeout";
  return "command_failed";
}

function mapCodexExecutionIssue(
  status: CliAccountPoolStatus,
  lastError: string | null | undefined,
): CodexSyncedAccountView["executionIssue"] {
  if (status === "connected") return "none";
  if (status === "install_required") return "install_required";
  if (status === "auth_required") return "auth_required";
  const errorText = String(lastError ?? "").toLowerCase();
  if (errorText.includes("profile_sync_required") || errorText.includes("auth_artifact_missing")) {
    return "profile_sync_required";
  }
  return "unknown";
}

function isCodexGlobalAccountDetected(): boolean {
  if (!isBinaryInstalled("codex")) return false;
  const probes: string[][] = [
    ["login", "status"],
    ["auth", "status"],
  ];
  for (const args of probes) {
    try {
      const output = execFileSync("codex", args, {
        stdio: "pipe",
        timeout: 8_000,
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      const normalized = output.toLowerCase();
      if (normalized.includes("logged in") || normalized.includes("authenticated") || normalized.includes("account")) {
        return true;
      }
    } catch {
      // Continue with the next safe probe. Token details are never read or logged here.
    }
  }
  return false;
}

function extractCodexUsageSummary(account: CodexForecastAccount): string | null {
  const liveSummary = typeof account.liveQuota?.summary === "string" ? account.liveQuota.summary.trim() : "";
  if (liveSummary) return liveSummary;

  if (Array.isArray(account.reasons)) {
    const joined = account.reasons
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" | ");
    if (joined) return joined;
  }

  const primaryReason = typeof account.primaryReason === "string" ? account.primaryReason.trim() : "";
  if (primaryReason) return primaryReason;
  return null;
}

function hasAuthArtifact(provider: string, profileHome: string): boolean {
  const markers: Record<ExecutionProvider, string[]> = {
    codex: [".codex/auth.json"],
    gemini: [".gemini/oauth_creds.json", ".config/gcloud/application_default_credentials.json"],
    claude: [".claude.json", ".claude/auth.json"],
    jules: [".jules/auth.json", ".jules/credentials.json", ".jules/cache/oauth_creds.json"],
  };
  const markerList = markers[provider as ExecutionProvider];
  if (!Array.isArray(markerList) || markerList.length === 0) return false;
  return markerList.some((relativePath) => fileExistsNonEmpty(path.posix.join(profileHome, relativePath)));
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
