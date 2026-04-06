import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { Agent, AgentStatus, CompanyStats, Department, Task, TaskStatus } from "@workspace/shared";

// 싱글턴 DB 인스턴스 — 연결 누수 방지
let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db || !_db.open) {
    const dbPath = process.env.WORKSPACE_DB_PATH ?? ".local/workspace.sqlite";
    _db = new Database(dbPath);
    // claw-empire 참조: WAL + busy_timeout으로 동시성 충돌 방지
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA busy_timeout = 5000");
    _db.exec("PRAGMA foreign_keys = ON");
    _db.exec("PRAGMA synchronous = NORMAL");
  }
  return _db;
}

// ─── Department Service ─────────────────────────────────────────────
export class DepartmentService {
  list(): Department[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM departments ORDER BY sort_order ASC").all() as Record<string, unknown>[];
    return rows.map(mapDept);
  }
}

// ─── Agent Service ──────────────────────────────────────────────────
export class AgentService {
  list(): Agent[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM agents ORDER BY name ASC").all() as Record<string, unknown>[];
    return rows.map(mapAgent);
  }

  updateStatus(id: string, status: AgentStatus): Agent {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE agents SET status = ?, updated_at = ? WHERE id = ?"
    ).run(status, now, id);
    const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown>;
    if (!row) throw new Error(`Agent not found: ${id}`);
    return mapAgent(row);
  }

  create(data: { name: string; role?: string; departmentId?: string; spriteNumber?: number }): Agent {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agents (id, name, role, department_id, sprite_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)`
    ).run(id, data.name, data.role ?? "Agent", data.departmentId ?? null, data.spriteNumber ?? null, now, now);
    return this.list().find((a) => a.id === id)!;
  }
}

// ─── Task Service ────────────────────────────────────────────────────
export class TaskService {
  list(): Task[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM tasks ORDER BY priority DESC, created_at DESC").all() as Record<string, unknown>[];
    return rows.map(mapTask);
  }

  create(data: { title: string; description?: string; departmentId?: string }): Task {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, description, status, department_id, created_at, updated_at)
       VALUES (?, ?, ?, 'inbox', ?, ?, ?)`
    ).run(id, data.title, data.description ?? null, data.departmentId ?? null, now, now);
    return this.list().find((t) => t.id === id)!;
  }

  updateStatus(id: string, status: Task["status"]): Task {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>;
    if (!row) throw new Error(`Task not found: ${id}`);
    return mapTask(row);
  }
}

// ─── Stats Service ───────────────────────────────────────────────────
export class StatsService {
  getStats(): CompanyStats {
    const db = getDb();

    const totalAgents = (db.prepare("SELECT COUNT(*) as c FROM agents").get() as { c: number }).c;
    const workingAgents = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE status = 'working'").get() as { c: number }).c;
    const idleAgents = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE status = 'idle'").get() as { c: number }).c;

    const totalTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks").get() as { c: number }).c;
    const doneTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get() as { c: number }).c;
    const inProgressTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress'").get() as { c: number }).c;
    const plannedTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'planned'").get() as { c: number }).c;
    const reviewTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'review'").get() as { c: number }).c;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const topAgentRows = db.prepare(
      "SELECT id, name, stats_xp, stats_tasks_done FROM agents ORDER BY stats_xp DESC LIMIT 5"
    ).all() as { id: string; name: string; stats_xp: number; stats_tasks_done: number }[];

    const deptRows = db.prepare(`
      SELECT d.id, d.name, d.icon,
             COUNT(t.id) as total_tasks,
             SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_tasks
      FROM departments d
      LEFT JOIN tasks t ON t.department_id = d.id
      GROUP BY d.id
      ORDER BY d.sort_order
    `).all() as { id: string; name: string; icon: string; total_tasks: number; done_tasks: number }[];

    return {
      agents: { total: totalAgents, working: workingAgents, idle: idleAgents },
      tasks: {
        total: totalTasks,
        done: doneTasks,
        in_progress: inProgressTasks,
        planned: plannedTasks,
        review: reviewTasks,
        completion_rate: completionRate,
      },
      topAgents: topAgentRows.map((r) => ({
        id: r.id,
        name: r.name,
        statsXp: r.stats_xp,
        statsTasksDone: r.stats_tasks_done,
      })),
      tasksByDepartment: deptRows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        totalTasks: r.total_tasks,
        doneTasks: r.done_tasks,
      })),
    };
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────
function mapDept(row: Record<string, unknown>): Department {
  return {
    id: row.id as string,
    name: row.name as string,
    icon: row.icon as string,
    color: (row.color as string | null) ?? null,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    departmentId: (row.department_id as string | null) ?? null,
    status: row.status as AgentStatus,
    spriteNumber: (row.sprite_number as number | null) ?? null,
    avatarEmoji: (row.avatar_emoji as string | null) ?? null,
    statsXp: row.stats_xp as number,
    statsTasksDone: row.stats_tasks_done as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as Task["status"],
    departmentId: (row.department_id as string | null) ?? null,
    assignedAgentId: (row.assigned_agent_id as string | null) ?? null,
    priority: row.priority as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
