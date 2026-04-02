import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SRC_DIR, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const DEFAULT_DB_PATH = path.join(REPO_ROOT, ".local", "workspace.sqlite");

export const getPackageRoot = (): string => PACKAGE_ROOT;

export const getMigrationsDir = (): string => path.join(PACKAGE_ROOT, "migrations");

export const getDbPath = (): string => {
  const envPath = process.env.WORKSPACE_DB_PATH?.trim();
  return envPath && envPath.length > 0 ? path.resolve(envPath) : DEFAULT_DB_PATH;
};

export const ensureDbDirectory = (dbPath: string): void => {
  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });
};
