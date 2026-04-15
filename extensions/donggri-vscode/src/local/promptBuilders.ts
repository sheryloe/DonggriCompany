import type { LocalReviewRequest, PromptContextSnapshot, PromoteToTaskInput } from "../types";
import { formatBulletList } from "../util/text";

function responseLanguageLabel(language: LocalReviewRequest["responseLanguage"]): string {
  switch (language) {
    case "ko":
      return "Korean";
    case "ja":
      return "Japanese";
    case "zh":
      return "Chinese";
    default:
      return "English";
  }
}

function buildContextBlock(context: PromptContextSnapshot): string {
  const sections = [
    context.workspaceFolderPath ? `[Workspace]\n${context.workspaceFolderPath}` : "",
    context.filePath ? `[File]\n${context.filePath}` : "",
    context.languageId ? `[Language]\n${context.languageId}` : "",
    context.selectionText ? `[Selection]\n${context.selectionText}` : "",
    context.activeFileText ? `[Active File]\n${context.activeFileText}` : "",
    context.workingDiff ? `[Working Diff]\n${context.workingDiff}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function buildReviewPrompt(request: LocalReviewRequest, context: PromptContextSnapshot): string {
  return [
    `Respond in ${responseLanguageLabel(request.responseLanguage)}.`,
    "You are operating inside a VS Code extension for real software work.",
    "Focus on concrete code quality, correctness risks, missing edge cases, and the shortest safe next step.",
    "Keep the response scannable with short markdown bullets.",
    `[Mode]\n${request.mode}`,
    `[User Request]\n${request.prompt || "Review the current context."}`,
    buildContextBlock(context),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildFixPrompt(
  request: LocalReviewRequest,
  context: PromptContextSnapshot,
  applyable: boolean,
): string {
  if (!applyable) {
    return [
      `Respond in ${responseLanguageLabel(request.responseLanguage)}.`,
      "Review the code and return a concise markdown fix plan.",
      "Do not return JSON in this case.",
      `[User Request]\n${request.prompt || "Suggest the safest fix for the current code context."}`,
      buildContextBlock(context),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "Return strict JSON only.",
    'Use exactly this schema: {"summary":"string","replacement":"string","why":["string"]}',
    "The replacement must contain only the text that should replace the current selection or file target.",
    `Respond in ${responseLanguageLabel(request.responseLanguage)} inside the summary and why values.`,
    `[User Request]\n${request.prompt || "Apply the safest fix for the current code context."}`,
    buildContextBlock(context),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTaskDescription(input: PromoteToTaskInput): string {
  const contextBullets = [
    input.context.filePath ? `File: ${input.context.filePath}` : "",
    input.context.relativePath ? `Relative path: ${input.context.relativePath}` : "",
    input.context.selectionText ? "Selection captured: yes" : "Selection captured: no",
    input.context.workingDiff ? "Working diff captured: yes" : "Working diff captured: no",
  ].filter(Boolean);

  return [
    `[Requested Outcome]\n${input.prompt}`,
    `[Workspace Binding]\nProject: ${input.binding.projectName}\nPath: ${input.binding.projectPath}\nCore goal: ${input.binding.projectContext}`,
    `[Captured Context]\n${formatBulletList(contextBullets)}`,
    input.context.selectionText ? `[Selection]\n${input.context.selectionText}` : "",
    input.context.workingDiff ? `[Working Diff]\n${input.context.workingDiff}` : "",
    input.context.activeFileText ? `[Active File]\n${input.context.activeFileText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTerminalSummaryPrompt(
  taskTitle: string,
  terminalText: string,
  hints: string[],
  language: LocalReviewRequest["responseLanguage"],
): string {
  return [
    `Respond in ${responseLanguageLabel(language)}.`,
    "Summarize the execution state in 4 bullets max.",
    "Include blockers, probable next step, and whether the task looks healthy.",
    `[Task]\n${taskTitle}`,
    hints.length > 0 ? `[Progress Hints]\n${formatBulletList(hints)}` : "",
    `[Terminal]\n${terminalText || "(empty)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
