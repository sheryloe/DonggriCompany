import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RolePackView } from "@workspace/shared";

type RolePackManifestFile = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  manifest?: unknown;
  isEnabled?: unknown;
};

type DiscoveryOptions = {
  repoRoot?: string;
  rolepacksDir?: string;
};

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SRC_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const DEFAULT_ROLEPACKS_DIR = path.join(DEFAULT_REPO_ROOT, "rolepacks");

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return fallback;
};

const normalizeRelativePath = (value: string): string => {
  return value.split(path.sep).join("/");
};

const parseManifest = (manifestPath: string, repoRoot: string): RolePackView | null => {
  try {
    const rawJson = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(rawJson) as RolePackManifestFile;

    if (!isRecord(parsed) || typeof parsed.id !== "string" || parsed.id.trim().length === 0) {
      return null;
    }

    const rootDirPath = path.dirname(manifestPath);
    const folderName = path.basename(rootDirPath);
    const slug =
      typeof parsed.slug === "string" && parsed.slug.trim().length > 0
        ? parsed.slug.trim()
        : folderName;
    const title =
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : folderName;

    return {
      id: parsed.id.trim(),
      slug,
      title,
      description: typeof parsed.description === "string" ? parsed.description : "",
      rootDir: normalizeRelativePath(path.relative(repoRoot, rootDirPath)),
      manifest: isRecord(parsed.manifest) ? parsed.manifest : {},
      isEnabled: toBoolean(parsed.isEnabled, true)
    };
  } catch {
    return null;
  }
};

export const discoverRolePacks = (options: DiscoveryOptions = {}): RolePackView[] => {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : DEFAULT_REPO_ROOT;
  const rolepacksDir = options.rolepacksDir
    ? path.resolve(options.rolepacksDir)
    : DEFAULT_ROLEPACKS_DIR;

  if (!fs.existsSync(rolepacksDir)) {
    return [];
  }

  const entries = fs
    .readdirSync(rolepacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const discovered: RolePackView[] = [];

  for (const entry of entries) {
    const manifestPath = path.join(rolepacksDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const view = parseManifest(manifestPath, repoRoot);
    if (view) {
      discovered.push(view);
    }
  }

  return discovered.sort((a, b) => a.slug.localeCompare(b.slug));
};
