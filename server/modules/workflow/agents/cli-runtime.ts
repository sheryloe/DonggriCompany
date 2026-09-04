import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcess } from "node:child_process";
import {
  isCanonicalCliAccountPoolId,
  isCliAuthArtifactValid,
  resolveDefaultCliAccountProfileRoot,
  resolveCliAccountPoolEnv,
} from "./cli-account-pool-env.ts";
import { resolveHostExecutable, type ResolveHostExecutableInput } from "./host-executable-resolver.ts";
import { resolveProviderRuntimeKind } from "./provider-runtime-kind.ts";

export const PROVIDER_LIVE_EXECUTION_GATE_ID = "G-PROVIDER-LIVE" as const;

export type ProviderLiveExecutionOperation =
  | "task_run"
  | "one_shot_run"
  | "cli_status_probe"
  | "account_diagnostic"
  | "usage_probe";

export type ProviderLiveExecutionGateRequest = {
  gateId: typeof PROVIDER_LIVE_EXECUTION_GATE_ID;
  operation: ProviderLiveExecutionOperation;
  runId: string | null;
  taskId: string | null;
  provider: string;
  poolId: string | null;
  projectPath: string | null;
  executable: string;
};

export type ProviderLiveExecutionGate = (request: ProviderLiveExecutionGateRequest) => boolean;

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
  providerLiveExecutionGate?: ProviderLiveExecutionGate;
  resolveExecutable?: (input: ResolveHostExecutableInput) => ReturnType<typeof resolveHostExecutable>;
  spawnProcess?: typeof spawn;
  cliAccountProfileRoot?: string;
};

type JsonRecord = Record<string, unknown>;

type CliRunSignals = {
  finalSignal: string | null;
  continuationSignal: string | null;
};

const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
] as const;

function readEnvironmentValue(
  sourceEnv: NodeJS.ProcessEnv,
  key: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== "win32") return sourceEnv[key];
  const foundKey = Object.keys(sourceEnv).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return foundKey ? sourceEnv[foundKey] : undefined;
}

export function buildMinimalCliChildEnv(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = readEnvironmentValue(sourceEnv, key, platform);
    if (typeof value === "string" && value.length > 0) childEnv[key] = value;
  }
  childEnv.NO_COLOR = "1";
  childEnv.FORCE_COLOR = "0";
  childEnv.CI = "1";
  if (!childEnv.TERM) childEnv.TERM = "dumb";
  return childEnv;
}

const PROVIDER_COMMAND_ALLOWLIST: Readonly<Record<string, readonly string[]>> = Object.freeze({
  codex: Object.freeze(["codex"]),
  claude: Object.freeze(["claude"]),
  gemini: Object.freeze(["gemini"]),
  jules: Object.freeze(["jules"]),
});

function getProviderAllowedCommands(provider: string): readonly string[] {
  return PROVIDER_COMMAND_ALLOWLIST[provider] ?? [];
}

export function isProviderLiveExecutionApproved(
  gate: ProviderLiveExecutionGate | undefined,
  request: Omit<ProviderLiveExecutionGateRequest, "gateId">,
): boolean {
  if (!gate) return false;
  try {
    return gate({ gateId: PROVIDER_LIVE_EXECUTION_GATE_ID, ...request }) === true;
  } catch {
    return false;
  }
}

function createRejectedChildProcess(exitCode = 1, beforeClose?: (emitClose: () => void) => void): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const mutable = child as ChildProcess & Record<string, unknown>;
  Object.assign(mutable, {
    pid: undefined,
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnfile: "",
    spawnargs: [],
    stdin,
    stdout,
    stderr,
    stdio: [stdin, stdout, stderr, null, null],
    kill: () => false,
    ref: () => child,
    unref: () => child,
  });
  let emitted = false;
  const emitClose = () => {
    if (emitted) return;
    emitted = true;
    stdin.end();
    stdout.end();
    stderr.end();
    (mutable as any).exitCode = exitCode;
    child.emit("exit", exitCode, null);
    child.emit("close", exitCode, null);
  };
  if (beforeClose) beforeClose(() => setImmediate(emitClose));
  else setImmediate(emitClose);
  return child;
}

function isSuccessfulAgentMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^완료했습니다(?:[.!。]|$|\s)/.test(normalized)) return true;
  if (/^작업\s*완료(?:[.!。]|$|\s)/.test(normalized)) return true;
  return /^(done|completed)(?:[.!:]|$|\s)/.test(normalized);
}

function readFinalOutputGraceMs(): number {
  const raw = (
    process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS ??
    process.env.CLIMPIRE_CLI_FINAL_OUTPUT_GRACE_MS ??
    ""
  ).trim();
  if (!raw) return 12_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 12_000;
  return Math.max(0, Math.trunc(parsed));
}

function detectCliRunSignals(data: string): CliRunSignals {
  const result: CliRunSignals = { finalSignal: null, continuationSignal: null };
  const lines = data.split("\n").filter(Boolean);
  for (const line of lines) {
    let j: JsonRecord;
    try {
      j = JSON.parse(line) as JsonRecord;
    } catch {
      continue;
    }

    if (j.type === "turn.completed") {
      result.finalSignal = result.finalSignal ?? "turn.completed";
      continue;
    }

    if (j.type === "item.started") {
      const item = j.item as JsonRecord | undefined;
      const itemType = String(item?.type ?? "");
      if (itemType && itemType !== "agent_message") {
        result.continuationSignal = result.continuationSignal ?? `item.started:${itemType}`;
      }
      continue;
    }

    if (j.type === "item.completed") {
      const item = j.item as JsonRecord | undefined;
      if (item?.type === "agent_message" && typeof item.text === "string" && isSuccessfulAgentMessage(item.text)) {
        result.finalSignal = result.finalSignal ?? "item.completed:agent_message";
      }
    }
  }
  return result;
}

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
    providerLiveExecutionGate,
    resolveExecutable = resolveHostExecutable,
    spawnProcess = spawn,
    cliAccountProfileRoot = resolveDefaultCliAccountProfileRoot(),
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
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "nodejs") : null,
          process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : null,
          path.dirname(process.execPath),
        ].filter((value): value is string => Boolean(value && path.isAbsolute(value)))
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
      'const julesExecutable = process.env.CLAW_JULES_EXECUTABLE || "";',
      'const julesArgvPrefix = JSON.parse(process.env.CLAW_JULES_ARGV_PREFIX_JSON || "[]");',
      "const julesChildEnv = {};",
      "for (const key of ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HOME', 'USERPROFILE', 'NO_COLOR', 'FORCE_COLOR', 'CI']) {",
      "  if (typeof process.env[key] === 'string' && process.env[key]) julesChildEnv[key] = process.env[key];",
      "}",
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
      "    if (!julesExecutable) return reject(new Error('jules_executable_required'));",
      "    if (!Array.isArray(julesArgvPrefix)) return reject(new Error('jules_argv_prefix_invalid'));",
      "    const child = spawn(julesExecutable, [...julesArgvPrefix, ...args], {",
      "      cwd: process.cwd(),",
      "      env: julesChildEnv,",
      "      shell: false,",
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
    const scriptPath = path.join(logsDir, JULES_ASYNC_RUNNER_SCRIPT_NAME);
    const expectedSource = getJulesAsyncRunnerSource();
    const validateScript = () => {
      const lstat = fs.lstatSync(scriptPath);
      const realPath = fs.realpathSync.native(scriptPath);
      if (
        !lstat.isFile() ||
        lstat.isSymbolicLink() ||
        (process.platform === "win32" && realPath.toLowerCase() !== path.resolve(scriptPath).toLowerCase()) ||
        fs.readFileSync(scriptPath, "utf8") !== expectedSource
      ) {
        throw new Error("jules_runner_script_integrity_failed");
      }
    };
    if (
      cachedJulesAsyncRunnerScriptPath &&
      path.resolve(cachedJulesAsyncRunnerScriptPath) !== path.resolve(scriptPath)
    ) {
      throw new Error("jules_runner_script_identity_mismatch");
    }
    if (fs.existsSync(scriptPath)) {
      validateScript();
      cachedJulesAsyncRunnerScriptPath = scriptPath;
      return scriptPath;
    }
    const logsLstat = fs.lstatSync(logsDir);
    const realLogsDir = fs.realpathSync.native(logsDir);
    if (
      !logsLstat.isDirectory() ||
      logsLstat.isSymbolicLink() ||
      (process.platform === "win32" && realLogsDir.toLowerCase() !== path.resolve(logsDir).toLowerCase())
    ) {
      throw new Error("jules_runner_directory_reparse_rejected");
    }
    fs.writeFileSync(scriptPath, expectedSource, { encoding: "utf8", mode: 0o600, flag: "wx" });
    validateScript();
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

  function ensureGeminiRunProfile(
    taskId: string,
    poolId: string,
    runId: string,
    authoritativeProfileHome: string,
    cleanEnv: NodeJS.ProcessEnv,
    safeWrite: (text: string) => boolean,
  ): void {
    if (!authoritativeProfileHome || !path.isAbsolute(authoritativeProfileHome)) {
      throw new Error("gemini_authoritative_profile_mismatch");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(taskId)) {
      throw new Error("gemini_task_id_segment_invalid");
    }
    if (!isCanonicalCliAccountPoolId(poolId) || !/^[0-9a-f-]{36}$/u.test(runId)) {
      throw new Error("gemini_run_identity_invalid");
    }
    const sourceHomeCandidates = [authoritativeProfileHome];
    const sourceGeminiDirs = sourceHomeCandidates.map((home) => path.join(home, ".gemini"));

    const dataRoot = path.basename(logsDir).toLowerCase() === "logs" ? path.dirname(logsDir) : logsDir;
    const runRoot = path.resolve(dataRoot, ".cli-homes", "gemini");
    const runDirectoryName = `${taskId.slice(0, 48)}--${poolId.slice(0, 48)}--${runId}`;
    const runHome = path.resolve(runRoot, runDirectoryName);
    const relativeRunHome = path.relative(runRoot, runHome);
    if (relativeRunHome.startsWith("..") || path.isAbsolute(relativeRunHome)) {
      throw new Error("gemini_run_home_escape");
    }
    const validateDirectoryIdentity = (directory: string, errorCode: string): string => {
      const lstat = fs.lstatSync(directory);
      if (!lstat.isDirectory() || lstat.isSymbolicLink()) throw new Error(errorCode);
      const realPath = fs.realpathSync.native(directory);
      if (process.platform === "win32" && realPath.toLowerCase() !== path.resolve(directory).toLowerCase()) {
        throw new Error(errorCode);
      }
      return realPath;
    };
    fs.mkdirSync(runRoot, { recursive: true });
    const realRunRoot = validateDirectoryIdentity(runRoot, "gemini_run_root_reparse_rejected");
    if (fs.existsSync(runHome)) validateDirectoryIdentity(runHome, "gemini_run_home_reparse_rejected");
    else fs.mkdirSync(runHome);
    const realRunHome = validateDirectoryIdentity(runHome, "gemini_run_home_reparse_rejected");
    const realRelative = path.relative(realRunRoot, realRunHome);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("gemini_run_home_escape");
    const runGeminiDir = path.join(runHome, ".gemini");
    fs.mkdirSync(runGeminiDir, { recursive: true });
    fs.mkdirSync(path.join(runGeminiDir, "tmp"), { recursive: true });
    fs.mkdirSync(path.join(runGeminiDir, "history"), { recursive: true });
    validateDirectoryIdentity(runGeminiDir, "gemini_run_profile_reparse_rejected");
    validateDirectoryIdentity(path.join(runGeminiDir, "tmp"), "gemini_run_profile_reparse_rejected");
    validateDirectoryIdentity(path.join(runGeminiDir, "history"), "gemini_run_profile_reparse_rejected");

    const copyIfPresent = (src: string, dest: string) => {
      if (!fs.existsSync(src)) return;
      const sourceLstat = fs.lstatSync(src);
      if (!sourceLstat.isFile() || sourceLstat.isSymbolicLink()) {
        throw new Error("gemini_profile_source_identity_invalid");
      }
      const realSource = fs.realpathSync.native(src);
      if (process.platform === "win32" && realSource.toLowerCase() !== path.resolve(src).toLowerCase()) {
        throw new Error("gemini_profile_source_reparse_rejected");
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      validateDirectoryIdentity(path.dirname(dest), "gemini_profile_destination_reparse_rejected");
      if (!fs.existsSync(dest)) fs.copyFileSync(realSource, dest, fs.constants.COPYFILE_EXCL);
      const destinationLstat = fs.lstatSync(dest);
      if (!destinationLstat.isFile() || destinationLstat.isSymbolicLink()) {
        throw new Error("gemini_profile_destination_identity_invalid");
      }
      const realDestination = fs.realpathSync.native(dest);
      if (process.platform === "win32" && realDestination.toLowerCase() !== path.resolve(dest).toLowerCase()) {
        throw new Error("gemini_profile_destination_reparse_rejected");
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
    const runOAuthPath = path.join(runGeminiDir, "oauth_creds.json");
    const runGcloudPath = path.join(runHome, ".config", "gcloud", "application_default_credentials.json");
    if (!isCliAuthArtifactValid("gemini", runOAuthPath) && !isCliAuthArtifactValid("gemini", runGcloudPath)) {
      throw new Error("gemini_authoritative_credentials_copy_failed");
    }

    const projectsPath = path.join(runGeminiDir, "projects.json");
    if (!fs.existsSync(projectsPath)) {
      fs.writeFileSync(projectsPath, JSON.stringify({ projects: {} }, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
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
    if (process.platform === "win32") cleanEnv.USERPROFILE = runHome;
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
    const executionRunId = randomUUID();
    const runtimeKind = resolveProviderRuntimeKind(provider);
    // Stream-based CLIs receive the prompt over stdin. Only the legacy async
    // Jules bridge still requires a bounded, short-lived prompt file.
    const promptPath = runtimeKind === "async_session" ? path.join(logsDir, `jules-${randomUUID()}.prompt.txt`) : null;
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
    safeWrite(`\n===== task run start ${new Date().toISOString()} | provider=${provider} =====\n`);
    const failBeforeSpawn = (reason: string): ChildProcess => {
      safeWrite(`${reason}\n`);
      appendTaskLog(taskId, "error", reason);
      const rejected = createRejectedChildProcess(1, (emitClose) => {
        safeEnd(() => {
          if (promptPath) {
            try {
              fs.unlinkSync(promptPath);
            } catch {
              // best-effort cleanup of the bounded Jules prompt file
            }
          }
          emitClose();
        });
      });
      rejected.stdin?.end();
      return rejected;
    };

    // Child processes receive a deliberate environment, not a clone of the
    // server environment. Provider credentials are reachable only through an
    // authoritative account-pool profile selected below.
    const cleanEnv = buildMinimalCliChildEnv(process.env, process.platform);
    cleanEnv.PATH = withCliPathFallback(String(cleanEnv.PATH ?? process.env.PATH ?? ""));

    const poolEnv = resolveCliAccountPoolEnv({
      db,
      provider,
      cliAccountPoolId: cliAccountPoolId ?? null,
      platform: process.platform,
      selectionSeed: taskId,
      profileRoot: cliAccountProfileRoot,
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
      return failBeforeSpawn(reason);
    } else if (!poolEnv.ok) {
      const reason = `[Claw-Empire] RUN FAILED (cli account pool): ${poolEnv.reason}`;
      return failBeforeSpawn(reason);
    } else {
      Object.assign(cleanEnv, poolEnv.envPatch);
      const effectiveHome = String(cleanEnv.HOME ?? "").trim();
      safeWrite(
        `[Claw-Empire] CLI account env: provider=${provider} kind=${runtimeKind} pool=${poolEnv.poolId ?? "default"} selected_by=${poolEnv.selectedBy} home=${effectiveHome || "(empty)"}\n`,
      );
      if (runtimeKind === "cli_stream") {
        let args: string[];
        try {
          args = buildAgentArgs(provider, model, reasoningLevel);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return failBeforeSpawn(`[Claw-Empire] RUN FAILED (arguments): ${message}`);
        }
        const executable = resolveExecutable({
          command: args[0],
          argv: args.slice(1),
          pathValue: cleanEnv.PATH,
          platform: process.platform,
          allowedCommands: getProviderAllowedCommands(provider),
        });
        if (!executable.ok) {
          const reason = `[Claw-Empire] RUN FAILED (executable): ${executable.reason}`;
          return failBeforeSpawn(reason);
        }
        if (
          !isProviderLiveExecutionApproved(providerLiveExecutionGate, {
            operation: "task_run",
            runId: executionRunId,
            taskId,
            provider,
            poolId: poolEnv.poolId,
            projectPath: path.resolve(projectPath),
            executable: executable.executable,
          })
        ) {
          return failBeforeSpawn(`[Claw-Empire] RUN FAILED (approval): ${PROVIDER_LIVE_EXECUTION_GATE_ID}`);
        }
        if (provider === "gemini" && poolEnv.profileHome) {
          try {
            ensureGeminiRunProfile(
              taskId,
              poolEnv.poolId ?? "",
              executionRunId,
              poolEnv.profileHome,
              cleanEnv,
              safeWrite,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return failBeforeSpawn(`[Claw-Empire] RUN FAILED (gemini profile): ${message}`);
          }
        }
        safeWrite(
          `[Claw-Empire] Host executable: source=${executable.source} command=${executable.commandPath} shell=false\n`,
        );
        child = spawnProcess(executable.executable, executable.argv, {
          cwd: projectPath,
          env: cleanEnv,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true,
        });
      } else if (runtimeKind === "async_session") {
        const pollIntervalRaw = Number(process.env.JULES_ASYNC_POLL_INTERVAL_MS ?? 5_000);
        const maxPollsRaw = Number(process.env.JULES_ASYNC_MAX_POLLS ?? 180);
        const pollIntervalMs = Number.isFinite(pollIntervalRaw) ? pollIntervalRaw : 5_000;
        const maxPolls = Number.isFinite(maxPollsRaw) ? maxPollsRaw : 180;
        if (!promptPath) return failBeforeSpawn("[Claw-Empire] RUN FAILED (jules prompt): prompt_path_required");
        cleanEnv.CLAW_JULES_PROMPT_PATH = promptPath;
        cleanEnv.CLAW_JULES_POLL_INTERVAL_MS = String(Math.max(1_000, Math.trunc(pollIntervalMs)));
        cleanEnv.CLAW_JULES_MAX_POLLS = String(Math.max(12, Math.trunc(maxPolls)));
        const executable = resolveExecutable({
          command: "jules",
          pathValue: cleanEnv.PATH,
          platform: process.platform,
          allowedCommands: getProviderAllowedCommands(provider),
        });
        if (!executable.ok) {
          const reason = `[Claw-Empire] RUN FAILED (executable): ${executable.reason}`;
          return failBeforeSpawn(reason);
        }
        if (
          !isProviderLiveExecutionApproved(providerLiveExecutionGate, {
            operation: "task_run",
            runId: executionRunId,
            taskId,
            provider,
            poolId: poolEnv.poolId,
            projectPath: path.resolve(projectPath),
            executable: executable.executable,
          })
        ) {
          return failBeforeSpawn(`[Claw-Empire] RUN FAILED (approval): ${PROVIDER_LIVE_EXECUTION_GATE_ID}`);
        }
        let runnerScriptPath: string;
        try {
          fs.writeFileSync(promptPath, prompt, { encoding: "utf8", mode: 0o600, flag: "wx" });
          runnerScriptPath = ensureJulesAsyncRunnerScript();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return failBeforeSpawn(`[Claw-Empire] RUN FAILED (jules runner): ${message}`);
        }
        cleanEnv.CLAW_JULES_EXECUTABLE = executable.executable;
        cleanEnv.CLAW_JULES_ARGV_PREFIX_JSON = JSON.stringify(executable.argv);
        safeWrite(
          `[Claw-Empire] Jules async session runner: script=${runnerScriptPath} poll_ms=${cleanEnv.CLAW_JULES_POLL_INTERVAL_MS} max_polls=${cleanEnv.CLAW_JULES_MAX_POLLS}\n`,
        );
        shouldWritePrompt = false;
        child = spawnProcess(process.execPath, [runnerScriptPath], {
          cwd: projectPath,
          env: cleanEnv,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true,
        });
      } else {
        const reason = `[Claw-Empire] RUN FAILED (runtime_kind): unsupported runtime kind '${runtimeKind}'`;
        return failBeforeSpawn(reason);
      }
    }

    let finished = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let stdoutListener: ((chunk: Buffer) => void) | null = null;
    let stderrListener: ((chunk: Buffer) => void) | null = null;
    let finalOutputTimer: ReturnType<typeof setTimeout> | null = null;
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
      if (finalOutputTimer) {
        clearTimeout(finalOutputTimer);
        finalOutputTimer = null;
      }
    };
    const cancelFinalOutputTimer = () => {
      if (!finalOutputTimer) return;
      clearTimeout(finalOutputTimer);
      finalOutputTimer = null;
    };
    const scheduleFinalOutputCleanup = (signal: string) => {
      if (finished || finalOutputTimer) return;
      const graceMs = readFinalOutputGraceMs();
      if (graceMs <= 0) return;
      (child as any).__clawFinalOutputObserved = true;
      (child as any).__clawFinalOutputReason = signal;
      finalOutputTimer = setTimeout(() => {
        finalOutputTimer = null;
        if (finished) return;
        (child as any).__clawForcedAfterFinalOutput = true;
        const msg = `[Claw-Empire] RUN FINAL OUTPUT OBSERVED (${signal}); terminating lingering CLI after ${graceMs}ms`;
        safeWrite(`\n${msg}\n`);
        appendTaskLog(taskId, "system", msg);
        try {
          if (child.pid && child.pid > 0) {
            killPidTree(child.pid);
          } else {
            child.kill("SIGTERM");
          }
        } catch {
          // ignore kill race
        }
      }, graceMs);
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
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stdout", text)) return;
      touchIdleTimer();
      safeWrite(text);
      broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
      parseAndCreateSubtasks(taskId, text);
      if (provider === "codex" && runtimeKind === "cli_stream") {
        const signals = detectCliRunSignals(text);
        if (signals.continuationSignal) cancelFinalOutputTimer();
        if (signals.finalSignal) scheduleFinalOutputCleanup(signals.finalSignal);
      }
    };
    stderrListener = (chunk: Buffer) => {
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stderr", text)) return;
      touchIdleTimer();
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
      if (promptPath) {
        try {
          fs.unlinkSync(promptPath);
        } catch {
          /* ignore */
        }
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
