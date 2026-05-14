#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_INTAKE_SCOPES = [GMAIL_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_SCOPE];
const SETTING_KEY = "gmailIntakeOAuth";

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (override || !(key in process.env)) process.env[key] = value;
  }
}

function normalizeSecret(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!value || value === "__CHANGE_ME__") return "";
  const lowered = value.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  if (value.startsWith("YOUR_")) return "";
  return value;
}

function normalizePathEnv(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!value || value === "__CHANGE_ME__") return "";
  if (!value.startsWith("~")) return value;
  const suffix = value.slice(1).replace(/^[\\/]+/, "");
  return path.resolve(os.homedir(), suffix);
}

function resolveDbPath() {
  const explicit = normalizePathEnv(process.env.DB_PATH);
  if (explicit) return path.resolve(explicit);
  const dataRoot = normalizePathEnv(process.env.APP_DATA_DIR);
  if (dataRoot) return path.resolve(dataRoot, "claw-empire.sqlite");
  return path.resolve(ROOT, "claw-empire.sqlite");
}

function encryptionKey(secret) {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptSecret(plaintext, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

function decryptSecret(payload, secret) {
  const [ver, ivB64, tagB64, ctB64] = String(payload ?? "").split(":");
  if (ver !== "v1" || !ivB64 || !tagB64 || !ctB64) return "";
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

function readExistingOAuthClient(dbPath, encryptionSecret) {
  if (!fs.existsSync(dbPath) || !encryptionSecret) return null;
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTING_KEY);
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value);
    const clientId = normalizeSecret(parsed.clientId || parsed.client_id);
    const rawClientSecret = normalizeSecret(parsed.clientSecret || parsed.client_secret);
    const encryptedClientSecret = normalizeSecret(parsed.clientSecretEnc || parsed.client_secret_enc);
    const clientSecret =
      rawClientSecret || (encryptedClientSecret ? decryptSecret(encryptedClientSecret, encryptionSecret) : "");
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } finally {
    db.close();
  }
}

function upsertOAuthPayload(dbPath, payload) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(SETTING_KEY, JSON.stringify(payload));
  } finally {
    db.close();
  }
}

function openBrowser(url) {
  if (process.platform === "win32") {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Start-Process", url],
      () => {},
    );
    return;
  }
  if (process.platform === "darwin") {
    execFile("open", [url], () => {});
    return;
  }
  execFile("xdg-open", [url], () => {});
}

async function startOAuthCallbackServer() {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = http.createServer((req, res) => {
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("not found");
      return;
    }
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400).end("OAuth failed. You can close this tab.");
      server.close();
      rejectCode(new Error(error));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Missing code. You can close this tab.");
      server.close();
      rejectCode(new Error("oauth_code_missing"));
      return;
    }
    res
      .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("Gmail intake OAuth connected. You can close this tab.");
    server.close();
    resolveCode(code);
  });
  const redirectUri = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("oauth_local_server_failed"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/oauth2callback`);
    });
  });
  setTimeout(
    () => {
      server.close();
      rejectCode(new Error("oauth_timeout"));
    },
    5 * 60 * 1000,
  ).unref();
  return { redirectUri, codePromise };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));

  const encryptionSecret =
    normalizeSecret(process.env.OAUTH_ENCRYPTION_SECRET) || normalizeSecret(process.env.SESSION_SECRET);
  const dbPath = resolveDbPath();
  const existingOAuthClient = encryptionSecret ? readExistingOAuthClient(dbPath, encryptionSecret) : null;
  const clientId =
    normalizeSecret(process.env.GMAIL_INTAKE_GOOGLE_CLIENT_ID) ||
    normalizeSecret(process.env.OAUTH_GOOGLE_CLIENT_ID) ||
    existingOAuthClient?.clientId ||
    "";
  const clientSecret =
    normalizeSecret(process.env.GMAIL_INTAKE_GOOGLE_CLIENT_SECRET) ||
    normalizeSecret(process.env.OAUTH_GOOGLE_CLIENT_SECRET) ||
    existingOAuthClient?.clientSecret ||
    "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "GMAIL_INTAKE_GOOGLE_CLIENT_ID/GMAIL_INTAKE_GOOGLE_CLIENT_SECRET 또는 OAUTH_GOOGLE_CLIENT_ID/OAUTH_GOOGLE_CLIENT_SECRET 값이 필요합니다.",
    );
  }
  if (!encryptionSecret) {
    throw new Error("OAUTH_ENCRYPTION_SECRET 값이 필요합니다.");
  }

  const { redirectUri, codePromise } = await startOAuthCallbackServer();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_INTAKE_SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("Opening browser for Gmail intake OAuth...");
  console.log(authUrl.toString());
  openBrowser(authUrl.toString());

  const code = await codePromise;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !token?.access_token || !token?.refresh_token) {
    throw new Error(`token_exchange_failed:${tokenRes.status}`);
  }

  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({}));
  const payload = {
    clientId,
    clientSecretEnc: encryptSecret(clientSecret, encryptionSecret),
    accessTokenEnc: encryptSecret(token.access_token, encryptionSecret),
    refreshTokenEnc: encryptSecret(token.refresh_token, encryptionSecret),
    expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000,
    email: profile?.emailAddress || "",
    scope: token.scope || GOOGLE_INTAKE_SCOPES.join(" "),
    updatedAt: Date.now(),
  };
  upsertOAuthPayload(dbPath, payload);

  const dockerDataDbPath = path.resolve(ROOT, "data", "claw-empire.sqlite");
  if (dockerDataDbPath !== dbPath && fs.existsSync(dockerDataDbPath)) {
    upsertOAuthPayload(dockerDataDbPath, payload);
  }

  console.log(`Gmail intake OAuth saved to DB settings (${SETTING_KEY}).`);
  console.log(`DB: ${dbPath}`);
  if (dockerDataDbPath !== dbPath && fs.existsSync(dockerDataDbPath)) console.log(`Docker DB: ${dockerDataDbPath}`);
  if (profile?.emailAddress) console.log(`Gmail: ${profile.emailAddress}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
