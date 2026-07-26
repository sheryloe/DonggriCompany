import { execFileSync } from "node:child_process";
import path from "node:path";

export type E2EDbHelperAction =
  | "delete-project-messages"
  | "delete-subtasks"
  | "mark-agents-offline"
  | "project-health-agent-current-task"
  | "project-health-seed"
  | "project-health-stale-assignment"
  | "project-health-task-status";

export function runE2EDbHelper<T extends Record<string, unknown>>(
  action: E2EDbHelperAction,
  payload: Record<string, unknown> = {},
): T {
  const helperPath = path.resolve(process.cwd(), "scripts", "e2e-db-helper.mjs");
  const output = execFileSync(process.execPath, [helperPath, action, JSON.stringify(payload)], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    windowsHide: true,
  }).trim();
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    throw new Error(`E2E DB helper returned no output for ${action}.`);
  }
  const parsed = JSON.parse(line) as T & { ok?: boolean };
  if (parsed.ok !== true) {
    throw new Error(`E2E DB helper failed for ${action}: ${line}`);
  }
  return parsed;
}
