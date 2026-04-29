import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  hydrateOfficePackAgentFromSettings,
  syncOfficePackAgentsForPack,
  syncOfficePackAgentsFromProfiles,
} from "./office-pack-agent-hydration.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL,
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'icon',
      color TEXT NOT NULL DEFAULT '#64748b',
      description TEXT,
      prompt TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()*1000)
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL,
      department_id TEXT,
      role TEXT NOT NULL,
      acts_as_planning_leader INTEGER NOT NULL DEFAULT 0,
      cli_provider TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '?',
      personality TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      stats_tasks_done INTEGER DEFAULT 0,
      stats_xp INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()*1000),
      oauth_account_id TEXT,
      api_provider_id TEXT,
      api_model TEXT,
      sprite_number INTEGER,
      agent_profile_json TEXT,
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      cli_model TEXT,
      run_mode TEXT NOT NULL DEFAULT 'standard',
      cli_reasoning_level TEXT
    );
  `);
  return db;
}

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe("office-pack-agent-hydration", () => {
  it("returns existing DB agent row and ignores officePackProfiles fallback payload", () => {
    db = createDb();
    const profiles = {
      video_preprod: {
        departments: [
          {
            id: "planning",
            name: "Planning",
            name_ko: "planning",
            name_ja: "planning",
            name_zh: "planning",
            icon: "star",
            color: "#f59e0b",
            sort_order: 1,
            created_at: 1700000000000,
          },
        ],
        agents: [
          {
            id: "video_preprod-seed-1",
            name: "Rian",
            name_ko: "rian",
            name_ja: "rian-ja",
            name_zh: "rian-zh",
            department_id: "planning",
            role: "team_leader",
            cli_provider: "claude",
            cli_model: "claude-opus-4-6",
            avatar_emoji: "ship",
            sprite_number: 8,
            personality: "planning lead",
            agent_profile: {
              role_template: "team_leader",
              growth_tier: 5,
              capabilities: {
                execution: 5,
                architecture: 4,
                review: 4,
                research: 4,
                communication: 5,
                leadership: 5,
              },
              prompt_style: {
                tone: 4,
                autonomy: 5,
                strictness: 4,
                collaboration: 5,
              },
              specialties: ["storyboarding", "approval"],
              custom_prompt_override: "Escalate risks before final sign-off.",
            },
            created_at: 1700000000001,
          },
        ],
      },
    };
    db.prepare("INSERT INTO settings (key, value) VALUES ('officePackProfiles', ?)").run(JSON.stringify(profiles));

    db.prepare(
      `INSERT INTO agents (
        id, name, name_ko, department_id, role, cli_provider, status, created_at, run_mode, cli_model, cli_reasoning_level
      ) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?)`,
    ).run(
      "video_preprod-seed-1",
      "DB Rian",
      "db-rian",
      "planning",
      "team_leader",
      "codex",
      1700000000123,
      "plan",
      "gpt-5.4",
      "high",
    );

    const hydrated = hydrateOfficePackAgentFromSettings(db, "video_preprod-seed-1", () => 1700000000999);

    expect(hydrated?.id).toBe("video_preprod-seed-1");
    expect(hydrated?.name).toBe("DB Rian");
    expect(hydrated?.department_id).toBe("planning");
    expect(hydrated?.cli_provider).toBe("codex");
    expect(hydrated?.cli_model).toBe("gpt-5.4");
    expect(hydrated?.run_mode).toBe("plan");

    const dbAgent = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id = 'video_preprod-seed-1'").get() as
      | { c: number }
      | undefined;
    const dbDept = db.prepare("SELECT COUNT(*) AS c FROM departments WHERE id = 'planning'").get() as
      | { c: number }
      | undefined;
    expect(dbAgent?.c).toBe(1);
    expect(dbDept?.c).toBe(0);
  });

  it("returns null for missing agent id even when officePackProfiles contains a matching seed", () => {
    db = createDb();
    db.prepare("INSERT INTO settings (key, value) VALUES ('officePackProfiles', ?)").run(
      JSON.stringify({
        development: {
          agents: [{ id: "missing-agent", name: "ghost", name_ko: "ghost", role: "senior" }],
        },
      }),
    );

    const hydrated = hydrateOfficePackAgentFromSettings(db, "missing-agent", () => 1700000000999);
    expect(hydrated).toBeNull();
  });

  it("syncOfficePackAgentsFromProfiles reads only and never inserts", () => {
    db = createDb();
    const profiles = {
      novel: {
        departments: [
          {
            id: "design",
            name: "Story Design",
            name_ko: "story design",
            icon: "brush",
            color: "#7c3aed",
            sort_order: 1,
          },
        ],
        agents: [
          {
            id: "novel-seed-1",
            name: "Luna",
            name_ko: "luna",
            department_id: "design",
            role: "team_leader",
            cli_provider: "claude",
            avatar_emoji: "brush",
          },
        ],
      },
    };

    const result = syncOfficePackAgentsFromProfiles(db, profiles, () => 1700000002000);
    expect(result).toEqual({ departmentsSynced: 1, agentsSynced: 1 });

    const row = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id = 'novel-seed-1'").get() as
      | { c: number }
      | undefined;
    const dept = db.prepare("SELECT COUNT(*) AS c FROM departments WHERE id = 'design'").get() as
      | { c: number }
      | undefined;
    expect(row?.c).toBe(0);
    expect(dept?.c).toBe(0);
  });

  it("syncOfficePackAgentsForPack reads only and never inserts cross-pack", () => {
    db = createDb();
    const profiles = {
      novel: {
        departments: [{ id: "design", name: "Story Design", name_ko: "story design", icon: "brush", color: "#7c3aed" }],
        agents: [
          {
            id: "novel-seed-1",
            name: "Luna",
            name_ko: "luna",
            department_id: "design",
            role: "team_leader",
            cli_provider: "claude",
            avatar_emoji: "brush",
          },
        ],
      },
      report: {
        departments: [{ id: "planning", name: "Report", name_ko: "report", icon: "note", color: "#f59e0b" }],
        agents: [
          {
            id: "report-seed-1",
            name: "Sage",
            name_ko: "sage",
            department_id: "planning",
            role: "team_leader",
            cli_provider: "claude",
            avatar_emoji: "note",
          },
        ],
      },
    };

    const result = syncOfficePackAgentsForPack(db, profiles, "novel", () => 1700000003000);
    expect(result).toEqual({ departmentsSynced: 1, agentsSynced: 1 });

    const novel = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id = 'novel-seed-1'").get() as {
      c: number;
    };
    const report = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id = 'report-seed-1'").get() as {
      c: number;
    };
    expect(novel.c).toBe(0);
    expect(report.c).toBe(0);
  });

  it("preserves run_mode from DB row instead of settings fallback projection", () => {
    db = createDb();
    const profiles = {
      development: {
        departments: [{ id: "planning", name: "Planning", name_ko: "planning", icon: "star", color: "#3b82f6" }],
        agents: [
          {
            id: "codex-plan-seed",
            name: "Planner",
            name_ko: "planner",
            department_id: "planning",
            role: "team_leader",
            cli_provider: "codex",
            cli_model: "gpt-5.4",
            cli_reasoning_level: "high",
            run_mode: "plan",
            avatar_emoji: "compass",
          },
        ],
      },
    };

    db.prepare("INSERT INTO settings (key, value) VALUES ('officePackProfiles', ?)").run(JSON.stringify(profiles));

    db.prepare(
      `INSERT INTO agents (
        id, name, name_ko, department_id, role, cli_provider, status, created_at, run_mode, cli_model, cli_reasoning_level
      ) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?)`,
    ).run(
      "codex-plan-seed",
      "Planner-DB",
      "planner-db",
      "planning",
      "team_leader",
      "codex",
      1700000004000,
      "plan",
      "gpt-5.4",
      "high",
    );

    const hydrated = hydrateOfficePackAgentFromSettings(db, "codex-plan-seed", () => 1700000004000);
    expect(hydrated?.run_mode).toBe("plan");

    const dbAgent = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE id = 'codex-plan-seed'").get() as {
      c: number;
    };
    expect(dbAgent.c).toBe(1);
  });
});
