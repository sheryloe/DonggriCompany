import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

// ── DB 싱글턴 ─────────────────────────────────────────────────────────
let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db || !_db.open) {
    const dbPath = process.env.WORKSPACE_DB_PATH ?? ".local/workspace.sqlite";
    _db = new Database(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA busy_timeout = 5000");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}

// ── CLI PATH 폴백 ─────────────────────────────────────────────────────
const CLI_PATH_FALLBACK_DIRS =
  process.platform === "win32"
    ? [
        path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs"),
        path.join(process.env.APPDATA ?? "", "npm"),
      ].filter(Boolean)
    : [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        path.join(os.homedir(), ".local", "bin"),
        path.join(os.homedir(), "bin"),
      ];

function withCliPathFallback(pathValue: string | undefined): string {
  const parts = (pathValue ?? "").split(path.delimiter).map((p) => p.trim()).filter(Boolean);
  const seen = new Set(parts);
  for (const dir of CLI_PATH_FALLBACK_DIRS) {
    if (!dir || seen.has(dir)) continue;
    parts.push(dir);
    seen.add(dir);
  }
  return parts.join(path.delimiter);
}

// ── ANSI 제거 ────────────────────────────────────────────────────────
const ANSI_REGEX = /\u001b(?:\[[0-?]*[ -/]*[@-~]|][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const SPINNER_LINE_REGEX = /^[\s.·•◦○●|/\\-⠁-⣿]+$/u;

function normalizeChunk(raw: Buffer | string): string {
  const input = typeof raw === "string" ? raw : raw.toString("utf8");
  return input
    .replace(ANSI_REGEX, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^reading prompt from stdin\.{0,3}$/i.test(t)) return false;
      if (SPINNER_LINE_REGEX.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// ── Provider별 CLI args 생성 ─────────────────────────────────────────
export type CliProvider = "claude" | "codex" | "gemini" | "opencode" | "kimi";

export function buildAgentArgs(provider: CliProvider, model?: string): string[] {
  switch (provider) {
    case "claude":
      return [
        "claude",
        "--dangerously-skip-permissions",
        "--print",
        "--verbose",
        "--output-format=stream-json",
        "--include-partial-messages",
        "--max-turns", "200",
        ...(model ? ["--model", model] : []),
      ];
    case "codex":
      return [
        "codex", "--enable", "multi_agent",
        ...(model ? ["-m", model] : []),
        "--yolo", "exec", "--json",
      ];
    case "gemini":
      return [
        "gemini",
        ...(model ? ["-m", model] : []),
        "--yolo", "--output-format=stream-json",
      ];
    case "opencode":
      return ["opencode", "run", ...(model ? ["-m", model] : []), "--format", "json"];
    case "kimi":
      return ["kimi", "--print", "--output-format=stream-json", ...(model ? ["-m", model] : [])];
    default:
      throw new Error(`Unsupported CLI provider: ${provider}`);
  }
}

// ── 타임아웃 설정 ────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS = Number(process.env.TASK_RUN_IDLE_TIMEOUT_MS ?? 5 * 60 * 1000);  // 5분
const HARD_TIMEOUT_MS = Number(process.env.TASK_RUN_HARD_TIMEOUT_MS ?? 30 * 60 * 1000); // 30분

// ── 활성 프로세스 맵 ──────────────────────────────────────────────────
export const activeProcesses = new Map<string, ChildProcess>();

// ── 로그 디렉토리 ────────────────────────────────────────────────────
const LOGS_DIR = process.env.LOGS_DIR ?? ".local/logs";
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Task 로그 기록 ────────────────────────────────────────────────────
function appendTaskLog(taskId: string, kind: string, message: string): void {
  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO task_logs (id, task_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(randomUUID(), taskId, kind, message, Date.now());
  } catch { /* ignore if table not ready */ }
}

// ── Subtask 생성/완료 ────────────────────────────────────────────────
function createSubtask(taskId: string, toolUseId: string, title: string): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM subtasks WHERE cli_tool_use_id = ?").get(toolUseId);
  if (existing) return;
  const now = Date.now();
  db.prepare(
    "INSERT INTO subtasks (id, task_id, title, cli_tool_use_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)"
  ).run(randomUUID(), taskId, title.slice(0, 200), toolUseId, now, now);
}

function completeSubtask(toolUseId: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    "UPDATE subtasks SET status = 'done', updated_at = ? WHERE cli_tool_use_id = ?"
  ).run(now, toolUseId);
}

// ── stdout 파싱 → subtask 자동 생성 ──────────────────────────────────
function parseSubtasksFromOutput(taskId: string, data: string): void {
  try {
    for (const line of data.split("\n").filter(Boolean)) {
      let j: Record<string, unknown>;
      try { j = JSON.parse(line); } catch { continue; }

      // Claude Code: tool_use Task
      if (j.type === "tool_use" && j.tool === "Task") {
        const id = (j.id as string) ?? `sub-${Date.now()}`;
        const input = j.input as Record<string, unknown> | undefined;
        const title = (input?.description as string) ?? (input?.prompt as string)?.slice(0, 100) ?? "Sub-task";
        createSubtask(taskId, id, title);
      }
      if (j.type === "tool_result" && j.tool === "Task") {
        completeSubtask(j.id as string);
      }
    }
  } catch { /* ignore */ }
}

// ── WebSocket broadcast 타입 ─────────────────────────────────────────
type BroadcastFn = (event: string, payload: unknown) => void;

// ── CLI 에이전트 실행 ────────────────────────────────────────────────
export function spawnCliAgent(
  taskId: string,
  provider: CliProvider,
  prompt: string,
  projectPath: string,
  broadcast: BroadcastFn,
  model?: string,
): ChildProcess {
  const logPath = path.join(LOGS_DIR, `${taskId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n===== task run start ${new Date().toISOString()} | provider=${provider} =====\n`);

  const args = buildAgentArgs(provider, model);

  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  delete cleanEnv.CLAUDE_CODE;
  cleanEnv.PATH = withCliPathFallback(String(cleanEnv.PATH ?? ""));
  cleanEnv.NO_COLOR = "1";
  cleanEnv.FORCE_COLOR = "0";
  cleanEnv.CI = "1";
  if (!cleanEnv.TERM) cleanEnv.TERM = "dumb";

  const child = spawn(args[0], args.slice(1), {
    cwd: projectPath,
    env: cleanEnv,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  activeProcesses.set(taskId, child);

  // DB에 활성 실행 기록
  const db = getDb();
  try {
    db.prepare(
      "INSERT OR REPLACE INTO active_cli_runs (task_id, provider, pid, started_at) VALUES (?, ?, ?, ?)"
    ).run(taskId, provider, child.pid ?? null, Date.now());
  } catch { /* ignore */ }

  appendTaskLog(taskId, "info", `CLI 에이전트 시작: provider=${provider}, pid=${child.pid}`);

  let finished = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;

  const touchIdleTimer = () => {
    if (finished || IDLE_TIMEOUT_MS <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => triggerTimeout("idle"), IDLE_TIMEOUT_MS);
  };

  const triggerTimeout = (kind: "idle" | "hard") => {
    if (finished) return;
    finished = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    const msg = kind === "idle"
      ? `[Timeout] 출력 없음 (${IDLE_TIMEOUT_MS / 1000}s)`
      : `[Timeout] 최대 실행 시간 초과 (${HARD_TIMEOUT_MS / 1000}s)`;
    logStream.write(`\n${msg}\n`);
    appendTaskLog(taskId, "error", msg);
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  };

  touchIdleTimer();
  if (HARD_TIMEOUT_MS > 0) {
    hardTimer = setTimeout(() => triggerTimeout("hard"), HARD_TIMEOUT_MS);
  }

  // stdin으로 프롬프트 전달
  child.stdin?.write(prompt);
  child.stdin?.end();

  // stdout/stderr 처리
  child.stdout?.on("data", (chunk: Buffer) => {
    touchIdleTimer();
    const text = normalizeChunk(chunk);
    if (!text) return;
    logStream.write(text);
    broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
    parseSubtasksFromOutput(taskId, text);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    touchIdleTimer();
    const text = normalizeChunk(chunk);
    if (!text) return;
    logStream.write(text);
    broadcast("cli_output", { task_id: taskId, stream: "stderr", data: text });
  });

  child.on("error", (err) => {
    finished = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    const msg = `에이전트 spawn 실패: ${err.message}`;
    logStream.write(`\n[ERROR] ${msg}\n`);
    logStream.end();
    activeProcesses.delete(taskId);
    appendTaskLog(taskId, "error", msg);
    broadcast("task_run_error", { task_id: taskId, error: msg });
  });

  child.on("close", (code) => {
    finished = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    logStream.end();
    activeProcesses.delete(taskId);

    // DB 정리
    try { db.prepare("DELETE FROM active_cli_runs WHERE task_id = ?").run(taskId); } catch { /* ignore */ }

    const msg = `에이전트 종료: exit_code=${code ?? "?"}`;
    appendTaskLog(taskId, "info", msg);
    broadcast("cli_done", { task_id: taskId, exit_code: code });

    // 태스크 상태 업데이트 (성공이면 review, 실패면 pending)
    const newStatus = code === 0 ? "review" : "pending";
    const now = Date.now();
    try {
      db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(newStatus, now, taskId);
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
    } catch { /* ignore */ }
  });

  if (process.platform !== "win32") child.unref();

  return child;
}

// ── 프로세스 종료 ────────────────────────────────────────────────────
export function stopCliAgent(taskId: string): boolean {
  const child = activeProcesses.get(taskId);
  if (!child) return false;
  try {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (activeProcesses.has(taskId)) {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }
    }, 3000);
  } catch { /* ignore */ }
  return true;
}

// ── 로그 조회 ────────────────────────────────────────────────────────
export class CliExecutionService {
  getLogs(taskId: string, limit = 100): Array<{ id: string; kind: string; message: string; createdAt: number }> {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, kind, message, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(taskId, limit) as { id: string; kind: string; message: string; created_at: number }[];
    return rows.map((r) => ({ id: r.id, kind: r.kind, message: r.message, createdAt: r.created_at }));
  }

  getSubtasks(taskId: string) {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC"
    ).all(taskId);
  }

  getActiveRuns() {
    const db = getDb();
    return db.prepare("SELECT * FROM active_cli_runs").all();
  }
}
