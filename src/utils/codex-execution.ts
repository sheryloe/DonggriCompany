import type { AgentRunMode, CliModelInfo, ReasoningLevelOption } from "../types";

export const DEFAULT_CODEX_REASONING_LEVELS: ReasoningLevelOption[] = [
  { effort: "low", description: "Fast" },
  { effort: "medium", description: "Balanced" },
  { effort: "high", description: "Thorough" },
  { effort: "xhigh", description: "Deep" },
];

export function getCodexReasoningOptions(model: CliModelInfo | null | undefined): ReasoningLevelOption[] {
  const options = model?.reasoningLevels ?? [];
  return options.length > 0 ? options : DEFAULT_CODEX_REASONING_LEVELS;
}

export function resolveCodexReasoningLevel(
  model: CliModelInfo | null | undefined,
  currentLevel: string | null | undefined,
): string {
  const options = getCodexReasoningOptions(model);
  if (currentLevel && options.some((option) => option.effort === currentLevel)) {
    return currentLevel;
  }

  const defaultLevel = String(model?.defaultReasoningLevel ?? "").trim();
  if (defaultLevel && options.some((option) => option.effort === defaultLevel)) {
    return defaultLevel;
  }

  return options[0]?.effort ?? "";
}

export function isCodexPlanModeEligible(
  cliProvider: string | null | undefined,
  cliModel: string | null | undefined,
): boolean {
  return String(cliProvider ?? "").trim() === "codex" && String(cliModel ?? "").trim().length > 0;
}

export function normalizeCodexRunMode(
  cliProvider: string | null | undefined,
  cliModel: string | null | undefined,
  runMode: AgentRunMode | null | undefined,
): AgentRunMode {
  return isCodexPlanModeEligible(cliProvider, cliModel) && runMode === "plan" ? "plan" : "standard";
}
