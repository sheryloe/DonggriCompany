import { describe, expect, it } from "vitest";
import { resolveProviderExecutionPolicy } from "./provider-policy-resolver.ts";

describe("resolveProviderExecutionPolicy", () => {
  it("uses providerModelConfig as execution policy fallback without canonical override", () => {
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

  it("falls back to providerModelConfig when canonical provider does not match selected provider", () => {
    expect(
      resolveProviderExecutionPolicy({
        provider: "claude",
        providerModelConfig: {
          claude: {
            model: "claude-opus-4-6",
            subModel: "claude-sonnet-4-6",
          },
        },
        canonicalOverride: {
          provider: "codex",
          model: "gpt-5.3-codex",
          reasoningLevel: "xhigh",
          subModel: "gpt-5.3-codex",
          subReasoningLevel: "xhigh",
        },
      }),
    ).toEqual({
      model: "claude-opus-4-6",
      reasoningLevel: undefined,
      subModel: "claude-sonnet-4-6",
      subModelReasoningLevel: undefined,
    });
  });
});
