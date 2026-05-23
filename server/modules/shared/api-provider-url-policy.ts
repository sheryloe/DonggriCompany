import { isIP } from "node:net";

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

function parseIPv4Parts(hostname: string): number[] | null {
  if (!isIPv4(hostname)) return null;
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function isPrivateIPv4Parts(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseIPv4MappedIPv6Parts(hostname: string): number[] | null {
  const host = normalizeHost(hostname);
  const mapped = host.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1] ?? "", 16);
  const low = Number.parseInt(mapped[2] ?? "", 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return null;
  }
  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255];
}

function isLoopbackIPv6Host(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (isIP(host) !== 6) return false;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;

  const mappedIPv4 = parseIPv4MappedIPv6Parts(host);
  if (mappedIPv4) return mappedIPv4[0] === 127;
  return false;
}

function isPrivateIPv6Host(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (isIP(host) !== 6) return false;
  if (host === "::" || isLoopbackIPv6Host(host)) return true;

  const mappedIPv4 = parseIPv4MappedIPv6Parts(host);
  if (mappedIPv4) return isPrivateIPv4Parts(mappedIPv4);

  const firstHextet = Number.parseInt(host.split(":")[0] || "0", 16);
  if (!Number.isInteger(firstHextet)) return true;
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true;
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  return false;
}

function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (isLoopbackIPv6Host(host)) return true;

  const parts = parseIPv4Parts(host);
  if (!parts) return false;
  return parts[0] === 127;
}

function isLoopbackOrPrivateHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (isLoopbackHost(host)) return true;
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (isPrivateIPv6Host(host)) return true;

  const parts = parseIPv4Parts(host);
  if (!parts) return false;
  return isPrivateIPv4Parts(parts);
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
