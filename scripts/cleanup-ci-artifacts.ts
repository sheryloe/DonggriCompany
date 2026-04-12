import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { cleanupCiArtifacts, previewCiArtifactCleanup } from "../server/modules/maintenance/cleanup-ci-artifacts.ts";

type CliOptions = {
  dbPath: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), "data", "claw-empire.sqlite");
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--db-path") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--db-path requires a value");
      }
      dbPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dbPath, dryRun };
}

function printSummary(label: string, payload: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(payload, null, 2));
}

try {
  const options = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(options.dbPath);
  try {
    const before = previewCiArtifactCleanup(db);
    printSummary("preview", {
      dbPath: options.dbPath,
      dryRun: options.dryRun,
      departmentIds: before.departmentIds,
      projectIds: before.projectIds,
      agentIds: before.agentIds,
      taskIds: before.taskIds,
      subtaskIds: before.subtaskIds,
      meetingIds: before.meetingIds,
      tableCounts: before.tableCounts,
    });

    if (options.dryRun) {
      process.exit(0);
    }

    const applied = cleanupCiArtifacts(db);
    const after = previewCiArtifactCleanup(db);
    printSummary("applied", {
      removed: applied.tableCounts,
      remaining: after.tableCounts,
    });
  } finally {
    db.close();
  }
} catch (error) {
  console.error(String(error));
  process.exit(1);
}
