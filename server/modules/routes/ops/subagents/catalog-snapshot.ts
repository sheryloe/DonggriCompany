import fs from "node:fs";
import path from "node:path";

export type CodexSubagentDepartment = "planning" | "dev" | "design" | "qa" | "devsecops" | "operations";

export interface CodexSubagentCatalogAgent {
  name: string;
  description: string;
  upstreamCategory: string;
  upstreamPath: string;
  department: CodexSubagentDepartment;
  class_stage_1?: string;
  class_stage_2?: string;
  class_stage_3?: string;
}

export interface CodexSubagentCatalogSnapshot {
  sourceRepo: string;
  sourceRef: string;
  sourceUrl: string;
  generatedAt: string;
  total: number;
  departmentSummary: Record<string, number>;
  agents: CodexSubagentCatalogAgent[];
}

const DEFAULT_CATALOG_PATH = path.join(process.cwd(), "docs", "agents", "codex-subagents.by-department.json");

let cachedSnapshot:
  | {
      filePath: string;
      mtimeMs: number;
      value: CodexSubagentCatalogSnapshot;
    }
  | null = null;

function getCatalogPath(): string {
  const override = String(process.env.CODEX_SUBAGENTS_CATALOG_PATH ?? "").trim();
  return override ? path.resolve(override) : DEFAULT_CATALOG_PATH;
}

function isValidSnapshot(value: unknown): value is CodexSubagentCatalogSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<CodexSubagentCatalogSnapshot>;
  if (
    typeof snapshot.sourceRepo !== "string" ||
    typeof snapshot.sourceRef !== "string" ||
    typeof snapshot.sourceUrl !== "string" ||
    typeof snapshot.generatedAt !== "string" ||
    typeof snapshot.total !== "number" ||
    !snapshot.departmentSummary ||
    typeof snapshot.departmentSummary !== "object" ||
    !Array.isArray(snapshot.agents)
  ) {
    return false;
  }

  for (const agent of snapshot.agents) {
    if (!agent || typeof agent !== "object") return false;
    const a = agent as Partial<CodexSubagentCatalogAgent>;
    if (
      typeof a.name !== "string" ||
      typeof a.description !== "string" ||
      typeof a.upstreamCategory !== "string" ||
      typeof a.upstreamPath !== "string" ||
      typeof a.department !== "string"
    ) {
      return false;
    }
    if (a.class_stage_1 !== undefined && typeof a.class_stage_1 !== "string") return false;
    if (a.class_stage_2 !== undefined && typeof a.class_stage_2 !== "string") return false;
    if (a.class_stage_3 !== undefined && typeof a.class_stage_3 !== "string") return false;
  }

  return true;
}

export function loadCodexSubagentCatalogSnapshot(): CodexSubagentCatalogSnapshot | null {
  const filePath = getCatalogPath();
  if (!fs.existsSync(filePath)) {
    cachedSnapshot = null;
    return null;
  }

  const stat = fs.statSync(filePath);
  if (cachedSnapshot && cachedSnapshot.filePath === filePath && cachedSnapshot.mtimeMs === stat.mtimeMs) {
    return cachedSnapshot.value;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isValidSnapshot(parsed)) {
      cachedSnapshot = null;
      return null;
    }
    cachedSnapshot = {
      filePath,
      mtimeMs: stat.mtimeMs,
      value: parsed,
    };
    return parsed;
  } catch {
    cachedSnapshot = null;
    return null;
  }
}
