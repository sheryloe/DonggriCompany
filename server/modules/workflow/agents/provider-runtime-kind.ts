export type ProviderRuntimeKind = "cli_stream" | "http_stream" | "async_session" | "api";

const PROVIDER_RUNTIME_KIND_MAP: Record<string, ProviderRuntimeKind> = {
  agy: "cli_stream",
  api: "api",
  copilot: "http_stream",
  jules: "async_session",
  claude: "cli_stream",
  codex: "cli_stream",
  // Legacy records are normalized at write boundaries, but still execute through AGY.
  antigravity: "cli_stream",
  gemini: "cli_stream",
  opencode: "cli_stream",
  kimi: "cli_stream",
};

export function resolveProviderRuntimeKind(provider: string | null | undefined): ProviderRuntimeKind | null {
  const key = String(provider ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return PROVIDER_RUNTIME_KIND_MAP[key] ?? null;
}

export function isSupportedExecutionProvider(provider: string | null | undefined): boolean {
  return resolveProviderRuntimeKind(provider) !== null;
}
