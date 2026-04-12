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
  policy?: {
    requireExplicitSelection?: boolean;
    requireConnectedStatus?: boolean;
  };
};

const POOL_CAPABLE_PROVIDERS = new Set(["codex", "gemini", "jules"]);

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

  const profileHome = path.resolve(rawProfileHome);
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

  return { ok: true, profileHome };
}

export function resolveCliAccountPoolEnv(input: ResolveCliAccountPoolEnvInput): CliAccountPoolEnvResolution {
  const provider = String(input.provider ?? "")
    .trim()
    .toLowerCase();
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
          `SELECT account_pool_id, label, profile_home
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
      return {
        ok: false,
        reason: `multiple_pools_require_explicit_selection: provider=${provider} count=${connectedPools.length}`,
      };
    }
    if (connectedPools.length === 1) {
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
