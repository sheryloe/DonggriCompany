export function detectResponseLanguage(input: string): "ko" | "en" | "ja" | "zh" {
  const sample = input.trim();
  const total = sample.replace(/\s/gu, "").length || 1;
  const ko = sample.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/gu)?.length ?? 0;
  const ja = sample.match(/[\u3040-\u30FF]/gu)?.length ?? 0;
  const zh = sample.match(/[\u4E00-\u9FFF]/gu)?.length ?? 0;

  if (ko / total > 0.15) {
    return "ko";
  }
  if (ja / total > 0.15) {
    return "ja";
  }
  if (zh / total > 0.3) {
    return "zh";
  }

  return "en";
}

export function trimToLength(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength)}\n...[truncated]`;
}

export function stripMarkdownFence(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json|typescript|tsx|javascript|js|ts|[\w-]+)?\n([\s\S]*?)\n```$/u);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function extractJsonObject<T>(input: string): T | undefined {
  const cleaned = stripMarkdownFence(input);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return undefined;
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return undefined;
    }
  }
}

export function buildTaskTitleFromPrompt(prompt: string, fallback: string): string {
  const singleLine = prompt
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.。!?！？]+$/u, "");

  if (!singleLine) {
    return fallback;
  }

  return singleLine.length > 72 ? `${singleLine.slice(0, 72).trim()}...` : singleLine;
}

export function formatBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
