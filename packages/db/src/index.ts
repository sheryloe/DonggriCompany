import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

export const getDb = (url: string = 'sqlite.db') => {
  if (!sqlite) {
    sqlite = new Database(url);
    db = drizzle(sqlite, { schema });
  }
  return db;
};

export * from './schema';
