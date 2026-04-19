import { getCanonicalSpecializationRegistry } from "../../../company/canonical-policy.ts";

export type CodexSubagentDepartment = "planning" | "dev" | "design" | "qa" | "devsecops" | "operations";

export interface CodexSubagentCatalogAgent {
  name: string;
  description: string;
  upstreamCategory: string;
  upstreamPath: string;
  department: CodexSubagentDepartment;
  family?: string;
  class_stage_1?: string;
  class_stage_2?: string;
  class_stage_3?: string;
}

export interface CodexSubagentCatalogSnapshot {
  sourceRepo: string;
  sourceRef: string;
  sourceUrl: string;
  generatedAt: string;
  total: number;
  departmentSummary: Record<string, number>;
  agents: CodexSubagentCatalogAgent[];
}

export function loadCodexSubagentCatalogSnapshot(): CodexSubagentCatalogSnapshot | null {
  try {
    const registry = getCanonicalSpecializationRegistry();
    return {
      sourceRepo: registry.sourceRepo,
      sourceRef: registry.sourceRef,
      sourceUrl: registry.sourceUrl,
      generatedAt: registry.generatedAt,
      total: registry.total,
      departmentSummary: registry.specializations.reduce<Record<string, number>>((summary, item) => {
        summary[item.department] = (summary[item.department] ?? 0) + 1;
        return summary;
      }, {}),
      agents: registry.specializations.map((item) => ({
        name: item.key,
        description: item.description,
        upstreamCategory: item.upstreamMetadata.upstreamCategory,
        upstreamPath: item.upstreamMetadata.upstreamPath,
        department: item.department as CodexSubagentDepartment,
        family: item.family,
        class_stage_1: item.classStageTree.stage1,
        class_stage_2: item.classStageTree.stage2,
        class_stage_3: item.classStageTree.stage3,
      })),
    };
  } catch {
    return null;
  }
}
