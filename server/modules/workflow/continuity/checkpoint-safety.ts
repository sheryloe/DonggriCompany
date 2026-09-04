const SENSITIVE_VALUE_PATTERNS = [
  /-----BEGIN (?:(?:DSA|EC|ENCRYPTED|OPENSSH|RSA) )?PRIVATE KEY-----/i,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
  /\b(?:Authorization\s*[:=]\s*)?(?:Basic|Bearer|Digest|AWS4-HMAC-SHA256)\s+\S+/i,
  /(?:^|[?&#\s,{])(?:["']?)(?:access|auth|gitlab|oauth|refresh|slack)[_-]?token(?:["']?)\s*[:=]\s*["']?[^\s,;&}"']+/i,
  /(?:^|[\s,{])(?:["']?)(?:authorization[_-]?header|credentials?|passphrase|password|passwd|private[_-]?key|pwd|session[_-]?cookie)(?:["']?)\s*[:=]\s*["']?[^\s,;}"']+/i,
  /\b(?:github_pat_|ghp_|sk-|xapp-|xox[a-z]-)[A-Za-z0-9_-]{8,}\b/i,
  /\bgl(?:pat|dt|rt|cbt|soat)-[A-Za-z0-9_-]{8,}\b/i,
] as const;

export interface SensitiveCheckpointValue {
  path: Array<string | number>;
  reason: "credential_like_value";
}

export function findSensitiveCheckpointValues(value: unknown): SensitiveCheckpointValue[] {
  const findings: SensitiveCheckpointValue[] = [];

  function visit(candidate: unknown, path: Array<string | number>): void {
    if (typeof candidate === "string") {
      if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(candidate))) {
        findings.push({ path, reason: "credential_like_value" });
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, item]) => visit(item, [...path, key]));
    }
  }

  visit(value, []);
  return findings;
}
