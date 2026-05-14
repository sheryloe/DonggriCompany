export type ApiProviderUrlPolicyType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openrouter"
  | "together"
  | "groq"
  | "cerebras"
  | "custom";

const PRIVATE_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isIPv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (!isIPv4(host)) return false;

  const parts = host.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a] = parts;
  if (a === 127) return true;
  return false;
}

function isLoopbackOrPrivateHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (isLoopbackHost(host)) return true;
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (!isIPv4(host)) return false;

  const parts = host.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function normalizeApiProviderBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, "");
  url = url.replace(/\/v1\/(chat\/completions|models|messages|embeddings)$/i, "/v1");
  url = url.replace(/\/(v\d+)\/(chat\/completions|models|messages|embeddings)$/i, "/$1");
  url = url.replace(/\/v1beta\/models\/.+$/i, "/v1beta");
  return url;
}

export function validateApiProviderBaseUrl(type: ApiProviderUrlPolicyType, rawUrl: string): string | null {
  const normalized = normalizeApiProviderBaseUrl(rawUrl);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return "invalid_base_url";
  }

  if (url.username || url.password) return "base_url_must_not_include_credentials";
  if (url.protocol !== "https:" && url.protocol !== "http:") return "base_url_protocol_not_allowed";

  const isPrivateTarget = isLoopbackOrPrivateHost(url.hostname);
  if (type === "ollama") {
    if (!isLoopbackHost(url.hostname)) return "ollama_base_url_must_be_loopback";
    return null;
  }

  if (url.protocol !== "https:") return "base_url_must_use_https";
  if (isPrivateTarget) return "base_url_private_network_not_allowed";
  return null;
}
