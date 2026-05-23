#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DB_PATH = path.join(REPO_ROOT, "data", "claw-empire.sqlite");
const CONTROL_ROOT = "G:/Donggri_DevDrive/storage/codex-control";
const DEVDRIVE_ROOT = "G:/Donggri_DevDrive";
const REPO_ESTATE_ROOT = "G:/Donggri_DevDrive/repos";
const SEED_VERSION = "dongri-grigri-v1";

const RESET_TABLES = [
  "task_interrupt_injections",
  "meeting_minute_entries",
  "meeting_minutes",
  "review_revision_history",
  "review_round_feedback_items",
  "review_round_decision_states",
  "subtasks",
  "task_report_archives",
  "task_logs",
  "task_creation_audits",
  "project_review_decision_events",
  "project_review_decision_states",
  "conversation_project_contexts",
  "messages",
  "gmail_intake_messages",
  "calendar_intake_events",
  "strategic_maintenance_runs",
  "agent_growth_events",
  "agent_memories",
  "project_memories",
  "memory_edges",
  "memory_entities",
  "memory_entity_relations",
  "memory_promotion_evidence",
  "memory_quality_events",
  "memory_outbox",
  "memory_embeddings",
  "memory_embedding_index",
  "memory_search_profiles",
  "skill_learning_history",
  "skill_usage_events",
  "project_component_events",
  "project_module_apply_runs",
  "project_module_bindings",
  "project_agents",
  "office_cli_runs",
  "office_runner_instances",
  "office_runner_queue",
  "asset_jobs",
  "quality_metric_events",
  "control_plane_persona_events",
  "control_plane_persona_runs",
  "control_plane_routing_decisions",
  "control_plane_agent_runs",
  "control_plane_project_operator_events",
  "control_plane_project_operator_memory_links",
  "control_plane_project_operator_runs",
  "control_plane_project_operators",
  "control_plane_spec_task_links",
  "control_plane_project_links",
  "control_plane_snapshots",
  "tasks",
  "projects",
  "agents",
  "departments",
  "office_pack_departments",
];

const MASTER_DEPARTMENTS = [
  ["planning", "Planning", "기획", "PLAN", "#2563eb", 1, "요구사항, 범위, 구조, 우선순위를 정리하는 마스터 부서입니다."],
  ["development", "Development", "개발", "DEV", "#0f766e", 2, "승인된 구현 범위 안에서 API, UI, 데이터 흐름을 구축하는 마스터 부서입니다."],
  ["design", "Design", "디자인", "UX", "#7c3aed", 3, "화면 구조, 사용성, 접근성, 시각 시스템을 책임지는 마스터 부서입니다."],
  ["quality", "Quality", "품질", "QA", "#dc2626", 4, "테스트, 회귀 검증, 릴리스 품질, 증거 기록을 관리하는 마스터 부서입니다."],
  ["operations", "Operations", "운영", "OPS", "#0891b2", 5, "프로젝트 scope 전환, Git/Docker/runtime, 메모리, 배포 승인 게이트를 관리합니다."],
  ["instructor", "External Instructor", "외부강사", "EDU", "#d97706", 6, "오픈소스 트렌드와 Skill 후보를 읽기 전용으로 조사해 도입 후보를 제안합니다."],
];

const MASTER_AGENTS = [
  {
    id: "master-planning",
    name: "Planning Master",
    nameKo: "기획 마스터",
    department: "planning",
    provider: "codex",
    icon: "PL",
    family: "product-manager",
    specialization: "planning.master",
    capability: "primary_author",
    authority: 7,
    sprite: 6,
    personality: "Root SDD intake, requirements, design, task planning, and approval checklist owner.",
    skills: ["requirements", "design", "task-planning", "repo-map", "approval-checklist"],
    subagents: ["research-analyst", "architect-reviewer", "risk-modeler"],
    lenses: ["scope", "risk", "traceability"],
  },
  {
    id: "master-development",
    name: "Development Master",
    nameKo: "개발 마스터",
    department: "development",
    provider: "codex",
    icon: "DV",
    family: "backend",
    specialization: "development.master",
    capability: "primary_author",
    authority: 7,
    sprite: 11,
    personality: "Approved implementation owner. Writes only through approved tasks and repo-map paths.",
    skills: ["typescript", "react", "node", "database", "refactor", "test"],
    subagents: ["frontend-developer", "backend-developer", "database-optimizer", "typescript-pro"],
    lenses: ["correctness", "maintainability", "contract"],
  },
  {
    id: "master-design",
    name: "Design Master",
    nameKo: "디자인 마스터",
    department: "design",
    provider: "codex",
    icon: "UX",
    family: "frontend",
    specialization: "design.master",
    capability: "primary_author",
    authority: 7,
    sprite: 16,
    personality: "Office-first UX, Korean readability, theme tokens, visual rhythm, and accessibility owner.",
    skills: ["design-system", "interaction", "accessibility", "visual-qa", "korean-ui-copy"],
    subagents: ["ui-designer", "ux-researcher", "accessibility-tester"],
    lenses: ["ux", "readability", "a11y"],
  },
  {
    id: "master-quality",
    name: "Quality Master",
    nameKo: "품질 마스터",
    department: "quality",
    provider: "codex",
    icon: "QA",
    family: "qa",
    specialization: "quality.master",
    capability: "reviewer",
    authority: 7,
    sprite: 21,
    personality: "Findings-first review, regression gate, build gate, and evidence owner.",
    skills: ["test-strategy", "regression", "contract-check", "browser-smoke", "evidence"],
    subagents: ["test-automator", "reviewer", "performance-monitor"],
    lenses: ["test_coverage", "regression", "evidence"],
  },
  {
    id: "master-operations",
    name: "Operations Master",
    nameKo: "운영 마스터",
    department: "operations",
    provider: "codex",
    icon: "OP",
    family: "memory-manager",
    specialization: "operations.master",
    capability: "primary_author",
    authority: 7,
    sprite: 31,
    personality: "Single persistent project operations agent for project scopes, runtime, Git, Docker, AgentMemory, and Gemini review.",
    skills: ["runtime-ops", "git-safety", "agentmemory", "gemini-review", "handoff", "status-log"],
    subagents: ["sre-engineer", "documentation-engineer", "security-auditor"],
    lenses: ["operability", "approval", "traceability"],
  },
  {
    id: "master-instructor",
    name: "External Instructor Master",
    nameKo: "외부강사 마스터",
    department: "instructor",
    provider: "codex",
    icon: "ED",
    family: "researcher",
    specialization: "instructor.opensource",
    capability: "reviewer",
    authority: 4,
    sprite: 33,
    personality: "Read-only open-source trend scout for high-star repositories and Skill candidate lessons.",
    skills: ["open-source-scout", "skill-candidate", "trend-analysis", "license-check"],
    subagents: ["research-analyst", "documentation-engineer", "security-auditor"],
    lenses: ["source_quality", "license", "adoption_fit"],
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { db: DEFAULT_DB_PATH, backup: true, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--db" && args[i + 1]) parsed.db = path.resolve(args[++i]);
    if (arg === "--no-backup") parsed.backup = false;
    if (arg === "--dry-run") parsed.dryRun = true;
  }
  return parsed;
}

function q(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function countTable(db, name) {
  if (!tableExists(db, name)) return null;
  return Number(db.prepare(`SELECT COUNT(*) AS cnt FROM ${q(name)}`).get().cnt ?? 0);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseActiveSpecId() {
  const raw = readText(path.join(CONTROL_ROOT, "specs", "_active.md")).replace(/<!--[\s\S]*?-->/g, "");
  return raw.match(/^- Spec ID:\s*`?([^`\r\n]+)`?/m)?.[1]?.trim() ?? null;
}

function parseProjectsYaml() {
  const raw = readText(path.join(CONTROL_ROOT, "registry", "projects.yaml"));
  const lines = raw.split(/\r?\n/);
  const projects = [];
  let inProjects = false;
  let current = null;
  let inOperationAgent = false;
  for (const line of lines) {
    if (/^projects:\s*$/.test(line)) {
      inProjects = true;
      continue;
    }
    if (!inProjects) continue;
    const projectMatch = line.match(/^ {2}([^:\s][^:]*):\s*$/);
    if (projectMatch) {
      if (current) projects.push(current);
      current = { key: projectMatch[1].trim(), path: "", type: "", status: "", summary: "", operation_agent: {} };
      inOperationAgent = false;
      continue;
    }
    if (!current) continue;
    const agentFieldMatch = line.match(/^ {6}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (inOperationAgent && agentFieldMatch) {
      current.operation_agent[agentFieldMatch[1]] = agentFieldMatch[2].trim().replace(/^["']|["']$/g, "");
      continue;
    }
    const fieldMatch = line.match(/^ {4}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    const [, field, rawValue] = fieldMatch;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    inOperationAgent = field === "operation_agent";
    if (!inOperationAgent) current[field] = value;
  }
  if (current) projects.push(current);
  return projects.filter((project) => project.key && project.path);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function makeBackup(dbPath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const backupDir = path.join(path.dirname(dbPath), "backups", `dongri-grigri-reset-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backupDir, path.basename(dbPath + suffix)));
  }
  return backupDir;
}

function ensureControlPlaneTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_snapshots (
      id TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      repo_estate_root TEXT NOT NULL,
      active_spec_id TEXT,
      projects_yaml_hash TEXT,
      active_spec_hash TEXT,
      registry_project_count INTEGER NOT NULL DEFAULT 0,
      db_project_count INTEGER NOT NULL DEFAULT 0,
      unlinked_registry_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_plane_project_links (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      registry_key TEXT NOT NULL UNIQUE,
      registry_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      registry_type TEXT,
      db_project_id TEXT,
      db_project_name TEXT,
      link_status TEXT NOT NULL,
      notes TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_plane_agent_runs (
      id TEXT PRIMARY KEY,
      spec_id TEXT,
      task_id TEXT,
      department_agent TEXT NOT NULL,
      status TEXT NOT NULL,
      objective TEXT NOT NULL,
      context_pack_json TEXT NOT NULL DEFAULT '{}',
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      hook_decisions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_plane_routing_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      spec_id TEXT,
      selected_department TEXT NOT NULL,
      selected_repo TEXT,
      persona_needed INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'medium',
      evidence_json TEXT NOT NULL DEFAULT '[]',
      rejection_reason TEXT,
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      next_safe_action TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

function seedMasterDepartmentsAndAgents(db) {
  const insertDepartment = db.prepare(`
    INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [id, name, nameKo, icon, color, sortOrder, description] of MASTER_DEPARTMENTS) {
    insertDepartment.run(id, name, nameKo, name, name, icon, color, description, sortOrder);
  }

  const insertAgent = db.prepare(`
    INSERT INTO agents (
      id, name, name_ko, name_ja, name_zh, department_id, workflow_pack_key, role, cli_provider,
      family, career_stage, specialization_key, authority_level, execution_capability_profile, workflow_profile,
      agent_profile_json, avatar_emoji, sprite_number, personality
    )
    VALUES (?, ?, ?, ?, ?, ?, 'development', 'team_leader', ?, ?, 'team-lead', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSkill = db.prepare(`
    INSERT INTO skill_learning_history (
      id, job_id, provider, repo, skill_id, skill_label, status, command, run_started_at, run_completed_at, created_at, updated_at
    )
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  for (const seed of MASTER_AGENTS) {
    const workflowProfile = {
      role: seed.capability,
      review_lenses: seed.lenses,
      two_pass_required: true,
      max_review_rounds: seed.capability === "primary_author" ? 2 : null,
    };
    const profile = {
      model: "dongri-grigri-master-agent",
      role_label: "마스터 에이전트",
      can_spawn_subagents: true,
      subagent_policy: {
        lifecycle: "single-task",
        max_recreate_attempts: 2,
        parent_accepts_or_rejects: true,
        subagents_cannot_spawn_subagents: true,
      },
      class_path: ["department-master", seed.department, seed.specialization],
      promotion_policy: "master_agent fixed role; no junior/senior ladder",
      project_scope_policy:
        seed.department === "operations"
          ? "OPS is the single persistent project operations agent; projects are scoped runs."
          : "Project operations are routed through OPS; implementation work still requires approved tasks.",
      specialties: [seed.specialization, ...seed.subagents],
      preferred_subagents: seed.subagents,
      visual_profile_key: `agent-visual-${String(seed.sprite).padStart(2, "0")}`,
      sprite_number: seed.sprite,
    };
    insertAgent.run(
      seed.id,
      seed.name,
      seed.nameKo,
      seed.name,
      seed.name,
      seed.department,
      seed.provider,
      seed.family,
      seed.specialization,
      seed.authority,
      seed.capability,
      JSON.stringify(workflowProfile),
      JSON.stringify(profile),
      seed.icon,
      seed.sprite,
      seed.personality,
    );
    for (const skill of seed.skills) {
      insertSkill.run(
        `seed-skill:${seed.id}:${skill}`,
        seed.provider,
        `builtin://${SEED_VERSION}/${seed.department}`,
        skill,
        skill.replace(/[-_.]+/g, " "),
        `dongri-master-db-reset ${SEED_VERSION}`,
        now,
        now,
        now,
        now,
      );
    }
  }
}

function seedSettings(db) {
  const settings = [
    ["companyName", "Dongri-grigri"],
    ["language", "ko"],
    ["organizationSeedVersion", SEED_VERSION],
    ["roomThemes", JSON.stringify({
      planning: { accent: 0x2563eb, floor1: 0xdbeafe, floor2: 0xc7dcfb, wall: 0x6b8ac3 },
      development: { accent: 0x0f766e, floor1: 0xd9f2ee, floor2: 0xc7ebe4, wall: 0x5c9990 },
      design: { accent: 0x7c3aed, floor1: 0xe9ddff, floor2: 0xddcff8, wall: 0x8a73b8 },
      quality: { accent: 0xdc2626, floor1: 0xf8dada, floor2: 0xf0caca, wall: 0xb56d6d },
      operations: { accent: 0x0891b2, floor1: 0xd8f0f5, floor2: 0xc9e7ee, wall: 0x669aaa },
      instructor: { accent: 0xd97706, floor1: 0xf7e4c7, floor2: 0xf1d7ad, wall: 0xac8451 },
    })],
  ];
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const row of settings) upsert.run(row[0], row[1]);
}

function seedControlPlaneProjection(db, activeSpecId) {
  ensureControlPlaneTables(db);
  const now = Date.now();
  const projectsRaw = readText(path.join(CONTROL_ROOT, "registry", "projects.yaml"));
  const activeRaw = readText(path.join(CONTROL_ROOT, "specs", "_active.md"));
  const registry = parseProjectsYaml();
  const snapshotId = `cpsnap-reset-${now}`;
  db.prepare(`
    INSERT INTO control_plane_snapshots (
      id, root_path, repo_estate_root, active_spec_id, projects_yaml_hash, active_spec_hash,
      registry_project_count, db_project_count, unlinked_registry_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(
    snapshotId,
    DEVDRIVE_ROOT,
    REPO_ESTATE_ROOT,
    activeSpecId,
    sha256Text(projectsRaw),
    sha256Text(activeRaw),
    registry.length,
    registry.length,
    JSON.stringify({ reset_startpoint: true, source: "Codex root registry projection" }),
    now,
    now,
  );

  const insertLink = db.prepare(`
    INSERT INTO control_plane_project_links (
      id, snapshot_id, registry_key, registry_path, absolute_path, registry_type, db_project_id,
      db_project_name, link_status, notes, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
  `);
  for (const project of registry) {
    const candidate = project.status === "candidate" || project.operation_agent?.enabled === "false";
    const linkStatus = candidate ? "candidate" : "unlinked";
    const absolutePath = path.join(DEVDRIVE_ROOT, project.path).replaceAll("\\", "/");
    insertLink.run(
      `cplink-${project.key.toLowerCase().replace(/[^a-z0-9_-]/gi, "-")}`,
      snapshotId,
      project.key,
      project.path,
      absolutePath,
      project.type || null,
      linkStatus,
      candidate ? "candidate project; no domain DB project created during reset" : "root registry projected; domain DB project intentionally empty",
      JSON.stringify({ summary: project.summary ?? "", operation_agent: project.operation_agent ?? {} }),
      now,
      now,
    );
  }

  const runId = `cprun-reset-${now}`;
  db.prepare(`
    INSERT INTO control_plane_agent_runs (
      id, spec_id, task_id, department_agent, status, objective, context_pack_json,
      approval_refs_json, hook_decisions_json, created_at, updated_at
    ) VALUES (?, ?, NULL, 'OPS', 'completed', ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    activeSpecId,
    "Dongri-grigri DB soft reset and Codex root projection sync startpoint",
    JSON.stringify({ root: DEVDRIVE_ROOT, repo_estate_root: REPO_ESTATE_ROOT, db_domain_projects: 0 }),
    JSON.stringify(["APR-DB-001", "APR-GIT-001"]),
    JSON.stringify([{ hook: "db-reset", decision: "allow", reason_code: "USER_APPROVED_APP_DB_RESET" }]),
    now,
    now,
  );
  db.prepare(`
    INSERT INTO control_plane_routing_decisions (
      id, run_id, spec_id, selected_department, selected_repo, persona_needed, confidence,
      evidence_json, rejection_reason, approval_refs_json, next_safe_action, created_at
    ) VALUES (?, ?, ?, 'OPS', 'DonggriCompany', 0, 'high', ?, NULL, ?, ?, ?)
  `).run(
    `cproute-reset-${now}`,
    runId,
    activeSpecId,
    JSON.stringify(["data/claw-empire.sqlite", "storage/codex-control/registry/projects.yaml"]),
    JSON.stringify(["APR-DB-001", "APR-GIT-001"]),
    "Verify UI shows zero domain projects/tasks and root registry projection.",
    now,
  );
}

function main() {
  const args = parseArgs();
  const dbPath = path.resolve(args.db);
  if (!fs.existsSync(dbPath)) {
    console.error(JSON.stringify({ ok: false, error: "db_not_found", dbPath }, null, 2));
    process.exit(1);
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA wal_checkpoint(FULL)");
  const before = Object.fromEntries(RESET_TABLES.map((table) => [table, countTable(db, table)]));
  const backupDir = args.backup && !args.dryRun ? makeBackup(dbPath) : null;
  const activeSpecId = parseActiveSpecId();

  if (!args.dryRun) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const table of RESET_TABLES) {
        if (tableExists(db, table)) db.exec(`DELETE FROM ${q(table)}`);
      }
      seedMasterDepartmentsAndAgents(db);
      seedSettings(db);
      seedControlPlaneProjection(db, activeSpecId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  const after = Object.fromEntries(RESET_TABLES.map((table) => [table, countTable(db, table)]));
  const masterAgents = countTable(db, "agents");
  const domainProjects = countTable(db, "projects");
  const domainTasks = countTable(db, "tasks");
  db.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: args.dryRun,
        dbPath,
        backupDir,
        activeSpecId,
        before,
        after,
        summary: {
          domain_projects: domainProjects,
          domain_tasks: domainTasks,
          master_agents: masterAgents,
          seed_version: SEED_VERSION,
        },
      },
      null,
      2,
    ),
  );
}

main();
