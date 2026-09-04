import type { RuntimeContext } from "../types/runtime-context.ts";
import type { IncomingMessage } from "node:http";
import type { WebSocket as WsSocket } from "ws";
import fs from "node:fs";
import path from "path";
import { HOST, PKG_VERSION, PORT } from "../config/runtime.ts";
import { notifyTaskStatus } from "../gateway/client.ts";
import { startCalendarIntakeReceiver } from "../messenger/calendar-intake-receiver.ts";
import { startDiscordReceiver } from "../messenger/discord-receiver.ts";
import { startGmailIntakeReceiver } from "../messenger/gmail-intake-receiver.ts";
import { startTelegramReceiver } from "../messenger/telegram-receiver.ts";
import { registerGracefulShutdownHandlers } from "./lifecycle/register-graceful-shutdown.ts";
import { startStrategicMaintenanceScheduler } from "./strategic-maintenance/service.ts";
import { runnerSupervisorRegistry } from "./services/runner-supervisor.ts";

type StartupCliStatus = Record<string, { installed?: boolean; authenticated?: boolean }>;

export function resolveStartupAuthenticatedProviders(
  cliStatus: StartupCliStatus,
  connectedPoolProviders: string[] = [],
): string[] {
  const providers = new Set<string>();
  for (const [name, status] of Object.entries(cliStatus ?? {})) {
    const provider = String(name ?? "").trim();
    if (!provider) continue;
    if (status?.installed && status?.authenticated) providers.add(provider);
  }
  for (const rawProvider of connectedPoolProviders) {
    const provider = String(rawProvider ?? "").trim();
    if (provider) providers.add(provider);
  }
  return [...providers];
}

export function buildWatchdogRecoveryMessage(taskTitle: string, lang: string): string {
  if (lang === "ko") {
    return `[WATCHDOG] '${taskTitle}' 작업이 in_progress 상태였지만 실행 프로세스가 없어 inbox로 복구했습니다.`;
  }
  return `[WATCHDOG] '${taskTitle}' was in progress but had no active process. Recovered to inbox.`;
}

function isSuccessfulCliAgentMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^완료했습니다(?:[.!。]|$|\s)/.test(normalized)) return true;
  if (/^작업\s*완료(?:[.!。]|$|\s)/.test(normalized)) return true;
  return /^(done|completed)(?:[.!:]|$|\s)/.test(normalized);
}

export function terminalLogHasCliFinalOutput(logText: string): boolean {
  for (const line of logText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (record.type === "turn.completed") return true;

    if (record.type === "item.completed") {
      const item = record.item as Record<string, unknown> | undefined;
      if (item?.type === "agent_message" && typeof item.text === "string" && isSuccessfulCliAgentMessage(item.text)) {
        return true;
      }
    }
  }
  return false;
}

export function startLifecycle(ctx: RuntimeContext): void {
  const {
    IN_PROGRESS_ORPHAN_GRACE_MS,
    IN_PROGRESS_ORPHAN_SWEEP_MS,
    SUBTASK_DELEGATION_SWEEP_MS,
    WebSocket,
    WebSocketServer,
    activeProcesses,
    app,
    appendTaskLog,
    broadcast,
    clearTaskWorkflowState,
    db,
    dbPath,
    detectAllCli,
    distDir,
    endTaskExecutionSession,
    express,
    finishReview,
    getDecryptedOAuthToken,
    handleTaskRunComplete,
    isAgentInMeeting,
    isIncomingMessageAuthenticated,
    isIncomingMessageOriginTrusted,
    isPidAlive,
    isProduction,
    killPidTree,
    notifyCeo,
    nowMs,
    processSubtaskDelegations,
    reconcileCrossDeptSubtasks,
    refreshGoogleToken,
    resolveLang,
    rollbackTaskWorktree,
    runInTransaction,
    stopProgressTimer,
    stopRequestedTasks,
    wsClients,
    logsDir,
  } = ctx as any;

  // ---------------------------------------------------------------------------
  // Production: serve React UI from dist/
  // ---------------------------------------------------------------------------
  if (isProduction) {
    // Always serve sprites from public/ so local sprite generation works without rebuilding dist/.
    app.use("/sprites", express.static(path.join(process.cwd(), "public", "sprites")));
    app.use(express.static(distDir));
    // SPA fallback: serve index.html for non-API routes (Express 5 named wildcard)
    app.get(
      "/{*splat}",
      (
        req: { path: string },
        res: {
          status(code: number): { json(payload: unknown): unknown };
          sendFile(filePath: string): unknown;
        },
      ) => {
        if (req.path.startsWith("/api/") || req.path === "/health" || req.path === "/healthz") {
          return res.status(404).json({ error: "not_found" });
        }
        res.sendFile(path.join(distDir, "index.html"));
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auto break rotation: idle <-> break every 60s
  // ---------------------------------------------------------------------------
  function rotateBreaks(): void {
    // Rule: max 1 agent per department on break at a time
    const allAgents = db
      .prepare("SELECT id, department_id, status FROM agents WHERE status IN ('idle','break')")
      .all() as { id: string; department_id: string; status: string }[];

    if (allAgents.length === 0) return;

    // Meeting/CEO-office summoned agents should stay in office, not break room.
    for (const a of allAgents) {
      if (a.status === "break" && isAgentInMeeting(a.id)) {
        db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(a.id);
        broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(a.id));
      }
    }

    const candidates = allAgents.filter((a) => !isAgentInMeeting(a.id));
    if (candidates.length === 0) return;

    // Group by department
    const byDept = new Map<string, typeof candidates>();
    for (const a of candidates) {
      const list = byDept.get(a.department_id) || [];
      list.push(a);
      byDept.set(a.department_id, list);
    }

    for (const [, members] of byDept) {
      const onBreak = members.filter((a) => a.status === "break");
      const idle = members.filter((a) => a.status === "idle");

      if (onBreak.length > 1) {
        // Too many on break from same dept; return extras to idle.
        const extras = onBreak.slice(1);
        for (const a of extras) {
          db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(a.id);
          broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(a.id));
        }
      } else if (onBreak.length === 1) {
        // 40% chance to return from break (avg ~2.5 min break)
        if (Math.random() < 0.4) {
          db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(onBreak[0].id);
          broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(onBreak[0].id));
        }
      } else if (onBreak.length === 0 && idle.length > 0) {
        // 50% chance to send one idle agent on break
        if (Math.random() < 0.5) {
          const pick = idle[Math.floor(Math.random() * idle.length)];
          db.prepare("UPDATE agents SET status = 'break' WHERE id = ?").run(pick.id);
          broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(pick.id));
        }
      }
    }
  }

  function pruneDuplicateReviewMeetings(): void {
    const rows = db
      .prepare(
        `
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY task_id, round, status
          ORDER BY started_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM meeting_minutes
      WHERE meeting_type = 'review'
        AND status IN ('in_progress', 'failed')
    )
    SELECT id
    FROM ranked
    WHERE rn > 1
  `,
      )
      .all() as Array<{ id: string }>;
    if (rows.length === 0) return;

    const delEntries = db.prepare("DELETE FROM meeting_minute_entries WHERE meeting_id = ?");
    const delMeetings = db.prepare("DELETE FROM meeting_minutes WHERE id = ?");
    runInTransaction(() => {
      for (const id of rows.map((r) => r.id)) {
        delEntries.run(id);
        delMeetings.run(id);
      }
    });
  }

  type InProgressRecoveryReason = "startup" | "interval";
  const ORPHAN_RECENT_ACTIVITY_WINDOW_MS = Math.max(120_000, IN_PROGRESS_ORPHAN_GRACE_MS);

  function recoverOrphanWorkingAgents(reason: InProgressRecoveryReason): void {
    const workingAgents = db
      .prepare(
        `
    SELECT
      a.id AS agent_id,
      a.name AS agent_name,
      a.current_task_id,
      t.id AS task_id,
      t.status AS task_status
    FROM agents a
    LEFT JOIN tasks t ON t.id = a.current_task_id
    WHERE a.status = 'working'
      AND a.current_task_id IS NOT NULL
      AND TRIM(a.current_task_id) != ''
    ORDER BY a.name ASC
  `,
      )
      .all() as Array<{
      agent_id: string;
      agent_name: string | null;
      current_task_id: string;
      task_id: string | null;
      task_status: string | null;
    }>;

    for (const row of workingAgents) {
      const normalizedTaskStatus = String(row.task_status ?? "")
        .trim()
        .toLowerCase();
      if (row.task_id && normalizedTaskStatus === "in_progress") continue;

      const staleReason = row.task_id ? `task_status_${normalizedTaskStatus || "unknown"}` : "task_missing";
      const cleared = db
        .prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?")
        .run(row.agent_id, row.current_task_id) as { changes?: number };
      if ((cleared.changes ?? 0) === 0) continue;

      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(row.agent_id));
      console.warn(
        `[Dongri-grigri] Recovery (${reason}): cleared stale working agent ${row.agent_id} (${row.agent_name || "unknown"}) -> ${row.current_task_id} (${staleReason})`,
      );
    }
  }

  function recoverStaleCompletedAssignments(reason: InProgressRecoveryReason): void {
    const staleAssignments = db
      .prepare(
        `
    SELECT
      a.id AS agent_id,
      a.name AS agent_name,
      a.current_task_id,
      t.status AS task_status
    FROM agents a
    INNER JOIN tasks t ON t.id = a.current_task_id
    WHERE a.current_task_id IS NOT NULL
      AND TRIM(a.current_task_id) != ''
      AND t.status IN ('done', 'cancelled')
    ORDER BY a.name ASC
  `,
      )
      .all() as Array<{
      agent_id: string;
      agent_name: string | null;
      current_task_id: string;
      task_status: string;
    }>;

    for (const row of staleAssignments) {
      const cleared = db
        .prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?")
        .run(row.agent_id, row.current_task_id) as { changes?: number };
      if ((cleared.changes ?? 0) === 0) continue;
      appendTaskLog(
        row.current_task_id,
        "system",
        `STALE_ASSIGNMENT_CLEANUP startup cleared agent=${row.agent_id} (${reason}, task_status=${row.task_status})`,
      );
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(row.agent_id));
      console.warn(
        `[Dongri-grigri] Recovery (${reason}): cleared stale completed assignment ${row.agent_id} (${row.agent_name || "unknown"}) -> ${row.current_task_id} (${row.task_status})`,
      );
    }
  }

  function recoverOrphanInProgressTasks(reason: InProgressRecoveryReason): void {
    const inProgressTasks = db
      .prepare(
        `
    SELECT id, title, assigned_agent_id, created_at, started_at, updated_at
    FROM tasks
    WHERE status = 'in_progress'
    ORDER BY updated_at ASC
  `,
      )
      .all() as Array<{
      id: string;
      title: string;
      assigned_agent_id: string | null;
      created_at: number | null;
      started_at: number | null;
      updated_at: number | null;
    }>;

    const now = nowMs();
    const hasSuccessfulReportRelay = (taskId: string): boolean => {
      try {
        const row = db
          .prepare(
            `
      SELECT 1 AS ok
      FROM task_logs
      WHERE task_id = ?
        AND kind = 'system'
        AND message LIKE '%messenger_relay_success%'
        AND message LIKE '%message_type=report%'
      LIMIT 1
    `,
          )
          .get(taskId) as { ok?: number } | undefined;
        return row?.ok === 1;
      } catch {
        return false;
      }
    };
    const taskTerminalLogHasFinalOutput = (taskId: string): boolean => {
      try {
        const logPath = path.join(logsDir, `${taskId}.log`);
        const stat = fs.statSync(logPath);
        const maxBytes = 512 * 1024;
        const length = Math.min(maxBytes, stat.size);
        const fd = fs.openSync(logPath, "r");
        try {
          const buffer = Buffer.alloc(length);
          fs.readSync(fd, buffer, 0, length, Math.max(0, stat.size - length));
          return terminalLogHasCliFinalOutput(buffer.toString("utf8"));
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        return false;
      }
    };

    for (const task of inProgressTasks) {
      const active = activeProcesses.get(task.id);
      if (active) {
        const pid = typeof active.pid === "number" ? active.pid : null;
        if (pid !== null && pid > 0 && !isPidAlive(pid)) {
          activeProcesses.delete(task.id);
          appendTaskLog(task.id, "system", `Recovery (${reason}): removed stale process handle (pid=${pid})`);
        } else {
          continue;
        }
      }

      const lastTouchedAt = Math.max(task.updated_at ?? 0, task.started_at ?? 0, task.created_at ?? 0);
      const ageMs = lastTouchedAt > 0 ? Math.max(0, now - lastTouchedAt) : IN_PROGRESS_ORPHAN_GRACE_MS + 1;
      if (ageMs < IN_PROGRESS_ORPHAN_GRACE_MS) continue;
      const reportRelaySucceeded = hasSuccessfulReportRelay(task.id);
      const terminalFinalOutput = taskTerminalLogHasFinalOutput(task.id);
      if (terminalFinalOutput) {
        appendTaskLog(
          task.id,
          "system",
          `Recovery (${reason}): orphan in_progress detected with final CLI output (age_ms=${ageMs}) -> replaying successful completion`,
        );
        handleTaskRunComplete(task.id, 0);
        continue;
      }

      // Safety 1: recent task log activity usually means the task is still active.
      // Exception: a task that already emitted a report but has no process should recover instead of looping reports.
      const recentLog = db
        .prepare(
          `
      SELECT created_at FROM task_logs
      WHERE task_id = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `,
        )
        .get(task.id, now - ORPHAN_RECENT_ACTIVITY_WINDOW_MS) as { created_at: number } | undefined;
      if (recentLog) {
        continue;
      }

      // Safety 2: a recently touched terminal log means output is still progressing.
      // Exception: a reported task with no process should recover to stop duplicate report fan-out.
      try {
        const logPath = path.join(logsDir, `${task.id}.log`);
        const stat = fs.statSync(logPath);
        const logIdleMs = Math.max(0, now - Math.floor(stat.mtimeMs || 0));
        if (logIdleMs <= ORPHAN_RECENT_ACTIVITY_WINDOW_MS) {
          continue;
        }
      } catch {
        // 로그 파일이 없거나 접근 불가하면 기존 복구 로직 진행
      }

      const latestRunLog = db
        .prepare(
          `
      SELECT message
      FROM task_logs
      WHERE task_id = ?
        AND kind = 'system'
        AND (message LIKE 'RUN %' OR message LIKE 'Agent spawn failed:%')
      ORDER BY created_at DESC
      LIMIT 1
    `,
        )
        .get(task.id) as { message: string } | undefined;
      const latestRunMessage = latestRunLog?.message ?? "";

      if (latestRunMessage.startsWith("RUN completed (exit code: 0)")) {
        appendTaskLog(
          task.id,
          "system",
          `Recovery (${reason}): orphan in_progress detected (age_ms=${ageMs}) -> replaying successful completion`,
        );
        handleTaskRunComplete(task.id, 0);
        continue;
      }

      if (latestRunMessage.startsWith("RUN ") || latestRunMessage.startsWith("Agent spawn failed:")) {
        appendTaskLog(
          task.id,
          "system",
          `Recovery (${reason}): orphan in_progress detected (age_ms=${ageMs}) -> replaying failed completion`,
        );
        handleTaskRunComplete(task.id, 1);
        continue;
      }

      const t = nowMs();
      const move = db
        .prepare("UPDATE tasks SET status = 'inbox', updated_at = ? WHERE id = ? AND status = 'in_progress'")
        .run(t, task.id) as { changes?: number };
      if ((move.changes ?? 0) === 0) continue;

      stopProgressTimer(task.id);
      clearTaskWorkflowState(task.id);
      endTaskExecutionSession(task.id, `orphan_in_progress_${reason}`);
      appendTaskLog(
        task.id,
        "system",
        reportRelaySucceeded
          ? `stale_execution_recovered Recovery (${reason}): in_progress had report relay success but no active process (age_ms=${ageMs}) -> inbox`
          : `Recovery (${reason}): in_progress without active process/run log (age_ms=${ageMs}) -> inbox`,
      );

      if (task.assigned_agent_id) {
        db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?").run(
          task.assigned_agent_id,
        );
        const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id);
        broadcast("agent_status", updatedAgent);
      }

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id);
      broadcast("task_update", updatedTask);
      const lang = resolveLang(task.title);
      notifyTaskStatus(task.id, task.title, "inbox", lang);
      notifyCeo(buildWatchdogRecoveryMessage(task.title, lang), task.id);
    }
  }

  function recoverInterruptedWorkflowOnStartup(): void {
    pruneDuplicateReviewMeetings();
    try {
      reconcileCrossDeptSubtasks();
    } catch (err) {
      console.error("[Dongri-grigri] startup reconciliation failed:", err);
    }

    recoverOrphanInProgressTasks("startup");
    recoverOrphanWorkingAgents("startup");
    recoverStaleCompletedAssignments("startup");

    const reviewTasks = db
      .prepare(
        `
    SELECT id, title
    FROM tasks
    WHERE status = 'review'
    ORDER BY updated_at ASC
  `,
      )
      .all() as Array<{ id: string; title: string }>;

    reviewTasks.forEach((task, idx) => {
      const delay = 1200 + idx * 400;
      setTimeout(() => {
        const current = db.prepare("SELECT status FROM tasks WHERE id = ?").get(task.id) as
          | { status: string }
          | undefined;
        if (!current || current.status !== "review") return;
        finishReview(task.id, task.title);
      }, delay);
    });
  }

  function sweepPendingSubtaskDelegations(): void {
    const parents = db
      .prepare(
        `
    SELECT DISTINCT t.id
    FROM tasks t
    JOIN subtasks s ON s.task_id = t.id
    WHERE t.status IN ('planned', 'collaborating', 'in_progress', 'review')
      AND s.target_department_id IS NOT NULL
      AND s.status != 'done'
      AND (s.delegated_task_id IS NULL OR s.delegated_task_id = '')
    ORDER BY t.updated_at ASC
    LIMIT 80
  `,
      )
      .all() as Array<{ id: string }>;

    for (const row of parents) {
      if (!row.id) continue;
      processSubtaskDelegations(row.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-assign agent providers on startup
  // ---------------------------------------------------------------------------
  async function autoAssignAgentProviders(): Promise<void> {
    const autoAssignRow = db.prepare("SELECT value FROM settings WHERE key = 'autoAssign'").get() as
      | { value: string }
      | undefined;
    if (!autoAssignRow || autoAssignRow.value === "false") return;

    const cliStatus = (await detectAllCli()) as StartupCliStatus;
    const connectedPoolProviders = (() => {
      try {
        const table = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cli_account_pools' LIMIT 1")
          .get() as { name?: string } | undefined;
        if (table?.name !== "cli_account_pools") return [];
        return (
          db.prepare("SELECT DISTINCT provider FROM cli_account_pools WHERE status = 'connected'").all() as Array<{
            provider?: string | null;
          }>
        )
          .map((row) => String(row.provider ?? "").trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    })();
    const authenticated = resolveStartupAuthenticatedProviders(cliStatus, connectedPoolProviders);

    if (authenticated.length === 0) {
      console.log("[Dongri-grigri] Auto-assign skipped: no authenticated CLI providers");
      return;
    }

    const dpRow = db.prepare("SELECT value FROM settings WHERE key = 'defaultProvider'").get() as
      | { value: string }
      | undefined;
    const defaultProv = dpRow?.value?.replace(/"/g, "") || "claude";
    const fallback = authenticated.includes(defaultProv) ? defaultProv : authenticated[0];

    const agents = db.prepare("SELECT id, name, cli_provider FROM agents").all() as Array<{
      id: string;
      name: string;
      cli_provider: string | null;
    }>;

    let count = 0;
    for (const agent of agents) {
      const prov = agent.cli_provider || "";
      if (prov === "copilot" || prov === "antigravity" || prov === "api") continue;
      if (authenticated.includes(prov)) continue;

      db.prepare("UPDATE agents SET cli_provider = ? WHERE id = ?").run(fallback, agent.id);
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(agent.id));
      console.log(`[Dongri-grigri] Auto-assigned ${agent.name}: ${prov || "none"} -> ${fallback}`);
      count++;
    }
    if (count > 0) console.log(`[Dongri-grigri] Auto-assigned ${count} agent(s)`);
  }

  // Run rotation every 60 seconds, and once on startup after 5s
  setTimeout(rotateBreaks, 5_000);
  setInterval(rotateBreaks, 60_000);
  setTimeout(recoverInterruptedWorkflowOnStartup, 3_000);
  setInterval(() => recoverOrphanInProgressTasks("interval"), IN_PROGRESS_ORPHAN_SWEEP_MS);
  setInterval(() => recoverOrphanWorkingAgents("interval"), IN_PROGRESS_ORPHAN_SWEEP_MS);
  setTimeout(sweepPendingSubtaskDelegations, 4_000);
  setInterval(sweepPendingSubtaskDelegations, SUBTASK_DELEGATION_SWEEP_MS);
  setTimeout(autoAssignAgentProviders, 4_000);
  const telegramReceiver = startTelegramReceiver({ db });
  const discordReceiver = startDiscordReceiver({ db });
  const gmailIntakeReceiver = startGmailIntakeReceiver({ db });
  const calendarIntakeReceiver = startCalendarIntakeReceiver({ db });
  const strategicMaintenanceScheduler = startStrategicMaintenanceScheduler(ctx);

  // ---------------------------------------------------------------------------
  // Start HTTP server + WebSocket
  // ---------------------------------------------------------------------------
  const server = app.listen(PORT, HOST, () => {
    console.log(`[Dongri-grigri] v${PKG_VERSION} listening on http://${HOST}:${PORT} (db: ${dbPath})`);
    if (isProduction) {
      console.log(`[Dongri-grigri] mode: production (serving UI from ${distDir})`);
    } else {
      console.log(`[Dongri-grigri] mode: development (UI served by Vite on separate port)`);
    }
  });

  // Background token refresh: check every 5 minutes for tokens expiring within 5 minutes
  setInterval(
    async () => {
      try {
        const cred = getDecryptedOAuthToken("google_antigravity");
        if (!cred || !cred.refreshToken) return;
        const expiresAtMs = cred.expiresAt && cred.expiresAt < 1e12 ? cred.expiresAt * 1000 : cred.expiresAt;
        if (!expiresAtMs) return;
        // Refresh if expiring within 5 minutes
        if (expiresAtMs < Date.now() + 5 * 60_000) {
          await refreshGoogleToken(cred);
          console.log("[oauth] Background refresh: Antigravity token renewed");
        }
      } catch (err) {
        console.error("[oauth] Background refresh failed:", err instanceof Error ? err.message : err);
      }
    },
    5 * 60 * 1000,
  );

  // WebSocket server on same HTTP server
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WsSocket, req: IncomingMessage) => {
    if (!isIncomingMessageOriginTrusted(req) || !isIncomingMessageAuthenticated(req)) {
      ws.close(1008, "unauthorized");
      return;
    }
    wsClients.add(ws);
    console.log(`[Dongri-grigri] WebSocket client connected (total: ${wsClients.size})`);

    // Send initial state to the newly connected client
    ws.send(
      JSON.stringify({
        type: "connected",
        payload: {
          version: PKG_VERSION,
          app: "Dongri-grigri",
        },
        ts: nowMs(),
      }),
    );

    ws.on("close", () => {
      wsClients.delete(ws);
      console.log(`[Dongri-grigri] WebSocket client disconnected (total: ${wsClients.size})`);
    });

    ws.on("error", () => {
      wsClients.delete(ws);
    });
  });

  registerGracefulShutdownHandlers({
    activeProcesses,
    stopRequestedTasks,
    killPidTree,
    rollbackTaskWorktree,
    db,
    nowMs,
    endTaskExecutionSession,
    wsClients,
    wss,
    server,
    supervisor: runnerSupervisorRegistry.getOrCreate(db),
    onBeforeClose: () => {
      telegramReceiver.stop();
      discordReceiver.stop();
      gmailIntakeReceiver.stop();
      calendarIntakeReceiver.stop();
      strategicMaintenanceScheduler.stop();
    },
  });
}
