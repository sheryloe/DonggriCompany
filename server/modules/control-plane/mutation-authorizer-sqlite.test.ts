import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyControlPlaneMutationSchema,
  CONTROL_PLANE_MUTATION_TABLES,
} from "../bootstrap/schema/control-plane-mutation-schema.ts";
import {
  MutationAuthorizer,
  type MutationExecuteInput,
  type MutationPreview,
  type ApprovalReceipt,
} from "./mutation-authorizer.ts";
import { SqliteMutationAuthorizerPersistence } from "./mutation-authorizer-sqlite.ts";

const tempDirectories: string[] = [];
const PROJECTION_EPOCH = "sha256:projection-epoch-v1";

function createDatabase(file = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 1000");
  applyControlPlaneMutationSchema(db);
  return db;
}

function createFileDatabase(): { directory: string; file: string; db: DatabaseSync } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-mutation-sqlite-"));
  tempDirectories.push(directory);
  const file = path.join(directory, "mutation.sqlite");
  return { directory, file, db: createDatabase(file) };
}

function createAuthorizer(db: DatabaseSync, now?: () => Date): MutationAuthorizer {
  return new MutationAuthorizer({
    persistence: new SqliteMutationAuthorizerPersistence(db),
    allowed_executable_ids: ["pnpm"],
    allowed_cwd_refs: ["worktree:donggri-v1"],
    now,
  });
}

async function createApprovedMutation(
  authorizer: MutationAuthorizer,
  idempotencyKey = "sqlite-idempotency-0001",
): Promise<{ preview: MutationPreview; receipt: ApprovalReceipt; executeInput: MutationExecuteInput }> {
  const preview = await authorizer.createPreview({
    spec_id: "spec-v1",
    project_id: "DonggriCompany",
    operation: "verify",
    resolved_target: "candidate-v1",
    scope: { gate: "G2" },
    command: {
      executable_id: "pnpm",
      args: ["run", "test:api"],
      cwd_ref: "worktree:donggri-v1",
    },
    source_epoch: "epoch-v1",
    projection_epoch: PROJECTION_EPOCH,
    requester: "requester",
  });
  const receipt = await authorizer.issueApproval(preview.preview_id, "approver");
  return {
    preview,
    receipt,
    executeInput: {
      preview_id: preview.preview_id,
      approval_id: receipt.approval_id,
      source_epoch: preview.source_epoch,
      current_projection_epoch: preview.projection_epoch,
      confirmation_text: preview.confirmation_text,
      idempotency_key: idempotencyKey,
      guards: {
        authenticated: true,
        csrf_valid: true,
        origin: "http://localhost:8790",
      },
    },
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("control-plane mutation SQLite schema", () => {
  it("initializes idempotently without altering an existing table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE existing_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO existing_state (id, value) VALUES (?, ?)").run("keep", "unchanged");

    applyControlPlaneMutationSchema(db);
    applyControlPlaneMutationSchema(db);

    const tables = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'control_plane_%'
        ORDER BY name
      `,
      )
      .all()
      .map((row) => String(row.name));
    expect(tables).toEqual([...CONTROL_PLANE_MUTATION_TABLES].sort());
    expect(db.prepare("SELECT value FROM existing_state WHERE id = ?").get("keep")).toEqual({
      value: "unchanged",
    });
    db.close();
  });
});

describe("SqliteMutationAuthorizerPersistence", () => {
  it("persists previews, approvals, idempotent outcomes, and audit across restart", async () => {
    const { file, db } = createFileDatabase();
    const firstAuthorizer = createAuthorizer(db);
    const approved = await createApprovedMutation(firstAuthorizer);
    const first = await firstAuthorizer.execute(approved.executeInput, async () => ({
      candidate_id: "candidate-001",
    }));
    expect(first).toMatchObject({ ok: true, status: "executed" });
    expect(
      db
        .prepare(
          `
          SELECT projection_epoch, json_extract(preview_json, '$.projection_epoch') AS json_projection_epoch
          FROM control_plane_mutation_previews
          WHERE preview_id = ?
        `,
        )
        .get(approved.preview.preview_id),
    ).toMatchObject({
      projection_epoch: PROJECTION_EPOCH,
      json_projection_epoch: PROJECTION_EPOCH,
    });
    expect(
      db
        .prepare(
          `
          SELECT projection_epoch, json_extract(receipt_json, '$.projection_epoch') AS json_projection_epoch
          FROM control_plane_approval_receipts
          WHERE approval_id = ?
        `,
        )
        .get(approved.receipt.approval_id),
    ).toMatchObject({
      projection_epoch: PROJECTION_EPOCH,
      json_projection_epoch: PROJECTION_EPOCH,
    });
    db.close();

    const reopened = createDatabase(file);
    const restartedAuthorizer = createAuthorizer(reopened);
    const callback = vi.fn(async () => ({ candidate_id: "should-not-run" }));
    const replay = await restartedAuthorizer.execute(approved.executeInput, callback);

    expect(replay).toMatchObject({
      ok: true,
      status: "replayed",
      value: { candidate_id: "candidate-001" },
    });
    expect(callback).not.toHaveBeenCalled();
    expect(reopened.prepare("SELECT COUNT(*) AS count FROM control_plane_mutation_audit").get()).toMatchObject({
      count: 6,
    });
    reopened.close();
  });

  it("atomically consumes an approval when reservations compete", async () => {
    const { file, db: firstDb } = createFileDatabase();
    const secondDb = createDatabase(file);
    const authorizer = createAuthorizer(firstDb);
    const approved = await createApprovedMutation(authorizer);
    const firstPersistence = new SqliteMutationAuthorizerPersistence(firstDb);
    const secondPersistence = new SqliteMutationAuthorizerPersistence(secondDb);
    const requestDigest = "a".repeat(64);

    const [first, second] = await Promise.all([
      firstPersistence.reserveExecution({
        idempotency_key: "concurrent-key-0001",
        request_digest: requestDigest,
        reservation_id: "reservation-001",
        approval_id: approved.receipt.approval_id,
        created_at: "2026-07-25T00:00:00.000Z",
        lease_expires_at: "2026-07-25T00:00:30.000Z",
      }),
      secondPersistence.reserveExecution({
        idempotency_key: "concurrent-key-0002",
        request_digest: requestDigest,
        reservation_id: "reservation-002",
        approval_id: approved.receipt.approval_id,
        created_at: "2026-07-25T00:00:00.001Z",
        lease_expires_at: "2026-07-25T00:00:30.001Z",
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual(["approval_reused", "reserved"]);
    expect(
      firstDb
        .prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results WHERE approval_id = ?")
        .get(approved.receipt.approval_id),
    ).toMatchObject({ count: 1 });
    firstDb.close();
    secondDb.close();
  });

  it("reproduces in-flight, replay, and conflict decisions from persisted state", async () => {
    const db = createDatabase();
    const authorizer = createAuthorizer(db);
    const approved = await createApprovedMutation(authorizer);
    const persistence = new SqliteMutationAuthorizerPersistence(db);
    const base = {
      idempotency_key: "reservation-key-0001",
      request_digest: "b".repeat(64),
      reservation_id: "reservation-001",
      approval_id: approved.receipt.approval_id,
      created_at: "2026-07-25T00:00:00.000Z",
      lease_expires_at: "2026-07-25T00:00:30.000Z",
    };

    expect(await persistence.reserveExecution(base)).toEqual({
      status: "reserved",
      reservation_id: "reservation-001",
    });
    expect(await persistence.reserveExecution({ ...base, reservation_id: "reservation-002" })).toEqual({
      status: "execution_in_flight",
    });
    expect(
      await persistence.reserveExecution({
        ...base,
        reservation_id: "reservation-003",
        request_digest: "c".repeat(64),
      }),
    ).toEqual({ status: "idempotency_conflict" });

    const outcome = { status: "succeeded" as const, value: { ok: true } };
    await persistence.recordExecutionEffect({
      reservation_id: "reservation-001",
      outcome,
      recorded_at: "2026-07-25T00:00:01.000Z",
    });
    await persistence.completeExecution({
      reservation_id: "reservation-001",
      outcome,
      completed_at: "2026-07-25T00:00:01.000Z",
      audit_event: {
        event_id: "event-completed-001",
        event_type: "execution_completed",
        occurred_at: "2026-07-25T00:00:01.000Z",
        approval_id: approved.receipt.approval_id,
      },
    });
    expect(await persistence.reserveExecution({ ...base, reservation_id: "reservation-004" })).toEqual({
      status: "replay",
      outcome: { status: "succeeded", value: { ok: true } },
    });
    db.close();
  });

  it("fails closed when a stored receipt is tampered", async () => {
    const db = createDatabase();
    const authorizer = createAuthorizer(db);
    const approved = await createApprovedMutation(authorizer);
    const tampered = { ...approved.receipt, approver: "attacker" };
    db.prepare("UPDATE control_plane_approval_receipts SET receipt_json = ? WHERE approval_id = ?").run(
      JSON.stringify(tampered),
      approved.receipt.approval_id,
    );
    const callback = vi.fn(async () => "mutated");

    const result = await authorizer.execute(approved.executeInput, callback);

    expect(result).toEqual({ ok: false, code: "approval_tampered" });
    expect(callback).not.toHaveBeenCalled();
    db.close();
  });

  it("refuses to issue approval for a tampered stored structured command", async () => {
    const db = createDatabase();
    const authorizer = createAuthorizer(db);
    const preview = await authorizer.createPreview({
      spec_id: "spec-v1",
      project_id: "DonggriCompany",
      operation: "verify",
      resolved_target: "candidate-v1",
      scope: { gate: "G2" },
      command: {
        executable_id: "pnpm",
        args: ["run", "test:api"],
        cwd_ref: "worktree:donggri-v1",
      },
      source_epoch: "epoch-v1",
      projection_epoch: PROJECTION_EPOCH,
      requester: "requester",
    });
    const tampered = {
      ...preview,
      command: {
        executable_id: "pnpm",
        args: ["$(calc.exe)"],
        cwd_ref: "worktree:donggri-v1",
      },
    };
    db.prepare("UPDATE control_plane_mutation_previews SET preview_json = ? WHERE preview_id = ?").run(
      JSON.stringify(tampered),
      preview.preview_id,
    );

    await expect(authorizer.issueApproval(preview.preview_id, "approver")).rejects.toThrow("preview_tampered");
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_approval_receipts").get()).toMatchObject({
      count: 0,
    });
    db.close();
  });

  it("fails closed on a corrupt persisted idempotency outcome", async () => {
    const db = createDatabase();
    const authorizer = createAuthorizer(db);
    const approved = await createApprovedMutation(authorizer);
    const first = await authorizer.execute(approved.executeInput, async () => ({ ok: true }));
    expect(first).toMatchObject({ ok: true });
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `
      UPDATE control_plane_idempotency_results
      SET outcome_json = ?
      WHERE idempotency_key = ?
    `,
    ).run('{"status":"succeeded"}', approved.executeInput.idempotency_key);
    db.exec("PRAGMA ignore_check_constraints = OFF");
    const callback = vi.fn(async () => ({ ok: false }));

    const replay = await authorizer.execute(approved.executeInput, callback);

    expect(replay).toEqual({ ok: false, code: "persistence_corrupt" });
    expect(callback).not.toHaveBeenCalled();
    db.close();
  });

  it("completes a compound execution inside the caller transaction and rolls back as one unit", async () => {
    const db = createDatabase();
    const authorizer = createAuthorizer(db);
    const approved = await createApprovedMutation(authorizer);
    const persistence = new SqliteMutationAuthorizerPersistence(db);
    const outcome = { status: "succeeded" as const, value: { target_run_id: "run:target" } };

    db.exec("BEGIN IMMEDIATE");
    expect(
      persistence.consumeApprovalAndCompleteInTransaction({
        idempotency_key: "atomic:rollback",
        request_digest: "a".repeat(64),
        reservation_id: "reservation:atomic",
        approval_id: approved.receipt.approval_id,
        outcome,
        created_at: "2026-07-25T00:00:01.000Z",
        completed_at: "2026-07-25T00:00:01.000Z",
        audit_event: {
          event_id: "event:atomic",
          event_type: "execution_completed",
          occurred_at: "2026-07-25T00:00:01.000Z",
          approval_id: approved.receipt.approval_id,
        },
      }),
    ).toEqual({ status: "completed", reservation_id: "reservation:atomic" });
    db.exec("ROLLBACK");

    expect(
      db.prepare("SELECT consumed_reservation_id FROM control_plane_approval_receipts WHERE approval_id = ?").get(
        approved.receipt.approval_id,
      ),
    ).toEqual({ consumed_reservation_id: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results").get()).toEqual({ count: 0 });
    db.close();
  });
});
