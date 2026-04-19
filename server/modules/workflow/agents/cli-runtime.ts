import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { resolveCliAccountPoolEnv } from "./cli-account-pool-env.ts";
import { resolveProviderRuntimeKind } from "./provider-runtime-kind.ts";

type CliRuntimeDeps = {
  db: any;
  logsDir: string;
  buildAgentArgs: (provider: string, model?: string, reasoningLevel?: string) => string[];
  clearCliOutputDedup: (taskId: string) => void;
  normalizeStreamChunk: (chunk: Buffer, options?: { dropCliNoise?: boolean }) => string;
  shouldSkipDuplicateCliOutput: (taskId: string, stream: "stdout" | "stderr", text: string) => boolean;
  broadcast: (event: string, payload: unknown) => void;
  TASK_RUN_IDLE_TIMEOUT_MS: number;
  TASK_RUN_HARD_TIMEOUT_MS: number;
  killPidTree: (pid: number) => void;
  appendTaskLog: (taskId: string | null, kind: string, message: string) => void;
  activeProcesses: Map<string, ChildProcess>;
  createSubtaskFromCli: (taskId: string, toolUseId: string, title: string) => void;
  completeSubtaskFromCli: (toolUseId: string) => void;
};

type JsonRecord = Record<string, unknown>;

export function createCliRuntimeTools(deps: CliRuntimeDeps) {
  const {
    db,
    logsDir,
    buildAgentArgs,
    clearCliOutputDedup,
    normalizeStreamChunk,
    shouldSkipDuplicateCliOutput,
    broadcast,
    TASK_RUN_IDLE_TIMEOUT_MS,
    TASK_RUN_HARD_TIMEOUT_MS,
    killPidTree,
    appendTaskLog,
    activeProcesses,
    createSubtaskFromCli,
    completeSubtaskFromCli,
  } = deps;

  // Codex multi-agent: map thread_id → cli_tool_use_id (item.id from spawn_agent)
  const codexThreadToSubtask = new Map<string, string>();

  function parseAndCreateSubtasks(taskId: string, data: string): void {
    try {
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        let j: Record<string, unknown>;
        try {
          j = JSON.parse(line);
        } catch {
          continue;
        }

        // Detect sub-agent spawn: tool_use with tool === "Task" (Claude Code)
        if (j.type === "tool_use" && j.tool === "Task") {
          const toolUseId = (j.id as string) || `sub-${Date.now()}`;
          // Check for duplicate
          const existing = dbPrepareSubtaskByToolUseId().get(toolUseId) as { id: string } | undefined;
          if (existing) continue;

          const input = j.input as Record<string, unknown> | undefined;
          const title = (input?.description as string) || (input?.prompt as string)?.slice(0, 100) || "Sub-task";

          createSubtaskFromCli(taskId, toolUseId, title);
        }

        // Detect sub-agent completion: tool_result with tool === "Task" (Claude Code)
        if (j.type === "tool_result" && j.tool === "Task") {
          const toolUseId = j.id as string;
          if (!toolUseId) continue;
          completeSubtaskFromCli(toolUseId);
        }

        // Codex: spawn_agent started → create subtask
        if (j.type === "item.started") {
          const item = j.item as Record<string, unknown> | undefined;
          if (item?.type === "collab_tool_call" && item?.tool === "spawn_agent") {
            const itemId = (item.id as string) || `codex-spawn-${Date.now()}`;
            const existing = dbPrepareSubtaskByToolUseId().get(itemId) as { id: string } | undefined;
            if (!existing) {
              const prompt = (item.prompt as string) || "Sub-agent";
              const title = prompt
                .split("\n")[0]
                .replace(/^Task:\s*/, "")
                .slice(0, 100);
              createSubtaskFromCli(taskId, itemId, title);
            }
          }
        }

        // Codex: spawn_agent completed → save thread_id mapping
        // Codex: close_agent completed → complete subtask via thread_id
        if (j.type === "item.completed") {
          const item = j.item as Record<string, unknown> | undefined;
          if (item?.type === "collab_tool_call") {
            if (item.tool === "spawn_agent") {
              const itemId = item.id as string;
              const threadIds = (item.receiver_thread_ids as string[]) || [];
              if (itemId && threadIds[0]) {
                codexThreadToSubtask.set(threadIds[0], itemId);
              }
            } else if (item.tool === "close_agent") {
              const threadIds = (item.receiver_thread_ids as string[]) || [];
              for (const tid of threadIds) {
                const origItemId = codexThreadToSubtask.get(tid);
                if (origItemId) {
                  completeSubtaskFromCli(origItemId);
                  codexThreadToSubtask.delete(tid);
                }
              }
            }
          }
        }

        // Gemini: plan-based subtask detection from message
        if (j.type === "message" && j.content) {
          const content = j.content as string;
          // Detect plan output: {"subtasks": [...]}
          const planMatch = content.match(/\{"subtasks"\s*:\s*\[.*?\]\}/s);
          if (planMatch) {
            try {
              const plan = JSON.parse(planMatch[0]) as { subtasks: { title: string }[] };
              for (const st of plan.subtasks) {
                const stId = `gemini-plan-${st.title.slice(0, 30).replace(/\s/g, "-")}-${Date.now()}`;
                const existing = dbPrepareOpenSubtaskByTitle().get(taskId, st.title) as { id: string } | undefined;
                if (!existing) {
                  createSubtaskFromCli(taskId, stId, st.title);
                }
              }
            } catch {
              /* ignore malformed JSON */
            }
          }
          // Detect completion report: {"subtask_done": "..."}
          const doneMatch = content.match(/\{"subtask_done"\s*:\s*"(.+?)"\}/);
          if (doneMatch) {
            const doneTitle = doneMatch[1];
            const sub = dbPrepareOpenSubtaskToolUseIdByTitle().get(taskId, doneTitle) as
              | { cli_tool_use_id: string }
              | undefined;
            if (sub) completeSubtaskFromCli(sub.cli_tool_use_id);
          }
        }
      }
    } catch {
      // Not JSON or not parseable - ignore
    }
  }

  const dbPrepareSubtaskByToolUseId = () => db.prepare("SELECT id FROM subtasks WHERE cli_tool_use_id = ?");
  const dbPrepareOpenSubtaskByTitle = () =>
    db.prepare("SELECT id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done'");
  const dbPrepareOpenSubtaskToolUseIdByTitle = () =>
    db.prepare("SELECT cli_tool_use_id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done' LIMIT 1");

  function createSafeLogStreamOps(logStream: any): {
    safeWrite: (text: string) => boolean;
    safeEnd: (onDone?: () => void) => void;
    isClosed: () => boolean;
  } {
    let ended = false;
    const isClosed = () => ended || Boolean(logStream?.destroyed || logStream?.writableEnded || logStream?.closed);
    const safeWrite = (text: string): boolean => {
      if (!text || isClosed()) return false;
      try {
        logStream.write(text);
        return true;
      } catch {
        ended = true;
        return false;
      }
    };
    const safeEnd = (onDone?: () => void): void => {
      if (isClosed()) {
        ended = true;
        onDone?.();
        return;
      }
      ended = true;
      try {
        logStream.end(() => onDone?.());
      } catch {
        onDone?.();
      }
    };
    return { safeWrite, safeEnd, isClosed };
  }

  const CLI_PATH_FALLBACK_DIRS =
    process.platform === "win32"
      ? [
          path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs"),
          path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs"),
          path.join(process.env.APPDATA || "", "npm"),
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
    const parts = (pathValue ?? "")
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean);
    const seen = new Set(parts);
    for (const dir of CLI_PATH_FALLBACK_DIRS) {
      if (!dir || seen.has(dir)) continue;
      parts.push(dir);
      seen.add(dir);
    }
    return parts.join(path.delimiter);
  }

  const JULES_ASYNC_RUNNER_SCRIPT_NAME = "__claw_jules_async_runner.cjs";
  let cachedJulesAsyncRunnerScriptPath: string | null = null;

  function getJulesAsyncRunnerSource(): string {
    return [
      '"use strict";',
      'const fs = require("node:fs");',
      'const { spawn } = require("node:child_process");',
      "",
      'const promptPath = process.env.CLAW_JULES_PROMPT_PATH || "";',
      'const pollIntervalMs = Number(process.env.CLAW_JULES_POLL_INTERVAL_MS || "5000");',
      'const maxPolls = Number(process.env.CLAW_JULES_MAX_POLLS || "180");',
      "",
      "let sessionId = null;",
      'let currentStatus = "unknown";',
      "",
      'const doneStatuses = new Set(["completed", "succeeded", "done", "ready", "applied"]);',
      'const failStatuses = new Set(["failed", "error", "cancelled", "canceled", "timed_out", "timeout"]);',
      "",
      "function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }",
      "",
      "function normalizeStatus(raw) {",
      '  return String(raw || "")',
      "    .trim()",
      "    .toLowerCase()",
      '    .replace(/[^a-z0-9]+/g, "_")',
      '    .replace(/^_+|_+$/g, "");',
      "}",
      "",
      "function collectJsonObjects(text) {",
      "  const out = [];",
      '  const lines = String(text || "").split(/\\r?\\n/);',
      "  for (const line of lines) {",
      "    const trimmed = line.trim();",
      "    if (!trimmed) continue;",
      '    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) continue;',
      "    try {",
      "      const parsed = JSON.parse(trimmed);",
      "      if (Array.isArray(parsed)) {",
      '        for (const item of parsed) if (item && typeof item === "object") out.push(item);',
      '      } else if (parsed && typeof parsed === "object") {',
      "        out.push(parsed);",
      "      }",
      "    } catch {",
      "      // ignore",
      "    }",
      "  }",
      "  return out;",
      "}",
      "",
      "function findSessionId(text) {",
      '  const combined = String(text || "");',
      "  const objects = collectJsonObjects(combined);",
      "  for (const obj of objects) {",
      "    const candidate = obj.session_id || obj.sessionId || obj.id || obj.session;",
      '    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();',
      "  }",
      "  const uuidMatch = combined.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);",
      "  if (uuidMatch?.[0]) return uuidMatch[0];",
      "  const genericMatch = combined.match(/\\bsession[_\\s-]*id\\s*[:=]\\s*([A-Za-z0-9._-]{8,})/i);",
      "  if (genericMatch?.[1]) return genericMatch[1];",
      "  return null;",
      "}",
      "",
      "function extractStatusFromList(text, targetSessionId) {",
      '  const combined = String(text || "");',
      '  const normalizedTarget = String(targetSessionId || "").trim();',
      "  const objects = collectJsonObjects(combined);",
      "  for (const obj of objects) {",
      '    const oid = String(obj.session_id || obj.sessionId || obj.id || obj.session || "").trim();',
      "    if (!oid || (normalizedTarget && oid !== normalizedTarget)) continue;",
      '    const rawStatus = obj.status || obj.state || obj.lifecycle || obj.phase || "";',
      "    const status = normalizeStatus(rawStatus);",
      "    if (status) return status;",
      "  }",
      "  const lines = combined.split(/\\r?\\n/);",
      "  for (const line of lines) {",
      "    if (normalizedTarget && !line.includes(normalizedTarget)) continue;",
      "    const statusMatch = line.match(/\\b(status|state|phase)\\s*[:=]\\s*([A-Za-z0-9_-]+)/i);",
      "    if (statusMatch?.[2]) return normalizeStatus(statusMatch[2]);",
      "    const tokenMatch = line.match(/\\b(completed|succeeded|done|ready|applied|running|in[_-]?progress|processing|pending|queued|awaiting|failed|error|cancelled|canceled|timed[_-]?out|timeout)\\b/i);",
      "    if (tokenMatch?.[1]) return normalizeStatus(tokenMatch[1]);",
      "  }",
      '  return "";',
      "}",
      "",
      "function classifyStatus(status) {",
      '  if (!status) return "waiting";',
      '  if (doneStatuses.has(status)) return "done";',
      '  if (failStatuses.has(status)) return "failed";',
      '  return "waiting";',
      "}",
      "",
      "function runJules(args, label, allowFailure = false) {",
      "  return new Promise((resolve, reject) => {",
      '    const child = spawn("jules", args, {',
      "      cwd: process.cwd(),",
      "      env: process.env,",
      '      shell: process.platform === "win32",',
      '      stdio: ["ignore", "pipe", "pipe"],',
      "      windowsHide: true,",
      "      detached: false,",
      "    });",
      '    let stdout = "";',
      '    let stderr = "";',
      '    child.stdout?.on("data", (chunk) => {',
      "      const text = String(chunk);",
      "      stdout += text;",
      "      process.stdout.write(text);",
      "    });",
      '    child.stderr?.on("data", (chunk) => {',
      "      const text = String(chunk);",
      "      stderr += text;",
      "      process.stderr.write(text);",
      "    });",
      '    child.on("error", (err) => reject(err));',
      '    child.on("close", (code) => {',
      '      const result = { code: code ?? 1, stdout, stderr, combined: [stdout, stderr].filter(Boolean).join("\\n") };',
      "      if (result.code !== 0 && !allowFailure) {",
      "        const reason = result.combined.trim() || `${label}_exit_code_${result.code}`;",
      "        reject(new Error(reason));",
      "        return;",
      "      }",
      "      resolve(result);",
      "    });",
      "  });",
      "}",
      "",
      "(async () => {",
      '  const prompt = fs.readFileSync(promptPath, "utf8").trim();',
      '  if (!prompt) throw new Error("prompt_empty");',
      "",
      '  console.log("[Jules] step=remote_new");',
      '  const created = await runJules(["remote", "new", "--session", prompt], "remote_new");',
      "  sessionId = findSessionId(created.combined);",
      '  if (!sessionId) throw new Error("session_id_not_found");',
      '  currentStatus = "created";',
      "  console.log(`[Jules] session_id=${sessionId} status=${currentStatus}`);",
      "",
      "  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {",
      '    const listed = await runJules(["remote", "list", "--session"], "remote_list", true);',
      "    const status = extractStatusFromList(listed.combined, sessionId);",
      "    if (status) currentStatus = status;",
      "    console.log(`[Jules] session_id=${sessionId} poll=${attempt}/${maxPolls} status=${currentStatus}`);",
      "    const state = classifyStatus(currentStatus);",
      '    if (state === "done") break;',
      '    if (state === "failed") throw new Error(`session_failed:${currentStatus}`);',
      '    if (attempt >= maxPolls) throw new Error("session_timeout");',
      "    await sleep(pollIntervalMs);",
      "  }",
      "",
      "  console.log(`[Jules] step=remote_pull session_id=${sessionId}`);",
      '  await runJules(["remote", "pull", "--session", sessionId, "--apply"], "remote_pull");',
      "  console.log(`[Jules] completed session_id=${sessionId} status=${currentStatus}`);",
      "  process.exit(0);",
      "})().catch((error) => {",
      "  const message = error instanceof Error ? error.message : String(error);",
      '  console.error(`[Jules] failed session_id=${sessionId || "(unknown)"} status=${currentStatus} reason=${message}`);',
      "  process.exit(1);",
      "});",
      "",
    ].join("\n");
  }

  function ensureJulesAsyncRunnerScript(): string {
    if (cachedJulesAsyncRunnerScriptPath && fs.existsSync(cachedJulesAsyncRunnerScriptPath)) {
      return cachedJulesAsyncRunnerScriptPath;
    }
    const scriptPath = path.join(logsDir, JULES_ASYNC_RUNNER_SCRIPT_NAME);
    fs.writeFileSync(scriptPath, getJulesAsyncRunnerSource(), "utf8");
    cachedJulesAsyncRunnerScriptPath = scriptPath;
    return scriptPath;
  }

  function readJsonObject(filePath: string): JsonRecord | null {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as JsonRecord;
    } catch {
      return null;
    }
  }

  function resolveConnectedCliProfileHome(provider: string): string | null {
    try {
      const row = db
        .prepare(
          `SELECT profile_home
           FROM cli_account_pools
           WHERE provider = ? AND status = 'connected'
           ORDER BY COALESCE(last_verified_at, updated_at, created_at) DESC
           LIMIT 1`,
        )
        .get(provider) as { profile_home?: string } | undefined;
      const value = String(row?.profile_home ?? "").trim();
      return value || null;
    } catch {
      return null;
    }
  }

  function ensureGeminiRunProfile(
    taskId: string,
    cleanEnv: NodeJS.ProcessEnv,
    safeWrite: (text: string) => boolean,
  ): void {
    try {
      const sharedHome = (process.env.HOME || os.homedir() || "").trim() || os.homedir();
      const connectedPoolHome = resolveConnectedCliProfileHome("gemini");
      const sourceHomeCandidates = [connectedPoolHome, sharedHome].filter((v): v is string => Boolean(v));
      const sourceGeminiDirs = sourceHomeCandidates.map((home) => path.join(home, ".gemini"));

      const dataRoot = path.dirname(logsDir);
      const runHome = path.join(dataRoot, ".cli-homes", "gemini", taskId);
      const runGeminiDir = path.join(runHome, ".gemini");
      fs.mkdirSync(runGeminiDir, { recursive: true });
      fs.mkdirSync(path.join(runGeminiDir, "tmp"), { recursive: true });
      fs.mkdirSync(path.join(runGeminiDir, "history"), { recursive: true });

      const copyIfPresent = (src: string, dest: string) => {
        try {
          if (!fs.existsSync(src) || fs.existsSync(dest)) return;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
        } catch {
          // best effort
        }
      };

      const copyFirstFound = (relativePath: string, destinationPath: string, roots: string[]) => {
        for (const root of roots) {
          const src = path.join(root, relativePath);
          if (!fs.existsSync(src)) continue;
          copyIfPresent(src, destinationPath);
          if (fs.existsSync(destinationPath)) break;
        }
      };

      copyFirstFound("oauth_creds.json", path.join(runGeminiDir, "oauth_creds.json"), sourceGeminiDirs);
      copyFirstFound("settings.json", path.join(runGeminiDir, "settings.json"), sourceGeminiDirs);
      copyFirstFound("projects.json", path.join(runGeminiDir, "projects.json"), sourceGeminiDirs);
      copyFirstFound(
        path.join(".config", "gcloud", "application_default_credentials.json"),
        path.join(runHome, ".config", "gcloud", "application_default_credentials.json"),
        sourceHomeCandidates,
      );

      const projectsPath = path.join(runGeminiDir, "projects.json");
      if (!fs.existsSync(projectsPath)) {
        fs.writeFileSync(projectsPath, JSON.stringify({ projects: {} }, null, 2), { encoding: "utf8", mode: 0o600 });
      }

      const oauthCreds = readJsonObject(path.join(runGeminiDir, "oauth_creds.json"));
      const hasOAuthToken =
        (typeof oauthCreds?.access_token === "string" && oauthCreds.access_token.length > 0) ||
        (oauthCreds?.token &&
          typeof oauthCreds.token === "object" &&
          typeof (oauthCreds.token as JsonRecord).accessToken === "string" &&
          ((oauthCreds.token as JsonRecord).accessToken as string).length > 0);

      if (hasOAuthToken) {
        const settingsPath = path.join(runGeminiDir, "settings.json");
        const settings = readJsonObject(settingsPath) ?? {};
        const currentSelectedType = (settings.security as JsonRecord | undefined)?.auth
          ? (((settings.security as JsonRecord).auth as JsonRecord).selectedType as string | undefined)
          : undefined;

        if (!currentSelectedType) {
          const nextSettings: JsonRecord = { ...settings };
          const security = (nextSettings.security as JsonRecord | undefined) ?? {};
          const auth = (security.auth as JsonRecord | undefined) ?? {};
          auth.selectedType = "oauth-personal";
          security.auth = auth;
          nextSettings.security = security;
          fs.writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2), { encoding: "utf8", mode: 0o600 });
          safeWrite("[Claw-Empire] Gemini auth mode auto-set to oauth-personal for this task run.\n");
        }
      }

      cleanEnv.HOME = runHome;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      safeWrite(`[Claw-Empire] Gemini profile prep warning: ${msg}\n`);
    }
  }

  function spawnCliAgent(
    taskId: string,
    provider: string,
    prompt: string,
    projectPath: string,
    logPath: string,
    model?: string,
    reasoningLevel?: string,
    cliAccountPoolId?: string | null,
  ): ChildProcess {
    clearCliOutputDedup(taskId);
    // Save prompt for debugging
    const promptPath = path.join(logsDir, `${taskId}.prompt.txt`);
    fs.writeFileSync(promptPath, prompt, "utf8");
    const runtimeKind = resolveProviderRuntimeKind(provider);
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
    safeWrite(`\n===== task run start ${new Date().toISOString()} | provider=${provider} =====\n`);

    // Remove CLAUDECODE env var to prevent "nested session" detection
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE;
    cleanEnv.PATH = withCliPathFallback(String(cleanEnv.PATH ?? process.env.PATH ?? ""));
    cleanEnv.NO_COLOR = "1";
    cleanEnv.FORCE_COLOR = "0";
    cleanEnv.CI = "1";
    if (!cleanEnv.TERM) cleanEnv.TERM = "dumb";
    if (provider === "gemini" && runtimeKind === "cli_stream") {
      ensureGeminiRunProfile(taskId, cleanEnv, safeWrite);
    }

    const poolEnv = resolveCliAccountPoolEnv({
      db,
      provider,
      cliAccountPoolId: cliAccountPoolId ?? null,
      platform: process.platform,
      selectionSeed: taskId,
      policy:
        runtimeKind === "async_session"
          ? {
              requireExplicitSelection: true,
              requireConnectedStatus: true,
            }
          : undefined,
    });
    let shouldWritePrompt = runtimeKind === "cli_stream";
    let child: ChildProcess;
    if (!runtimeKind) {
      const reason = `[Claw-Empire] RUN FAILED (provider): unsupported provider '${provider}'`;
      safeWrite(`${reason}\n`);
      appendTaskLog(taskId, "error", reason);
      shouldWritePrompt = false;
      child = spawn(process.execPath, ["-e", "process.exit(1)"], {
        cwd: projectPath,
        env: cleanEnv,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } else if (!poolEnv.ok) {
      const reason = `[Claw-Empire] RUN FAILED (cli account pool): ${poolEnv.reason}`;
      safeWrite(`${reason}\n`);
      appendTaskLog(taskId, "error", reason);
      shouldWritePrompt = false;
      child = spawn(process.execPath, ["-e", "process.exit(1)"], {
        cwd: projectPath,
        env: cleanEnv,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } else {
      Object.assign(cleanEnv, poolEnv.envPatch);
      const effectiveHome = String(cleanEnv.HOME ?? "").trim();
      safeWrite(
        `[Claw-Empire] CLI account env: provider=${provider} kind=${runtimeKind} pool=${poolEnv.poolId ?? "default"} selected_by=${poolEnv.selectedBy} home=${effectiveHome || "(empty)"}\n`,
      );
      if (runtimeKind === "cli_stream") {
        const args = buildAgentArgs(provider, model, reasoningLevel);
        child = spawn(args[0], args.slice(1), {
          cwd: projectPath,
          env: cleanEnv,
          shell: process.platform === "win32",
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true,
        });
      } else if (runtimeKind === "async_session") {
        const runnerScriptPath = ensureJulesAsyncRunnerScript();
        const pollIntervalRaw = Number(process.env.JULES_ASYNC_POLL_INTERVAL_MS ?? 5_000);
        const maxPollsRaw = Number(process.env.JULES_ASYNC_MAX_POLLS ?? 180);
        const pollIntervalMs = Number.isFinite(pollIntervalRaw) ? pollIntervalRaw : 5_000;
        const maxPolls = Number.isFinite(maxPollsRaw) ? maxPollsRaw : 180;
        cleanEnv.CLAW_JULES_PROMPT_PATH = promptPath;
        cleanEnv.CLAW_JULES_POLL_INTERVAL_MS = String(Math.max(1_000, Math.trunc(pollIntervalMs)));
        cleanEnv.CLAW_JULES_MAX_POLLS = String(Math.max(12, Math.trunc(maxPolls)));
        safeWrite(
          `[Claw-Empire] Jules async session runner: script=${runnerScriptPath} poll_ms=${cleanEnv.CLAW_JULES_POLL_INTERVAL_MS} max_polls=${cleanEnv.CLAW_JULES_MAX_POLLS}\n`,
        );
        shouldWritePrompt = false;
        child = spawn(process.execPath, [runnerScriptPath], {
          cwd: projectPath,
          env: cleanEnv,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true,
        });
      } else {
        const reason = `[Claw-Empire] RUN FAILED (runtime_kind): unsupported runtime kind '${runtimeKind}'`;
        safeWrite(`${reason}\n`);
        appendTaskLog(taskId, "error", reason);
        shouldWritePrompt = false;
        child = spawn(process.execPath, ["-e", "process.exit(1)"], {
          cwd: projectPath,
          env: cleanEnv,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true,
        });
      }
    }

    let finished = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let stdoutListener: ((chunk: Buffer) => void) | null = null;
    let stderrListener: ((chunk: Buffer) => void) | null = null;
    const detachOutputListeners = () => {
      if (stdoutListener) {
        child.stdout?.off("data", stdoutListener);
        stdoutListener = null;
      }
      if (stderrListener) {
        child.stderr?.off("data", stderrListener);
        stderrListener = null;
      }
    };
    const clearRunTimers = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
    };
    const triggerTimeout = (kind: "idle" | "hard") => {
      if (finished) return;
      finished = true;
      clearRunTimers();
      const timeoutMs = kind === "idle" ? TASK_RUN_IDLE_TIMEOUT_MS : TASK_RUN_HARD_TIMEOUT_MS;
      const reason =
        kind === "idle"
          ? `no output for ${Math.round(timeoutMs / 1000)}s`
          : `exceeded max runtime ${Math.round(timeoutMs / 1000)}s`;
      const msg = `[Claw-Empire] RUN TIMEOUT (${reason})`;
      safeWrite(`\n${msg}\n`);
      appendTaskLog(taskId, "error", msg);
      try {
        if (child.pid && child.pid > 0) {
          killPidTree(child.pid);
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // ignore kill race
      }
    };
    const touchIdleTimer = () => {
      if (finished || TASK_RUN_IDLE_TIMEOUT_MS <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => triggerTimeout("idle"), TASK_RUN_IDLE_TIMEOUT_MS);
    };

    touchIdleTimer();
    if (TASK_RUN_HARD_TIMEOUT_MS > 0) {
      hardTimer = setTimeout(() => triggerTimeout("hard"), TASK_RUN_HARD_TIMEOUT_MS);
    }

    activeProcesses.set(taskId, child);

    child.on("error", (err) => {
      finished = true;
      clearRunTimers();
      detachOutputListeners();
      console.error(`[Claw-Empire] spawn error for ${provider} (task ${taskId}): ${err.message}`);
      safeWrite(`\n[Claw-Empire] SPAWN ERROR: ${err.message}\n`);
      safeEnd();
      activeProcesses.delete(taskId);
      appendTaskLog(taskId, "error", `Agent spawn failed: ${err.message}`);
    });

    // Deliver prompt via stdin (cross-platform safe)
    if (shouldWritePrompt) {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    // Pipe agent output to log file AND broadcast via WebSocket
    stdoutListener = (chunk: Buffer) => {
      touchIdleTimer();
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stdout", text)) return;
      safeWrite(text);
      broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
      parseAndCreateSubtasks(taskId, text);
    };
    stderrListener = (chunk: Buffer) => {
      touchIdleTimer();
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stderr", text)) return;
      safeWrite(text);
      broadcast("cli_output", { task_id: taskId, stream: "stderr", data: text });
    };
    child.stdout?.on("data", stdoutListener);
    child.stderr?.on("data", stderrListener);

    child.on("close", () => {
      finished = true;
      clearRunTimers();
      detachOutputListeners();
      safeEnd();
      try {
        fs.unlinkSync(promptPath);
      } catch {
        /* ignore */
      }
    });

    if (process.platform !== "win32") child.unref();

    return child;
  }

  return {
    codexThreadToSubtask,
    spawnCliAgent,
  };
}
