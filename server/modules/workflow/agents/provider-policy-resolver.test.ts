import { describe, expect, it } from "vitest";
import { resolveProviderExecutionPolicy } from "./provider-policy-resolver.ts";

describe("resolveProviderExecutionPolicy", () => {
  it("does not use providerModelConfig as execution policy source without canonical override", () => {
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
      model: undefined,
      reasoningLevel: undefined,
      subModel: undefined,
      subModelReasoningLevel: undefined,
    });
  });

  it("normalizes canonical override blanks to undefined", () => {
    expect(
      resolveProviderExecutionPolicy({
        provider: "claude",
        providerModelConfig: {},
        canonicalOverride: {
          model: "  ",
          reasoningLevel: "",
          subModel: "claude-sonnet-4-6",
          subReasoningLevel: "   ",
        },
      }),
    ).toEqual({
      model: undefined,
      reasoningLevel: undefined,
      subModel: "claude-sonnet-4-6",
      subModelReasoningLevel: undefined,
    });
  });

  it("prefers canonical override when provider matches", () => {
    expect(
      resolveProviderExecutionPolicy({
        provider: "codex",
        providerModelConfig: {
          codex: {
            model: "gpt-5.3-codex",
            reasoningLevel: "high",
            subModel: "gpt-5.3-codex",
            subModelReasoningLevel: "high",
          },
        },
        canonicalOverride: {
          provider: "codex",
          model: "gpt-5.4",
          reasoningLevel: "medium",
          subModel: "gpt-5.4-mini",
          subReasoningLevel: "low",
        },
      }),
    ).toEqual({
      model: "gpt-5.4",
      reasoningLevel: "medium",
      subModel: "gpt-5.4-mini",
      subModelReasoningLevel: "low",
    });
  });
});
