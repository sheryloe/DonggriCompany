import type { Lang } from "../../../types/lang.ts";
import type { L10n } from "./language-policy.ts";

interface MessageDeps {
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
}

interface QueueProgressParams extends MessageDeps {
  lang: Lang;
  targetDeptName: string;
  queueIndex: number;
  queueTotal: number;
  itemCount: number;
}

interface OriginRequestParams extends MessageDeps {
  lang: Lang;
  crossLeaderName: string;
  parentTitle: string;
  itemCount: number;
  batchTitle: string;
}

interface CrossLeaderAckParams extends MessageDeps {
  lang: Lang;
  hasSubordinate: boolean;
  originLeaderName: string;
  itemCount: number;
  batchTitle: string;
  execName: string;
}

interface DelegatedDescriptionParams extends MessageDeps {
  lang: Lang;
  sourceDeptName: string;
  parentSummary: string;
  delegatedChecklist: string;
}

interface ExecutionStartParams extends MessageDeps {
  lang: Lang;
  targetDeptName: string;
  execName: string;
  itemCount: number;
  worktreeCeoNote: string;
}

function localized(deps: MessageDeps, lang: Lang, ko: string, en: string): string {
  return deps.pickL(deps.l([ko], [en], [en], [en]), lang);
}

export function teamLeadFallbackLabel(deps: MessageDeps, lang: Lang): string {
  return localized(deps, lang, "팀장", "Team Lead");
}

export function buildQueueProgressNotice(params: QueueProgressParams): string {
  const { lang, targetDeptName, queueIndex, queueTotal, itemCount } = params;
  return localized(
    params,
    lang,
    `서브태스크 일괄 위임 진행 중: ${targetDeptName} (${queueIndex + 1}/${queueTotal}, ${itemCount}건)`,
    `Batched subtask delegation in progress: ${targetDeptName} (${queueIndex + 1}/${queueTotal}, ${itemCount} item(s))`,
  );
}

export function buildOriginRequestMessage(params: OriginRequestParams): string {
  const { lang, crossLeaderName, parentTitle, itemCount, batchTitle } = params;
  return localized(
    params,
    lang,
    `${crossLeaderName}, '${parentTitle}' 작업에서 ${itemCount}건(${batchTitle})을 하나의 순차 체크리스트로 묶어 처리해주세요. 각 항목은 구현 내용, 검증 방법, 완료 기준을 짧게 남겨주세요.`,
    `${crossLeaderName}, please process ${itemCount} subtasks (${batchTitle}) for '${parentTitle}' as one sequential checklist. Leave the implementation summary, verification method, and completion criteria for each item.`,
  );
}

export function buildCrossLeaderAckMessage(params: CrossLeaderAckParams): string {
  const { lang, hasSubordinate, originLeaderName, itemCount, batchTitle, execName } = params;
  if (hasSubordinate) {
    return localized(
      params,
      lang,
      `${originLeaderName}, 확인했습니다. ${itemCount}건(${batchTitle})을 ${execName}에게 순차 배정하고, 산출물과 검증 결과를 함께 받겠습니다.`,
      `Understood, ${originLeaderName}. I will assign ${itemCount} items (${batchTitle}) to ${execName} in order and collect both outputs and verification results.`,
    );
  }

  return localized(
    params,
    lang,
    `${originLeaderName}, 확인했습니다. ${itemCount}건(${batchTitle})은 제가 직접 순차 처리하고, 결과와 차단 사유를 정리하겠습니다.`,
    `Understood, ${originLeaderName}. I will handle ${itemCount} items (${batchTitle}) myself in order and summarize the result and any blockers.`,
  );
}

export function buildDelegatedTitle(deps: MessageDeps, lang: Lang, itemCount: number, batchTitle: string): string {
  return localized(
    deps,
    lang,
    `[서브태스크 일괄 협업 x${itemCount}] ${batchTitle}`,
    `[Batched Subtask Collaboration x${itemCount}] ${batchTitle}`,
  );
}

export function buildDelegatedDescription(params: DelegatedDescriptionParams): string {
  const { lang, sourceDeptName, parentSummary, delegatedChecklist } = params;
  return localized(
    params,
    lang,
    `[${sourceDeptName}에서 위임된 서브태스크]
${parentSummary}

[순차 체크리스트]
${delegatedChecklist}`,
    `[Subtasks delegated from ${sourceDeptName}]
${parentSummary}

[Sequential checklist]
${delegatedChecklist}`,
  );
}

export function buildWorktreeCeoNote(
  deps: MessageDeps,
  lang: Lang,
  delegatedTaskId: string,
  hasWorktree: boolean,
): string {
  if (!hasWorktree) return "";
  return localized(
    deps,
    lang,
    ` (격리 브랜치: climpire/${delegatedTaskId.slice(0, 8)})`,
    ` (isolated branch: climpire/${delegatedTaskId.slice(0, 8)})`,
  );
}

export function buildExecutionStartNotice(params: ExecutionStartParams): string {
  const { lang, targetDeptName, execName, itemCount, worktreeCeoNote } = params;
  return localized(
    params,
    lang,
    `${targetDeptName} ${execName}가 서브태스크 ${itemCount}건을 하나의 일괄 실행으로 시작했습니다.${worktreeCeoNote}`,
    `${targetDeptName} ${execName} started one batched run for ${itemCount} subtasks.${worktreeCeoNote}`,
  );
}
