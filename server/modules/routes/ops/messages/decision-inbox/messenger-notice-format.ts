import type { RuntimeContext } from "../../../../../types/runtime-context.ts";
import type { DecisionInboxRouteItem } from "./types.ts";

type NoticeFormatterDeps = {
  getPreferredLanguage: RuntimeContext["getPreferredLanguage"];
  normalizeTextField: RuntimeContext["normalizeTextField"];
};

export function createDecisionNoticeFormatter(deps: NoticeFormatterDeps) {
  const { getPreferredLanguage, normalizeTextField } = deps;

  function pickDecisionL10n(ko: string, en: string): string {
    void en;
    void getPreferredLanguage;
    return ko;
  }

  function truncateLine(value: string, max = 220): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 3).trimEnd()}...`;
  }

  function summarizeDecisionText(value: string, max = 120): string {
    const normalized = value.replace(/\s+/g, " ").replace(/[*`]+/g, "").trim();
    if (!normalized) return "-";
    return truncateLine(normalized.replace(/^[-\s]+/, ""), max);
  }

  function splitDecisionLabel(raw: string): { title: string; detail: string } {
    const cleaned = summarizeDecisionText(raw, 240);
    const colonMatch = cleaned.match(/^([^:：]{1,48})[:：]\s*(.+)$/);
    if (!colonMatch) return { title: cleaned, detail: "" };
    return {
      title: summarizeDecisionText(colonMatch[1] || "", 48),
      detail: summarizeDecisionText(colonMatch[2] || "", 220),
    };
  }

  function isSkipOption(option: { action?: string; label?: string }): boolean {
    const source = `${option.label || ""} ${option.action || ""}`;
    return /skip|next|다음|건너|보류/i.test(source);
  }

  function summarizeDecisionOptionStance(input: string): string {
    const text = summarizeDecisionText(input, 220);
    if (!text || text === "-") return pickDecisionL10n("세부 내용 확인", "Check details");
    if (/skip|next|다음|건너|보류/i.test(text)) return pickDecisionL10n("다음 라운드로 이동", "Move to next round");
    if (/hold|pending|rework|remediation|보완|수정|재작업|추가/i.test(text))
      return pickDecisionL10n("보완 후 재검토", "Remediate then review");
    if (/approve|approved|ready|merge|go\b|승인|진행|완료/i.test(text))
      return pickDecisionL10n("승인/즉시 진행 가능", "Approved / ready now");
    const firstClause = text.split(/(?<=[.!?。])\s+|[,，]\s+/)[0] || text;
    return truncateLine(firstClause, 70);
  }

  function extractSummaryClauses(summary: string, maxClauses = 4): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();
    const clauses = summary
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?。])\s+/))
      .map((line) => summarizeDecisionText(line, 220))
      .filter((line) => line && line !== "-");
    for (const clause of clauses) {
      const key = clause.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(clause);
      if (deduped.length >= maxClauses) break;
    }
    return deduped;
  }

  function buildPlannerSummaryLines(item: DecisionInboxRouteItem): string[] {
    const lines: string[] = [];
    const summaryClauses = extractSummaryClauses(item.summary || "", 3);
    if (summaryClauses.length > 0) lines.push(truncateLine(summaryClauses[0] || "", 95));
    const nonSkipOptions = item.options.filter((option) => !isSkipOption(option));
    for (const option of nonSkipOptions.slice(0, 3)) {
      const { title, detail } = splitDecisionLabel(option.label || option.action || "-");
      lines.push(truncateLine(`${title} - ${summarizeDecisionOptionStance(detail || title)}`, 95));
    }
    if (lines.length < 3) {
      lines.push(
        truncateLine(
          pickDecisionL10n(
            `총 ${item.options.length}개 선택지 중 우선순위를 골라 회신하면 즉시 반영합니다.`,
            `Choose priority option(s) from ${item.options.length} choices to apply immediately.`,
          ),
          95,
        ),
      );
    }
    return lines.slice(0, 5);
  }

  function parseRecommendedOptionNumbers(summary: string, validOptions: Array<{ number: number }>): number[] {
    const valid = new Set(validOptions.map((option) => option.number));
    const numbers: number[] = [];
    for (const match of summarizeDecisionText(summary || "", 1200).matchAll(/[1-9]\d?/g)) {
      const picked = Number.parseInt(match[0] || "", 10);
      if (valid.has(picked) && !numbers.includes(picked)) numbers.push(picked);
      if (numbers.length >= 5) break;
    }
    return numbers;
  }

  function resolveRecommendedOptions(item: DecisionInboxRouteItem): Array<{ number: number; title: string }> {
    const options = item.options;
    if (options.length <= 0) return [];
    const fromSummaryNumbers = parseRecommendedOptionNumbers(item.summary || "", options);
    if (fromSummaryNumbers.length > 0) {
      return fromSummaryNumbers
        .map((number) => options.find((option) => option.number === number) || null)
        .filter((option): option is (typeof options)[number] => option !== null)
        .map((option) => ({
          number: option.number,
          title: truncateLine(splitDecisionLabel(option.label || option.action || "-").title, 42),
        }));
    }
    const fallback = options.find((option) => !isSkipOption(option)) || options[0] || null;
    if (!fallback) return [];
    return [
      {
        number: fallback.number,
        title: truncateLine(splitDecisionLabel(fallback.label || fallback.action || "-").title, 42),
      },
    ];
  }

  function buildDecisionOptionPreview(option: { number: number; label: string; action: string }): string {
    const { title, detail } = splitDecisionLabel(option.label || option.action || "-");
    return `${option.number}. ${truncateLine(`${title}: ${summarizeDecisionOptionStance(detail || title)}`, 92)}`;
  }

  function resolvePlanningLeadName(item: DecisionInboxRouteItem): string {
    const lang = getPreferredLanguage();
    return lang === "ko"
      ? normalizeTextField(item.agent_name_ko) || normalizeTextField(item.agent_name) || "기획 리드"
      : normalizeTextField(item.agent_name) || normalizeTextField(item.agent_name_ko) || "Planning Lead";
  }

  function buildDecisionMessengerNotice(item: DecisionInboxRouteItem): string {
    const projectLabel =
      normalizeTextField(item.project_name) ||
      normalizeTextField(item.project_path) ||
      normalizeTextField(item.project_id) ||
      "-";
    const taskLabel = normalizeTextField(item.task_title);
    const plannerSummaryLines = buildPlannerSummaryLines(item);
    const recommendedOptions = resolveRecommendedOptions(item);
    const recommendedNumbers = recommendedOptions.map((option) => option.number).join(",");
    const planningLeadName = resolvePlanningLeadName(item);
    const options = item.options.slice(0, 8).map((option) => buildDecisionOptionPreview(option));
    const defaultOption = String(item.options[0]?.number ?? options[0]?.match(/^(\d+)/)?.[1] ?? 1);
    const isMultiPick =
      item.kind === "review_round_pick" &&
      item.options.some(
        (option) => option.action === "apply_review_pick" || option.action === "apply_selected_feedback",
      );
    const replyGuide =
      options.length > 0
        ? pickDecisionL10n(
            isMultiPick
              ? `회신: 번호를 하나 또는 여러 개 보내주세요. 예: ${defaultOption} 또는 ${defaultOption},3`
              : `회신: 숫자만 보내주세요. 예: ${defaultOption}`,
            isMultiPick
              ? `Reply: send one or multiple option numbers (e.g., ${defaultOption} or ${defaultOption},3)`
              : `Reply: send only the option number (e.g., ${defaultOption})`,
          )
        : pickDecisionL10n("회신: 선택 번호를 보내주세요.", "Reply with an option number");
    const lines = [
      pickDecisionL10n("의사결정 요청", "Decision Request"),
      `${pickDecisionL10n("프로젝트", "Project")}: ${projectLabel}`,
      ...(taskLabel ? [`${pickDecisionL10n("작업", "Task")}: ${truncateLine(taskLabel, 140)}`] : []),
      `${pickDecisionL10n("기획 리드 요약", "Planning lead summary")}:`,
      ...plannerSummaryLines.map((line) => `- ${line}`),
      ...(options.length > 0 ? [`${pickDecisionL10n("선택지", "Options")}:`, ...options] : []),
      `ID: [DECISION:${item.id}]`,
      replyGuide,
      ...(recommendedOptions.length > 0
        ? [
            `${pickDecisionL10n("기획 리드", "Planning lead")} ${planningLeadName}: ${pickDecisionL10n(`제 추천은 ${recommendedNumbers}번입니다.`, `My recommendation: option ${recommendedNumbers}.`)}`,
            `${pickDecisionL10n("추천 선택지", "Recommended options")}: ${recommendedNumbers}`,
          ]
        : []),
    ];
    return lines.join("\n");
  }

  return { buildDecisionMessengerNotice };
}
