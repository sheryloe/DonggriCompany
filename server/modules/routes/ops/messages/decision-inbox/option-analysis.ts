import type { DecisionOptionAnalysis } from "./types.ts";

type Translate = (ko: string, en: string, ja: string, zh: string) => string;

type DecisionOptionAnalysisInput = {
  action: string;
  number: number;
  label: string;
  kind: "project_review_ready" | "task_timeout_resume" | "review_round_pick";
  t: Translate;
  blockerCount?: number;
  reviewRound?: number;
};

function genericAnalysis(input: DecisionOptionAnalysisInput): DecisionOptionAnalysis {
  const { number, t } = input;
  if (number === 1) {
    return {
      rationale: t(
        "가장 직접적인 진행 경로입니다.",
        "This is the most direct execution path.",
        "This is the most direct execution path.",
        "This is the most direct execution path.",
      ),
      expected_result: t(
        "선택 즉시 현재 요청이 진행 단계로 넘어가고 관련 로그가 남습니다.",
        "The current request moves forward immediately and the decision is logged.",
        "The current request moves forward immediately and the decision is logged.",
        "The current request moves forward immediately and the decision is logged.",
      ),
      risk: t(
        "전제 조건이 틀리면 후속 보완이나 되돌림 비용이 생길 수 있습니다.",
        "If assumptions are wrong, follow-up rework can be required.",
        "If assumptions are wrong, follow-up rework can be required.",
        "If assumptions are wrong, follow-up rework can be required.",
      ),
      follow_up: t(
        "실행 로그와 새로 생긴 작업을 확인합니다.",
        "Check execution logs and any newly created work items.",
        "Check execution logs and any newly created work items.",
        "Check execution logs and any newly created work items.",
      ),
    };
  }

  return {
    rationale: t(
      "속도보다 검토와 보완 여지를 남기는 경로입니다.",
      "This path leaves room for review or remediation over speed.",
      "This path leaves room for review or remediation over speed.",
      "This path leaves room for review or remediation over speed.",
    ),
    expected_result: t(
      "현재 진행은 보류되거나 범위가 좁아지고 추가 확인 내용이 기록됩니다.",
      "Execution is held or narrowed while additional checks are recorded.",
      "Execution is held or narrowed while additional checks are recorded.",
      "Execution is held or narrowed while additional checks are recorded.",
    ),
    risk: t(
      "대기 시간이 늘거나 다음 결정까지 업무 흐름이 멈출 수 있습니다.",
      "Wait time can increase and work may pause until the next decision.",
      "Wait time can increase and work may pause until the next decision.",
      "Wait time can increase and work may pause until the next decision.",
    ),
    follow_up: t(
      "보류 사유와 다시 진행할 조건을 명확히 남깁니다.",
      "Record why it is held and the condition for resuming.",
      "Record why it is held and the condition for resuming.",
      "Record why it is held and the condition for resuming.",
    ),
  };
}

export function buildDecisionOptionAnalysis(input: DecisionOptionAnalysisInput): DecisionOptionAnalysis {
  const { action, t } = input;

  if (action.startsWith("approve_task_review:")) {
    return {
      rationale: t(
        "프로젝트 리뷰 전에 대표 검토 대상을 먼저 고정합니다.",
        "Locks the representative review item before the project-level review.",
        "Locks the representative review item before the project-level review.",
        "Locks the representative review item before the project-level review.",
      ),
      expected_result: t(
        "선택한 작업이 프로젝트 리뷰 대표 항목으로 기록되고, 남은 선택 단계가 계속됩니다.",
        "The selected task is recorded as a representative item and remaining picks continue.",
        "The selected task is recorded as a representative item and remaining picks continue.",
        "The selected task is recorded as a representative item and remaining picks continue.",
      ),
      risk: t(
        "잘못 고르면 회의 기준이 흐려져 리뷰 범위가 다시 조정될 수 있습니다.",
        "A poor pick can blur the review baseline and require scope adjustment.",
        "A poor pick can blur the review baseline and require scope adjustment.",
        "A poor pick can blur the review baseline and require scope adjustment.",
      ),
      follow_up: t(
        "남은 대표 항목 선택 또는 팀장 회의 시작 여부를 이어서 결정합니다.",
        "Continue by selecting remaining representative items or starting the lead meeting.",
        "Continue by selecting remaining representative items or starting the lead meeting.",
        "Continue by selecting remaining representative items or starting the lead meeting.",
      ),
    };
  }

  if (action === "start_project_review") {
    return {
      rationale: t(
        "모든 활성 항목이 Review 상태라 팀장 회의로 승인 또는 보완 여부를 확정합니다.",
        "All active items are in Review, so a lead meeting can decide approval or remediation.",
        "All active items are in Review, so a lead meeting can decide approval or remediation.",
        "All active items are in Review, so a lead meeting can decide approval or remediation.",
      ),
      expected_result: t(
        "프로젝트 리뷰 회의가 시작되고 통과 시 완료 처리, 보류 시 보완 작업이 생성됩니다.",
        "The project review meeting starts; approval completes work, holds create remediation work.",
        "The project review meeting starts; approval completes work, holds create remediation work.",
        "The project review meeting starts; approval completes work, holds create remediation work.",
      ),
      risk: t(
        "검증 산출물이 부족하면 회의 시작이 보류되고 추가 작업이 늘어날 수 있습니다.",
        "If artifacts are incomplete, meeting start can be blocked and extra work can grow.",
        "If artifacts are incomplete, meeting start can be blocked and extra work can grow.",
        "If artifacts are incomplete, meeting start can be blocked and extra work can grow.",
      ),
      follow_up: t(
        "보류된 작업은 로그와 생성된 보완 태스크를 확인합니다.",
        "For held work, inspect logs and generated remediation tasks.",
        "For held work, inspect logs and generated remediation tasks.",
        "For held work, inspect logs and generated remediation tasks.",
      ),
    };
  }

  if (action === "add_followup_request") {
    return {
      rationale: t(
        "바로 승인하지 않고 추가 요구사항이나 확인 조건을 남깁니다.",
        "Records additional requirements or checks instead of approving immediately.",
        "Records additional requirements or checks instead of approving immediately.",
        "Records additional requirements or checks instead of approving immediately.",
      ),
      expected_result: t(
        "결정 이벤트가 기록되고 입력한 메모가 후속 요청으로 남습니다.",
        "A decision event is recorded and your note remains as a follow-up request.",
        "A decision event is recorded and your note remains as a follow-up request.",
        "A decision event is recorded and your note remains as a follow-up request.",
      ),
      risk: t(
        "요구사항이 모호하면 다시 질문이 발생하고 일정이 지연될 수 있습니다.",
        "Vague follow-up can trigger another question and delay the schedule.",
        "Vague follow-up can trigger another question and delay the schedule.",
        "Vague follow-up can trigger another question and delay the schedule.",
      ),
      follow_up: t(
        "메모에는 필요한 산출물, 판단 기준, 완료 조건을 함께 적습니다.",
        "Include required artifacts, decision criteria, and done conditions in the note.",
        "Include required artifacts, decision criteria, and done conditions in the note.",
        "Include required artifacts, decision criteria, and done conditions in the note.",
      ),
    };
  }

  if (action === "resume_timeout_task") {
    return {
      rationale: t(
        "timeout으로 멈춘 작업을 기존 담당 흐름에서 재개합니다.",
        "Resumes the timed-out task in its existing ownership flow.",
        "Resumes the timed-out task in its existing ownership flow.",
        "Resumes the timed-out task in its existing ownership flow.",
      ),
      expected_result: t(
        "작업 실행이 다시 시작되고 새 로그가 기존 작업에 이어집니다.",
        "Task execution restarts and new logs continue under the same task.",
        "Task execution restarts and new logs continue under the same task.",
        "Task execution restarts and new logs continue under the same task.",
      ),
      risk: t(
        "같은 timeout 원인이 남아 있으면 다시 중단될 수 있습니다.",
        "If the timeout cause remains, the task can stop again.",
        "If the timeout cause remains, the task can stop again.",
        "If the timeout cause remains, the task can stop again.",
      ),
      follow_up: t(
        "재중단되면 로그에서 병목 구간을 분리해 범위나 실행 전략을 조정합니다.",
        "If it stops again, isolate the bottleneck from logs and adjust scope or execution strategy.",
        "If it stops again, isolate the bottleneck from logs and adjust scope or execution strategy.",
        "If it stops again, isolate the bottleneck from logs and adjust scope or execution strategy.",
      ),
    };
  }

  if (action === "keep_inbox") {
    return {
      rationale: t(
        "자동 재개하지 않고 PMO 또는 사용자 확인을 기다립니다.",
        "Keeps the task waiting for PMO or user review instead of auto-resuming.",
        "Keeps the task waiting for PMO or user review instead of auto-resuming.",
        "Keeps the task waiting for PMO or user review instead of auto-resuming.",
      ),
      expected_result: t(
        "작업은 Inbox에 남고 추가 실행은 시작되지 않습니다.",
        "The task stays in Inbox and no new execution starts.",
        "The task stays in Inbox and no new execution starts.",
        "The task stays in Inbox and no new execution starts.",
      ),
      risk: t(
        "담당자가 다시 열기 전까지 대기열에 남아 일정이 밀릴 수 있습니다.",
        "It can remain queued and delay delivery until someone resumes it.",
        "It can remain queued and delay delivery until someone resumes it.",
        "It can remain queued and delay delivery until someone resumes it.",
      ),
      follow_up: t(
        "재개 조건, 차단 사유, 필요한 입력을 작업 메모에 정리합니다.",
        "Document resume conditions, blockers, and required inputs in the task note.",
        "Document resume conditions, blockers, and required inputs in the task note.",
        "Document resume conditions, blockers, and required inputs in the task note.",
      ),
    };
  }

  if (action === "apply_all_feedback") {
    return {
      rationale: t(
        "모든 reviewer blocker를 보완 범위에 포함해 누락 위험을 줄입니다.",
        "Includes every reviewer blocker to reduce omission risk.",
        "Includes every reviewer blocker to reduce omission risk.",
        "Includes every reviewer blocker to reduce omission risk.",
      ),
      expected_result: t(
        "전체 피드백 기반 보완 작업이 생성되고 다음 리뷰 라운드 준비로 이어집니다.",
        "Remediation work is created from all feedback and the next review round is prepared.",
        "Remediation work is created from all feedback and the next review round is prepared.",
        "Remediation work is created from all feedback and the next review round is prepared.",
      ),
      risk: t(
        "가치가 낮은 피드백까지 포함되어 범위와 일정이 커질 수 있습니다.",
        "Lower-value feedback can increase scope and schedule cost.",
        "Lower-value feedback can increase scope and schedule cost.",
        "Lower-value feedback can increase scope and schedule cost.",
      ),
      follow_up: t(
        "생성된 보완 작업의 담당자, 우선순위, 완료 기준을 확인합니다.",
        "Check owners, priority, and done criteria for generated remediation tasks.",
        "Check owners, priority, and done criteria for generated remediation tasks.",
        "Check owners, priority, and done criteria for generated remediation tasks.",
      ),
    };
  }

  if (action === "apply_selected_feedback") {
    return {
      rationale: t(
        "핵심 blocker만 골라 범위와 처리 시간을 통제합니다.",
        "Selects only key blockers to control scope and turnaround time.",
        "Selects only key blockers to control scope and turnaround time.",
        "Selects only key blockers to control scope and turnaround time.",
      ),
      expected_result: t(
        "선택한 번호와 메모만 보완 작업으로 생성됩니다.",
        "Only selected feedback numbers and notes are converted into remediation work.",
        "Only selected feedback numbers and notes are converted into remediation work.",
        "Only selected feedback numbers and notes are converted into remediation work.",
      ),
      risk: t(
        "누락한 blocker가 다음 라운드에서 다시 이슈가 될 수 있습니다.",
        "Skipped blockers can reappear in the next review round.",
        "Skipped blockers can reappear in the next review round.",
        "Skipped blockers can reappear in the next review round.",
      ),
      follow_up: t(
        "체크박스와 메모로 포함 범위를 명확히 지정합니다.",
        "Use checkboxes and notes to define the included scope clearly.",
        "Use checkboxes and notes to define the included scope clearly.",
        "Use checkboxes and notes to define the included scope clearly.",
      ),
    };
  }

  if (action === "proceed_final_verdict" || action === "skip_to_next_round") {
    return {
      rationale: t(
        "추가 보완 없이 현재 reviewer 판정 기준으로 마감 판단을 진행합니다.",
        "Moves to final judgment using current reviewer verdicts without more remediation.",
        "Moves to final judgment using current reviewer verdicts without more remediation.",
        "Moves to final judgment using current reviewer verdicts without more remediation.",
      ),
      expected_result: t(
        "최종 판정 흐름으로 넘어가고 남은 blocker는 승인 리스크로 함께 남습니다.",
        "The flow moves to final verdict and remaining blockers stay as approval risk.",
        "The flow moves to final verdict and remaining blockers stay as approval risk.",
        "The flow moves to final verdict and remaining blockers stay as approval risk.",
      ),
      risk: t(
        "미해결 품질, 보안, UX 이슈가 사후 결함이나 재작업으로 이어질 수 있습니다.",
        "Unresolved quality, security, or UX issues can become post-release defects or rework.",
        "Unresolved quality, security, or UX issues can become post-release defects or rework.",
        "Unresolved quality, security, or UX issues can become post-release defects or rework.",
      ),
      follow_up: t(
        "hold 또는 reject 근거는 사후 리스크와 예외 승인 기록에 남깁니다.",
        "Record hold or reject grounds as post-decision risk and exception approval notes.",
        "Record hold or reject grounds as post-decision risk and exception approval notes.",
        "Record hold or reject grounds as post-decision risk and exception approval notes.",
      ),
    };
  }

  return genericAnalysis(input);
}
