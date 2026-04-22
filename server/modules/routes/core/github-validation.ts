const GITHUB_REPO_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const GITHUB_OWNER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;

export function normalizeGitHubRepoName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function isValidGitHubRepoName(value: string): boolean {
  if (!GITHUB_REPO_NAME_PATTERN.test(value)) return false;
  if (value === "." || value === "..") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  if (value.endsWith(".git")) return false;
  return true;
}

export function normalizeGitHubRepoFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function isValidGitHubRepoFullName(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  if (!owner || !repo) return false;
  if (!GITHUB_OWNER_PATTERN.test(owner)) return false;
  return isValidGitHubRepoName(repo.toLowerCase());
}
