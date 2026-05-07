import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyMemorySchema } from "../../bootstrap/schema/memory-schema.ts";
import { applyModuleSchema } from "../../bootstrap/schema/module-schema.ts";
import { applyTaskSchemaMigrations } from "../../bootstrap/schema/task-schema-migrations.ts";
import { registerProjectRoutes } from "./projects.ts";

function createHarness() {
  const app = express();
  app.use(express.json());
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  applyTaskSchemaMigrations(db);
  applyMemorySchema(db);
  applyModuleSchema(db);

  registerProjectRoutes({
    app,
    db,
    firstQueryValue: (value: unknown) => (Array.isArray(value) ? String(value[0]) : value == null ? undefined : String(value)),
    normalizeTextField: (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null),
    runInTransaction: (fn: () => void) => {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    nowMs: () => 1_700_000_000_000,
  });

  return { app, db };
}

function seedProject(db: DatabaseSync, id: string): void {
  db.prepare(
    `
      INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, 1)
    `,
  ).run(id, id, `G:\\Donggri_DevDrive\\repos\\runtime\\${id}`, `Goal for ${id}`);
}

describe("project deletion foreign-key edge cases", () => {
  let db: DatabaseSync | null = null;
  let app: express.Express;

  beforeEach(() => {
    const harness = createHarness();
    app = harness.app;
    db = harness.db;
    seedProject(db, "project-delete");
    seedProject(db, "project-keep");
    db.prepare(
      `
        INSERT INTO agents (id, name, name_ko, role, cli_provider, status, stats_tasks_done, stats_xp)
        VALUES ('agent-1', 'Agent', 'Agent', 'team_leader', 'codex', 'idle', 0, 0)
      `,
    ).run();
  });

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("nulls task links, preserves agent memories, and removes project-scoped rows", async () => {
    db!
      .prepare(
        `
          INSERT INTO tasks (
            id, title, description, assigned_agent_id, project_id, status, task_type,
            workflow_pack_key, result, created_at, updated_at, completed_at
          ) VALUES ('task-1', 'Delete edge', 'Delete edge test', 'agent-1', 'project-delete', 'done', 'development',
            'development', 'done', 1, 1, 1)
        `,
      )
      .run();
    db!
      .prepare(
        `
          INSERT INTO memory_embeddings (
            source_table, memory_id, embedding_model, dims, vector_json, content_hash, created_at, updated_at
          ) VALUES
            ('agent_memories', 'agent-memory-1', 'local-hash-v3', 2, '[1,0]', 'agent-hash', 1, 1),
            ('project_memories', 'project-memory-1', 'local-hash-v3', 2, '[0,1]', 'project-hash', 1, 1)
        `,
      )
      .run();
    db!
      .prepare(
        `
          INSERT INTO agent_memories (
            id, agent_id, project_id, memory_type, scope_type, title, body, tags_json,
            source_type, memory_layer, status, created_at, updated_at
          ) VALUES ('agent-memory-1', 'agent-1', 'project-delete', 'lesson', 'project', 'Agent memory',
            'Keep this memory but detach project.', '[]', 'manual', 'archival', 'active', 1, 1)
        `,
      )
      .run();
    db!
      .prepare(
        `
          INSERT INTO project_memories (
            id, project_id, agent_id, memory_type, scope_type, title, body, tags_json,
            source_type, memory_layer, status, created_at, updated_at
          ) VALUES ('project-memory-1', 'project-delete', 'agent-1', 'lesson', 'project', 'Project memory',
            'Delete with project.', '[]', 'manual', 'archival', 'active', 1, 1)
        `,
      )
      .run();
    db!
      .prepare(
        `
          INSERT INTO project_component_events (
            id, project_id, department_id, component_key, component_kind, event_type,
            title, payload_json, created_at
          ) VALUES ('event-1', 'project-delete', 'design', 'design-workspace', 'design_workspace', 'snapshot',
            'Snapshot', '{}', 1)
        `,
      )
      .run();

    await request(app).delete("/api/projects/project-delete").expect(200);

    expect(db!.prepare("SELECT project_id FROM tasks WHERE id = 'task-1'").get()).toEqual({ project_id: null });
    expect(db!.prepare("SELECT project_id FROM agent_memories WHERE id = 'agent-memory-1'").get()).toEqual({
      project_id: null,
    });
    expect(
      db!
        .prepare("SELECT memory_id FROM memory_embeddings WHERE source_table = 'agent_memories' AND memory_id = 'agent-memory-1'")
        .get(),
    ).toEqual({ memory_id: "agent-memory-1" });
    expect(
      db!
        .prepare("SELECT memory_id FROM memory_embeddings WHERE source_table = 'project_memories' AND memory_id = 'project-memory-1'")
        .get(),
    ).toBeUndefined();
    expect(db!.prepare("SELECT id FROM project_memories WHERE id = 'project-memory-1'").get()).toBeUndefined();
    expect(db!.prepare("SELECT id FROM project_component_events WHERE id = 'event-1'").get()).toBeUndefined();
    expect(db!.prepare("SELECT id FROM projects WHERE id = 'project-keep'").get()).toEqual({ id: "project-keep" });
  });
});
