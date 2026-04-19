import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import {
  BUILTIN_GITHUB_CLIENT_ID,
  BUILTIN_GOOGLE_CLIENT_ID,
  BUILTIN_GOOGLE_CLIENT_SECRET,
  OAUTH_BASE_URL,
  OAUTH_STATE_TTL_MS,
  appendOAuthQuery,
  b64url,
  decryptSecret,
  encryptSecret,
  pkceVerifier,
  sanitizeOAuthRedirect,
} from "../../../../oauth/helpers.ts";

type OAuthStateRow = {
  provider: string;
  verifier_enc: string;
  redirect_to: string | null;
  created_at: number;
};

type GoogleOAuthEnvSnapshot = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  email: string | null;
};

export function createOAuthRouteHelpers(ctx: RuntimeContext) {
  const { db, nowMs, getNextOAuthLabel, normalizeOAuthProvider, setActiveOAuthAccount, ensureOAuthActiveAccount } = ctx;
  const oauthRuntimeEnvPath = (() => {
    const explicit = (process.env.OAUTH_RUNTIME_ENV_PATH ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (explicit) return explicit;
    const dbPath = (process.env.DB_PATH ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (dbPath) return path.join(path.dirname(dbPath), ".env.oauth");
    return path.resolve(process.cwd(), "data", ".env.oauth");
  })();

  function readSettingString(key: string): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
      | { value?: unknown }
      | undefined;
    if (!row) return "";
    const raw = String(row.value ?? "")
      .replace(/^"|"$/g, "")
      .trim();
    const lowered = raw.toLowerCase();
    if (!raw || lowered === "null" || lowered === "undefined") return "";
    if (raw === "__CHANGE_ME__") return "";
    if (raw.startsWith("YOUR_")) return "";
    return raw;
  }

  function readEnvString(key: string): string {
    const raw = String(process.env[key] ?? "")
      .replace(/^"|"$/g, "")
      .trim();
    const lowered = raw.toLowerCase();
    if (!raw || lowered === "null" || lowered === "undefined") return "";
    if (raw === "__CHANGE_ME__") return "";
    if (raw.startsWith("YOUR_")) return "";
    return raw;
  }

  function loadEnvMap(filePath: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(filePath)) return map;
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!key) continue;
      map.set(key, value);
    }
    return map;
  }

  function saveEnvMap(filePath: string, map: Map<string, string>): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload =
      [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n";
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, payload, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  function persistGoogleOAuthRuntimeEnv(snapshot: GoogleOAuthEnvSnapshot): void {
    try {
      const map = loadEnvMap(oauthRuntimeEnvPath);
      map.set("OAUTH_GOOGLE_CLIENT_ID", snapshot.clientId);
      map.set("OAUTH_GOOGLE_CLIENT_SECRET", snapshot.clientSecret);
      map.set("OAUTH_GOOGLE_ACCESS_TOKEN", snapshot.accessToken);
      if (snapshot.refreshToken) {
        map.set("OAUTH_GOOGLE_REFRESH_TOKEN", snapshot.refreshToken);
      }
      if (snapshot.expiresAt) {
        map.set("OAUTH_GOOGLE_EXPIRES_AT", String(snapshot.expiresAt));
      }
      if (snapshot.scope) {
        map.set("OAUTH_GOOGLE_SCOPE", snapshot.scope);
      }
      if (snapshot.email) {
        map.set("OAUTH_GOOGLE_EMAIL", snapshot.email);
      }
      map.set("OAUTH_GOOGLE_UPDATED_AT", String(Date.now()));
      saveEnvMap(oauthRuntimeEnvPath, map);

      // Apply immediately without restart
      process.env.OAUTH_GOOGLE_CLIENT_ID = snapshot.clientId;
      process.env.OAUTH_GOOGLE_CLIENT_SECRET = snapshot.clientSecret;
      process.env.OAUTH_GOOGLE_ACCESS_TOKEN = snapshot.accessToken;
      if (snapshot.refreshToken) process.env.OAUTH_GOOGLE_REFRESH_TOKEN = snapshot.refreshToken;
      if (snapshot.expiresAt) process.env.OAUTH_GOOGLE_EXPIRES_AT = String(snapshot.expiresAt);
      if (snapshot.scope) process.env.OAUTH_GOOGLE_SCOPE = snapshot.scope;
      if (snapshot.email) process.env.OAUTH_GOOGLE_EMAIL = snapshot.email;
      process.env.OAUTH_GOOGLE_UPDATED_AT = String(Date.now());
    } catch (err) {
      console.warn("[oauth] failed to persist Google OAuth runtime env:", err);
    }
  }

  function consumeOAuthState(
    stateId: string,
    provider: string,
  ): { verifier_enc: string; redirect_to: string | null } | null {
    const row = db
      .prepare("SELECT provider, verifier_enc, redirect_to, created_at FROM oauth_states WHERE id = ?")
      .get(stateId) as OAuthStateRow | undefined;
    if (!row) return null;
    db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
    if (Date.now() - row.created_at > OAUTH_STATE_TTL_MS) return null;
    if (row.provider !== provider) return null;
    return { verifier_enc: row.verifier_enc, redirect_to: row.redirect_to };
  }

  function upsertOAuthCredential(input: {
    provider: string;
    source: string;
    email: string | null;
    scope: string | null;
    access_token: string;
    refresh_token: string | null;
    expires_at: number | null;
    label?: string | null;
    model_override?: string | null;
    make_active?: boolean;
  }): string {
    const normalizedProvider = normalizeOAuthProvider(input.provider) ?? input.provider;
    const now = nowMs();
    const accessEnc = encryptSecret(input.access_token);
    const refreshEnc = input.refresh_token ? encryptSecret(input.refresh_token) : null;
    const encData = encryptSecret(JSON.stringify({ access_token: input.access_token }));

    db.prepare(
      `
    INSERT INTO oauth_credentials (provider, source, encrypted_data, email, scope, expires_at, created_at, updated_at, access_token_enc, refresh_token_enc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      source = excluded.source,
      encrypted_data = excluded.encrypted_data,
      email = excluded.email,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc
  `,
    ).run(
      normalizedProvider,
      input.source,
      encData,
      input.email,
      input.scope,
      input.expires_at,
      now,
      now,
      accessEnc,
      refreshEnc,
    );

    let accountId: string | null = null;
    if (input.email) {
      const existing = db
        .prepare("SELECT id FROM oauth_accounts WHERE provider = ? AND email = ? ORDER BY updated_at DESC LIMIT 1")
        .get(normalizedProvider, input.email) as { id: string } | undefined;
      if (existing) accountId = existing.id;
    }

    if (!accountId) {
      const nextPriority = (
        db
          .prepare("SELECT COALESCE(MAX(priority), 90) + 10 AS p FROM oauth_accounts WHERE provider = ?")
          .get(normalizedProvider) as { p: number }
      ).p;
      const defaultLabel = getNextOAuthLabel(normalizedProvider);
      accountId = randomUUID();
      db.prepare(
        `
      INSERT INTO oauth_accounts (
        id, provider, source, label, email, scope, expires_at,
        access_token_enc, refresh_token_enc, status, priority, model_override,
        failure_count, last_error, last_error_at, last_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, NULL, NULL, ?, ?, ?)
    `,
      ).run(
        accountId,
        normalizedProvider,
        input.source,
        input.label ?? defaultLabel,
        input.email,
        input.scope,
        input.expires_at,
        accessEnc,
        refreshEnc,
        nextPriority,
        null,
        now,
        now,
        now,
      );
    } else {
      let resolvedLabel: string | null = input.label ?? null;
      if (!resolvedLabel) {
        const current = db.prepare("SELECT label, email FROM oauth_accounts WHERE id = ?").get(accountId) as
          | { label: string | null; email: string | null }
          | undefined;
        if (!current?.label || (current.email && current.label === current.email)) {
          resolvedLabel = getNextOAuthLabel(normalizedProvider);
        }
      }
      db.prepare(
        `
      UPDATE oauth_accounts
      SET source = ?,
          label = COALESCE(?, label),
          email = ?,
          scope = ?,
          expires_at = ?,
          access_token_enc = ?,
          refresh_token_enc = ?,
          model_override = COALESCE(?, model_override),
          status = 'active',
          updated_at = ?,
          last_success_at = ?,
          failure_count = 0,
          last_error = NULL,
          last_error_at = NULL
      WHERE id = ?
    `,
      ).run(
        input.source,
        resolvedLabel,
        input.email,
        input.scope,
        input.expires_at,
        accessEnc,
        refreshEnc,
        null,
        now,
        now,
        accountId,
      );
    }

    if (input.make_active !== false && accountId) {
      setActiveOAuthAccount(normalizedProvider, accountId);
    }

    ensureOAuthActiveAccount(normalizedProvider);
    return accountId;
  }

  function startGitHubOAuth(redirectTo: string | undefined, callbackPath: string): string {
    const customClientId = readSettingString("github_oauth_client_id");
    const clientId = customClientId || BUILTIN_GITHUB_CLIENT_ID || readEnvString("OAUTH_GITHUB_CLIENT_ID");
    if (!clientId) throw new Error("missing_OAUTH_GITHUB_CLIENT_ID");
    const stateId = randomUUID();
    const safeRedirect = sanitizeOAuthRedirect(redirectTo);
    db.prepare(
      "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)",
    ).run(stateId, "github", Date.now(), "none", safeRedirect);

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}${callbackPath}`);
    url.searchParams.set("state", stateId);
    url.searchParams.set("scope", "read:user user:email repo");
    return url.toString();
  }

  function startGoogleAntigravityOAuth(redirectTo: string | undefined, callbackPath: string): string {
    const customClientId = readSettingString("google_oauth_client_id");
    const clientId = customClientId || BUILTIN_GOOGLE_CLIENT_ID || readEnvString("OAUTH_GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("missing_OAUTH_GOOGLE_CLIENT_ID");
    const stateId = randomUUID();
    const verifier = pkceVerifier();
    const safeRedirect = sanitizeOAuthRedirect(redirectTo);
    const verifierEnc = encryptSecret(verifier);
    db.prepare(
      "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)",
    ).run(stateId, "google_antigravity", Date.now(), verifierEnc, safeRedirect);

    const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}${callbackPath}`);
    url.searchParams.set(
      "scope",
      ["https://www.googleapis.com/auth/cloud-platform", "openid", "email", "profile"].join(" "),
    );
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", stateId);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  async function handleGitHubCallback(
    code: string,
    stateId: string,
    callbackPath: string,
  ): Promise<{ redirectTo: string }> {
    const stateRow = consumeOAuthState(stateId, "github");
    if (!stateRow) throw new Error("Invalid or expired state");

    const redirectTo = stateRow.redirect_to || "/";
    const customClientId = readSettingString("github_oauth_client_id");
    const clientId = customClientId || BUILTIN_GITHUB_CLIENT_ID || readEnvString("OAUTH_GITHUB_CLIENT_ID");
    const clientSecret = readEnvString("OAUTH_GITHUB_CLIENT_SECRET");

    const tokenBody: Record<string, string> = {
      client_id: clientId,
      code,
      redirect_uri: `${OAUTH_BASE_URL}${callbackPath}`,
    };
    if (clientSecret) tokenBody.client_secret = clientSecret;

    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokenBody),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = (await tokenResp.json()) as { access_token?: string; error?: string; scope?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error || "No access token received");

    let email: string | null = null;
    try {
      const emailResp = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "climpire",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (emailResp.ok) {
        const emails = (await emailResp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified);
        if (primary) email = primary.email;
      }
    } catch {
      // email fetch is best-effort
    }

    const grantedScope = tokenData.scope?.trim() || null;
    upsertOAuthCredential({
      provider: "github",
      source: "web-oauth",
      email,
      scope: grantedScope,
      access_token: tokenData.access_token,
      refresh_token: null,
      expires_at: null,
    });

    return {
      redirectTo: appendOAuthQuery(
        redirectTo.startsWith("/") ? `${OAUTH_BASE_URL}${redirectTo}` : redirectTo,
        "oauth",
        "github-copilot",
      ),
    };
  }

  async function handleGoogleAntigravityCallback(
    code: string,
    stateId: string,
    callbackPath: string,
  ): Promise<{ redirectTo: string }> {
    const stateRow = consumeOAuthState(stateId, "google_antigravity");
    if (!stateRow) throw new Error("Invalid or expired state");

    const redirectTo = stateRow.redirect_to || "/";
    const customClientId = readSettingString("google_oauth_client_id");
    const customClientSecret = readSettingString("google_oauth_client_secret");
    const clientId = customClientId || BUILTIN_GOOGLE_CLIENT_ID || readEnvString("OAUTH_GOOGLE_CLIENT_ID");
    const clientSecret =
      customClientSecret || BUILTIN_GOOGLE_CLIENT_SECRET || readEnvString("OAUTH_GOOGLE_CLIENT_SECRET");
    if (!clientId) throw new Error("missing_OAUTH_GOOGLE_CLIENT_ID");
    const verifier = decryptSecret(stateRow.verifier_enc);
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      code,
      redirect_uri: `${OAUTH_BASE_URL}${callbackPath}`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    if (clientSecret) tokenBody.set("client_secret", clientSecret);

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      signal: AbortSignal.timeout(10000),
    });
    const tokenRaw = await tokenResp.text();
    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
      scope?: string;
    };
    try {
      tokenData = JSON.parse(tokenRaw) as typeof tokenData;
    } catch {
      tokenData = {};
    }
    if (!tokenData.access_token) {
      const details = [
        tokenData.error || "unknown_error",
        tokenData.error_description || "",
        `status=${tokenResp.status}`,
      ]
        .filter(Boolean)
        .join(" | ");
      throw new Error(`google_token_exchange_failed: ${details}`);
    }

    let email: string | null = null;
    try {
      const userResp = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (userResp.ok) {
        const ui = (await userResp.json()) as { email?: string };
        if (ui?.email) email = ui.email;
      }
    } catch {
      // userinfo best-effort
    }

    const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null;
    const scope = tokenData.scope || "openid email profile";

    upsertOAuthCredential({
      provider: "google_antigravity",
      source: "web-oauth",
      email,
      scope,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
    });
    persistGoogleOAuthRuntimeEnv({
      clientId,
      clientSecret,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt,
      scope,
      email,
    });

    return {
      redirectTo: appendOAuthQuery(
        redirectTo.startsWith("/") ? `${OAUTH_BASE_URL}${redirectTo}` : redirectTo,
        "oauth",
        "antigravity",
      ),
    };
  }

  return {
    consumeOAuthState,
    upsertOAuthCredential,
    startGitHubOAuth,
    startGoogleAntigravityOAuth,
    handleGitHubCallback,
    handleGoogleAntigravityCallback,
  };
}
