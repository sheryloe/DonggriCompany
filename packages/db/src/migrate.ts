import fs from "node:fs";
import path from "node:path";

import type { DatabaseHandle } from "./database.js";
import { withDatabase } from "./database.js";
import { getDbPath, getMigrationsDir } from "./paths.js";

type Migration = {
  id: string;
  fileName: string;
  sql: string;
};

type MigrationRow = {
  id: string;
};

export type MigrationResult = {
  dbPath: string;
  appliedMigrations: string[];
  skippedMigrations: string[];
};

const MIGRATION_FILE_PATTERN = /^(\d{4}_[a-z0-9_]+)\.sql$/i;

const createMigrationsTable = (db: DatabaseHandle): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
};

const listMigrations = (): Migration[] => {
  const migrationsDir = getMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return files.map((fileName) => {
    const id = fileName.replace(/\.sql$/i, "");
    const filePath = path.join(migrationsDir, fileName);
    return {
      id,
      fileName,
      sql: fs.readFileSync(filePath, "utf8")
    };
  });
};

const readAppliedMigrationSet = (db: DatabaseHandle): Set<string> => {
  const rows = db.prepare("SELECT id FROM _migrations ORDER BY id ASC").all() as MigrationRow[];
  return new Set(rows.map((row) => row.id));
};

export const runMigrations = (dbPath = getDbPath()): MigrationResult => {
  const migrations = listMigrations();
  const appliedMigrations: string[] = [];
  const skippedMigrations: string[] = [];

  return withDatabase((db) => {
    createMigrationsTable(db);
    const appliedSet = readAppliedMigrationSet(db);
    const insertApplied = db.prepare(
      "INSERT INTO _migrations (id, file_name, applied_at) VALUES (?, ?, ?)"
    );

    const runSingle = db.transaction((migration: Migration) => {
      db.exec(migration.sql);
      insertApplied.run(migration.id, migration.fileName, new Date().toISOString());
    });

    for (const migration of migrations) {
      if (appliedSet.has(migration.id)) {
        skippedMigrations.push(migration.id);
        continue;
      }

      runSingle(migration);
      appliedMigrations.push(migration.id);
      appliedSet.add(migration.id);
    }

    return {
      dbPath,
      appliedMigrations,
      skippedMigrations
    };
  }, dbPath);
};
