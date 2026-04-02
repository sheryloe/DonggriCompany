import { randomUUID } from "node:crypto";

import type { ProviderKey, ProviderProbeView } from "@workspace/shared";

import { withDatabase } from "./database.js";
import { PROVIDERS } from "./constants.js";
import { getDbPath } from "./paths.js";
import { probeProvider } from "./provider-probe/index.js";

type ProviderProbeRow = {
  provider: ProviderKey;
  cli_installed: number;
  executable_path: string | null;
  config_path: string | null;
  login_status: "unknown" | "logged_in" | "logged_out";
  checked_at: string;
};

const toProbeView = (row: ProviderProbeRow): ProviderProbeView => {
  return {
    provider: row.provider,
    cliInstalled: row.cli_installed === 1,
    executablePath: row.executable_path,
    configPath: row.config_path,
    loginStatus: row.login_status,
    checkedAt: row.checked_at
  };
};

export const listProvidersWithLatestProbe = (dbPath = getDbPath()): ProviderProbeView[] => {
  return withDatabase((db) => {
    const latestRows = db.prepare(
      `
      SELECT p.provider, p.cli_installed, p.executable_path, p.config_path, p.login_status, p.checked_at
      FROM provider_probe_results p
      INNER JOIN (
        SELECT provider, MAX(checked_at) AS latest_checked_at
        FROM provider_probe_results
        GROUP BY provider
      ) latest
      ON p.provider = latest.provider AND p.checked_at = latest.latest_checked_at
      ORDER BY p.provider ASC
      `
    ).all() as ProviderProbeRow[];

    const viewMap = new Map(latestRows.map((row) => [row.provider, toProbeView(row)]));

    return PROVIDERS.map((provider) => {
      const existing = viewMap.get(provider);
      if (existing) {
        return existing;
      }

      return {
        provider,
        cliInstalled: false,
        executablePath: null,
        configPath: null,
        loginStatus: "unknown",
        checkedAt: null
      };
    });
  }, dbPath);
};

export const runProviderProbeAndPersist = (
  provider: ProviderKey,
  dbPath = getDbPath()
): ProviderProbeView & { checkedAt: string } => {
  const probe = probeProvider(provider);

  return withDatabase((db) => {
    db.prepare(
      `
      INSERT INTO provider_probe_results (
        id,
        provider,
        cli_installed,
        executable_path,
        config_path,
        login_status,
        raw_json,
        checked_at
      )
      VALUES (
        @id,
        @provider,
        @cli_installed,
        @executable_path,
        @config_path,
        @login_status,
        @raw_json,
        @checked_at
      )
      `
    ).run({
      id: randomUUID(),
      provider: probe.provider,
      cli_installed: probe.cliInstalled ? 1 : 0,
      executable_path: probe.executablePath,
      config_path: probe.configPath,
      login_status: probe.loginStatus,
      raw_json: JSON.stringify(probe.diagnostics),
      checked_at: probe.checkedAt
    });

    return {
      provider: probe.provider,
      cliInstalled: probe.cliInstalled,
      executablePath: probe.executablePath,
      configPath: probe.configPath,
      loginStatus: probe.loginStatus,
      checkedAt: probe.checkedAt
    };
  }, dbPath);
};