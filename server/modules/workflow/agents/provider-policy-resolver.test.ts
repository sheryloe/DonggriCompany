import { describe, expect, it } from "vitest";
import { resolveProviderExecutionPolicy } from "./provider-policy-resolver.ts";

describe("resolveProviderExecutionPolicy", () => {
  it("returns main and sub-agent policy fields from provider config", () => {
    expect(
      resolveProviderExecutionPolicy({
        provider: "codex",
        providerModelConfig: {
          codex: {
            model: "gpt-5.4",
            reasoningLevel: "medium",
            subModel: "gpt-5.4-mini",
            subModelReasoningLevel: "high",
          },
        },
      }),
    ).toEqual({
      model: "gpt-5.4",
      reasoningLevel: "medium",
      subModel: "gpt-5.4-mini",
      subModelReasoningLevel: "high",
    });
  });

  it("normalizes missing or blank values to undefined", () => {
    expect(
      resolveProviderExecutionPolicy({
        provider: "claude",
        providerModelConfig: {
          claude: {
            model: "  ",
            reasoningLevel: "",
            subModel: "claude-sonnet-4-6",
            subModelReasoningLevel: "   ",
          },
        },
      }),
    ).toEqual({
      model: undefined,
      reasoningLevel: undefined,
      subModel: "claude-sonnet-4-6",
      subModelReasoningLevel: undefined,
    });
  });
});
