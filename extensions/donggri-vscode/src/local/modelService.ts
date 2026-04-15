import * as vscode from "vscode";
import type { FixSuggestion, LocalReviewRequest, PromptContextSnapshot } from "../types";
import { buildFixPrompt, buildReviewPrompt, buildTerminalSummaryPrompt } from "./promptBuilders";
import { extractJsonObject, stripMarkdownFence } from "../util/text";

type ModelLike = vscode.LanguageModelChat;

type FixPayload = {
  summary?: string;
  replacement?: string;
  why?: string[];
};

async function consumeResponse(
  response: Awaited<ReturnType<ModelLike["sendRequest"]>>,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  let text = "";
  for await (const chunk of response.text) {
    const value = String(chunk);
    text += value;
    onChunk?.(value);
  }
  return text;
}

export async function selectDefaultModel(): Promise<ModelLike | undefined> {
  const selectors: Array<Record<string, string>> = [{ vendor: "copilot" }, {}];

  for (const selector of selectors) {
    const models = await vscode.lm.selectChatModels(selector);
    if (models.length > 0) {
      return models[0];
    }
  }

  return undefined;
}

export async function runReviewWithModel(
  model: ModelLike,
  request: LocalReviewRequest,
  context: PromptContextSnapshot,
  token: vscode.CancellationToken,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const response = await model.sendRequest(
    [vscode.LanguageModelChatMessage.User(buildReviewPrompt(request, context))],
    {},
    token,
  );

  return consumeResponse(response, onChunk);
}

export async function runFixWithModel(
  model: ModelLike,
  request: LocalReviewRequest,
  context: PromptContextSnapshot,
  applyable: boolean,
  token: vscode.CancellationToken,
): Promise<FixSuggestion> {
  const response = await model.sendRequest(
    [vscode.LanguageModelChatMessage.User(buildFixPrompt(request, context, applyable))],
    {},
    token,
  );

  const rawText = await consumeResponse(response);
  if (!applyable) {
    return {
      summary: "Edit proposal prepared.",
      why: [],
      rawText,
      applyable: false,
    };
  }

  const parsed = extractJsonObject<FixPayload>(rawText);
  if (parsed?.replacement) {
    return {
      summary: parsed.summary?.trim() || "Edit proposal prepared.",
      replacement: parsed.replacement,
      why: Array.isArray(parsed.why) ? parsed.why.filter((entry): entry is string => typeof entry === "string") : [],
      rawText,
      applyable: true,
    };
  }

  return {
    summary: "Edit proposal prepared.",
    replacement: stripMarkdownFence(rawText),
    why: [],
    rawText,
    applyable: true,
  };
}

export async function summarizeTerminalWithModel(
  model: ModelLike,
  taskTitle: string,
  terminalText: string,
  hints: string[],
  responseLanguage: LocalReviewRequest["responseLanguage"],
  token: vscode.CancellationToken,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const response = await model.sendRequest(
    [
      vscode.LanguageModelChatMessage.User(
        buildTerminalSummaryPrompt(taskTitle, terminalText, hints, responseLanguage),
      ),
    ],
    {},
    token,
  );

  return consumeResponse(response, onChunk);
}
