import * as vscode from "vscode";
import type { DefaultProjectBindingMode, DonggriServerConfig } from "./types";

export function readDonggriServerConfig(): DonggriServerConfig {
  const config = vscode.workspace.getConfiguration("donggri");
  const serverUrl = (config.get<string>("serverUrl", "http://127.0.0.1:8790") || "http://127.0.0.1:8790").replace(
    /\/+$/u,
    "",
  );

  return {
    serverUrl,
    apiToken: (config.get<string>("apiToken", "") || "").trim(),
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
