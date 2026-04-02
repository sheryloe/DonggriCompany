import { runMigrations } from "../migrate.js";

const result = runMigrations();

console.log("[db:migrate] dbPath:", result.dbPath);
console.log("[db:migrate] applied:", result.appliedMigrations.join(", ") || "(none)");
console.log("[db:migrate] skipped:", result.skippedMigrations.join(", ") || "(none)");
