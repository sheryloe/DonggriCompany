import { getCanonicalStageRank, resolveCanonicalIdentity } from "./canonical-identity.ts";

type CanonicalAuthorityAgent = {
  id: string;
  name?: string | null;
  status?: string | null;
  department_id?: string | null;
  cli_provider?: string | null;
  workflow_profile?: unknown;
  family?: string | null;
  career_stage?: string | null;
  authority_level?: number | null;
};

export interface CanonicalAuthorityContext {
  taskTitle: string;
  taskDescription?: string | null;
  workflowPackKey?: string | null;
  phase: "planned" | "review";
}

export interface CanonicalAuthorityEvaluation<TAgent> {
  chair: TAgent | null;
  selectedBy: string[];
  blockedBy: string[];
}

function statusRank(status: string | null | undefined): number {
  if (status === "idle") return 0;
  if (status === "break") return 1;
  if (status === "working") return 2;
  return 3;
}

function includesPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function buildTaskSignalText(context: CanonicalAuthorityContext): string {
  return `${context.taskTitle} ${context.taskDescription ?? ""} ${context.workflowPackKey ?? ""}`.toLowerCase();
}

function requiresArchitectureReview(context: CanonicalAuthorityContext): boolean {
  return includesPattern(
    buildTaskSignalText(context),
    /architect|architecture|system design|schema|db design|refactor|integration design|api contract/,
  );
}

function requiresQaQuorum(context: CanonicalAuthorityContext): boolean {
  const text = buildTaskSignalText(context);
  return (
    context.phase === "review" &&
    (context.workflowPackKey === "video_preprod" ||
      includesPattern(text, /release|deploy|reliability|security|audit|compliance|incident|stability|ship/))
  );
}

function requiresDocumenterQuorum(context: CanonicalAuthorityContext): boolean {
  const text = buildTaskSignalText(context);
  return (
    context.phase === "review" &&
    (context.workflowPackKey === "report" ||
      context.workflowPackKey === "web_research_report" ||
      context.workflowPackKey === "novel" ||
      context.workflowPackKey === "roleplay" ||
      includesPattern(text, /report|documentation|document|brief|summary|research|proposal|script|external/))
  );
}

function isSeniorPlus(stage: string | null | undefined): boolean {
  return getCanonicalStageRank(stage as any) >= getCanonicalStageRank("senior");
}

function isChairCandidate(agent: CanonicalAuthorityAgent): boolean {
  const canonical = resolveCanonicalIdentity(agent);
  return canonical.family === "orchestrator" && canonical.career_stage === "team-lead";
}

export function pickCanonicalMeetingChair<TAgent extends CanonicalAuthorityAgent>(leaders: TAgent[]): TAgent | null {
  if (leaders.length <= 0) return null;
  return (
    [...leaders]
      .map((leader) => ({
        leader,
        canonical: resolveCanonicalIdentity(leader),
      }))
      .sort((left, right) => {
        const leftChair = isChairCandidate(left.leader) ? 0 : 1;
        const rightChair = isChairCandidate(right.leader) ? 0 : 1;
        if (leftChair !== rightChair) return leftChair - rightChair;

        const leftStage = getCanonicalStageRank(left.canonical.career_stage);
        const rightStage = getCanonicalStageRank(right.canonical.career_stage);
        if (leftStage !== rightStage) return rightStage - leftStage;

        if (left.canonical.authority_level !== right.canonical.authority_level) {
          return right.canonical.authority_level - left.canonical.authority_level;
        }

        const leftStatus = statusRank(left.leader.status);
        const rightStatus = statusRank(right.leader.status);
        if (leftStatus !== rightStatus) return leftStatus - rightStatus;

        return String(left.leader.name ?? "").localeCompare(String(right.leader.name ?? ""));
      })[0]?.leader ?? null
  );
}

export function evaluateCanonicalMeetingAuthority<TAgent extends CanonicalAuthorityAgent>(
  leaders: TAgent[],
  context: CanonicalAuthorityContext,
): CanonicalAuthorityEvaluation<TAgent> {
  const chair = pickCanonicalMeetingChair(leaders);
  const hasCanonicalChair = leaders.some((leader) => isChairCandidate(leader));
  const selectedBy: string[] = [];
  const blockedBy: string[] = [];

  if (!chair || !hasCanonicalChair) {
    blockedBy.push("missing_orchestrator_team_lead");
  }
  if (chair) {
    const canonical = resolveCanonicalIdentity(chair);
    selectedBy.push(`chair:${canonical.family}:${canonical.career_stage}:${canonical.authority_level}`);
  }

  const enriched = leaders.map((leader) => ({
    leader,
    canonical: resolveCanonicalIdentity(leader),
  }));

  if (context.phase === "review") {
    const reviewer = enriched.find(
      ({ canonical }) =>
        isSeniorPlus(canonical.career_stage) &&
        (canonical.family === "reviewer" ||
          canonical.family === "qa" ||
          canonical.family === "documenter" ||
          canonical.family === "product-manager"),
    );
    if (!reviewer) blockedBy.push("missing_reviewer_senior");
    else selectedBy.push(`reviewer:${reviewer.canonical.family}:${reviewer.canonical.career_stage}`);
  }

  if (requiresArchitectureReview(context)) {
    const architect = enriched.find(
      ({ canonical }) =>
        isSeniorPlus(canonical.career_stage) &&
        (canonical.family === "architect" ||
          canonical.family === "backend" ||
          canonical.family === "frontend" ||
          canonical.family === "refactor"),
    );
    if (!architect) blockedBy.push("missing_architect_senior");
    else selectedBy.push(`architecture:${architect.canonical.family}:${architect.canonical.career_stage}`);
  }

  if (requiresQaQuorum(context)) {
    const qa = enriched.find(({ canonical }) => canonical.family === "qa" && isSeniorPlus(canonical.career_stage));
    if (!qa) blockedBy.push("missing_qa_senior");
    else selectedBy.push(`qa:${qa.canonical.career_stage}`);
  }

  if (requiresDocumenterQuorum(context)) {
    const documenter = enriched.find(
      ({ canonical }) =>
        isSeniorPlus(canonical.career_stage) &&
        (canonical.family === "documenter" || canonical.family === "product-manager"),
    );
    if (!documenter) blockedBy.push("missing_documenter_or_product_manager_senior");
    else selectedBy.push(`document:${documenter.canonical.family}:${documenter.canonical.career_stage}`);
  }

  return {
    chair,
    selectedBy,
    blockedBy,
  };
}
