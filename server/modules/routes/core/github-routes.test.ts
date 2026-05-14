import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";

const ORIGINAL_PROJECT_PATH_ALLOWED_ROOTS = process.env.PROJECT_PATH_ALLOWED_ROOTS;

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

const oauthHelperMocks = vi.hoisted(() => ({
  decryptSecret: vi.fn((value: string) => value),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
  execFileSync: childProcessMocks.execFileSync,
}));

vi.mock("../../../oauth/helpers.ts", () => ({
  decryptSecret: oauthHelperMocks.decryptSecret,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function insertActiveGitHubAccount(db: DatabaseSync, now = 1_717_171_717_000): void {
  db.prepare(
    `
      INSERT INTO oauth_accounts (
        id, provider, label, email, scope, access_token_enc, status, priority, created_at, updated_at
      )
      VALUES (?, 'github', ?, ?, ?, ?, 'active', 1, ?, ?)
    `,
  ).run("github-account-1", "GitHub", "dev@example.com", "repo", "encrypted-token", now, now);
}

async function createHarness() {
  vi.resetModules();
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);

  const app = express();
  app.use(express.json());

  const { registerGitHubRoutes } = await import("./github-routes.ts");
  registerGitHubRoutes({
    app,
    db,
    broadcast: () => undefined,
  });

  return { app, db };
}

function createMockSpawnChild(exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;

  queueMicrotask(() => {
    child.stderr.write("Receiving objects: 100%");
    child.stderr.end();
    child.emit("close", exitCode);
  });

  return child;
}

describe("github routes", () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    if (ORIGINAL_PROJECT_PATH_ALLOWED_ROOTS === undefined) {
      delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
    } else {
      process.env.PROJECT_PATH_ALLOWED_ROOTS = ORIGINAL_PROJECT_PATH_ALLOWED_ROOTS;
    }
    childProcessMocks.spawn.mockReset();
    childProcessMocks.execFileSync.mockReset();
    oauthHelperMocks.decryptSecret.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs = [];
    if (ORIGINAL_PROJECT_PATH_ALLOWED_ROOTS === undefined) {
      delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
    } else {
      process.env.PROJECT_PATH_ALLOWED_ROOTS = ORIGINAL_PROJECT_PATH_ALLOWED_ROOTS;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("creates a GitHub repository with auto_init enabled", async () => {
    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          {
            name: "demo-repo",
            full_name: "octocat/demo-repo",
            private: true,
            default_branch: "main",
            html_url: "https://github.com/octocat/demo-repo",
            clone_url: "https://github.com/octocat/demo-repo.git",
          },
          201,
        ),
      );

      const response = await request(app).post("/api/github/repos").send({
        name: "demo-repo",
        private: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.repo).toMatchObject({
        name: "demo-repo",
        full_name: "octocat/demo-repo",
        private: true,
        default_branch: "main",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.github.com/user/repos",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "demo-repo",
            private: true,
            auto_init: true,
          }),
        }),
      );
    } finally {
      db.close();
    }
  });

  it("fails when GitHub omits repository metadata from a 201 response", async () => {
    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", {
          status: 201,
          headers: { "content-type": "text/plain" },
        }),
      );

      const response = await request(app).post("/api/github/repos").send({
        name: "demo-repo",
        private: true,
      });

      expect(response.status).toBe(502);
      expect(response.body.error).toBe("github_repo_create_failed");
    } finally {
      db.close();
    }
  });

  it("returns 401 when no GitHub account is connected", async () => {
    const { app, db } = await createHarness();
    try {
      const response = await request(app).post("/api/github/repos").send({
        name: "demo-repo",
        private: true,
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("github_not_connected");
    } finally {
      db.close();
    }
  });

  it("rejects invalid repository names before calling GitHub", async () => {
    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);

      const response = await request(app).post("/api/github/repos").send({
        name: "../demo.git",
        private: true,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_repo_name");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("normalizes GitHub 422 responses to repo_name_conflict", async () => {
    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          {
            message: "Repository creation failed.",
            errors: [{ message: "name already exists on this account" }],
          },
          422,
        ),
      );

      const response = await request(app).post("/api/github/repos").send({
        name: "demo-repo",
        private: false,
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe("repo_name_conflict");
    } finally {
      db.close();
    }
  });

  it("deletes a GitHub repository", async () => {
    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

      const response = await request(app).delete("/api/github/repos/octocat/demo-repo");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/octocat/demo-repo",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    } finally {
      db.close();
    }
  });

  it("creates missing parent directories before cloning", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-clone-route-"));
    tempDirs.push(rootDir);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = rootDir;

    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      childProcessMocks.spawn.mockImplementation(() => createMockSpawnChild(0));

      const targetPath = path.join(rootDir, "nested", "demo-repo");
      const parentPath = path.dirname(targetPath);

      expect(fs.existsSync(parentPath)).toBe(false);

      const response = await request(app).post("/api/github/clone").send({
        owner: "octocat",
        repo: "demo-repo",
        branch: "main",
        target_path: targetPath,
      });

      expect(response.status).toBe(200);
      expect(fs.existsSync(parentPath)).toBe(true);
      expect(childProcessMocks.spawn).toHaveBeenCalledWith(
        "git",
        expect.arrayContaining([
          "clone",
          "--progress",
          "--branch",
          "main",
          "--single-branch",
          "https://github.com/octocat/demo-repo.git",
          targetPath,
        ]),
        expect.objectContaining({
          env: expect.objectContaining({
            GIT_ASKPASS: expect.any(String),
            GIT_TERMINAL_PROMPT: "0",
          }),
        }),
      );
      expect(JSON.stringify(childProcessMocks.spawn.mock.calls[0])).not.toContain("encrypted-token@github.com");
    } finally {
      db.close();
    }
  });

  it("rejects clone targets outside PROJECT_PATH_ALLOWED_ROOTS", async () => {
    const allowedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "github-allowed-root-"));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "github-outside-root-"));
    tempDirs.push(allowedRoot, outsideRoot);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;

    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      const targetPath = path.join(outsideRoot, "demo-repo");

      const response = await request(app).post("/api/github/clone").send({
        owner: "octocat",
        repo: "demo-repo",
        target_path: targetPath,
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: "target_path_outside_allowed_roots",
        allowed_roots: [allowedRoot],
      });
      expect(childProcessMocks.spawn).not.toHaveBeenCalled();
      expect(fs.existsSync(targetPath)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("removes a cloned local path only when it is a git directory", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-local-cleanup-"));
    tempDirs.push(rootDir);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = rootDir;

    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      const cloneDir = path.join(rootDir, "demo-repo");
      fs.mkdirSync(path.join(cloneDir, ".git"), { recursive: true });

      const response = await request(app).delete("/api/github/local-path").send({
        target_path: cloneDir,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        removed: true,
        target_path: cloneDir,
      });
      expect(fs.existsSync(cloneDir)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("requires configured allowed roots before deleting a local clone", async () => {
    delete process.env.PROJECT_PATH_ALLOWED_ROOTS;

    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-local-cleanup-no-root-"));
      tempDirs.push(rootDir);
      const cloneDir = path.join(rootDir, "demo-repo");
      fs.mkdirSync(path.join(cloneDir, ".git"), { recursive: true });

      const response = await request(app).delete("/api/github/local-path").send({
        target_path: cloneDir,
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("target_path_allowed_roots_required");
      expect(fs.existsSync(cloneDir)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("rejects local cleanup targets outside PROJECT_PATH_ALLOWED_ROOTS", async () => {
    const allowedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "github-cleanup-allowed-"));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "github-cleanup-outside-"));
    tempDirs.push(allowedRoot, outsideRoot);
    process.env.PROJECT_PATH_ALLOWED_ROOTS = allowedRoot;

    const { app, db } = await createHarness();
    try {
      insertActiveGitHubAccount(db);
      const cloneDir = path.join(outsideRoot, "demo-repo");
      fs.mkdirSync(path.join(cloneDir, ".git"), { recursive: true });

      const response = await request(app).delete("/api/github/local-path").send({
        target_path: cloneDir,
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: "target_path_outside_allowed_roots",
        allowed_roots: [allowedRoot],
      });
      expect(fs.existsSync(cloneDir)).toBe(true);
    } finally {
      db.close();
    }
  });
});
