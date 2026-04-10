import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { seedDefaultWorkflowPacks } from "./workflow-pack-seeds.ts";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

function isTruthyEnv(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function applyDefaultSeeds(db: DbLike): void {
  seedDefaultWorkflowPacks(db);

  const deptCount = (db.prepare("SELECT COUNT(*) as cnt FROM departments").get() as { cnt: number }).cnt;

  if (deptCount === 0) {
    const insertDept = db.prepare(
      "INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insertDept.run("planning", "Planning", "Planning", "Planning", "Planning", "🏛️", "#f59e0b", 1);
    insertDept.run("dev", "Development", "Development", "Development", "Development", "🔧", "#3b82f6", 2);
    insertDept.run("design", "Design", "Design", "Design", "Design", "🎨", "#8b5cf6", 3);
    insertDept.run("qa", "QA/QC", "QA/QC", "QA/QC", "QA/QC", "🧪", "#ef4444", 4);
    insertDept.run("devsecops", "DevSecOps", "DevSecOps", "DevSecOps", "DevSecOps", "🛡️", "#f97316", 5);
    insertDept.run("operations", "Operations", "Operations", "Operations", "Operations", "⚙️", "#10b981", 6);
    console.log("[Claw-Empire] Seeded default departments");
  }

  const agentCount = (db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number }).cnt;
  if (agentCount === 0) {
    const insertAgent = db.prepare(
      `INSERT INTO agents (id, name, name_ko, department_id, role, cli_provider, avatar_emoji, personality)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertAgent.run(randomUUID(), "Aria", "Aria", "dev", "team_leader", "claude", "👩‍💻", "Pragmatic dev lead");
    insertAgent.run(randomUUID(), "Bolt", "Bolt", "dev", "senior", "codex", "⚡", "Fast senior coder");
    insertAgent.run(randomUUID(), "Nova", "Nova", "dev", "junior", "copilot", "🌟", "Creative junior");

    insertAgent.run(randomUUID(), "Pixel", "Pixel", "design", "team_leader", "claude", "🎨", "Design lead");
    insertAgent.run(randomUUID(), "Luna", "Luna", "design", "junior", "gemini", "🌙", "UI designer");

    insertAgent.run(randomUUID(), "Sage", "Sage", "planning", "team_leader", "codex", "🧠", "Strategy planner");
    insertAgent.run(randomUUID(), "Clio", "Clio", "planning", "senior", "claude", "📚", "Data-oriented planner");

    insertAgent.run(randomUUID(), "Atlas", "Atlas", "operations", "team_leader", "claude", "🗺️", "Ops coordinator");
    insertAgent.run(randomUUID(), "Turbo", "Turbo", "operations", "senior", "codex", "🚀", "Automation expert");

    insertAgent.run(randomUUID(), "Hawk", "Hawk", "qa", "team_leader", "claude", "🦅", "Quality lead");
    insertAgent.run(randomUUID(), "Lint", "Lint", "qa", "senior", "codex", "🔎", "QA specialist");

    insertAgent.run(randomUUID(), "Vault", "Vault", "devsecops", "team_leader", "claude", "🔐", "Security architect");
    insertAgent.run(randomUUID(), "Pipe", "Pipe", "devsecops", "senior", "codex", "🔁", "CI/CD specialist");
    insertAgent.run(randomUUID(), "DORO", "DORO", "qa", "junior", "gemini", "💗", "QA junior");
    console.log("[Claw-Empire] Seeded default agents");
  }

  {
    const defaultRoomThemes = {
      ceoOffice: { accent: 0xa77d0c, floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243 },
      planning: { accent: 0xd4a85a, floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871 },
      dev: { accent: 0x5a9fd4, floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7 },
      design: { accent: 0x9a6fc4, floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad },
      qa: { accent: 0xd46a6a, floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979 },
      devsecops: { accent: 0xd4885a, floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871 },
      operations: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
      breakRoom: { accent: 0xf0c878, floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83 },
    };

    const settingsCount = (db.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number }).c;
    const isLegacySettingsInstall = settingsCount > 0;

    if (settingsCount === 0) {
      const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
      insertSetting.run("companyName", "Claw-Empire");
      insertSetting.run("ceoName", "CEO");
      insertSetting.run("autoAssign", "true");
      insertSetting.run("yoloMode", "false");
      insertSetting.run("autoUpdateEnabled", "false");
      insertSetting.run("autoUpdateNoticePending", "false");
      insertSetting.run("oauthAutoSwap", "true");
      insertSetting.run("language", "en");
      insertSetting.run("defaultProvider", "claude");
      insertSetting.run(
        "providerModelConfig",
        JSON.stringify({
          claude: { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
          codex: {
            model: "gpt-5.3-codex",
            reasoningLevel: "xhigh",
            subModel: "gpt-5.3-codex",
            subModelReasoningLevel: "high",
          },
          gemini: { model: "gemini-3-pro-preview" },
          opencode: { model: "github-copilot/claude-sonnet-4.6" },
          copilot: { model: "github-copilot/claude-sonnet-4.6" },
          antigravity: { model: "google/antigravity-gemini-3-pro" },
        }),
      );
      insertSetting.run("roomThemes", JSON.stringify(defaultRoomThemes));
      console.log("[Claw-Empire] Seeded default settings");
    }

    const hasLanguageSetting = db.prepare("SELECT 1 FROM settings WHERE key = 'language' LIMIT 1").get() as
      | { 1: number }
      | undefined;
    if (!hasLanguageSetting) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("language", "en");

    const hasOAuthAutoSwapSetting = db.prepare("SELECT 1 FROM settings WHERE key = 'oauthAutoSwap' LIMIT 1").get() as
      | { 1: number }
      | undefined;
    if (!hasOAuthAutoSwapSetting) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("oauthAutoSwap", "true");

    const hasAutoUpdateEnabledSetting = db
      .prepare("SELECT 1 FROM settings WHERE key = 'autoUpdateEnabled' LIMIT 1")
      .get() as { 1: number } | undefined;
    if (!hasAutoUpdateEnabledSetting)
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("autoUpdateEnabled", "false");

    const hasYoloModeSetting = db.prepare("SELECT 1 FROM settings WHERE key = 'yoloMode' LIMIT 1").get() as
      | { 1: number }
      | undefined;
    if (!hasYoloModeSetting) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("yoloMode", "false");

    const hasAutoUpdateNoticePendingSetting = db
      .prepare("SELECT 1 FROM settings WHERE key = 'autoUpdateNoticePending' LIMIT 1")
      .get() as { 1: number } | undefined;
    if (!hasAutoUpdateNoticePendingSetting) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "autoUpdateNoticePending",
        isLegacySettingsInstall ? "true" : "false",
      );
    }

    const hasRoomThemesSetting = db.prepare("SELECT 1 FROM settings WHERE key = 'roomThemes' LIMIT 1").get() as
      | { 1: number }
      | undefined;
    if (!hasRoomThemesSetting) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("roomThemes", JSON.stringify(defaultRoomThemes));
    }
  }

  {
    try {
      db.exec("ALTER TABLE agents ADD COLUMN acts_as_planning_leader INTEGER NOT NULL DEFAULT 0");
    } catch {
      // already exists
    }

    try {
      db.exec("ALTER TABLE agents ADD COLUMN workflow_profile TEXT");
    } catch {
      // already exists
    }

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_round_feedback_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          meeting_id TEXT NOT NULL REFERENCES meeting_minutes(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          round INTEGER NOT NULL,
          agent_id TEXT REFERENCES agents(id),
          lens TEXT,
          pass1 TEXT NOT NULL,
          pass2 TEXT NOT NULL,
          final_verdict TEXT NOT NULL CHECK(final_verdict IN ('approved','hold','rejected')),
          confidence REAL NOT NULL DEFAULT 0.5,
          blocking_items_json TEXT,
          requires_jules_action INTEGER NOT NULL DEFAULT 0 CHECK(requires_jules_action IN (0,1)),
          created_at INTEGER DEFAULT (unixepoch()*1000)
        )
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_review_round_feedback_items_meeting
          ON review_round_feedback_items(meeting_id, round, created_at DESC)
      `);
    } catch {
      // best effort
    }

    try {
      db.exec(`
        UPDATE agents
        SET acts_as_planning_leader = CASE
          WHEN role = 'team_leader' AND department_id = 'planning' THEN 1
          ELSE COALESCE(acts_as_planning_leader, 0)
        END
      `);
    } catch {
      // best effort
    }

    try {
      db.exec("ALTER TABLE departments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 99");
    } catch {
      // already exists
    }

    try {
      db.exec("DROP INDEX IF EXISTS idx_departments_sort_order");
    } catch {
      // noop
    }

    const DEPT_ORDER: Record<string, number> = { planning: 1, dev: 2, design: 3, qa: 4, devsecops: 5, operations: 6 };

    const insertDeptIfMissing = db.prepare(
      "INSERT OR IGNORE INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insertDeptIfMissing.run("qa", "QA/QC", "QA/QC", "🧪", "#ef4444", 4);
    insertDeptIfMissing.run("devsecops", "DevSecOps", "DevSecOps", "🛡️", "#f97316", 5);

    const updateOrder = db.prepare("UPDATE departments SET sort_order = ? WHERE id = ?");
    for (const [id, order] of Object.entries(DEPT_ORDER)) updateOrder.run(order, id);

    const allDepartments = db
      .prepare("SELECT id, sort_order FROM departments ORDER BY sort_order ASC, id ASC")
      .all() as Array<{ id: string; sort_order: number }>;
    const existingDeptIds = new Set(allDepartments.map((row) => row.id));
    const usedOrders = new Set<number>();

    for (const [id, order] of Object.entries(DEPT_ORDER)) {
      if (existingDeptIds.has(id)) usedOrders.add(order);
    }

    let nextOrder = 1;
    for (const row of allDepartments) {
      if (Object.prototype.hasOwnProperty.call(DEPT_ORDER, row.id)) continue;
      while (usedOrders.has(nextOrder)) nextOrder += 1;
      updateOrder.run(nextOrder, row.id);
      usedOrders.add(nextOrder);
      nextOrder += 1;
    }

    try {
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_sort_order ON departments(sort_order)");
    } catch (err) {
      console.warn("[Claw-Empire] Failed to recreate idx_departments_sort_order:", err);
    }

    const insertAgentIfMissing = db.prepare(
      `INSERT OR IGNORE INTO agents (id, name, name_ko, department_id, role, cli_provider, avatar_emoji, personality)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const existingNames = new Set(
      (db.prepare("SELECT name FROM agents").all() as { name: string }[]).map((r) => r.name),
    );

    const shouldAutoTopUpAgents = isTruthyEnv(process.env.CLAW_AGENT_AUTO_TOPUP);
    if (shouldAutoTopUpAgents) {
      const newAgents: [string, string, string, string, string, string, string][] = [
        ["Luna", "Luna", "design", "junior", "gemini", "🌙", "UI designer"],
        ["Clio", "Clio", "planning", "senior", "claude", "📚", "Planner"],
        ["Turbo", "Turbo", "operations", "senior", "codex", "🚀", "Automation expert"],
        ["Hawk", "Hawk", "qa", "team_leader", "claude", "🦅", "QA lead"],
        ["Lint", "Lint", "qa", "senior", "opencode", "🔎", "QA specialist"],
        ["Vault", "Vault", "devsecops", "team_leader", "claude", "🔐", "Security architect"],
        ["Pipe", "Pipe", "devsecops", "senior", "codex", "🔁", "CI/CD specialist"],
      ];

      let added = 0;
      for (const [name, nameKo, dept, role, provider, emoji, personality] of newAgents) {
        if (existingNames.has(name)) continue;
        if (!existingDeptIds.has(dept)) {
          console.warn(`[Claw-Empire] Skip adding agent "${name}": missing department "${dept}"`);
          continue;
        }
        try {
          insertAgentIfMissing.run(randomUUID(), name, nameKo, dept, role, provider, emoji, personality);
          added++;
        } catch (err) {
          console.warn(`[Claw-Empire] Skip adding agent "${name}":`, err);
        }
      }

      if (added > 0) console.log(`[Claw-Empire] Added ${added} new agents`);
    }
  }
}
