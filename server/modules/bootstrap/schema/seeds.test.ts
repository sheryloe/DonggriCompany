import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "./base-schema.ts";
import { applyDefaultSeeds } from "./seeds.ts";

describe("default seeds", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("backfills strategic maintenance seeds into a non-empty existing database without duplicates", () => {
    const guideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-agent-guides-"));
    vi.stubEnv("AGENT_GUIDE_ROOT", guideRoot);
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      db.prepare("INSERT INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(
        "pmo",
        "PMO",
        "PMO",
        "PMO",
        "#0f766e",
        1,
      );

      applyDefaultSeeds(db);
      applyDefaultSeeds(db);

      const departments = db.prepare("SELECT COUNT(*) AS cnt FROM departments").get() as { cnt: number };
      const agents = db.prepare("SELECT COUNT(*) AS cnt FROM agents").get() as { cnt: number };
      const strategicAgents = db
        .prepare("SELECT COUNT(*) AS cnt FROM agents WHERE department_id = 'strategic_maintenance'")
        .get() as { cnt: number };
      const settings = db.prepare("SELECT value FROM settings WHERE key = 'strategicMaintenance'").get() as
        | { value: string }
        | undefined;

      expect(departments.cnt).toBe(8);
      expect(agents.cnt).toBe(22);
      expect(strategicAgents.cnt).toBe(3);
      expect(JSON.parse(settings?.value ?? "{}")).toMatchObject({
        enabled: false,
        cadence: "weekly",
        dayOfWeek: 1,
      });
      expect(fs.existsSync(path.join(guideRoot, "strategic_maintenance"))).toBe(true);
    } finally {
      db.close();
      fs.rmSync(guideRoot, { recursive: true, force: true });
    }
  });
});
