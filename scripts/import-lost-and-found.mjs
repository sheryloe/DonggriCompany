#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_SOURCE = path.resolve("data/recovery-lab/recovered-from-shifted.sqlite");
const DEFAULT_TARGET = path.resolve("data/claw-empire.sqlite");
const DEFAULT_REPORT = path.resolve("data/recovery-lab/import-lost-and-found-report.json");
const TARGET_TABLES = ["tasks", "projects", "messages", "settings"];
const MAX_ERRORS_PER_TABLE = 20;

function parseArgs(argv) {
  const args = {
    apply: false,
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    report: DEFAULT_REPORT,
    tables: [...TARGET_TABLES],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--dry-run") {
      args.apply = false;
      continue;
    }
    if (token === "--source" && argv[i + 1]) {
      args.source = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--target" && argv[i + 1]) {
      args.target = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--report" && argv[i + 1]) {
      args.report = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--tables" && argv[i + 1]) {
      args.tables = argv[i + 1]
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function splitTopLevelColumns(definition) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < definition.length; i += 1) {
    const char = definition[i];
    const prev = i > 0 ? definition[i - 1] : "";

    if (char === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (char === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")" && depth > 0) {
        depth -= 1;
      } else if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

function normalizeColumnName(raw) {
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^"/, "")
    .replace(/"$/, "")
    .replace(/^`/, "")
    .replace(/`$/, "")
    .trim();
}

function extractColumnsFromCreateTable(createSql) {
  const start = createSql.indexOf("(");
  const end = createSql.lastIndexOf(")");
  if (start < 0 || end < 0 || end <= start) {
    return [];
  }
  const body = createSql.slice(start + 1, end).trim();
  const segments = splitTopLevelColumns(body);
  const columns = [];

  for (const segment of segments) {
    const normalized = segment.trim();
    if (!normalized) continue;
    const upper = normalized.toUpperCase();
    if (
      upper.startsWith("PRIMARY KEY") ||
      upper.startsWith("FOREIGN KEY") ||
      upper.startsWith("UNIQUE ") ||
      upper.startsWith("CHECK ") ||
      upper.startsWith("CONSTRAINT ")
    ) {
      continue;
    }
    const firstToken = normalized.split(/\s+/)[0] ?? "";
    const columnName = normalizeColumnName(firstToken);
    if (!columnName) continue;
    columns.push(columnName);
  }

  return columns;
}

function getTargetTableColumns(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.map((row) => String(row.name));
}

function findTableRootAndDefinition(sourceDb, tableName) {
  const row = sourceDb
    .prepare(`
      SELECT CAST(c3 AS INTEGER) AS rootpgno, c4 AS ddl, id
      FROM lost_and_found
      WHERE c0='table' AND c1=?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(tableName);
  return row ?? null;
}

function selectSourceRows(sourceDb, rootpgno, nfield) {
  return sourceDb
    .prepare(`
      SELECT rootpgno, pgno, nfield, id,
             c0, c1, c2, c3, c4, c5, c6, c7, c8, c9,
             c10, c11, c12, c13, c14, c15, c16, c17, c18, c19,
             c20, c21, c22, c23, c24, c25, c26, c27, c28, c29, c30, c31
      FROM lost_and_found
      WHERE rootpgno = ? AND nfield = ?
      ORDER BY COALESCE(id, 0), pgno
    `)
    .all(rootpgno, nfield);
}

function rowToSourceRecord(row, sourceColumns) {
  const record = {};
  for (let i = 0; i < sourceColumns.length; i += 1) {
    record[sourceColumns[i]] = row[`c${i}`];
  }
  return record;
}

function getSharedColumns(sourceColumns, targetColumns) {
  const targetSet = new Set(targetColumns);
  return sourceColumns.filter((column) => targetSet.has(column));
}

function shouldSkipRecord(tableName, record) {
  if (tableName === "settings") {
    return !record.key;
  }
  return !record.id;
}

function buildInsertSql(tableName, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  const colSql = columns.join(", ");

  if (tableName === "settings") {
    const hasValue = columns.includes("value");
    const hasUpdatedAt = columns.includes("updated_at");
    const updates = [];
    if (hasValue) updates.push("value=excluded.value");
    if (hasUpdatedAt) updates.push("updated_at=excluded.updated_at");
    if (updates.length === 0) updates.push("key=excluded.key");
    return `INSERT INTO ${tableName} (${colSql}) VALUES (${placeholders}) ON CONFLICT(key) DO UPDATE SET ${updates.join(", ")}`;
  }

  return `INSERT OR IGNORE INTO ${tableName} (${colSql}) VALUES (${placeholders})`;
}

function summarizeRecord(record, columns) {
  const summary = {};
  for (const column of columns.slice(0, 8)) {
    summary[column] = record[column];
  }
  return summary;
}

function run() {
  const args = parseArgs(process.argv);
  ensureFileExists(args.source, "source");
  ensureFileExists(args.target, "target");

  const sourceDb = new DatabaseSync(args.source, { readOnly: true });
  const targetDb = new DatabaseSync(args.target);
  const now = Date.now();
  const report = {
    mode: args.apply ? "apply" : "dry-run",
    source: args.source,
    target: args.target,
    startedAt: now,
    tables: [],
  };

  const lostAndFoundExists = sourceDb
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lost_and_found' LIMIT 1")
    .get();
  if (!lostAndFoundExists) {
    throw new Error("source database does not contain lost_and_found");
  }

  if (args.apply) {
    targetDb.exec("BEGIN IMMEDIATE");
  }

  try {
    for (const tableName of args.tables) {
      const tableReport = {
        table: tableName,
        foundDefinition: false,
        rootpgno: null,
        sourceColumns: [],
        targetColumns: [],
        sharedColumns: [],
        sourceRows: 0,
        candidates: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };

      const def = findTableRootAndDefinition(sourceDb, tableName);
      if (!def || !def.ddl) {
        report.tables.push(tableReport);
        continue;
      }

      tableReport.foundDefinition = true;
      tableReport.rootpgno = Number(def.rootpgno);
      tableReport.sourceColumns = extractColumnsFromCreateTable(String(def.ddl));
      tableReport.targetColumns = getTargetTableColumns(targetDb, tableName);
      tableReport.sharedColumns = getSharedColumns(tableReport.sourceColumns, tableReport.targetColumns);

      if (tableReport.sourceColumns.length === 0 || tableReport.sharedColumns.length === 0) {
        report.tables.push(tableReport);
        continue;
      }

      const rows = selectSourceRows(sourceDb, tableReport.rootpgno, tableReport.sourceColumns.length);
      tableReport.sourceRows = rows.length;

      const insertSql = buildInsertSql(tableName, tableReport.sharedColumns);
      const stmt = args.apply ? targetDb.prepare(insertSql) : null;

      for (const row of rows) {
        const sourceRecord = rowToSourceRecord(row, tableReport.sourceColumns);
        if (shouldSkipRecord(tableName, sourceRecord)) {
          tableReport.skipped += 1;
          continue;
        }

        const values = tableReport.sharedColumns.map((column) => sourceRecord[column]);
        tableReport.candidates += 1;

        if (!args.apply) {
          continue;
        }

        try {
          const result = stmt.run(...values);
          const changes = Number(result.changes ?? 0);
          if (changes > 0) {
            tableReport.imported += changes;
          } else {
            tableReport.skipped += 1;
          }
        } catch (error) {
          tableReport.failed += 1;
          if (tableReport.errors.length < MAX_ERRORS_PER_TABLE) {
            tableReport.errors.push({
              message: String(error?.message ?? error),
              sample: summarizeRecord(sourceRecord, tableReport.sharedColumns),
            });
          }
        }
      }

      report.tables.push(tableReport);
    }

    if (args.apply) {
      targetDb.exec("COMMIT");
    }
  } catch (error) {
    if (args.apply) {
      targetDb.exec("ROLLBACK");
    }
    throw error;
  } finally {
    sourceDb.close();
    targetDb.close();
  }

  report.finishedAt = Date.now();
  report.elapsedMs = report.finishedAt - report.startedAt;
  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

run();
