import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseIdentity } from "../modules/release/release-identity.ts";
import { resolveDonggriControlRoot } from "./control-root.ts";

export const SERVER_DIRNAME = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// .env loader (no dotenv dependency)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string, override = false): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const envContent = fs.readFileSync(filePath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (override || !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore .env read errors
  }
}

function normalizeEnvPath(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
}

const rootEnvFilePath = path.resolve(SERVER_DIRNAME, "..", "..", ".env");
loadEnvFile(rootEnvFilePath);
const oauthRuntimeEnvPath = (() => {
  const explicit = normalizeEnvPath(process.env.OAUTH_RUNTIME_ENV_PATH);
  if (explicit) return explicit;
  const dbPath = normalizeEnvPath(process.env.DB_PATH);
  if (dbPath) return path.join(path.dirname(dbPath), ".env.oauth");
  return path.resolve(SERVER_DIRNAME, "..", "..", "data", ".env.oauth");
})();
loadEnvFile(oauthRuntimeEnvPath, true);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
if (
  process.env.DONGRI_CERTIFICATION_MODE === "1" &&
  !/^[0-9a-f]{40}$/i.test(process.env.DONGRI_RELEASE_GIT_SHA?.trim() ?? "")
) {
  throw new Error("certification_runtime_git_sha_binding_required");
}
export const RELEASE_IDENTITY = resolveReleaseIdentity(path.resolve(SERVER_DIRNAME, "..", ".."));
export const PKG_VERSION: string = RELEASE_IDENTITY.product_version;
export const DONGGRI_CONTROL_ROOT = resolveDonggriControlRoot({
  envValue: process.env.DONGGRI_CONTROL_ROOT,
  repoRoot: path.resolve(SERVER_DIRNAME, "..", ".."),
});

export const PORT = Number(process.env.PORT ?? 8790);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const OAUTH_BASE_HOST = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
export const SESSION_COOKIE_NAME = "claw_session";

export function normalizeSecret(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed === "__CHANGE_ME__") return "";
  return trimmed;
}

export function normalizePathEnv(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed === "__CHANGE_ME__") return "";
  if (!trimmed.startsWith("~")) return trimmed;

  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return trimmed;

  const suffix = trimmed.slice(1).replace(/^[\\/]+/, "");
  return suffix ? path.resolve(home, suffix) : home;
}

export const OPENCLAW_CONFIG_PATH = normalizePathEnv(process.env.OPENCLAW_CONFIG);
export const API_AUTH_TOKEN = normalizeSecret(process.env.API_AUTH_TOKEN);
export const INBOX_WEBHOOK_SECRET = normalizeSecret(process.env.INBOX_WEBHOOK_SECRET);
export const SESSION_AUTH_TOKEN = API_AUTH_TOKEN || randomBytes(32).toString("hex");
export const ALLOWED_ORIGIN_SUFFIXES = (process.env.ALLOWED_ORIGIN_SUFFIXES ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

function normalizePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const numeric = Number((raw ?? "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.trunc(numeric);
}

export const GMAIL_INTAKE_ENABLED = process.env.GMAIL_INTAKE_ENABLED === "1";
export const GMAIL_INTAKE_SUBJECT_TOKEN = (process.env.GMAIL_INTAKE_SUBJECT_TOKEN ?? "[DonggriCompany]").trim();
export const GMAIL_INTAKE_ALLOWED_SENDERS = (process.env.GMAIL_INTAKE_ALLOWED_SENDERS ?? "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
export const GMAIL_INTAKE_POLL_INTERVAL_MS = normalizePositiveIntEnv(process.env.GMAIL_INTAKE_POLL_INTERVAL_MS, 60_000);
export const GMAIL_INTAKE_LOOKBACK_DAYS = normalizePositiveIntEnv(process.env.GMAIL_INTAKE_LOOKBACK_DAYS, 14);
export const GMAIL_INTAKE_MAX_ATTACHMENT_MB = normalizePositiveIntEnv(process.env.GMAIL_INTAKE_MAX_ATTACHMENT_MB, 10);
export const GMAIL_INTAKE_TELEGRAM_SESSION_KEY = (
  process.env.GMAIL_INTAKE_TELEGRAM_SESSION_KEY ?? "telegram:global"
).trim();
export const GMAIL_INTAKE_DEFAULT_PROJECT_PATH =
  normalizePathEnv(process.env.GMAIL_INTAKE_DEFAULT_PROJECT_PATH) || process.cwd();

export const CALENDAR_INTAKE_ENABLED = process.env.CALENDAR_INTAKE_ENABLED === "1";
export const CALENDAR_INTAKE_CALENDAR_ID = (process.env.CALENDAR_INTAKE_CALENDAR_ID ?? "primary").trim();
export const CALENDAR_INTAKE_MATCH_TOKENS = (
  process.env.CALENDAR_INTAKE_MATCH_TOKENS ?? "[DonggriCompany],[Hackathon],[해커톤],해커톤,hackathon"
)
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
export const CALENDAR_INTAKE_POLL_INTERVAL_MS = normalizePositiveIntEnv(
  process.env.CALENDAR_INTAKE_POLL_INTERVAL_MS,
  60_000,
);
export const CALENDAR_INTAKE_LOOKBACK_DAYS = normalizePositiveIntEnv(process.env.CALENDAR_INTAKE_LOOKBACK_DAYS, 1);
export const CALENDAR_INTAKE_LOOKAHEAD_DAYS = normalizePositiveIntEnv(process.env.CALENDAR_INTAKE_LOOKAHEAD_DAYS, 60);
export const CALENDAR_INTAKE_TELEGRAM_SESSION_KEY = (
  process.env.CALENDAR_INTAKE_TELEGRAM_SESSION_KEY ?? "telegram:global"
).trim();
export const CALENDAR_INTAKE_DEFAULT_PROJECT_PATH =
  normalizePathEnv(process.env.CALENDAR_INTAKE_DEFAULT_PROJECT_PATH) || process.cwd();

// ---------------------------------------------------------------------------
// Production static file serving
// ---------------------------------------------------------------------------
export const DIST_DIR = path.resolve(SERVER_DIRNAME, "..", "..", "dist");
export const IS_PRODUCTION = !process.env.VITE_DEV && fs.existsSync(path.join(DIST_DIR, "index.html"));

// ---------------------------------------------------------------------------
// Runtime path defaults
// ---------------------------------------------------------------------------
function resolveDefaultDataRoot(): string {
  const envDataRoot = normalizePathEnv(process.env.APP_DATA_DIR);
  if (envDataRoot) return envDataRoot;

  const dockerDataRoot = "/app/data";
  if (fs.existsSync(dockerDataRoot)) return dockerDataRoot;

  return process.cwd();
}

export const DEFAULT_DATA_ROOT = resolveDefaultDataRoot();
export const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_ROOT, "claw-empire.sqlite");
export const DEFAULT_LOGS_DIR = path.join(DEFAULT_DATA_ROOT, "logs");
export const LEGACY_DB_PATH = path.join(process.cwd(), "climpire.sqlite");
