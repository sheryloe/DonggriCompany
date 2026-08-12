import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";

export type CliOutputStream = "stdout" | "stderr";

type CreateCliToolsDeps = {
  nowMs: () => number;
  cliOutputDedupWindowMs: number;
};

type BuildAntigravityArgsOptions = {
  continueConversation?: boolean;
  conversationId?: string | null;
  projectId?: string | null;
  printTimeout?: string | null;
  logFile?: string | null;
  addDirs?: string[];
};

type BuildAgentArgsOptions = {
  noTools?: boolean;
  agy?: BuildAntigravityArgsOptions;
};

export function createCliTools(deps: CreateCliToolsDeps) {
  const { nowMs, cliOutputDedupWindowMs } = deps;

  const CLI_PATH_FALLBACK_DIRS =
    process.platform === "win32"
      ? [
          path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs"),
          path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs"),
          path.join(process.env.LOCALAPPDATA || "", "agy", "bin"),
          path.join(process.env.APPDATA || "", "npm"),
          path.join("G:\\Donggri_DevDrive", "tools", "antigravity"),
        ].filter(Boolean)
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          path.join(os.homedir(), ".local", "bin"),
          path.join(os.homedir(), "bin"),
        ];

  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const ANSI_ESCAPE_REGEX = new RegExp(
    `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|][^${BEL}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`,
    "g",
  );
  const CLI_SPINNER_LINE_REGEX = /^[\s.|/\\\-+=*~]{2,}$/u;
  const cliOutputDedupCache = new Map<string, { normalized: string; ts: number }>();

  const euckrDecoder: TextDecoder | null = (() => {
    if (process.platform !== "win32") return null;
    try {
      return new TextDecoder("euc-kr");
    } catch {
      return null;
    }
  })();

  function scoreDecodedChunk(text: string): number {
    const hangul = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length;
    const replacement = (text.match(/\uFFFD/g) ?? []).length;
    const questionMarks = (text.match(/\?/g) ?? []).length;
    return hangul * 2 - replacement * 3 - questionMarks;
  }

  function decodeBufferChunk(raw: Buffer): string {
    const utf8 = raw.toString("utf8");
    if (!euckrDecoder) return utf8;

    const utf8Score = scoreDecodedChunk(utf8);
    if (utf8Score >= 0 && !utf8.includes("\uFFFD")) return utf8;

    const euckr = euckrDecoder.decode(raw);
    return scoreDecodedChunk(euckr) > utf8Score ? euckr : utf8;
  }

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

  function readEnvString(...keys: string[]): string | null {
    for (const key of keys) {
      const value = String(process.env[key] ?? "").trim();
      if (value) return value;
    }
    return null;
  }

  function readEnvFlag(...keys: string[]): boolean {
    const value = readEnvString(...keys);
    if (!value) return false;
    return /^(1|true|yes|on)$/i.test(value);
  }

  function normalizeAgyCliModel(model?: string): string {
    const configured = String(model ?? "").trim() || readEnvString("AGY_CLI_MODEL", "ANTIGRAVITY_CLI_MODEL") || "";
    const normalized = configured.toLowerCase();
    if (!normalized) return "Gemini 3.1 Pro (High)";
    if (
      normalized === "google/antigravity-gemini-3-pro" ||
      normalized === "antigravity-gemini-3-pro" ||
      normalized === "gemini-3-pro" ||
      normalized === "gemini-3.1-pro" ||
      normalized === "gemini-3.1-pro-high"
    ) {
      return "Gemini 3.1 Pro (High)";
    }
    if (
      normalized === "google/antigravity-gemini-3-flash" ||
      normalized === "antigravity-gemini-3-flash" ||
      normalized === "gemini-3-flash" ||
      normalized === "gemini-3.5-flash"
    ) {
      return "Gemini 3.5 Flash (Medium)";
    }
    return configured;
  }

  function buildAgyArgs(model?: string, opts: BuildAntigravityArgsOptions = {}): string[] {
    const args = ["agy", "--model", normalizeAgyCliModel(model)];
    const conversationId =
      String(opts.conversationId ?? "").trim() ||
      readEnvString("AGY_CLI_CONVERSATION_ID", "ANTIGRAVITY_CLI_CONVERSATION_ID");
    const projectId =
      String(opts.projectId ?? "").trim() || readEnvString("AGY_CLI_PROJECT_ID", "ANTIGRAVITY_CLI_PROJECT_ID");
    const printTimeout =
      String(opts.printTimeout ?? "").trim() ||
      readEnvString("AGY_CLI_PRINT_TIMEOUT", "ANTIGRAVITY_CLI_PRINT_TIMEOUT") ||
      "5m";
    const logFile = String(opts.logFile ?? "").trim();
    const shouldContinue =
      opts.continueConversation === true || readEnvFlag("AGY_CLI_CONTINUE", "ANTIGRAVITY_CLI_CONTINUE");

    if (conversationId) args.push("--conversation", conversationId);
    else if (shouldContinue) args.push("--continue");
    if (projectId) args.push("--project", projectId);
    args.push("--sandbox");
    for (const dir of opts.addDirs ?? []) {
      const normalizedDir = String(dir ?? "").trim();
      if (normalizedDir) args.push("--add-dir", normalizedDir);
    }
    if (logFile) args.push("--log-file", logFile);
    args.push("--print-timeout", printTimeout);
    return args;
  }

  function buildAgentArgs(provider: string, model?: string, reasoningLevel?: string, opts: BuildAgentArgsOptions = {}): string[] {
    const { noTools = false } = opts;
    switch (provider) {
      case "codex": {
        const args = ["codex"];
        if (!noTools) args.push("--enable", "multi_agent");
        if (model) args.push("-m", model);
        if (reasoningLevel) args.push("-c", `model_reasoning_effort="${reasoningLevel}"`);
        args.push("--ask-for-approval", "never");
        if (!noTools) args.push("--sandbox", "workspace-write");
        args.push("exec", "--json");
        if (noTools) args.push("--sandbox", "read-only");
        return args;
      }
      case "claude": {
        const args = [
          "claude",
          "--permission-mode",
          "plan",
          "--print",
          "--verbose",
          "--output-format=stream-json",
          "--include-partial-messages",
          "--max-turns",
          "200",
        ];
        if (model) args.push("--model", model);
        if (noTools) args.push("--tools=");
        return args;
      }
      case "agy":
      case "gemini":
      case "antigravity":
        return buildAgyArgs(model, opts.agy);
      case "kimi": {
        const args = ["kimi", "--print", "--output-format=stream-json"];
        if (model) args.push("-m", model);
        return args;
      }
      case "opencode": {
        const args = ["opencode", "run"];
        if (model) args.push("-m", model);
        args.push("--format", "json");
        return args;
      }
      case "copilot":
        throw new Error(`${provider} uses HTTP agent (not CLI spawn)`);
      default:
        throw new Error(`unsupported CLI provider: ${provider}`);
    }
  }

  function shouldSkipDuplicateCliOutput(taskId: string, stream: CliOutputStream, text: string): boolean {
    if (cliOutputDedupWindowMs <= 0) return false;
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    const key = `${taskId}:${stream}`;
    const now = nowMs();
    const prev = cliOutputDedupCache.get(key);
    if (prev && prev.normalized === normalized && now - prev.ts <= cliOutputDedupWindowMs) {
      cliOutputDedupCache.set(key, { normalized, ts: now });
      return true;
    }
    cliOutputDedupCache.set(key, { normalized, ts: now });
    return false;
  }

  function clearCliOutputDedup(taskId: string): void {
    const prefix = `${taskId}:`;
    for (const key of cliOutputDedupCache.keys()) {
      if (key.startsWith(prefix)) cliOutputDedupCache.delete(key);
    }
  }

  function isIgnorableCliNoiseLine(trimmed: string): boolean {
    if (/^\d{4}-\d{2}-\d{2}T.+\s+(WARN|ERROR)\s+codex_core_plugins::/i.test(trimmed)) return true;
    if (/^\d{4}-\d{2}-\d{2}T.+\s+(WARN|ERROR)\s+codex_core_skills::loader:/i.test(trimmed)) return true;
    if (/^\d{4}-\d{2}-\d{2}T.+\s+ERROR\s+codex_models_manager::manager:/i.test(trimmed)) return true;
    if (/^\d{4}-\d{2}-\d{2}T.+\s+ERROR\s+codex_core::session:\s+failed to load skill/i.test(trimmed)) return true;
    if (/^<\/?(html|head|body|script|style|svg|path|meta|div|span|noscript)\b/i.test(trimmed)) return true;
    if (/cloudflare|challenge-platform|window\._cf_chl_opt|enable javascript and cookies/i.test(trimmed)) return true;
    return false;
  }

  function normalizeStreamChunk(raw: Buffer | string, opts: { dropCliNoise?: boolean } = {}): string {
    const { dropCliNoise = false } = opts;
    const input = typeof raw === "string" ? raw : decodeBufferChunk(raw);
    const normalized = input.replace(ANSI_ESCAPE_REGEX, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (!dropCliNoise) return normalized;

    return normalized
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^reading prompt from stdin\.{0,3}$/i.test(trimmed)) return false;
        if (CLI_SPINNER_LINE_REGEX.test(trimmed)) return false;
        if (isIgnorableCliNoiseLine(trimmed)) return false;
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  function hasStructuredJsonLines(raw: string): boolean {
    return raw.split(/\r?\n/).some((line) => line.trim().startsWith("{"));
  }

  return {
    ANSI_ESCAPE_REGEX,
    CLI_SPINNER_LINE_REGEX,
    cliOutputDedupCache,
    withCliPathFallback,
    buildAgentArgs,
    shouldSkipDuplicateCliOutput,
    clearCliOutputDedup,
    normalizeStreamChunk,
    hasStructuredJsonLines,
  };
}
