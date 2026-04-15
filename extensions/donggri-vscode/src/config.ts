import * as vscode from "vscode";
import type { DefaultProjectBindingMode, DonggriServerConfig } from "./types";

const API_TOKEN_SECRET_KEY = "donggri.apiToken";

let cachedSecretApiToken = "";

function normalizeApiToken(value: string | null | undefined): string {
  return (value || "").trim();
}

function readLegacyApiToken(): string {
  return normalizeApiToken(vscode.workspace.getConfiguration("donggri").get<string>("apiToken", ""));
}

async function clearLegacyApiTokenSetting(): Promise<void> {
  const config = vscode.workspace.getConfiguration("donggri");
  const inspected = config.inspect<string>("apiToken");
  const updates: Promise<void>[] = [];

  if (inspected?.globalValue !== undefined) {
    updates.push(Promise.resolve(config.update("apiToken", "", vscode.ConfigurationTarget.Global)));
  }
  if (inspected?.workspaceValue !== undefined) {
    updates.push(Promise.resolve(config.update("apiToken", "", vscode.ConfigurationTarget.Workspace)));
  }
  if (inspected?.workspaceFolderValue !== undefined) {
    updates.push(Promise.resolve(config.update("apiToken", "", vscode.ConfigurationTarget.WorkspaceFolder)));
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

export async function initializeDonggriServerConfig(context: vscode.ExtensionContext): Promise<void> {
  const storedSecret = normalizeApiToken(await context.secrets.get(API_TOKEN_SECRET_KEY));
  if (storedSecret) {
    cachedSecretApiToken = storedSecret;
    return;
  }

  const legacyToken = readLegacyApiToken();
  cachedSecretApiToken = legacyToken;
  if (!legacyToken) {
    return;
  }

  await context.secrets.store(API_TOKEN_SECRET_KEY, legacyToken);
  await clearLegacyApiTokenSetting();
}

export async function setDonggriApiToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  const normalized = normalizeApiToken(token);
  cachedSecretApiToken = normalized;
  if (normalized) {
    await context.secrets.store(API_TOKEN_SECRET_KEY, normalized);
    return;
  }
  await context.secrets.delete(API_TOKEN_SECRET_KEY);
}

export async function clearDonggriApiToken(context: vscode.ExtensionContext): Promise<void> {
  cachedSecretApiToken = "";
  await context.secrets.delete(API_TOKEN_SECRET_KEY);
}

export function readDonggriServerConfig(): DonggriServerConfig {
  const config = vscode.workspace.getConfiguration("donggri");
  const serverUrl = (config.get<string>("serverUrl", "http://127.0.0.1:8790") || "http://127.0.0.1:8790").replace(
    /\/+$/u,
    "",
  );

  return {
    serverUrl,
    apiToken: cachedSecretApiToken || readLegacyApiToken(),
    autoConnect: config.get<boolean>("autoConnect", true),
    defaultProjectBindingMode: config.get<DefaultProjectBindingMode>("defaultProjectBindingMode", "match-or-create"),
  };
}

export function isDonggriConfigChange(event: vscode.ConfigurationChangeEvent): boolean {
  return (
    event.affectsConfiguration("donggri.serverUrl") ||
    event.affectsConfiguration("donggri.apiToken") ||
    event.affectsConfiguration("donggri.autoConnect") ||
    event.affectsConfiguration("donggri.defaultProjectBindingMode")
  );
}
