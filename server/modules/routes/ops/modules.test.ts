import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { registerModuleRoutes } from "./modules.ts";

function createHarness() {
  const app = express();
  app.use(express.json());
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  registerModuleRoutes({
    app: app as any,
    db,
    nowMs: () => 1_700_000_000_000,
  });
  return { app, db };
}

function seedProject(db: DatabaseSync, projectPath: string) {
  db.prepare(
    `
    INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
    VALUES ('project-1', 'Module Project', ?, 'Build reusable project modules.', 1, 1, 1)
  `,
  ).run(projectPath);
}

describe("project module routes", () => {
  let db: DatabaseSync | null = null;
  let projectDir = "";
  let app: express.Express;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-module-test-"));
    const harness = createHarness();
    app = harness.app;
    db = harness.db;
    seedProject(db, projectDir);
  });

  afterEach(() => {
    db?.close();
    db = null;
    fs.rmSync(projectDir, { recursive: true, force: true });
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it("returns seed module catalog separated from skills", async () => {
    const res = await request(app).get("/api/modules").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module_key: "google-oauth", category_key: "auth-provider" }),
        expect.objectContaining({ module_key: "sprite-4dir", category_key: "game-asset" }),
      ]),
    );
  });

  it("builds preview without writing project artifacts and redacts secret values", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    const res = await request(app)
      .post("/api/projects/project-1/modules/preview")
      .send({
        module_key: "google-oauth",
        binding_name: "Google Login",
        secret_refs: {
          GOOGLE_CLIENT_SECRET: "raw-secret-that-must-not-be-returned",
        },
      })
      .expect(200);

    expect(res.body.preview.binding_name).toBe("google-login");
    expect(res.body.preview.secret_status).toMatchObject({
      GOOGLE_CLIENT_ID: "configured",
      GOOGLE_CLIENT_SECRET: "configured",
      GOOGLE_CALLBACK_URL: "missing",
    });
    expect(JSON.stringify(res.body)).not.toContain("raw-secret-that-must-not-be-returned");
    expect(fs.existsSync(path.join(projectDir, ".donggri"))).toBe(false);
  });

  it("rejects preview when request project path does not match the selected project", async () => {
    await request(app)
      .post("/api/projects/project-1/modules/preview")
      .send({
        module_key: "google-oauth",
        project_path: path.join(projectDir, "other"),
      })
      .expect(409);
  });

  it("applies preview artifacts with idempotency key reuse", async () => {
    const bindingRes = await request(app)
      .post("/api/projects/project-1/modules")
      .send({
        module_key: "sprite-4dir",
        binding_name: "Character Sprite",
      })
      .expect(201);

    const bindingId = bindingRes.body.binding.id;
    const firstApply = await request(app)
      .post(`/api/projects/project-1/modules/${bindingId}/apply`)
      .set("Idempotency-Key", "apply-once")
      .send({})
      .expect(201);
    const secondApply = await request(app)
      .post(`/api/projects/project-1/modules/${bindingId}/apply`)
      .set("Idempotency-Key", "apply-once")
      .send({})
      .expect(200);

    expect(firstApply.body.apply_run.status).toBe("applied");
    expect(secondApply.body.idempotent).toBe(true);
    expect(secondApply.body.apply_run.id).toBe(firstApply.body.apply_run.id);
    expect(fs.existsSync(path.join(projectDir, ".donggri", "modules", "character-sprite.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, ".donggri", "assets", "manifest.json"))).toBe(true);
  });

  it("creates image asset jobs without publishing Codex-home-only drafts", async () => {
    const res = await request(app)
      .post("/api/projects/project-1/assets/jobs")
      .send({
        module_key: "character-image",
        asset_key: "hero-agent",
        asset_brief: "Original animated developer character.",
      })
      .expect(201);

    expect(res.body.job).toMatchObject({
      module_key: "character-image",
      asset_key: "hero-agent",
      status: "draft",
      engine: "imagegen_builtin",
    });
    expect(res.body.job.prompt_markdown).toContain("Approved results must be copied");
  });
});
