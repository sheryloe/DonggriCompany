import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { createProjectMemory } from "./store.ts";

export type BeadsStatus = {
  installed: boolean;
  initialized: boolean;
  project_path: string | null;
  beads_dir: string | null;
  version: string | null;
  ready_count: number | null;
  error: string | null;
};

export type BeadsImportResult = {
  imported: number;
  skipped: number;
  status: BeadsStatus;
};

type BeadsItem = {
  id: string;
  title: string;
  body: string;
  status: string;
  tags: string[];
};

function runBd(args: string[], cwd?: string): string {
  return execFileSync("bd", args, {
    cwd,
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value))
    return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["items", "issues", "beads", "data", "ready"]) {
      if (Array.isArray(record[key])) return asRecords(record[key]);
    }
  }
  return [];
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function readTags(record: Record<string, unknown>): string[] {
  const source = record.tags ?? record.labels ?? record.kind ?? [];
  if (Array.isArray(source)) {
    return source
      .map((item) =>
        String(item ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }
  if (typeof source === "string") {
    return source
      .split(/[,\s]+/g)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function normalizeItem(record: Record<string, unknown>): BeadsItem | null {
  const id = readString(record, ["id", "key", "ref", "issue_id"]);
  const title = readString(record, ["title", "summary", "name"]);
  if (!id || !title) return null;
  return {
    id,
    title,
    body: readString(record, ["description", "body", "content", "notes"]) || title,
    status: readString(record, ["status", "state"]) || "open",
    tags: ["beads", ...readTags(record)],
  };
}

function readProjectPathById(db: DatabaseSync, projectId: string): string | null {
  const row = db.prepare("SELECT project_path FROM projects WHERE id = ?").get(projectId) as
    | { project_path?: string | null }
    | undefined;
  return typeof row?.project_path === "string" && row.project_path.trim() ? row.project_path : null;
}

export function getBeadsStatusForProjectPath(projectPath: string | null | undefined): BeadsStatus {
  const normalizedProjectPath =
    typeof projectPath === "string" && projectPath.trim() ? path.resolve(projectPath) : null;
  let version: string | null = null;
  try {
    version = runBd(["--version"]).trim().split(/\r?\n/g)[0] ?? null;
  } catch (error) {
    return {
      installed: false,
      initialized: false,
      project_path: normalizedProjectPath,
      beads_dir: normalizedProjectPath ? path.join(normalizedProjectPath, ".beads") : null,
      version: null,
      ready_count: null,
      error: "bd_not_installed",
    };
  }

  const beadsDir = normalizedProjectPath ? path.join(normalizedProjectPath, ".beads") : null;
  const initialized = !!beadsDir && fs.existsSync(beadsDir);
  let readyCount: number | null = null;
  let error: string | null = null;
  if (initialized && normalizedProjectPath) {
    try {
      const ready = asRecords(parseJson(runBd(["ready", "--json"], normalizedProjectPath)));
      readyCount = ready.length;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    installed: true,
    initialized,
    project_path: normalizedProjectPath,
    beads_dir: beadsDir,
    version,
    ready_count: readyCount,
    error,
  };
}

export function getBeadsStatus(db: DatabaseSync, projectId: string): BeadsStatus {
  return getBeadsStatusForProjectPath(readProjectPathById(db, projectId));
}

export function importBeadsProjectMemory(
  db: DatabaseSync,
  input: { projectId: string; now?: number | null },
): BeadsImportResult {
  const projectPath = readProjectPathById(db, input.projectId);
  const status = getBeadsStatusForProjectPath(projectPath);
  if (!status.installed || !status.initialized || !projectPath) {
    return { imported: 0, skipped: 0, status };
  }

  let records: Array<Record<string, unknown>> = [];
  try {
    const ready = asRecords(parseJson(runBd(["ready", "--json"], projectPath)));
    const listed = asRecords(parseJson(runBd(["list", "--json"], projectPath)));
    const byId = new Map<string, Record<string, unknown>>();
    for (const record of [...ready, ...listed]) {
      const id = readString(record, ["id", "key", "ref", "issue_id"]);
      if (!id) continue;
      byId.set(id, { ...byId.get(id), ...record });
    }
    records = [...byId.values()];
  } catch (error) {
    return {
      imported: 0,
      skipped: 0,
      status: {
        ...status,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    const item = normalizeItem(record);
    if (!item) {
      skipped += 1;
      continue;
    }
    createProjectMemory(db, {
      projectId: input.projectId,
      memoryType: item.status === "closed" ? "closed_issue" : "open_issue",
      scopeType: "project",
      title: item.title,
      body: item.body,
      displaySummaryKo: `Beads 항목: ${item.title}`,
      tags: item.tags,
      confidence: 0.82,
      strength: item.status === "closed" ? 0.45 : 0.72,
      sourceType: "beads",
      sourceId: input.projectId,
      externalRef: item.id,
      status: "active",
      now: input.now,
    });
    imported += 1;
  }

  return { imported, skipped, status };
}

export function createBeadsIssue(
  db: DatabaseSync,
  input: { projectId: string; title: string; body?: string | null },
): { ok: true; output: string } | { ok: false; error: string; status: BeadsStatus } {
  const projectPath = readProjectPathById(db, input.projectId);
  const status = getBeadsStatusForProjectPath(projectPath);
  if (!status.installed || !status.initialized || !projectPath) {
    return { ok: false, error: "beads_unavailable", status };
  }
  try {
    const output = runBd(
      ["create", "--title", input.title, "--description", input.body?.trim() || input.title, "--json"],
      projectPath,
    );
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status,
    };
  }
}
