import type { ProbeLoginStatus, ProviderKey } from "@workspace/shared";

export type ProviderProbeAdapter = {
  provider: ProviderKey;
  binary: string;
  resolveConfigCandidates: () => string[];
  loginSignalFiles: string[];
};

export type ProviderProbeResult = {
  provider: ProviderKey;
  cliInstalled: boolean;
  executablePath: string | null;
  configPath: string | null;
  loginStatus: ProbeLoginStatus;
  checkedAt: string;
  diagnostics: Record<string, unknown>;
};