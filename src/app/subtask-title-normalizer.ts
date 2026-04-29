const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_ESCAPE_REGEX = new RegExp(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|][^${BEL}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`,
  "g",
);
const SUBTASK_EN_REGEX = /^sub[\s_-]*task(?:\s*title)?\s*(\d+)?$/i;
const COMPLETED_SUBTASK_EN_REGEX = /^(?:done|complete|completed)\s*sub[\s_-]*task(?:\s*title)?\s*(\d+)?$/i;
const SUBTASK_KO_REGEX = /^(?:\uC644\uB8CC\uB41C\s*)?\uC11C\uBE0C\uD0DC\uC2A4\uD06C(?:\s*\uC81C\uBAA9)?\s*(\d+)?$/u;
// Intentionally keeps mojibake repair tokens so old corrupted task titles can be normalized.
const MOJIBAKE_FRAGMENT_REGEX = /(\uFFFD|\?쒕툕|쒕툕|\?쒖뒪|쒖뒪|\?쒕ぉ|\?꾨즺|꾨즺|\?뺥닏|뺥닏|\?{2,})/u;
const DONE_TOKEN_REGEX = /(done|complete|completed|\uC644\uB8CC|\?꾨즺|꾨즺|\?袁⑥┷|袁⑥┷)/i;
const SUBTASK_TOKEN_REGEX = /(sub[\s_-]*task|\uC11C\uBE0C\uD0DC\uC2A4\uD06C|\?쒕툕|쒕툕|\?쒖뒪|쒖뒪|\?뺥닏|뺥닏)/i;

const SUBTASK_LABEL = "\uC11C\uBE0C\uD0DC\uC2A4\uD06C";
const TITLE_LABEL = "\uC81C\uBAA9";
const COMPLETED_LABEL = "\uC644\uB8CC\uB41C";

function sanitizeRawText(input: unknown): string {
  const raw = String(input ?? "");
  return raw.replace(ANSI_ESCAPE_REGEX, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function extractTrailingNumber(value: string): string | null {
  const match = value.match(/(\d+)\s*$/);
  return match?.[1] ?? null;
}

function formatSubtaskTitle(value: string): string {
  const number = extractTrailingNumber(value);
  return number ? `${SUBTASK_LABEL} ${TITLE_LABEL}${number}` : `${SUBTASK_LABEL} ${TITLE_LABEL}`;
}

function formatCompletedSubtaskTitle(value: string): string {
  const number = extractTrailingNumber(value);
  return number
    ? `${COMPLETED_LABEL} ${SUBTASK_LABEL} ${TITLE_LABEL}${number}`
    : `${COMPLETED_LABEL} ${SUBTASK_LABEL} ${TITLE_LABEL}`;
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
