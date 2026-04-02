import type { RolePackView } from "@workspace/shared";

import { withDatabase } from "./database.js";
import { getDbPath } from "./paths.js";

type RolePackRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  root_dir: string;
  manifest_json: string;
  is_enabled: number;
};

const parseManifest = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const listRolePacks = (dbPath = getDbPath()): RolePackView[] => {
  return withDatabase((db) => {
    const rows = db.prepare("SELECT * FROM role_packs ORDER BY slug ASC").all() as RolePackRow[];

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      rootDir: row.root_dir,
      manifest: parseManifest(row.manifest_json),
      isEnabled: row.is_enabled === 1
    }));
  }, dbPath);
};
