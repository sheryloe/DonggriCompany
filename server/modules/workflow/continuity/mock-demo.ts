import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyContinuityCheckpointSchema } from "../../bootstrap/schema/continuity-checkpoint-schema.js";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.js";
import { ContinuityTransferService, type CreateTransferInput } from "./transfer-service.js";
import { collectContinuityWorkspace } from "./workspace-identity.js";

export interface ContinuityDemoResult {
  ok: true;
  transfers: Array<{ direction: string; task_id: string; final_status: string; checkpoints: number }>;
  credentials_used: false;
}

export async function runContinuityMockDemo(): Promise<ContinuityDemoResult> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dongri-continuity-demo-"));
  const db = new DatabaseSync(":memory:");
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "demo@dongri.local"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Dongri Demo"], { cwd: root });
    fs.writeFileSync(path.join(root, "README.md"), "# Dongri continuity demo\n");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "-m", "demo baseline"], { cwd: root, stdio: "ignore" });
    applyContinuityCheckpointSchema(db);
    const store = new SqliteContinuityCheckpointStore(db);
    const service = new ContinuityTransferService(
      store,
      collectContinuityWorkspace,
      (provider, accountPoolId) => ({
        provider,
        account_pool_id: accountPoolId,
        account_label: `${provider} mock`,
        state: "ready",
        observed_at: null,
        reason: null,
      }),
      async (checkpoint) => ({
        ok: true,
        dispatch_id: checkpoint.dispatch_id!,
        target_run_id: checkpoint.target_run_id!,
        provider_native_session_id: `mock:${checkpoint.target_provider}:${checkpoint.task_id}`,
      }),
    );
    const transfers: ContinuityDemoResult["transfers"] = [];
    for (const [index, source] of (["codex", "claude"] as const).entries()) {
      const target = source === "codex" ? "claude" : "codex";
      const taskId = `demo:${source}-to-${target}`;
      const input: CreateTransferInput = {
        project_id: "project:demo",
        project_path: root,
        task_id: taskId,
        source_run_id: `mock:${source}:source`,
        source_provider: source,
        source_account_pool_id: `${source}-mock`,
        source_account_label: `${source} mock`,
        target_provider: target,
        target_account_pool_id: `${target}-mock`,
        target_account_label: `${target} mock`,
        objective: "Prove portable provider continuity",
        acceptance_criteria: ["task identity preserved", "workspace digest matches"],
        completed: ["source paused"],
        pending: ["target resume"],
        next_safe_action: "validate target",
        idempotency_key: `demo:create:${index}`,
        created_by: "mock-demo",
      };
      const created = service.create(input);
      if (created.status === "idempotency_conflict") throw new Error("demo_create_conflict");
      const validated = service.validate(created.checkpoint.checkpoint_id, root, `demo:validate:${index}`);
      if (validated.status === "idempotency_conflict") throw new Error("demo_validate_conflict");
      const accepted = service.accept(validated.checkpoint.checkpoint_id, "APR-MOCK-DEMO", `demo:accept:${index}`);
      if (accepted.status === "idempotency_conflict") throw new Error("demo_accept_conflict");
      const resumed = await service.resume(accepted.checkpoint.checkpoint_id, `demo:resume:${index}`);
      if (resumed.status === "idempotency_conflict") throw new Error("demo_resume_conflict");
      transfers.push({
        direction: `${source}->${target}`,
        task_id: resumed.checkpoint.task_id,
        final_status: resumed.checkpoint.status,
        checkpoints: store.list(taskId).length,
      });
    }
    return { ok: true, transfers, credentials_used: false };
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
