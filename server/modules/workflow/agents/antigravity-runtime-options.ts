export type AntigravityRuntimeOptions = {
  continueConversation?: boolean;
  antigravityConversationId?: string | null;
  antigravityProjectId?: string | null;
};

type JsonRecord = Record<string, unknown>;

function parseWorkflowMeta(raw: unknown): JsonRecord {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as JsonRecord;
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function nestedValue(root: JsonRecord, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

function readString(root: JsonRecord, paths: string[][]): string | null {
  for (const path of paths) {
    const value = nestedValue(root, path);
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (text) return text;
  }
  return null;
}

function readBoolean(root: JsonRecord, paths: string[][]): boolean | null {
  for (const path of paths) {
    const value = nestedValue(root, path);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (/^(1|true|yes|on)$/.test(normalized)) return true;
      if (/^(0|false|no|off)$/.test(normalized)) return false;
    }
  }
  return null;
}

export function resolveAntigravityRuntimeOptions(input: {
  provider: string;
  workflowMetaJson?: unknown;
  continuationContext?: string | null;
}): AntigravityRuntimeOptions | undefined {
  if (input.provider !== "antigravity") return undefined;

  const meta = parseWorkflowMeta(input.workflowMetaJson);
  const conversationId = readString(meta, [
    ["antigravity", "conversation_id"],
    ["antigravity", "conversationId"],
    ["agy", "conversation_id"],
    ["agy", "conversationId"],
    ["antigravity_conversation_id"],
    ["agy_conversation_id"],
  ]);
  const projectId = readString(meta, [
    ["antigravity", "project_id"],
    ["antigravity", "projectId"],
    ["agy", "project_id"],
    ["agy", "projectId"],
    ["antigravity_project_id"],
    ["agy_project_id"],
  ]);
  const explicitContinue = readBoolean(meta, [
    ["antigravity", "continue"],
    ["antigravity", "continueConversation"],
    ["agy", "continue"],
    ["agy", "continueConversation"],
    ["antigravity_continue"],
    ["agy_continue"],
  ]);
  const hasContinuationContext = Boolean(String(input.continuationContext ?? "").trim());

  return {
    continueConversation: conversationId ? false : (explicitContinue ?? hasContinuationContext),
    antigravityConversationId: conversationId,
    antigravityProjectId: projectId,
  };
}
