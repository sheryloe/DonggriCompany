const ANSI_ESCAPE_REGEX = /\u001b(?:\[[0-?]*[ -/]*[@-~]|][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const SUBTASK_EN_REGEX = /^sub[\s_-]*task(?:\s*title)?\s*(\d+)?$/i;
const COMPLETED_SUBTASK_EN_REGEX = /^(?:done|complete|completed)\s*sub[\s_-]*task(?:\s*title)?\s*(\d+)?$/i;
const SUBTASK_KO_REGEX = /^(?:완료된\s*)?서브태스크(?:\s*제목)?\s*(\d+)?$/u;
const MOJIBAKE_FRAGMENT_REGEX = /(\uFFFD|\?쒕툕|쒕툕|\?쒖뒪|쒖뒪|\?쒕ぉ|\?{2,})/u;
const DONE_TOKEN_REGEX = /(done|complete|completed|완료|\?꾨즺|꾨즺)/i;
const SUBTASK_TOKEN_REGEX = /(sub[\s_-]*task|서브태스크|\?쒕툕|쒕툕)/i;

function sanitizeRawText(input: unknown): string {
  const raw = String(input ?? "");
  return raw
    .replace(ANSI_ESCAPE_REGEX, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTrailingNumber(value: string): string | null {
  const match = value.match(/(\d+)\s*$/);
  return match?.[1] ?? null;
}

function formatSubtaskTitle(value: string): string {
  const number = extractTrailingNumber(value);
  return number ? `서브태스크 제목${number}` : "서브태스크 제목";
}

function formatCompletedSubtaskTitle(value: string): string {
  const number = extractTrailingNumber(value);
  return number ? `완료된 서브태스크 제목${number}` : "완료된 서브태스크 제목";
}

function shouldRepairAsMojibake(value: string): boolean {
  if (!value) return false;
  if (MOJIBAKE_FRAGMENT_REGEX.test(value)) return true;
  if (value.includes("?")) {
    const qCount = (value.match(/\?/g) ?? []).length;
    if (qCount >= 3 && SUBTASK_TOKEN_REGEX.test(value)) return true;
  }
  return false;
}

export function normalizeSubtaskTitleForUi(input: unknown): string {
  const value = sanitizeRawText(input);
  if (!value) return "Subtask";

  if (COMPLETED_SUBTASK_EN_REGEX.test(value)) return formatCompletedSubtaskTitle(value);
  if (SUBTASK_EN_REGEX.test(value)) return formatSubtaskTitle(value);

  if (SUBTASK_KO_REGEX.test(value)) {
    return DONE_TOKEN_REGEX.test(value) ? formatCompletedSubtaskTitle(value) : formatSubtaskTitle(value);
  }

  if (shouldRepairAsMojibake(value) && SUBTASK_TOKEN_REGEX.test(value)) {
    return DONE_TOKEN_REGEX.test(value) ? formatCompletedSubtaskTitle(value) : formatSubtaskTitle(value);
  }

  return value;
}
