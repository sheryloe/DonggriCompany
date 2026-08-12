import fs from "node:fs";
import path from "node:path";

type DbLike = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
};

type CliAccountPoolRow = {
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
  policy?: {
    requireExplicitSelection?: boolean;
    requireConnectedStatus?: boolean;
  };
};

const POOL_CAPABLE_PROVIDERS = new Set(["codex", "agy", "jules", "gemini", "antigravity"]);
const AUTH_ARTIFACT_MARKERS: Record<string, string[]> = {
  codex: [".codex/auth.json"],
  agy: [".gemini/antigravity-cli/settings.json", ".gemini/antigravity-cli/installation_id"],
  jules: [".jules/auth.json", ".jules/credentials.json", ".jules/cache/oauth_creds.json"],
  antigravity: [".gemini/antigravity-cli/settings.json", ".gemini/antigravity-cli/installation_id"],
  gemini: [".gemini/antigravity-cli/settings.json", ".gemini/antigravity-cli/installation_id"],
};

function normalizeRuntimeProvider(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "gemini" || value === "antigravity" ? "agy" : value;
}

function providerLookupKeys(provider: string): string[] {
  if (provider === "agy") return ["agy", "antigravity", "gemini"];
  return [provider];
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function resolveCliAccountProfileHome(provider: string, poolId: string, rawProfileHome: string): string {
  const profileHome = path.resolve(rawProfileHome);
  if (fs.existsSync(profileHome)) return profileHome;

  const normalizedRaw = rawProfileHome.replace(/[\\/]+/g, "/").toLowerCase();
  const legacySuffixes =
    provider === "agy"
      ? ["agy", "antigravity", "gemini"].map((entry) => `/.office-accounts/${entry}/${poolId}`.toLowerCase())
      : [`/.office-accounts/${provider}/${poolId}`.toLowerCase()];
  if (legacySuffixes.some((suffix) => normalizedRaw.endsWith(suffix))) {
    const repoScoped = path.resolve(process.cwd(), "data", "office-accounts", provider, poolId);
    if (fs.existsSync(repoScoped)) return repoScoped;
  }

  return profileHome;
}

export function hasCliAccountAuthArtifact(provider: string, profileHome: string): boolean {
  const markers = AUTH_ARTIFACT_MARKERS[provider];
  if (!markers) return true;
  return markers.some((relativePath) => fileExistsNonEmpty(path.join(profileHome, relativePath)));
}

function validateProfileHome(params: {
  provider: string;
  poolId: string;
  profileHomeRaw: string;
}): { ok: true; profileHome: string } | { ok: false; reason: string } {
  const { provider, poolId, profileHomeRaw } = params;
  const rawProfileHome = String(profileHomeRaw ?? "").trim();
  if (!rawProfileHome) {
    return {
      ok: false,
      reason: `profile_home is empty: provider=${provider} account_pool_id=${poolId}`,
    };
  }

  const profileHome = resolveCliAccountProfileHome(provider, poolId, rawProfileHome);
  try {
    const stat = fs.statSync(profileHome);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        reason: `profile_home is not a directory: ${profileHome}`,
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
  const provider = normalizeRuntimeProvider(input.provider);
  const poolId = String(input.cliAccountPoolId ?? "").trim();
  const platform = input.platform ?? process.platform;
  const requireExplicitSelection = input.policy?.requireExplicitSelection === true;
  const requireConnectedStatus = input.policy?.requireConnectedStatus === true;

  if (!POOL_CAPABLE_PROVIDERS.has(provider)) {
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
          `SELECT account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider IN (${providerLookupKeys(provider).map(() => "?").join(", ")}) AND account_pool_id = ?
           ${explicitStatusFilter}
           LIMIT 1`,
        )
        .get(...providerLookupKeys(provider), poolId) as CliAccountPoolRow | undefined;
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
             WHERE provider IN (${providerLookupKeys(provider).map(() => "?").join(", ")}) AND account_pool_id = ?
             LIMIT 1`,
          )
          .get(...providerLookupKeys(provider), poolId) as { account_pool_id?: string } | undefined;
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
          `SELECT account_pool_id, label, profile_home
           FROM cli_account_pools
           WHERE provider IN (${providerLookupKeys(provider).map(() => "?").join(", ")}) AND status = 'connected'
           ORDER BY COALESCE(last_verified_at, updated_at, created_at) DESC`,
        )
        .all(...providerLookupKeys(provider)) as CliAccountPoolRow[];
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

  const validatedHome = validateProfileHome({
    provider,
    poolId: resolvedPool.account_pool_id,
    profileHomeRaw: resolvedPool.profile_home,
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
    poolId: resolvedPool.account_pool_id,
    profileHome,
    poolLabel: resolvedPool.label ?? null,
    selectedBy,
    envPatch,
  };
}
