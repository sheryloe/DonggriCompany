import Database from "better-sqlite3";

import { ensureDbDirectory, getDbPath } from "./paths.js";

export type DatabaseHandle = Database.Database;

export const openDatabase = (dbPath = getDbPath()): DatabaseHandle => {
  ensureDbDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
};

export const withDatabase = <T>(
  operation: (db: DatabaseHandle) => T,
  dbPath = getDbPath()
): T => {
  const db = openDatabase(dbPath);
  try {
    return operation(db);
  } finally {
    db.close();
  }
};
