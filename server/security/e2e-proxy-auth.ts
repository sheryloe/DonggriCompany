type E2EProxyAuthPolicyInput = {
  token: string;
  isolatedRuntime: boolean;
  apiTarget: string;
  wsTarget: string;
  remoteAddress: string | undefined;
};

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

function isLoopbackRemoteAddress(value: string | undefined): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

export function shouldInjectE2EProxyAuth(input: E2EProxyAuthPolicyInput): boolean {
  return (
    Boolean(input.token.trim()) &&
    input.isolatedRuntime &&
    isLoopbackUrl(input.apiTarget) &&
    isLoopbackUrl(input.wsTarget) &&
    isLoopbackRemoteAddress(input.remoteAddress)
  );
}
