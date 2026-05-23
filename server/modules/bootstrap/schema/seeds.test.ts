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

  it("backfills Dongri-grigri master agents into a non-empty existing database without duplicates", () => {
    const guideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-agent-guides-"));
    vi.stubEnv("AGENT_GUIDE_ROOT", guideRoot);
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      db.prepare("INSERT INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(
        "planning",
        "Planning",
        "기획",
        "PLAN",
        "#2563eb",
        1,
      );

      applyDefaultSeeds(db);
      applyDefaultSeeds(db);

      const departments = db.prepare("SELECT COUNT(*) AS cnt FROM departments").get() as { cnt: number };
      const agents = db.prepare("SELECT COUNT(*) AS cnt FROM agents").get() as { cnt: number };
      const instructorAgents = db
        .prepare("SELECT COUNT(*) AS cnt FROM agents WHERE department_id = 'instructor'")
        .get() as { cnt: number };
      const seedVersion = db.prepare("SELECT value FROM settings WHERE key = 'organizationSeedVersion'").get() as
        | { value: string }
        | undefined;
      const settings = db.prepare("SELECT value FROM settings WHERE key = 'strategicMaintenance'").get() as
        | { value: string }
        | undefined;

      expect(departments.cnt).toBe(6);
      expect(agents.cnt).toBe(6);
      expect(instructorAgents.cnt).toBe(1);
      expect(seedVersion?.value).toBe("dongri-grigri-v1");
      expect(JSON.parse(settings?.value ?? "{}")).toMatchObject({
        enabled: false,
        cadence: "weekly",
        dayOfWeek: 1,
      });
      expect(fs.existsSync(path.join(guideRoot, "operations"))).toBe(true);
      expect(fs.existsSync(path.join(guideRoot, "instructor"))).toBe(true);
    } finally {
      db.close();
      fs.rmSync(guideRoot, { recursive: true, force: true });
    }
  });
});
