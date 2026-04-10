import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyOAuthRunnerIsolationSchema } from "../bootstrap/schema/oauth-runner-isolation.ts";
import { CliAccountGateError, CliAccountGateService } from "./cli-account-gate-service.ts";

describe("CliAccountGateService", () => {
  let db: DatabaseSync;
  let profileRoot: string;
  let nowValue = Date.now();

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-cli-pools-"));
    nowValue = Date.now();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(profileRoot, { recursive: true, force: true });
  });

  function createService() {
    return new CliAccountGateService({
      db,
      nowMs: () => nowValue++,
      profileRoot,
      containerName: "donggricompany",
    });
  }

  it("creates pool with deterministic profile path", () => {
    const service = createService();
    const pool = service.createPool("codex", "codex-main", "Codex Main");

    expect(pool.provider).toBe("codex");
    expect(pool.accountPoolId).toBe("codex-main");
    expect(pool.profileHome).toBe(path.posix.join(profileRoot, "codex", "codex-main"));
    expect(pool.status).toBe("auth_required");
  });

  it("throws cli_not_connected when pool is missing", () => {
    const service = createService();
    expect(() => service.ensureProviderPoolReady("codex", "missing-pool")).toThrowError(CliAccountGateError);
    try {
      service.ensureProviderPoolReady("codex", "missing-pool");
    } catch (error) {
      const typed = error as CliAccountGateError;
      expect(typed.code).toBe("cli_not_connected");
      expect(typed.status).toBe(412);
    }
  });

  it("detects auth artifact when profile has provider credentials", () => {
    const service = createService();
    const created = service.createPool("codex", "pool-a", "Pool A");
    const authDir = path.posix.join(created.profileHome, ".codex");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.posix.join(authDir, "auth.json"), JSON.stringify({ token: "x" }), "utf8");

    const result = service.verifyPool("codex", "pool-a");
    if (result.binaryInstalled) {
      expect(result.pool.status).toBe("connected");
      expect(result.authArtifactFound).toBe(true);
    } else {
      expect(result.pool.status).toBe("install_required");
      expect(result.authArtifactFound).toBe(false);
    }
  });

  it("returns Codex login command with device auth in docker exec string", () => {
    const service = createService();
    service.createPool("codex", "codex-main", "Codex Main");

    const result = service.getLoginCommand("codex", "codex-main");
    expect(result.provider).toBe("codex");
    expect(result.accountPoolId).toBe("codex-main");
    expect(result.command).toContain("docker exec -it donggricompany sh -lc");
    expect(result.command).toContain("codex login --device-auth");
  });
});
