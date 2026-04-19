import type { Lang } from "../../../types/lang.ts";
import type { L10n } from "./language-policy.ts";

interface MessageDeps {
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
}

interface LeaderAckParams extends MessageDeps {
  lang: Lang;
  subRole: string;
  subName: string;
  skipPlannedMeeting: boolean;
  isPlanningLead: boolean;
  crossDeptNames: string;
}

interface DelegateMessageParams extends MessageDeps {
  lang: Lang;
  subName: string;
  ceoMessage: string;
}

interface SubordinateAckParams extends MessageDeps {
  lang: Lang;
  leaderRole: string;
  leaderName: string;
}

interface SelfMessageParams extends MessageDeps {
  lang: Lang;
  skipPlannedMeeting: boolean;
}

interface ManualFallbackNoticeParams extends MessageDeps {
  lang: Lang;
  leaderName: string;
}

export function buildLeaderAckMessage(params: LeaderAckParams): string {
  const { l, pickL, lang, subRole, subName, skipPlannedMeeting, isPlanningLead, crossDeptNames } = params;

  if (skipPlannedMeeting && isPlanningLead && crossDeptNames) {
    return pickL(
      l(
        [`확인했습니다. 기획 회의는 생략하고 ${crossDeptNames} 선행 조율 후 ${subRole} ${subName}에게 바로 위임하겠습니다.`],
        [`Understood. I will skip the planning meeting, pre-coordinate with ${crossDeptNames}, and delegate to ${subRole} ${subName}.`],
      ),
      lang,
    );
  }

  if (skipPlannedMeeting && crossDeptNames) {
    return pickL(
      l(
        [`확인했습니다. 회의 없이 ${subRole} ${subName}에게 위임하고 ${crossDeptNames}와 병행 조율하겠습니다.`],
        [`Understood. I will delegate to ${subRole} ${subName} and coordinate with ${crossDeptNames} in parallel.`],
      ),
      lang,
    );
  }

  if (skipPlannedMeeting) {
    return pickL(
      l(
        [`확인했습니다. 회의 없이 ${subRole} ${subName}에게 바로 위임하겠습니다.`],
        [`Understood. I will skip the meeting and delegate directly to ${subRole} ${subName}.`],
      ),
      lang,
    );
  }

  if (isPlanningLead && crossDeptNames) {
    return pickL(
      l(
        [`확인했습니다. ${crossDeptNames}와 선행 조율을 마친 뒤 ${subRole} ${subName}에게 최종 위임하겠습니다.`],
        [`Understood. I will pre-coordinate with ${crossDeptNames}, then hand off to ${subRole} ${subName}.`],
      ),
      lang,
    );
  }

  if (crossDeptNames) {
    return pickL(
      l(
        [`확인했습니다. 팀장 회의 후 ${subRole} ${subName}에게 위임하고 ${crossDeptNames}와 정렬하겠습니다.`],
        [`Understood. After the team-lead meeting, I will delegate to ${subRole} ${subName} and align with ${crossDeptNames}.`],
      ),
      lang,
    );
  }

  return pickL(
    l(
      [`확인했습니다. 팀장 회의를 먼저 진행하고 ${subRole} ${subName}에게 위임하겠습니다.`],
      [`Understood. I will run the team-lead meeting first and then delegate to ${subRole} ${subName}.`],
    ),
    lang,
  );
}

export function buildDelegateMessage(params: DelegateMessageParams): string {
  const { l, pickL, lang, subName, ceoMessage } = params;
  return pickL(
    l(
      [`${subName}, CEO 지시입니다. "${ceoMessage}" 기준으로 즉시 실행을 시작하세요.`],
      [`${subName}, CEO directive: "${ceoMessage}". Start execution immediately.`],
    ),
    lang,
  );
}

export function buildSubordinateAckMessage(params: SubordinateAckParams): string {
  const { l, pickL, lang, leaderRole, leaderName } = params;
  return pickL(
    l(
      [`확인했습니다. ${leaderRole} ${leaderName} 지시에 따라 즉시 진행하겠습니다.`],
      [`Confirmed. I will proceed immediately under ${leaderRole} ${leaderName}'s direction.`],
    ),
    lang,
  );
}

export function buildSelfExecutionMessage(params: SelfMessageParams): string {
  const { l, pickL, lang, skipPlannedMeeting } = params;
  return pickL(
    l(
      [
        skipPlannedMeeting
          ? "확인했습니다. 적합한 담당자가 없어 제가 직접 처리하겠습니다."
          : "확인했습니다. 팀장 회의 이후에도 적합한 담당자가 없어 제가 직접 처리하겠습니다.",
      ],
      [
        skipPlannedMeeting
          ? "Understood. No eligible assignee is available, so I will execute this directly."
          : "Understood. After the team-lead meeting, no eligible assignee is available, so I will execute this directly.",
      ],
    ),
    lang,
  );
}

export function buildManualFallbackNotice(params: ManualFallbackNoticeParams): string {
  const { l, pickL, lang, leaderName } = params;
  return pickL(
    l(
      [`[CEO OFFICE] 적합한 하위 담당자가 없어 팀장 ${leaderName}가 직접 실행합니다.`],
      [`[CEO OFFICE] No eligible subordinate was available, so team lead ${leaderName} will execute directly.`],
    ),
    lang,
  );
}
