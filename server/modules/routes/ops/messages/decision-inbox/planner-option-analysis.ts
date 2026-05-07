import type { DecisionOption, DecisionOptionAnalysis, PlannerDecisionAnalysisQuality } from "./types.ts";

const OPTION_ANALYSIS_START = "[DECISION_OPTION_ANALYSIS_JSON]";
const OPTION_ANALYSIS_END = "[/DECISION_OPTION_ANALYSIS_JSON]";

export type PlannerOptionAnalysis = DecisionOptionAnalysis & {
  number: number;
  source: "planner";
};

export type ParsedPlannerDecisionAnalysis = {
  summary: string;
  options: PlannerOptionAnalysis[];
  optionsByNumber: Map<number, PlannerOptionAnalysis>;
  quality: PlannerDecisionAnalysisQuality;
};

function normalizeText(value: unknown, max = 480): string {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function normalizeSummary(value: unknown, max = 1800): string {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function normalizeOptionNumber(value: unknown): number | null {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number <= 0 || number > 99) return null;
  return number;
}

function parseJsonObject(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractMarkedJson(raw: string): string | null {
  const start = raw.indexOf(OPTION_ANALYSIS_START);
  const end = raw.indexOf(OPTION_ANALYSIS_END);
  if (start < 0 || end <= start) return null;
  return raw.slice(start + OPTION_ANALYSIS_START.length, end).trim();
}

function removeMarkedJson(raw: string): string {
  const start = raw.indexOf(OPTION_ANALYSIS_START);
  const end = raw.indexOf(OPTION_ANALYSIS_END);
  if (start < 0 || end <= start) return raw;
  return `${raw.slice(0, start)}${raw.slice(end + OPTION_ANALYSIS_END.length)}`.trim();
}

function extractObjectJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.includes("{") || !trimmed.includes("}")) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function parseOptionAnalyses(parsed: unknown): PlannerOptionAnalysis[] {
  const options = Array.isArray((parsed as { options?: unknown })?.options)
    ? ((parsed as { options?: unknown[] }).options ?? [])
    : [];
  const out: PlannerOptionAnalysis[] = [];
  const seen = new Set<number>();
  for (const option of options) {
    const number = normalizeOptionNumber((option as { number?: unknown })?.number);
    if (!number || seen.has(number)) continue;
    const rationale = normalizeText((option as { rationale?: unknown })?.rationale);
    const expected_result = normalizeText(
      (option as { expected_result?: unknown; expectedResult?: unknown })?.expected_result ??
        (option as { expectedResult?: unknown })?.expectedResult,
    );
    const risk = normalizeText((option as { risk?: unknown })?.risk);
    const follow_up = normalizeText(
      (option as { follow_up?: unknown; followUp?: unknown })?.follow_up ??
        (option as { followUp?: unknown })?.followUp,
    );
    if (!rationale || !expected_result || !risk || !follow_up) continue;
    seen.add(number);
    out.push({
      number,
      rationale,
      expected_result,
      risk,
      follow_up,
      source: "planner",
    });
  }
  return out;
}

function uniqueOptionNumbers(values: number[]): number[] {
  return [...new Set(values.filter((number) => Number.isFinite(number) && number > 0))].sort((a, b) => a - b);
}

function buildPlannerAnalysisQuality(input: {
  hasJsonBlock: boolean;
  invalidJson: boolean;
  expectedOptionNumbers: number[];
  options: PlannerOptionAnalysis[];
}): PlannerDecisionAnalysisQuality {
  const expectedOptionNumbers = uniqueOptionNumbers(input.expectedOptionNumbers);
  const plannerOptionNumbers = uniqueOptionNumbers(input.options.map((option) => option.number));
  const expectedOptionCount = expectedOptionNumbers.length;
  const coveredOptionNumbers = expectedOptionNumbers.filter((number) => plannerOptionNumbers.includes(number));
  const missingOptionNumbers = expectedOptionNumbers.filter((number) => !plannerOptionNumbers.includes(number));
  const coverageRatio =
    expectedOptionCount > 0 ? Math.round((coveredOptionNumbers.length / expectedOptionCount) * 100) / 100 : 0;
  const status: PlannerDecisionAnalysisQuality["status"] =
    expectedOptionCount <= 0
      ? "not_applicable"
      : input.invalidJson
        ? "invalid"
        : plannerOptionNumbers.length <= 0
          ? "missing"
          : missingOptionNumbers.length > 0
            ? "partial"
            : "complete";

  return {
    status,
    expected_option_count: expectedOptionCount,
    planner_option_count: plannerOptionNumbers.length,
    covered_option_count: coveredOptionNumbers.length,
    coverage_ratio: coverageRatio,
    missing_option_numbers: missingOptionNumbers,
    has_json_block: input.hasJsonBlock,
    invalid_json: input.invalidJson,
  };
}

export function extractPlannerDecisionAnalysis(
  raw: string | null | undefined,
  expectedOptionNumbers: number[] = [],
): ParsedPlannerDecisionAnalysis {
  const input = normalizeSummary(raw ?? "");
  const markedJson = extractMarkedJson(input);
  const objectJson = markedJson ?? extractObjectJson(input);
  const parsed = objectJson ? parseJsonObject(objectJson) : null;
  const options = parsed ? parseOptionAnalyses(parsed) : [];
  const parsedSummary = normalizeSummary((parsed as { summary?: unknown } | null)?.summary ?? "");
  const fallbackSummary = normalizeSummary(markedJson ? removeMarkedJson(input) : input);
  const summary = parsedSummary || fallbackSummary;
  return {
    summary,
    options,
    optionsByNumber: new Map(options.map((option) => [option.number, option])),
    quality: buildPlannerAnalysisQuality({
      hasJsonBlock: Boolean(objectJson),
      invalidJson: Boolean(objectJson && !parsed),
      expectedOptionNumbers,
      options,
    }),
  };
}

export function serializePlannerDecisionAnalysis(summary: string, options: PlannerOptionAnalysis[]): string {
  const cleanSummary = normalizeSummary(summary);
  if (options.length <= 0) return cleanSummary;
  const payload = JSON.stringify({
    options: options.map((option) => ({
      number: option.number,
      rationale: option.rationale,
      expected_result: option.expected_result,
      risk: option.risk,
      follow_up: option.follow_up,
    })),
  });
  return `${cleanSummary}\n\n${OPTION_ANALYSIS_START}\n${payload}\n${OPTION_ANALYSIS_END}`.trim();
}

export function applyPlannerOptionAnalysis<T extends DecisionOption>(
  options: T[],
  rawPlannerSummary: string | null | undefined,
): T[] {
  const { optionsByNumber } = extractPlannerDecisionAnalysis(
    rawPlannerSummary,
    options.map((option) => option.number),
  );
  if (optionsByNumber.size <= 0) return options;
  return options.map((option) => {
    const plannerAnalysis = optionsByNumber.get(option.number);
    if (!plannerAnalysis) return option;
    return {
      ...option,
      analysis: plannerAnalysis,
    } as T;
  });
}
