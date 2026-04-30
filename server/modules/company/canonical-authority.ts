import { getCanonicalStageRank, resolveCanonicalIdentity } from "./canonical-identity.ts";
import { mapLegacyDepartmentId } from "../bootstrap/schema/organization-manifest.ts";

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
  specialization_key?: string | null;
  execution_capability_profile?: string | null;
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

function requiresReleaseQuorum(context: CanonicalAuthorityContext): boolean {
  return (
    context.phase === "review" &&
    (includesPattern(buildTaskSignalText(context), /release|merge|deploy|ship|rollout|production/) ||
      context.workflowPackKey === "video_preprod")
  );
}

function requiresSecurityQuorum(context: CanonicalAuthorityContext): boolean {
  return (
    context.phase === "review" &&
    includesPattern(buildTaskSignalText(context), /security|auth|permission|billing|compliance|audit/)
  );
}

function requiresDocsQuorum(context: CanonicalAuthorityContext): boolean {
  return (
    includesPattern(
      buildTaskSignalText(context),
      /report|documentation|document|brief|summary|governance|decision|status/,
    ) ||
    context.workflowPackKey === "report" ||
    context.workflowPackKey === "web_research_report" ||
    context.workflowPackKey === "novel" ||
    context.workflowPackKey === "roleplay"
  );
}

function isSeniorPlus(stage: string | null | undefined): boolean {
  return getCanonicalStageRank(stage as any) >= getCanonicalStageRank("senior");
}

function isPmoChairCandidate(agent: CanonicalAuthorityAgent): boolean {
  const canonical = resolveCanonicalIdentity(agent);
  const departmentId = mapLegacyDepartmentId(agent.department_id);
  return canonical.family === "orchestrator" && canonical.career_stage === "team-lead" && departmentId === "pmo";
}

function isChairCandidate(agent: CanonicalAuthorityAgent): boolean {
  const canonical = resolveCanonicalIdentity(agent);
  const departmentId = mapLegacyDepartmentId(agent.department_id);
  return (
    (canonical.family === "orchestrator" && canonical.career_stage === "team-lead") ||
    (departmentId === "planning" && canonical.career_stage === "team-lead")
  );
}

export function pickCanonicalMeetingChair<TAgent extends CanonicalAuthorityAgent>(leaders: TAgent[]): TAgent | null {
  if (leaders.length <= 0) return null;
  const candidates = leaders.filter((leader) => isChairCandidate(leader));
  if (candidates.length <= 0) return null;
  return (
    [...candidates]
      .map((leader) => ({
        leader,
        canonical: resolveCanonicalIdentity(leader),
      }))
      .sort((left, right) => {
        const leftPmo = isPmoChairCandidate(left.leader) ? 0 : 1;
        const rightPmo = isPmoChairCandidate(right.leader) ? 0 : 1;
        if (leftPmo !== rightPmo) return leftPmo - rightPmo;

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
  const hasPmoChair = leaders.some((leader) => isPmoChairCandidate(leader));
  const selectedBy: string[] = [];
  const blockedBy: string[] = [];
  const enriched = leaders.map((leader) => ({
    leader,
    canonical: resolveCanonicalIdentity(leader),
    department_id: mapLegacyDepartmentId(leader.department_id),
  }));

  if (!chair) {
    blockedBy.push("missing_orchestrator_team_lead");
  } else {
    const canonical = resolveCanonicalIdentity(chair);
    selectedBy.push(`chair:${canonical.family}:${canonical.career_stage}:${canonical.authority_level}`);
    if (hasPmoChair) selectedBy.push("chair_source:pmo");
  }

  const reviewer = enriched.find(
    ({ canonical }) =>
      isSeniorPlus(canonical.career_stage) &&
      (canonical.family === "reviewer" ||
        canonical.family === "qa" ||
        canonical.family === "documenter" ||
        canonical.family === "product-manager"),
  );
  if (context.phase === "review") {
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

  if (requiresReleaseQuorum(context)) {
    const qaLeader = enriched.find(
      ({ canonical, department_id }) => department_id === "qa" && isSeniorPlus(canonical.career_stage),
    );
    const hasReleaseDiscipline = enriched.some(({ department_id }) => department_id === "devsecops");
    const releaseLeader = enriched.find(
      ({ canonical, department_id }) =>
        department_id === "devsecops" &&
        (isSeniorPlus(canonical.career_stage) || canonical.career_stage === "team-lead"),
    );
    if (!qaLeader) {
      blockedBy.push("missing_qa_senior");
    } else if (hasReleaseDiscipline && !releaseLeader) {
      blockedBy.push("release_quorum_not_met");
    } else if (releaseLeader) {
      selectedBy.push(`release_quorum:${qaLeader.canonical.career_stage}:${releaseLeader.canonical.career_stage}`);
    } else {
      selectedBy.push(`release_quorum:${qaLeader.canonical.career_stage}:legacy`);
    }
  }

  if (requiresSecurityQuorum(context)) {
    const qaLeader = enriched.find(
      ({ canonical, department_id }) => department_id === "qa" && isSeniorPlus(canonical.career_stage),
    );
    const securityLeader = enriched.find(
      ({ canonical, department_id }) =>
        department_id === "devsecops" &&
        (isSeniorPlus(canonical.career_stage) || canonical.career_stage === "team-lead"),
    );
    if (!qaLeader || !securityLeader) blockedBy.push("security_quorum_not_met");
    else selectedBy.push(`security_quorum:${qaLeader.canonical.career_stage}:${securityLeader.canonical.career_stage}`);
  }

  if (requiresDocsQuorum(context)) {
    const docsLeader = enriched.find(
      ({ canonical, department_id }) =>
        department_id === "operations" &&
        (isSeniorPlus(canonical.career_stage) || canonical.career_stage === "team-lead"),
    );
    const pmoLeader = enriched.find(
      ({ canonical, department_id }) =>
        department_id === "pmo" && canonical.family === "orchestrator" && canonical.career_stage === "team-lead",
    );
    if (!docsLeader || !pmoLeader) blockedBy.push("docs_quorum_not_met");
    else selectedBy.push(`docs_quorum:${docsLeader.canonical.career_stage}:${pmoLeader.canonical.career_stage}`);
  }

  return {
    chair,
    selectedBy,
    blockedBy: [...new Set(blockedBy)],
  };
}
