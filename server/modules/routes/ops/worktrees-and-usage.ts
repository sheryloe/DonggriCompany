import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import type { CliUsageEntry } from "../shared/types.ts";

function readGitLines(cwd: string, args: string[], timeout = 8000): string[] {
  const output = execFileSync("git", args, { cwd, stdio: "pipe", timeout }).toString().trim();
  return output
    ? output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function tryReadGitLines(cwd: string, args: string[], timeout = 8000): string[] {
  try {
    return readGitLines(cwd, args, timeout);
  } catch {
    return [];
  }
}

function refExists(cwd: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", ref], { cwd, stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function resolveCompareRef(projectPath: string, worktreePath: string): string | null {
  const preferredCandidates: string[] = [];

  try {
    const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath,
      stdio: "pipe",
      timeout: 5000,
    })
      .toString()
      .trim();
    if (currentBranch && currentBranch !== "HEAD") {
      preferredCandidates.push(`origin/${currentBranch}`, currentBranch);
    }
  } catch {
    // ignore and fall back to generic candidates
  }

  preferredCandidates.push("origin/main", "main", "origin/master", "master");

  for (const candidate of preferredCandidates) {
    if (refExists(worktreePath, candidate)) return candidate;
  }
  return null;
}

function parsePorcelainPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = trimmed.slice(3).trim();
  if (!pathPart) return null;
  const renamed = pathPart.split(" -> ").pop()?.trim();
  return renamed || pathPart;
}

function isCodeLikePath(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|scss|py|md|yml|yaml|sh|ps1|sql)$/i.test(filePath);
}

function isIgnoredWorktreeArtifact(filePath: string): boolean {
  return filePath === ".claude/skills" || filePath.startsWith(".claude/skills/");
}

function parseExpiryMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOAuthClientValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") return "";
  if (normalized === "YOUR_GOOGLE_CLIENT_SECRET") return "";
  return normalized;
}

function parseJwtAudience(idToken: string): string | null {
  try {
    const payloadPart = idToken.split(".")[1] ?? "";
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { aud?: unknown };
    return typeof payload.aud === "string" && payload.aud ? payload.aud : null;
  } catch {
    return null;
  }
}

type VerifyCommitState = {
  ok: true;
  hasWorktree: boolean;
  worktreePath: string | null;
  branchName?: string;
  compareRef: string | null;
  hasCommit: boolean;
  commitCount: number;
  commits: string[];
  files: string[];
  uncommittedFiles: string[];
  hasUncommittedChanges: boolean;
  hasRealCode: boolean;
  verdict: "no_worktree" | "no_commit" | "dirty_without_commit" | "commit_but_no_code" | "ok";
};

type CliPoolUsageEntry = {
  key: string;
  provider: string;
  accountPoolId: string;
  label: string;
  usage: CliUsageEntry;
};

type CliSessionUsageCounts = {
  in_progress: number;
  awaiting: number;
  completed: number;
  failed: number;
  unknown: number;
  total: number;
};

type CliSessionUsageEntry = {
  key: string;
  provider: "jules";
  accountPoolId: string;
  label: string;
  sessions: CliSessionUsageCounts;
  lastActive: string | null;
  error: string | null;
};

type CliPoolRow = {
  provider: string;
  account_pool_id: string;
  label: string;
  profile_home: string;
};

const REQUIRED_USAGE_PROVIDERS = ["claude", "codex", "gemini", "jules", "copilot", "antigravity"];
const GOOGLE_OAUTH_CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID ?? process.env.OAUTH_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_OAUTH_CLIENT_SECRET =
  process.env.GEMINI_OAUTH_CLIENT_SECRET ?? process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "";
const GEMINI_DEFAULT_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const GEMINI_DEFAULT_CLIENT_SECRET = "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";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

type GoogleProfileProvider = "gemini" | "jules";

type GoogleOAuthProfileCreds = {
  provider: GoogleProfileProvider;
  sourcePath: string;
  raw: Record<string, unknown>;
  accessToken: string;
  refreshToken: string | null;
  expiryDateMs: number | null;
};

type RefreshedGoogleToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
};

function inspectWorktreeVerification(wtInfo?: {
  worktreePath: string;
  branchName: string;
  projectPath: string;
}): VerifyCommitState {
  const worktreePath = wtInfo?.worktreePath ?? null;
  if (!wtInfo || !worktreePath) {
    return {
      ok: true,
      hasWorktree: false,
      worktreePath: null,
      compareRef: null,
      hasCommit: false,
      commitCount: 0,
      commits: [],
      files: [],
      uncommittedFiles: [],
      hasUncommittedChanges: false,
      hasRealCode: false,
      verdict: "no_worktree",
    };
  }

  const compareRef = resolveCompareRef(wtInfo.projectPath, worktreePath);
  const commits = compareRef ? readGitLines(worktreePath, ["log", `${compareRef}..HEAD`, "--oneline"]) : [];
  const changedFiles = (
    compareRef ? tryReadGitLines(worktreePath, ["diff", `${compareRef}..HEAD`, "--name-only"]) : []
  ).filter((filePath) => !isIgnoredWorktreeArtifact(filePath));
  const uncommittedFiles = tryReadGitLines(worktreePath, ["status", "--porcelain"])
    .map(parsePorcelainPath)
    .filter((value): value is string => Boolean(value))
    .filter((filePath) => !isIgnoredWorktreeArtifact(filePath));
  const hasRealCode = changedFiles.some(isCodeLikePath);
  const hasUncommittedChanges = uncommittedFiles.length > 0;

  const verdict =
    commits.length === 0
      ? hasUncommittedChanges
        ? "dirty_without_commit"
        : "no_commit"
      : hasRealCode
        ? "ok"
        : "commit_but_no_code";

  return {
    ok: true,
    hasWorktree: true,
    worktreePath,
    branchName: wtInfo.branchName,
    compareRef,
    hasCommit: commits.length > 0,
    commitCount: commits.length,
    commits,
    files: changedFiles,
    uncommittedFiles,
    hasUncommittedChanges,
    hasRealCode,
    verdict,
  };
}

export function registerWorktreeAndUsageRoutes(ctx: RuntimeContext): {
  refreshCliUsageData: () => Promise<Record<string, CliUsageEntry>>;
} {
  const {
    app,
    taskWorktrees,
    mergeWorktree,
    cleanupWorktree,
    appendTaskLog,
    resolveLang,
    pickL,
    l,
    notifyCeo,
    db,
    nowMs,
    CLI_TOOLS,
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchGeminiUsage,
    getGeminiProjectId,
    broadcast,
  } = ctx;

  app.get("/api/tasks/:id/diff", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.json({ ok: true, hasWorktree: false, diff: "", stat: "" });
    }

    try {
      const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 5000,
      })
        .toString()
        .trim();

      const stat = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`, "--stat"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 10000,
      })
        .toString()
        .trim();

      const diff = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 15000,
      }).toString();

      res.json({
        ok: true,
        hasWorktree: true,
        branchName: wtInfo.branchName,
        stat,
        diff: diff.length > 50000 ? diff.slice(0, 50000) + "\n... (truncated)" : diff,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/tasks/:id/merge", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    let verificationState: VerifyCommitState | null = null;
    try {
      verificationState = inspectWorktreeVerification(wtInfo);
    } catch (err: unknown) {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: skipped (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    if (verificationState?.verdict === "ok") {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: passed (ref=${verificationState.compareRef ?? "unknown"}, commits=${verificationState.commitCount}, files=${verificationState.files.length})`,
      );
    } else if (verificationState && verificationState.verdict !== "no_worktree") {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: warning (verdict=${verificationState.verdict}, commits=${verificationState.commitCount}, uncommitted=${verificationState.uncommittedFiles.length})`,
      );
    }

    const result = mergeWorktree(wtInfo.projectPath, id);
    const lang = resolveLang();

    if (result.success) {
      cleanupWorktree(wtInfo.projectPath, id);
      appendTaskLog(id, "system", `Manual merge completed: ${result.message}`);
      notifyCeo(
        pickL(
          l(
            [`수동 병합 완료: ${result.message}`],
            [`Manual merge completed: ${result.message}`],
            [`手動マージ完了: ${result.message}`],
            [`手动合并完成: ${result.message}`],
          ),
          lang,
        ),
        id,
      );
    } else {
      appendTaskLog(id, "system", `Manual merge failed: ${result.message}`);
    }

    res.json({ ok: result.success, message: result.message, conflicts: result.conflicts });
  });

  app.post("/api/tasks/:id/discard", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    cleanupWorktree(wtInfo.projectPath, id);
    appendTaskLog(id, "system", "Worktree discarded (changes abandoned)");
    const lang = resolveLang();
    notifyCeo(
      pickL(
        l(
          [`작업 브랜치가 폐기되었습니다: climpire/${id.slice(0, 8)}`],
          [`Task branch discarded: climpire/${id.slice(0, 8)}`],
          [`タスクブランチを破棄しました: climpire/${id.slice(0, 8)}`],
          [`任务分支已丢弃: climpire/${id.slice(0, 8)}`],
        ),
        lang,
      ),
      id,
    );

    res.json({ ok: true, message: "Worktree discarded" });
  });

  app.get("/api/tasks/:id/verify-commit", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);

    try {
      return res.json(inspectWorktreeVerification(wtInfo));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.json({ ok: false, error: msg, verdict: "error" });
    }
  });

  app.get("/api/worktrees", (_req, res) => {
    const entries: Array<{ taskId: string; branchName: string; worktreePath: string; projectPath: string }> = [];
    for (const [taskId, info] of taskWorktrees) {
      entries.push({ taskId, ...info });
    }
    res.json({ ok: true, worktrees: entries });
  });

  function readCliUsageFromDb(): Record<string, CliUsageEntry> {
    const rows = db.prepare("SELECT provider, data_json FROM cli_usage_cache").all() as Array<{
      provider: string;
      data_json: string;
    }>;
    const usage: Record<string, CliUsageEntry> = {};
    for (const row of rows) {
      try {
        usage[row.provider] = JSON.parse(row.data_json);
      } catch {
        // invalid json row
      }
    }
    return usage;
  }

  function readConnectedCliPools(): CliPoolRow[] {
    try {
      return db
        .prepare(
          `SELECT provider, account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider IN ('codex','gemini') AND status = 'connected'
           ORDER BY updated_at DESC`,
        )
        .all() as CliPoolRow[];
    } catch {
      return [];
    }
  }

  function readConnectedJulesPools(): CliPoolRow[] {
    try {
      return db
        .prepare(
          `SELECT provider, account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider = 'jules' AND status = 'connected'
           ORDER BY updated_at DESC`,
        )
        .all() as CliPoolRow[];
    } catch {
      return [];
    }
  }

  function readCodexTokensFromProfile(profileHome: string): { access_token: string; account_id: string } | null {
    try {
      const authPath = path.join(profileHome, ".codex", "auth.json");
      const parsed = JSON.parse(fs.readFileSync(authPath, "utf8")) as {
        tokens?: { access_token?: string; account_id?: string };
      };
      const accessToken = parsed?.tokens?.access_token;
      const accountId = parsed?.tokens?.account_id;
      if (!accessToken || !accountId) return null;
      return { access_token: accessToken, account_id: accountId };
    } catch {
      return null;
    }
  }

  async function fetchCodexUsageByTokens(tokens: { access_token: string; account_id: string }): Promise<CliUsageEntry> {
    try {
      const resp = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "ChatGPT-Account-Id": tokens.account_id,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
      const data = (await resp.json()) as {
        rate_limit?: {
          primary_window?: { used_percent?: number; reset_at?: number };
          secondary_window?: { used_percent?: number; reset_at?: number };
        };
      };
      const windows: Array<{ label: string; utilization: number; resetsAt: string | null }> = [];
      if (data.rate_limit?.primary_window) {
        const primary = data.rate_limit.primary_window;
        windows.push({
          label: "5-hour",
          utilization: (primary.used_percent ?? 0) / 100,
          resetsAt: primary.reset_at ? new Date(primary.reset_at * 1000).toISOString() : null,
        });
      }
      if (data.rate_limit?.secondary_window) {
        const secondary = data.rate_limit.secondary_window;
        windows.push({
          label: "7-day",
          utilization: (secondary.used_percent ?? 0) / 100,
          resetsAt: secondary.reset_at ? new Date(secondary.reset_at * 1000).toISOString() : null,
        });
      }
      return { windows, error: null };
    } catch {
      return { windows: [], error: "unavailable" };
    }
  }

  function readGoogleCredsFromProfile(
    profileHome: string,
    provider: GoogleProfileProvider,
  ): GoogleOAuthProfileCreds | null {
    try {
      const sourcePath =
        provider === "gemini"
          ? path.join(profileHome, ".gemini", "oauth_creds.json")
          : path.join(profileHome, ".jules", "cache", "oauth_creds.json");
      const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as Record<string, unknown>;
      const accessToken = String(raw.access_token ?? "").trim();
      if (!accessToken) return null;
      const refreshToken = String(raw.refresh_token ?? "").trim() || null;
      const expiryDateMs =
        provider === "gemini"
          ? parseExpiryMs(raw.expiry_date)
          : parseExpiryMs(raw.expiry) ?? parseExpiryMs(raw.expiry_date);
      return {
        provider,
        sourcePath,
        raw,
        accessToken,
        refreshToken,
        expiryDateMs,
      };
    } catch {
      return null;
    }
  }

  async function refreshGoogleAccessToken(creds: GoogleOAuthProfileCreds): Promise<RefreshedGoogleToken | null> {
    if (!creds.refreshToken) return null;

    const envClientId = normalizeOAuthClientValue(GOOGLE_OAUTH_CLIENT_ID);
    const envClientSecret = normalizeOAuthClientValue(GOOGLE_OAUTH_CLIENT_SECRET);
    const geminiFallbackClientId =
      parseJwtAudience(String(creds.raw.id_token ?? "").trim()) || GEMINI_DEFAULT_CLIENT_ID;
    const clientId = envClientId || (creds.provider === "gemini" ? geminiFallbackClientId : "");
    const clientSecret = envClientSecret || (creds.provider === "gemini" ? GEMINI_DEFAULT_CLIENT_SECRET : "");
    if (!clientId || !clientSecret) return null;

    try {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) return null;
      return {
        accessToken: data.access_token,
        refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
        expiresInSec: typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : null,
      };
    } catch {
      return null;
    }
  }

  function persistRefreshedGoogleCreds(
    creds: GoogleOAuthProfileCreds,
    refreshed: RefreshedGoogleToken,
    now = Date.now(),
  ): void {
    const next = { ...creds.raw } as Record<string, unknown>;
    next.access_token = refreshed.accessToken;
    if (refreshed.refreshToken) next.refresh_token = refreshed.refreshToken;
    const expiresInSec = refreshed.expiresInSec ?? 3600;
    const nextExpiryMs = now + expiresInSec * 1000;
    if (creds.provider === "gemini") {
      next.expiry_date = nextExpiryMs;
    } else {
      next.expiry = new Date(nextExpiryMs).toISOString();
      next.expires_in = expiresInSec;
    }
    try {
      fs.writeFileSync(creds.sourcePath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch {
      // best effort only
    }
  }

  async function resolveFreshGoogleAccessTokenFromProfile(
    profileHome: string,
    provider: GoogleProfileProvider,
  ): Promise<string | null> {
    const creds = readGoogleCredsFromProfile(profileHome, provider);
    if (!creds) return null;

    const now = Date.now();
    const tokenLooksExpired =
      typeof creds.expiryDateMs === "number" && Number.isFinite(creds.expiryDateMs)
        ? creds.expiryDateMs <= now + ACCESS_TOKEN_REFRESH_SKEW_MS
        : false;

    if (!tokenLooksExpired) return creds.accessToken;
    if (!creds.refreshToken) return creds.accessToken;

    const refreshed = await refreshGoogleAccessToken(creds);
    if (!refreshed) return creds.accessToken;
    persistRefreshedGoogleCreds(creds, refreshed, now);
    return refreshed.accessToken;
  }

  async function discoverGeminiProjectIdByToken(accessToken: string): Promise<string | null> {
    try {
      const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "google-api-nodejs-client/9.15.1",
          "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
          "Client-Metadata": JSON.stringify({
            ideType: "ANTIGRAVITY",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          }),
        },
        body: JSON.stringify({
          metadata: {
            ideType: "ANTIGRAVITY",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          cloudaicompanionProject?: string | { id?: string | null } | null;
        };
        const project =
          typeof data?.cloudaicompanionProject === "string"
            ? data.cloudaicompanionProject
            : (data?.cloudaicompanionProject?.id ?? "");
        if (project) return project;
      }
    } catch {
      // try next fallback
    }

    try {
      const resp = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=1", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "climpire",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        projects?: Array<{ projectId?: string; lifecycleState?: string }>;
      };
      return (
        data.projects?.find(
          (project) =>
            project?.lifecycleState === "ACTIVE" && typeof project?.projectId === "string" && project.projectId,
        )?.projectId ?? null
      );
    } catch {
      return null;
    }
  }

  async function fetchGeminiQuotaUsageByToken(accessToken: string): Promise<CliUsageEntry> {
    const mapQuotaError = async (resp: Response): Promise<string> => {
      if (resp.status === 401) return "unauthenticated";
      if (resp.status === 403) {
        try {
          const payload = (await resp.clone().json()) as {
            error?: {
              status?: string;
              details?: Array<{ reason?: string }>;
            };
          };
          const detailReason = payload?.error?.details?.find((item) => item?.reason)?.reason ?? "";
          const status = String(payload?.error?.status ?? "").toUpperCase();
          const normalizedReason = String(detailReason).toUpperCase();
          if (
            normalizedReason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
            normalizedReason === "SERVICE_DISABLED" ||
            status === "PERMISSION_DENIED"
          ) {
            return "usage_api_unavailable";
          }
        } catch {
          // ignore parsing failure and fall through to generic handling
        }
        return "usage_api_unavailable";
      }
      return `http_${resp.status}`;
    };

    try {
      let projectId: string | null = null;
      if (typeof getGeminiProjectId === "function") {
        try {
          projectId = await getGeminiProjectId(accessToken);
        } catch {
          projectId = null;
        }
      }
      if (!projectId) {
        projectId = await discoverGeminiProjectIdByToken(accessToken);
      }
      if (!projectId) return { windows: [], error: "usage_api_unavailable" };
      const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project: projectId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { windows: [], error: await mapQuotaError(resp) };
      const data = (await resp.json()) as {
        buckets?: Array<{ modelId?: string; remainingFraction?: number; resetTime?: string }>;
      };
      const windows: Array<{ label: string; utilization: number; resetsAt: string | null }> = [];
      if (data.buckets) {
        for (const bucket of data.buckets) {
          if (bucket.modelId?.endsWith("_vertex")) continue;
          windows.push({
            label: bucket.modelId ?? "Quota",
            utilization: Math.round((1 - (bucket.remainingFraction ?? 1)) * 100) / 100,
            resetsAt: bucket.resetTime ?? null,
          });
        }
      }
      return { windows, error: null };
    } catch {
      return { windows: [], error: "unavailable" };
    }
  }

  function normalizeJulesSessionStatus(raw: unknown): keyof CliSessionUsageCounts {
    const normalized = String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) return "unknown";
    if (["running", "in_progress", "processing", "active", "started"].includes(normalized)) return "in_progress";
    if (["queued", "pending", "awaiting", "waiting"].includes(normalized)) return "awaiting";
    if (["completed", "succeeded", "done", "ready", "applied"].includes(normalized)) return "completed";
    if (["failed", "error", "cancelled", "canceled", "timed_out", "timeout"].includes(normalized)) return "failed";
    return "unknown";
  }

  function parseTimestampToIso(value: unknown): string | null {
    const parsedMs = parseExpiryMs(value);
    if (!parsedMs) return null;
    return new Date(parsedMs).toISOString();
  }

  function collectJulesSessionObjects(input: unknown, out: Array<Record<string, unknown>>): void {
    if (!input) return;
    if (Array.isArray(input)) {
      for (const item of input) collectJulesSessionObjects(item, out);
      return;
    }
    if (typeof input !== "object") return;
    const record = input as Record<string, unknown>;
    out.push(record);
    for (const value of Object.values(record)) {
      if (Array.isArray(value) || (value && typeof value === "object")) {
        collectJulesSessionObjects(value, out);
      }
    }
  }

  function parseJulesSessionList(raw: string): { counts: CliSessionUsageCounts; lastActive: string | null } {
    const counts: CliSessionUsageCounts = {
      in_progress: 0,
      awaiting: 0,
      completed: 0,
      failed: 0,
      unknown: 0,
      total: 0,
    };

    let lastActive: string | null = null;
    const seenByComposite = new Set<string>();
    const objects: Array<Record<string, unknown>> = [];

    for (const line of String(raw || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) continue;
      try {
        const parsed = JSON.parse(trimmed);
        collectJulesSessionObjects(parsed, objects);
      } catch {
        // ignore non-JSON lines
      }
    }

    for (const session of objects) {
      const sessionId = String(session.session_id ?? session.sessionId ?? session.id ?? session.session ?? "").trim();
      const statusRaw = session.status ?? session.state ?? session.phase ?? session.lifecycle ?? "";
      if (!sessionId && !statusRaw) continue;
      const statusKey = normalizeJulesSessionStatus(statusRaw);
      const dedupKey = `${sessionId || "unknown"}:${statusKey}`;
      if (seenByComposite.has(dedupKey)) continue;
      seenByComposite.add(dedupKey);
      counts[statusKey] += 1;
      counts.total += 1;

      const candidateTime =
        parseTimestampToIso(session.last_active ?? session.lastActive ?? session.updated_at ?? session.updatedAt) ??
        parseTimestampToIso(session.created_at ?? session.createdAt);
      if (candidateTime && (!lastActive || candidateTime > lastActive)) {
        lastActive = candidateTime;
      }
    }

    if (counts.total === 0) {
      for (const line of String(raw || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const statusMatch = trimmed.match(
          /\b(completed|succeeded|done|ready|applied|running|in[_-]?progress|processing|active|started|queued|pending|awaiting|waiting|failed|error|cancelled|canceled|timed[_-]?out|timeout)\b/i,
        );
        if (!statusMatch?.[1]) continue;
        const statusKey = normalizeJulesSessionStatus(statusMatch[1]);
        counts[statusKey] += 1;
        counts.total += 1;
        const isoMatch = trimmed.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/);
        if (isoMatch?.[0]) {
          const iso = parseTimestampToIso(isoMatch[0]);
          if (iso && (!lastActive || iso > lastActive)) {
            lastActive = iso;
          }
        }
      }
    }

    return { counts, lastActive };
  }

  function readJulesSessionUsageFromProfile(profileHome: string): { counts: CliSessionUsageCounts; lastActive: string | null; error: string | null } {
    const envPatch: NodeJS.ProcessEnv = { ...process.env, HOME: profileHome };
    if (process.platform === "win32") {
      envPatch.USERPROFILE = profileHome;
    }
    try {
      const output = execFileSync("jules", ["remote", "list", "--session"], {
        env: envPatch,
        timeout: 8_000,
        stdio: "pipe",
        shell: process.platform === "win32",
      }).toString("utf8");
      const parsed = parseJulesSessionList(output);
      return { counts: parsed.counts, lastActive: parsed.lastActive, error: null };
    } catch (error) {
      const withOutput = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
      const details = [
        error instanceof Error ? error.message : String(error),
        withOutput.stdout ? (Buffer.isBuffer(withOutput.stdout) ? withOutput.stdout.toString("utf8") : String(withOutput.stdout)) : "",
        withOutput.stderr ? (Buffer.isBuffer(withOutput.stderr) ? withOutput.stderr.toString("utf8") : String(withOutput.stderr)) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const isAuthError =
        details.includes("not logged in") || details.includes("please run /login") || details.includes("login");
      return {
        counts: { in_progress: 0, awaiting: 0, completed: 0, failed: 0, unknown: 0, total: 0 },
        lastActive: null,
        error: isAuthError ? "unauthenticated" : "usage_api_unavailable",
      };
    }
  }

  async function readCliPoolUsage(): Promise<CliPoolUsageEntry[]> {
    const pools = readConnectedCliPools();
    if (pools.length === 0) return [];
    const entries = await Promise.all(
      pools.map(async (pool) => {
        let usage: CliUsageEntry = { windows: [], error: "not_implemented" };
        if (pool.provider === "codex") {
          const tokens = readCodexTokensFromProfile(pool.profile_home);
          usage = tokens ? await fetchCodexUsageByTokens(tokens) : { windows: [], error: "unauthenticated" };
        } else if (pool.provider === "gemini") {
          const accessToken = await resolveFreshGoogleAccessTokenFromProfile(pool.profile_home, "gemini");
          usage = accessToken ? await fetchGeminiQuotaUsageByToken(accessToken) : { windows: [], error: "unauthenticated" };
        }
        const baseLabel = String(pool.label || pool.account_pool_id).trim() || pool.account_pool_id;
        return {
          key: `${pool.provider}:${pool.account_pool_id}`,
          provider: pool.provider,
          accountPoolId: pool.account_pool_id,
          label: baseLabel,
          usage,
        } as CliPoolUsageEntry;
      }),
    );
    return entries.sort((a, b) => a.label.localeCompare(b.label) || a.accountPoolId.localeCompare(b.accountPoolId));
  }

  async function readCliSessionUsage(): Promise<CliSessionUsageEntry[]> {
    const pools = readConnectedJulesPools();
    if (pools.length === 0) return [];
    const entries = pools.map((pool) => {
      const baseLabel = String(pool.label || pool.account_pool_id).trim() || pool.account_pool_id;
      const sessionUsage = readJulesSessionUsageFromProfile(pool.profile_home);
      return {
        key: `${pool.provider}:${pool.account_pool_id}`,
        provider: "jules",
        accountPoolId: pool.account_pool_id,
        label: baseLabel,
        sessions: sessionUsage.counts,
        lastActive: sessionUsage.lastActive,
        error: sessionUsage.error,
      } as CliSessionUsageEntry;
    });
    return entries.sort((a, b) => a.label.localeCompare(b.label) || a.accountPoolId.localeCompare(b.accountPoolId));
  }

  async function refreshCliUsageData(): Promise<Record<string, CliUsageEntry>> {
    const providers = REQUIRED_USAGE_PROVIDERS;
    const usage: Record<string, CliUsageEntry> = {};

    const fetchMap: Record<string, () => Promise<CliUsageEntry>> = {
      claude: fetchClaudeUsage,
      codex: fetchCodexUsage,
      gemini: fetchGeminiUsage,
    };

    const fetches = providers.map(async (p) => {
      const tool = CLI_TOOLS.find((t) => t.name === p);
      if (!tool) {
        usage[p] = { windows: [], error: "not_implemented" };
        return;
      }
      if (!tool.checkAuth()) {
        usage[p] = { windows: [], error: "unauthenticated" };
        return;
      }
      const fetcher = fetchMap[p];
      if (fetcher) {
        usage[p] = await fetcher();
      } else {
        usage[p] = { windows: [], error: "not_implemented" };
      }
    });

    await Promise.all(fetches);

    const upsert = db.prepare(
      "INSERT INTO cli_usage_cache (provider, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(provider) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
    );
    const now = nowMs();
    for (const [p, entry] of Object.entries(usage)) {
      upsert.run(p, JSON.stringify(entry), now);
    }

    return usage;
  }

  app.get("/api/cli-usage", async (_req, res) => {
    let usage = readCliUsageFromDb();
    const missingRequiredProvider = REQUIRED_USAGE_PROVIDERS.some((provider) => !(provider in usage));
    if (Object.keys(usage).length === 0 || missingRequiredProvider) {
      usage = await refreshCliUsageData();
    }
    const poolUsage = await readCliPoolUsage();
    const sessionUsage = await readCliSessionUsage();
    res.json({ ok: true, usage, poolUsage, sessionUsage });
  });

  app.post("/api/cli-usage/refresh", async (_req, res) => {
    try {
      const usage = await refreshCliUsageData();
      const poolUsage = await readCliPoolUsage();
      const sessionUsage = await readCliSessionUsage();
      const payload = { usage, poolUsage, sessionUsage };
      broadcast("cli_usage_update", payload);
      res.json({ ok: true, ...payload });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return { refreshCliUsageData };
}
