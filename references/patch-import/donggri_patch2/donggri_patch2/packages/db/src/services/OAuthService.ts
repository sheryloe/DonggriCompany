import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import Database from "better-sqlite3";

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db || !_db.open) {
    const dbPath = process.env.WORKSPACE_DB_PATH ?? ".local/workspace.sqlite";
    _db = new Database(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA busy_timeout = 5000");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}

// ── 암호화 헬퍼 ──────────────────────────────────────────────────────
const ENCRYPTION_KEY_RAW = process.env.OFFICE_OAUTH_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "donggri-default-key-change-in-prod";
const ENCRYPTION_KEY = createHash("sha256").update(ENCRYPTION_KEY_RAW).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptSecret(enc: string): string {
  const [ivB64, tagB64, ctB64] = enc.split(".");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ── PKCE 헬퍼 ────────────────────────────────────────────────────────
export function pkceVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest().toString("base64url");
}

// ── OAuth State TTL ───────────────────────────────────────────────────
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10분

// ── OAuthService ─────────────────────────────────────────────────────
export class OAuthService {
  private nowMs(): number { return Date.now(); }

  // ── GitHub OAuth 시작 ─────────────────────────────────────────────
  startGitHub(redirectTo?: string): { stateId: string; authorizeUrl: string } {
    const db = getDb();
    const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
    if (!clientId) throw new Error("OAUTH_GITHUB_CLIENT_ID not configured");

    const stateId = randomUUID();
    db.prepare(
      "INSERT INTO oauth_states (id, provider, verifier_enc, redirect_to, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(stateId, "github", "none", redirectTo ?? null, this.nowMs());

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${process.env.OAUTH_BASE_URL ?? "http://localhost:4315"}/api/oauth/callback/github`);
    url.searchParams.set("state", stateId);
    url.searchParams.set("scope", "read:user user:email");

    return { stateId, authorizeUrl: url.toString() };
  }

  // ── Google OAuth 시작 (PKCE) ──────────────────────────────────────
  startGoogle(redirectTo?: string): { stateId: string; authorizeUrl: string } {
    const db = getDb();
    const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("OAUTH_GOOGLE_CLIENT_ID not configured");

    const stateId = randomUUID();
    const verifier = pkceVerifier();
    const challenge = pkceChallenge(verifier);
    db.prepare(
      "INSERT INTO oauth_states (id, provider, verifier_enc, redirect_to, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(stateId, "google", encryptSecret(verifier), redirectTo ?? null, this.nowMs());

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", `${process.env.OAUTH_BASE_URL ?? "http://localhost:4315"}/api/oauth/callback/google`);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", stateId);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    return { stateId, authorizeUrl: url.toString() };
  }

  // ── State 소비 (1회용) ────────────────────────────────────────────
  consumeState(stateId: string, provider: string): { verifierEnc: string; redirectTo: string | null } | null {
    const db = getDb();
    const row = db.prepare(
      "SELECT provider, verifier_enc, redirect_to, created_at FROM oauth_states WHERE id = ?"
    ).get(stateId) as { provider: string; verifier_enc: string; redirect_to: string | null; created_at: number } | undefined;

    db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
    if (!row) return null;
    if (row.provider !== provider) return null;
    if (Date.now() - row.created_at > OAUTH_STATE_TTL_MS) return null;
    return { verifierEnc: row.verifier_enc, redirectTo: row.redirect_to };
  }

  // ── 토큰 저장 ─────────────────────────────────────────────────────
  upsertAccount(input: {
    provider: string;
    source: string;
    email: string | null;
    scope: string | null;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
  }): string {
    const db = getDb();
    const now = this.nowMs();
    const accessEnc = encryptSecret(input.accessToken);
    const refreshEnc = input.refreshToken ? encryptSecret(input.refreshToken) : null;

    // oauth_credentials (provider별 단일 최신 토큰)
    db.prepare(`
      INSERT INTO oauth_credentials (provider, source, email, scope, expires_at, access_token_enc, refresh_token_enc, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        source = excluded.source, email = excluded.email, scope = excluded.scope,
        expires_at = excluded.expires_at, access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc, updated_at = excluded.updated_at
    `).run(input.provider, input.source, input.email, input.scope, input.expiresAt, accessEnc, refreshEnc, now, now);

    // oauth_accounts (멀티 계정)
    let accountId: string | null = null;
    if (input.email) {
      const ex = db.prepare(
        "SELECT id FROM oauth_accounts WHERE provider = ? AND email = ? LIMIT 1"
      ).get(input.provider, input.email) as { id: string } | undefined;
      if (ex) accountId = ex.id;
    }

    if (!accountId) {
      accountId = randomUUID();
      const maxPrio = (db.prepare(
        "SELECT COALESCE(MAX(priority), 90) + 10 AS p FROM oauth_accounts WHERE provider = ?"
      ).get(input.provider) as { p: number }).p;
      db.prepare(`
        INSERT INTO oauth_accounts (id, provider, source, email, scope, expires_at, access_token_enc, refresh_token_enc, status, priority, created_at, updated_at, last_success_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `).run(accountId, input.provider, input.source, input.email, input.scope, input.expiresAt, accessEnc, refreshEnc, maxPrio, now, now, now);
    } else {
      db.prepare(`
        UPDATE oauth_accounts SET source=?, email=?, scope=?, expires_at=?, access_token_enc=?,
          refresh_token_enc=?, status='active', updated_at=?, last_success_at=?, failure_count=0, last_error=NULL
        WHERE id=?
      `).run(input.source, input.email, input.scope, input.expiresAt, accessEnc, refreshEnc, now, now, accountId);
    }

    // active account 등록
    db.prepare(`
      INSERT INTO oauth_active_accounts (provider, account_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(provider, account_id) DO UPDATE SET updated_at = excluded.updated_at
    `).run(input.provider, accountId, now);

    return accountId;
  }

  // ── 연결 해제 ─────────────────────────────────────────────────────
  disconnect(provider: string, accountId?: string): void {
    const db = getDb();
    if (accountId) {
      db.prepare("DELETE FROM oauth_accounts WHERE id = ? AND provider = ?").run(accountId, provider);
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ? AND account_id = ?").run(provider, accountId);
    } else {
      db.prepare("DELETE FROM oauth_accounts WHERE provider = ?").run(provider);
      db.prepare("DELETE FROM oauth_credentials WHERE provider = ?").run(provider);
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
    }
  }

  // ── 상태 조회 ─────────────────────────────────────────────────────
  getProviderStatus(provider: string) {
    const db = getDb();
    const accounts = db.prepare(
      "SELECT * FROM oauth_accounts WHERE provider = ? ORDER BY priority ASC, updated_at DESC"
    ).all(provider) as Record<string, unknown>[];

    const activeIds = new Set(
      (db.prepare(
        "SELECT account_id FROM oauth_active_accounts WHERE provider = ?"
      ).all(provider) as { account_id: string }[]).map((r) => r.account_id)
    );

    const mappedAccounts = accounts.map((r) => {
      const expiresAt = r.expires_at as number | null;
      const hasFresh = !!r.access_token_enc && (!expiresAt || expiresAt > Date.now() + 60_000);
      const hasRefresh = !!r.refresh_token_enc;
      return {
        id: r.id as string,
        provider: r.provider as string,
        label: r.label as string | null,
        email: r.email as string | null,
        status: r.status as "active" | "disabled",
        priority: r.priority as number,
        hasRefreshToken: hasRefresh,
        executionReady: (r.status === "active") && (hasFresh || hasRefresh),
        active: activeIds.has(r.id as string),
        failureCount: r.failure_count as number,
        lastError: r.last_error as string | null,
        createdAt: r.created_at as number,
        updatedAt: r.updated_at as number,
      };
    });

    const connected = mappedAccounts.some((a) => a.executionReady);
    const primary = mappedAccounts.find((a) => a.active) ?? mappedAccounts[0] ?? null;

    return {
      connected,
      detected: mappedAccounts.length > 0,
      executionReady: connected,
      email: primary?.email ?? null,
      scope: null as string | null,
      expiresAt: null as number | null,
      activeAccountId: primary?.id ?? null,
      accounts: mappedAccounts,
    };
  }

  getStatus() {
    return {
      ok: true as const,
      storageReady: !!process.env.OFFICE_OAUTH_ENCRYPTION_KEY,
      providers: {
        github: this.getProviderStatus("github"),
        google: this.getProviderStatus("google"),
      },
    };
  }
}
