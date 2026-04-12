export type AgentRunMode = "standard" | "plan";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function isCodexPlanModeEligible(input: {
  cliProvider: unknown;
  cliModel: unknown;
}): boolean {
  return normalizeText(input.cliProvider).toLowerCase() === "codex" && normalizeText(input.cliModel).length > 0;
}

export function normalizeAgentRunMode(value: unknown): AgentRunMode {
  return normalizeText(value).toLowerCase() === "plan" ? "plan" : "standard";
}

export function parseAgentRunModePayload(value: unknown): AgentRunMode | null | "__invalid__" {
  if (typeof value === "undefined") return null;
  if (value === null || value === "") return "standard";
  if (typeof value !== "string") return "__invalid__";
  const normalized = value.trim().toLowerCase();
  if (normalized === "standard" || normalized === "plan") return normalized;
  return "__invalid__";
}

export function resolveAgentRunMode(input: {
  runMode: unknown;
  cliProvider: unknown;
  cliModel: unknown;
}): AgentRunMode {
  const normalized = normalizeAgentRunMode(input.runMode);
  return normalized === "plan" && isCodexPlanModeEligible(input) ? "plan" : "standard";
}

export function buildAgentRunModePromptBlock(params: {
  runMode: unknown;
  cliProvider: unknown;
  cliModel: unknown;
  promptKind: "task" | "direct_reply";
  lang?: string | null;
}): string {
  if (!isCodexPlanModeEligible(params) || resolveAgentRunMode(params) !== "plan") return "";

  const lang = normalizeText(params.lang).toLowerCase();
  if (params.promptKind === "direct_reply") {
    if (lang.startsWith("ko")) {
      return [
        "[Codex Plan Mode]",
        "- 먼저 내부적으로 짧은 계획과 판단 기준을 세운 뒤 답변하세요.",
        "- 답변은 여전히 짧고 실용적으로 유지하세요.",
        "- 답변 방향이 크게 달라질 만큼 모호할 때만 짧게 되물으세요.",
      ].join("\n");
    }
    return [
      "[Codex Plan Mode]",
      "- Think plan-first internally before answering.",
      "- Keep the final reply concise and practical.",
      "- Ask a short clarifying question only when ambiguity would materially change the answer.",
    ].join("\n");
  }

  if (lang.startsWith("ko")) {
    return [
      "[Codex Plan Mode]",
      "- 작업을 시작하기 전에 내부 체크리스트와 실행 순서를 먼저 정하세요.",
      "- 요구사항이 크게 모호하면 짧게 질문하고, 그렇지 않으면 같은 세션에서 구현과 검증까지 끝내세요.",
      "- 별도 승인 대기 상태를 만들지 말고, 계획 후 바로 실행으로 이어가세요.",
    ].join("\n");
  }
  return [
    "[Codex Plan Mode]",
    "- Before execution, form an internal checklist and execution order.",
    "- If requirements are materially ambiguous, ask a short clarifying question; otherwise complete implementation and verification in the same session.",
    "- Do not stop at a separate approval stage; move from planning into execution directly.",
  ].join("\n");
}
