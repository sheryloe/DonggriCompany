import {
  CANONICAL_PACK_KEYS,
  CANONICAL_PACK_SOURCES,
  type CanonicalPackKey,
  type CanonicalPackSource,
} from "./canonical-profiles.ts";

export const WORKFLOW_PACK_KEYS = CANONICAL_PACK_KEYS;

export type WorkflowPackKey = CanonicalPackKey;

export const DEFAULT_WORKFLOW_PACK_KEY: WorkflowPackKey = "development";

export function isWorkflowPackKey(value: unknown): value is WorkflowPackKey {
  return typeof value === "string" && (WORKFLOW_PACK_KEYS as readonly string[]).includes(value);
}

export type WorkflowPackSeed = {
  key: WorkflowPackKey;
  name: string;
  inputSchema: Record<string, unknown>;
  promptPreset: Record<string, unknown>;
  qaRules: Record<string, unknown>;
  outputTemplate: Record<string, unknown>;
  routingKeywords: string[];
  costProfile: Record<string, unknown>;
};

function toWorkflowPackSeed(source: CanonicalPackSource): WorkflowPackSeed {
  return {
    key: source.key,
    name: source.name,
    inputSchema: source.inputSchema,
    promptPreset: source.promptPreset,
    qaRules: source.qaRules,
    outputTemplate: source.outputTemplate,
    routingKeywords: source.routingKeywords,
    costProfile: source.costProfile,
  };
}

export const DEFAULT_WORKFLOW_PACK_SEEDS: WorkflowPackSeed[] = CANONICAL_PACK_SOURCES.map(toWorkflowPackSeed);
