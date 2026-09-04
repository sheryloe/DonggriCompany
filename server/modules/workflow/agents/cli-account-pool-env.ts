import fs from "node:fs";
import path from "node:path";

type DbLike = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
};

type CliAccountPoolRow = {
  provider: string;
  account_pool_id: string;
  label: string | null;
  profile_home: string;
};

export type CliAccountPoolEnvResolution =
  | {
      ok: true;
      provider: string;
      poolId: string | null;
      profileHome: string | null;
      poolLabel: string | null;
      selectedBy: "explicit" | "auto" | "none";
      envPatch: Partial<NodeJS.ProcessEnv>;
    }
  | {
      ok: false;
      reason: string;
    };

type ResolveCliAccountPoolEnvInput = {
  db: DbLike;
  provider: string;
  cliAccountPoolId?: string | null;
  platform?: NodeJS.Platform;
  selectionSeed?: string;
  profileRoot?: string;
  policy?: {
    requireExplicitSelection?: boolean;
    requireConnectedStatus?: boolean;
    requireAuthoritativePool?: boolean;
  };
};

const POOL_CAPABLE_PROVIDERS = new Set(["codex", "claude", "gemini", "jules"]);
const AUTH_ARTIFACT_MARKERS: Record<string, string[]> = {
  codex: [".codex/auth.json"],
  claude: [".claude/.credentials.json"],
  gemini: [".gemini/oauth_creds.json", ".config/gcloud/application_default_credentials.json"],
  jules: [".jules/auth.json", ".jules/credentials.json", ".jules/cache/oauth_creds.json"],
};
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/u;
const ACCOUNT_POOL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;

export function isCanonicalCliAccountPoolId(value: string): boolean {
  return ACCOUNT_POOL_ID_PATTERN.test(String(value ?? ""));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasString(record: Record<string, unknown> | null, ...keys: string[]): boolean {
  return Boolean(
    record && keys.some((key) => typeof record[key] === "string" && String(record[key]).trim().length > 0),
  );
}

function hasProviderCredentialIdentity(provider: string, filePath: string, parsed: unknown): boolean {
  const root = asRecord(parsed);
  if (!root) return false;
  if (provider === "codex") {
    const tokens = asRecord(root.tokens);
    return hasString(tokens, "access_token") && hasString(tokens, "account_id", "refresh_token", "id_token");
  }
  if (provider === "claude") {
    const oauth = asRecord(root.claudeAiOauth) ?? asRecord(root.oauth);
    return hasString(oauth, "accessToken", "access_token") && hasString(oauth, "refreshToken", "refresh_token");
  }
  if (provider === "gemini") {
    if (path.basename(filePath).toLowerCase() === "application_default_credentials.json") {
      return hasString(root, "refresh_token") && hasString(root, "client_id");
    }
    return hasString(root, "access_token") && hasString(root, "refresh_token");
  }
  if (provider === "jules") {
    const token = asRecord(root.token) ?? root;
    return hasString(token, "access_token", "accessToken") && hasString(token, "refresh_token", "refreshToken");
  }
  return false;
}

export function isCliAuthArtifactValid(provider: string, filePath: string): boolean {
  try {
    const lstat = fs.lstatSync(filePath);
    if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size <= 0) return false;
    const realPath = fs.realpathSync.native(filePath);
    const resolvedPath = path.resolve(filePath);
    const identityMatches =
      process.platform === "win32" ? realPath.toLowerCase() === resolvedPath.toLowerCase() : realPath === resolvedPath;
    if (!identityMatches) return false;
    return hasProviderCredentialIdentity(provider, realPath, JSON.parse(fs.readFileSync(realPath, "utf8")));
  } catch {
    return false;
  }
}

export function resolveCliAccountProfileHome(provider: string, poolId: string, rawProfileHome: string): string {
  const profileHome = path.resolve(rawProfileHome);
  if (fs.existsSync(profileHome)) return profileHome;

  const normalizedRaw = rawProfileHome.replace(/[\\/]+/g, "/").toLowerCase();
  const legacySuffix = `/.office-accounts/${provider}/${poolId}`.toLowerCase();
  if (normalizedRaw.endsWith(legacySuffix)) {
    const repoScoped = path.resolve(process.cwd(), "data", "office-accounts", provider, poolId);
    if (fs.existsSync(repoScoped)) return repoScoped;
  }

  return profileHome;
}

export function hasCliAccountAuthArtifact(provider: string, profileHome: string): boolean {
  const markers = AUTH_ARTIFACT_MARKERS[provider];
  if (!markers) return true;
  return markers.some((relativePath) => isCliAuthArtifactValid(provider, path.join(profileHome, relativePath)));
}

function validateProfileHome(params: {
  provider: string;
  poolId: string;
  profileHomeRaw: string;
  profileRoot: string;
}): { ok: true; profileHome: string } | { ok: false; reason: string } {
  const { provider, poolId, profileHomeRaw, profileRoot } = params;
  const rawProfileHome = String(profileHomeRaw ?? "").trim();
  if (!rawProfileHome) {
    return {
      ok: false,
      reason: `profile_home is empty: provider=${provider} account_pool_id=${poolId}`,
    };
  }

  const profileHome = resolveCliAccountProfileHome(provider, poolId, rawProfileHome);
  const expectedProfileHome = path.resolve(profileRoot, provider, poolId);
  const profileMatches =
    process.platform === "win32"
      ? path.resolve(profileHome).toLowerCase() === expectedProfileHome.toLowerCase()
      : path.resolve(profileHome) === expectedProfileHome;
  if (!profileMatches) {
    return {
      ok: false,
      reason: `profile_home identity mismatch: provider=${provider} account_pool_id=${poolId} profile_home=${profileHome}`,
    };
  }
  try {
    const lstat = fs.lstatSync(profileHome);
    if (!lstat.isDirectory() || lstat.isSymbolicLink()) {
      return {
        ok: false,
        reason: `profile_home is not a directory: ${profileHome}`,
      };
    }
    const realProfileHome = fs.realpathSync.native(profileHome);
    if (process.platform === "win32" && realProfileHome.toLowerCase() !== path.resolve(profileHome).toLowerCase()) {
      return {
        ok: false,
        reason: `profile_home reparse point is not allowed: ${profileHome}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `profile_home is invalid: ${profileHome} (${message})`,
    };
  }

  if (!hasCliAccountAuthArtifact(provider, profileHome)) {
    return {
      ok: false,
      reason: `auth_artifact_missing: provider=${provider} account_pool_id=${poolId} profile_home=${profileHome}`,
    };
  }

  return { ok: true, profileHome };
}

export function resolveDefaultCliAccountProfileRoot(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd = process.cwd(),
): string {
  const configured = String(sourceEnv.OFFICE_CLI_PROFILE_ROOT ?? "").trim();
  if (configured) return path.resolve(configured);
  const localRoot = path.resolve(cwd, "data", "office-accounts");
  if (platform === "win32" || fs.existsSync(localRoot)) return localRoot;
  return "/app/.office-accounts";
}

function computePoolIndex(seed: string | undefined, count: number): number {
  if (!seed || count <= 1) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Number(hash % count);
}

export function resolveCliAccountPoolEnv(input: ResolveCliAccountPoolEnvInput): CliAccountPoolEnvResolution {
  const provider = String(input.provider ?? "")
    .trim()
    .toLowerCase();
  const poolId = String(input.cliAccountPoolId ?? "").trim();
  const platform = input.platform ?? process.platform;
  const profileRoot = path.resolve(input.profileRoot ?? resolveDefaultCliAccountProfileRoot(process.env, platform));
  const requireExplicitSelection = input.policy?.requireExplicitSelection === true;
  const requireConnectedStatus = input.policy?.requireConnectedStatus !== false;
  const requireAuthoritativePool = input.policy?.requireAuthoritativePool !== false;

  if (!PROVIDER_ID_PATTERN.test(provider)) {
    return { ok: false, reason: `provider_identity_invalid: ${provider || "(empty)"}` };
  }
  if (poolId && !isCanonicalCliAccountPoolId(poolId)) {
    return { ok: false, reason: `cli_account_pool_identity_invalid: provider=${provider} account_pool_id=${poolId}` };
  }

  if (!POOL_CAPABLE_PROVIDERS.has(provider)) {
    if (poolId) {
      return {
        ok: false,
        reason: `cli_account_pool_unsupported: provider=${provider} account_pool_id=${poolId}`,
      };
    }
    if (requireAuthoritativePool) {
      return {
        ok: false,
        reason: `authoritative_cli_account_pool_unsupported: provider=${provider}`,
      };
    }
    return {
      ok: true,
      provider,
      poolId: null,
      profileHome: null,
      poolLabel: null,
      selectedBy: "none",
      envPatch: {},
    };
  }

  let resolvedPool: CliAccountPoolRow | undefined;
  let selectedBy: "explicit" | "auto" | "none" = "none";

  if (poolId) {
    const explicitStatusFilter = requireConnectedStatus ? "AND status = 'connected'" : "";
    try {
      resolvedPool = input.db
        .prepare(
          `SELECT provider, account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider = ? AND account_pool_id = ?
           ${explicitStatusFilter}
           LIMIT 1`,
        )
        .get(provider, poolId) as CliAccountPoolRow | undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: `cli_account_pools lookup failed: ${message}`,
      };
    }

    if (!resolvedPool) {
      if (requireConnectedStatus) {
        const exists = input.db
          .prepare(
            `SELECT account_pool_id
             FROM cli_account_pools
             WHERE provider = ? AND account_pool_id = ?
             LIMIT 1`,
          )
          .get(provider, poolId) as { account_pool_id?: string } | undefined;
        if (exists) {
          return {
            ok: false,
            reason: `cli_account_pool_not_connected: provider=${provider} account_pool_id=${poolId}`,
          };
        }
      }
      return {
        ok: false,
        reason: `cli_account_pool_not_found: provider=${provider} account_pool_id=${poolId}`,
      };
    }
    selectedBy = "explicit";
  } else {
    if (requireExplicitSelection) {
      return {
        ok: false,
        reason: `explicit_pool_selection_required: provider=${provider}`,
      };
    }
    let connectedPools: CliAccountPoolRow[] = [];
    try {
      connectedPools = input.db
        .prepare(
          `SELECT provider, account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider = ? AND status = 'connected'
           ORDER BY COALESCE(last_verified_at, updated_at, created_at) DESC`,
        )
        .all(provider) as CliAccountPoolRow[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: `cli_account_pools connected lookup failed: ${message}`,
      };
    }

    if (connectedPools.length > 1) {
      const index = computePoolIndex(input.selectionSeed ?? "", connectedPools.length);
      resolvedPool = connectedPools[index];
      selectedBy = "auto";
    } else if (connectedPools.length === 1) {
      resolvedPool = connectedPools[0];
      selectedBy = "auto";
    }
  }

  if (!resolvedPool) {
    if (requireAuthoritativePool) {
      return {
        ok: false,
        reason: `authoritative_cli_account_pool_required: provider=${provider}`,
      };
    }
    return {
      ok: true,
      provider,
      poolId: null,
      profileHome: null,
      poolLabel: null,
      selectedBy: "none",
      envPatch: {},
    };
  }

  const resolvedProvider = String(resolvedPool.provider ?? "")
    .trim()
    .toLowerCase();
  const resolvedPoolId = String(resolvedPool.account_pool_id ?? "").trim();
  if (resolvedProvider !== provider || !isCanonicalCliAccountPoolId(resolvedPoolId)) {
    return {
      ok: false,
      reason: `cli_account_pool_identity_mismatch: requested_provider=${provider} resolved_provider=${resolvedProvider || "(empty)"} account_pool_id=${resolvedPoolId || "(empty)"}`,
    };
  }
  if (poolId && resolvedPoolId !== poolId) {
    return {
      ok: false,
      reason: `cli_account_pool_identity_mismatch: requested_account_pool_id=${poolId} resolved_account_pool_id=${resolvedPoolId}`,
    };
  }

  const validatedHome = validateProfileHome({
    provider,
    poolId: resolvedPoolId,
    profileHomeRaw: resolvedPool.profile_home,
    profileRoot,
  });
  if (!validatedHome.ok) {
    return {
      ok: false,
      reason: validatedHome.reason,
    };
  }

  const profileHome = validatedHome.profileHome;

  const envPatch: Partial<NodeJS.ProcessEnv> = {
    HOME: profileHome,
  };
  if (platform === "win32") {
    envPatch.USERPROFILE = profileHome;
  }

  return {
    ok: true,
    provider,
    poolId: resolvedPoolId,
    profileHome,
    poolLabel: resolvedPool.label ?? null,
    selectedBy,
    envPatch,
  };
}
