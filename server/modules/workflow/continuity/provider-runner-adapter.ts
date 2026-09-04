export type ProviderRunnerProvider = "codex" | "claude";
export type ProviderRunnerMode = "start" | "resume";

export interface ProviderRunnerCommandInput {
  provider: ProviderRunnerProvider;
  mode: ProviderRunnerMode;
  provider_native_session_id?: string | null;
  model?: string;
  reasoning_level?: "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
}

export interface ProviderRunnerCommand {
  command: ProviderRunnerProvider;
  args: string[];
}

export interface ProviderRunnerEvent {
  provider: ProviderRunnerProvider;
  kind: "session_started" | "progress" | "completed" | "failed" | "unknown";
  provider_event_type: string;
  provider_native_session_id: string | null;
}

type JsonRecord = Record<string, unknown>;
const PROVIDER_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function optionalArgument(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (/\r|\n|\0/.test(normalized)) throw new Error("continuity_provider_argument_invalid");
  return normalized;
}

function resumeSessionId(input: ProviderRunnerCommandInput): string | null {
  const sessionId = optionalArgument(input.provider_native_session_id ?? undefined);
  if (input.mode === "resume" && !sessionId) throw new Error("continuity_provider_native_session_id_required");
  if (input.mode === "start" && sessionId) throw new Error("continuity_start_must_not_reuse_native_session");
  if (sessionId && !PROVIDER_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("continuity_provider_native_session_id_invalid");
  }
  return sessionId;
}

export function buildProviderRunnerCommand(input: ProviderRunnerCommandInput): ProviderRunnerCommand {
  const sessionId = resumeSessionId(input);
  const model = optionalArgument(input.model);

  if (input.provider === "codex") {
    const args: string[] = [];
    if (model) args.push("-m", model);
    if (input.reasoning_level) args.push("-c", `model_reasoning_effort="${input.reasoning_level}"`);
    args.push("--ask-for-approval", "never", "--sandbox", "workspace-write", "exec");
    if (input.mode === "resume") args.push("resume");
    args.push("--json");
    if (sessionId) args.push(sessionId);
    return { command: "codex", args };
  }

  const args = [
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
  if (input.reasoning_level) {
    if (input.reasoning_level === "ultra") throw new Error("continuity_claude_effort_unsupported");
    args.push("--effort", input.reasoning_level);
  }
  if (sessionId) args.push("--resume", sessionId);
  return { command: "claude", args };
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRecord(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return record(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function codexKind(type: string): ProviderRunnerEvent["kind"] {
  if (type === "thread.started") return "session_started";
  if (type === "turn.completed") return "completed";
  if (type === "error" || type.endsWith(".failed")) return "failed";
  if (type.startsWith("turn.") || type.startsWith("item.")) return "progress";
  return "unknown";
}

function claudeKind(type: string, subtype: string | null, value: JsonRecord): ProviderRunnerEvent["kind"] {
  if (type === "system" && subtype === "init") return "session_started";
  if (type === "result") return value.is_error === true || subtype === "error" ? "failed" : "completed";
  if (type === "error") return "failed";
  if (["assistant", "user", "stream_event", "system"].includes(type)) return "progress";
  return "unknown";
}

export function parseProviderRunnerEvent(
  provider: ProviderRunnerProvider,
  line: string,
): ProviderRunnerEvent | null {
  const value = parseRecord(line);
  if (!value) return null;
  const type = stringValue(value.type);
  if (!type) return null;

  if (provider === "codex") {
    return {
      provider,
      kind: codexKind(type),
      provider_event_type: type,
      provider_native_session_id: stringValue(value.thread_id),
    };
  }

  const subtype = stringValue(value.subtype);
  return {
    provider,
    kind: claudeKind(type, subtype, value),
    provider_event_type: subtype ? `${type}:${subtype}` : type,
    provider_native_session_id: stringValue(value.session_id),
  };
}
