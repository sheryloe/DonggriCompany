import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface GeminiCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  source: "keychain" | "file";
}

export function createCredentialTools() {
  function jsonHasKey(filePath: string, key: string): boolean {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const j = JSON.parse(raw);
      return j != null && typeof j === "object" && key in j && j[key] != null;
    } catch {
      return false;
    }
  }

  function fileExistsNonEmpty(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      return stat.isFile() && stat.size > 2;
    } catch {
      return false;
    }
  }

  function readClaudeToken(): string | null {
    if (process.platform === "darwin") {
      try {
        const raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
          timeout: 3000,
        })
          .toString()
          .trim();
        const j = JSON.parse(raw);
        if (j?.claudeAiOauth?.accessToken) return j.claudeAiOauth.accessToken;
      } catch {
        /* ignore */
      }
    }
    const home = os.homedir();
    try {
      const credsPath = path.join(home, ".claude", ".credentials.json");
      if (fs.existsSync(credsPath)) {
        const j = JSON.parse(fs.readFileSync(credsPath, "utf8"));
        if (j?.claudeAiOauth?.accessToken) return j.claudeAiOauth.accessToken;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function readCodexTokens(): { access_token: string; account_id: string } | null {
    try {
      const authPath = path.join(os.homedir(), ".codex", "auth.json");
      const j = JSON.parse(fs.readFileSync(authPath, "utf8"));
      if (j?.tokens?.access_token && j?.tokens?.account_id) {
        return { access_token: j.tokens.access_token, account_id: j.tokens.account_id };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  // Gemini OAuth refresh credentials must come from env in public deployments.
  const GEMINI_OAUTH_CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID ?? process.env.OAUTH_GOOGLE_CLIENT_ID ?? "";
  const GEMINI_OAUTH_CLIENT_SECRET =
    process.env.GEMINI_OAUTH_CLIENT_SECRET ?? process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "";
  const GEMINI_DEFAULT_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
  const GEMINI_DEFAULT_CLIENT_SECRET = "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";

  function normalizeOAuthClientValue(value: string): string {
    const normalized = value.trim();
    if (!normalized) return "";
    if (normalized === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") return "";
    if (normalized === "YOUR_GOOGLE_CLIENT_SECRET") return "";
    return normalized;
  }

  function readGeminiCredsFromKeychain(): GeminiCreds | null {
    if (process.platform !== "darwin") return null;
    try {
      const raw = execFileSync(
        "security",
        ["find-generic-password", "-s", "gemini-cli-oauth", "-a", "main-account", "-w"],
        { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] },
      )
        .toString()
        .trim();
      if (!raw) return null;
      const stored = JSON.parse(raw);
      if (!stored?.token?.accessToken) return null;
      return {
        access_token: stored.token.accessToken,
        refresh_token: stored.token.refreshToken ?? "",
        expiry_date: stored.token.expiresAt ?? 0,
        source: "keychain",
      };
    } catch {
      return null;
    }
  }

  function readGeminiCredsFromFile(): GeminiCreds | null {
    try {
      const p = path.join(os.homedir(), ".gemini", "oauth_creds.json");
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j?.access_token) {
        return {
          access_token: j.access_token,
          refresh_token: j.refresh_token ?? "",
          expiry_date: j.expiry_date ?? 0,
          source: "file",
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function readGeminiCreds(): GeminiCreds | null {
    return readGeminiCredsFromKeychain() ?? readGeminiCredsFromFile();
  }

  async function freshGeminiToken(): Promise<string | null> {
    const creds = readGeminiCreds();
    if (!creds) return null;
    if (creds.expiry_date > Date.now() + 300_000) return creds.access_token;
    if (!creds.refresh_token) return creds.access_token;
    const clientId = normalizeOAuthClientValue(GEMINI_OAUTH_CLIENT_ID) || GEMINI_DEFAULT_CLIENT_ID;
    const clientSecret = normalizeOAuthClientValue(GEMINI_OAUTH_CLIENT_SECRET) || GEMINI_DEFAULT_CLIENT_SECRET;
    try {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: creds.refresh_token,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return creds.access_token;
      const data = (await resp.json()) as { access_token?: string; expires_in?: number; refresh_token?: string };
      if (!data.access_token) return creds.access_token;
      if (creds.source === "file") {
        try {
          const p = path.join(os.homedir(), ".gemini", "oauth_creds.json");
          const raw = JSON.parse(fs.readFileSync(p, "utf8"));
          raw.access_token = data.access_token;
          if (data.refresh_token) raw.refresh_token = data.refresh_token;
          raw.expiry_date = Date.now() + (data.expires_in ?? 3600) * 1000;
          fs.writeFileSync(p, JSON.stringify(raw, null, 2), { mode: 0o600 });
        } catch {
          /* ignore write failure */
        }
      }
      return data.access_token;
    } catch {
      return creds.access_token;
    }
  }

  let geminiProjectCache: { id: string; fetchedAt: number; tokenHash: string } | null = null;
  const GEMINI_PROJECT_TTL = 300_000; // 5 minutes

  async function getGeminiProjectId(token: string): Promise<string | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 16);
    const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (envProject) return envProject;

    try {
      const settingsPath = path.join(os.homedir(), ".gemini", "settings.json");
      const j = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const settingsProject = j?.cloudaicompanionProject?.id ?? j?.cloudaicompanionProject;
      if (typeof settingsProject === "string" && settingsProject) return settingsProject;
    } catch {
      /* ignore */
    }

    if (
      geminiProjectCache &&
      geminiProjectCache.tokenHash === tokenHash &&
      Date.now() - geminiProjectCache.fetchedAt < GEMINI_PROJECT_TTL
    ) {
      return geminiProjectCache.id;
    }

    try {
      const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "google-api-nodejs-client/9.15.1",
          "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
          "Client-Metadata": JSON.stringify({
            ideType: "ANTIGRAVITY",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          }),
        },
        body: JSON.stringify({
          metadata: { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        cloudaicompanionProject?: string | { id?: string | null } | null;
      };
      const discoveredProject =
        typeof data?.cloudaicompanionProject === "string"
          ? data.cloudaicompanionProject
          : (data?.cloudaicompanionProject?.id ?? "");
      if (discoveredProject) {
        geminiProjectCache = { id: discoveredProject, fetchedAt: Date.now(), tokenHash };
        return geminiProjectCache.id;
      }
    } catch {
      /* ignore */
    }

    try {
      const resp = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=1", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "climpire",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          projects?: Array<{ projectId?: string; lifecycleState?: string }>;
        };
        const firstActiveProjectId = data.projects?.find(
          (project) =>
            project?.lifecycleState === "ACTIVE" && typeof project?.projectId === "string" && project.projectId,
        )?.projectId;
        if (firstActiveProjectId) {
          geminiProjectCache = { id: firstActiveProjectId, fetchedAt: Date.now(), tokenHash };
          return firstActiveProjectId;
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  return {
    jsonHasKey,
    fileExistsNonEmpty,
    readClaudeToken,
    readCodexTokens,
    readGeminiCredsFromKeychain,
    readGeminiCredsFromFile,
    readGeminiCreds,
    freshGeminiToken,
    getGeminiProjectId,
  };
}
