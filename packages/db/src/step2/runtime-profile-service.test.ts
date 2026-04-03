import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { DbServiceError, RuntimeProfileService } from "../index.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step2-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("RuntimeProfileService supports create and update", () => {
  const dbPath = createSeededDbPath();
  const service = new RuntimeProfileService(dbPath);

  try {
    const created = service.create({
      key: "codex-runtime-extra-a",
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      profilePath: ".codex/profiles/runtime-extra-a",
      status: "active"
    });

    assert.equal(created.key, "codex-runtime-extra-a");
    assert.equal(created.provider, "codex");
    assert.equal(created.accountPoolId, "pool_codex_pro_main");

    const updated = service.update(created.id, {
      key: "codex-runtime-extra-b",
      profilePath: ".codex/profiles/runtime-extra-b",
      status: "disabled"
    });

    assert.equal(updated.key, "codex-runtime-extra-b");
    assert.equal(updated.profilePath, ".codex/profiles/runtime-extra-b");
    assert.equal(updated.status, "disabled");
    assert.equal(updated.provider, "codex");
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("RuntimeProfileService supports delete and rejects unknown ids", () => {
  const dbPath = createSeededDbPath();
  const service = new RuntimeProfileService(dbPath);

  try {
    const created = service.create({
      key: "codex-runtime-delete-a",
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      profilePath: ".codex/profiles/runtime-delete-a",
      status: "active"
    });

    const removed = service.remove(created.id);
    assert.equal(removed.id, created.id);
    assert.equal(service.list().some((profile) => profile.id === created.id), false);

    assert.throws(
      () => service.remove(created.id),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("RuntimeProfileService rejects create when provider and account pool do not match", () => {
  const dbPath = createSeededDbPath();
  const service = new RuntimeProfileService(dbPath);

  try {
    assert.throws(
      () =>
        service.create({
          key: "codex-invalid-target",
          provider: "codex",
          accountPoolId: "pool_claude_pro_main"
        }),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "BAD_REQUEST");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("RuntimeProfileService rejects update when account pool provider mismatches profile provider", () => {
  const dbPath = createSeededDbPath();
  const service = new RuntimeProfileService(dbPath);

  try {
    assert.throws(
      () =>
        service.update("rt_codex_builder_pro_a", {
          accountPoolId: "pool_claude_pro_main"
        }),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "BAD_REQUEST");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});
