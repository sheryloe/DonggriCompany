import type { RuntimeContext } from "../../../types/runtime-context.ts";
import type { Lang } from "../../../types/lang.ts";
import type { AgentRow } from "./direct-chat.ts";
import { resolveCanonicalIdentity } from "../../company/canonical-identity.ts";

type L10n = Record<Lang, string[]>;

type AnnouncementReplyDeps = {
  db: RuntimeContext["db"];
  resolveLang: (text?: string, fallback?: Lang) => Lang;
  getDeptName: (deptId: string) => string;
  getRoleLabel: (role: string, lang: Lang) => string;
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
  sendAgentMessage: (
    agent: AgentRow,
    content: string,
    messageType?: string,
    receiverType?: string,
    receiverId?: string | null,
    taskId?: string | null,
  ) => void;
};

export function createAnnouncementReplyScheduler(deps: AnnouncementReplyDeps): {
  generateAnnouncementReply: (agent: AgentRow, announcement: string, lang: Lang) => string;
  scheduleAnnouncementReplies: (announcement: string) => void;
} {
  const { db, resolveLang, getDeptName, getRoleLabel, l, pickL, sendAgentMessage } = deps;

  function generateAnnouncementReply(agent: AgentRow, announcement: string, lang: Lang): string {
    const name = lang === "ko" ? agent.name_ko || agent.name : agent.name;
    const dept = agent.department_id ? getDeptName(agent.department_id) : "";
    const role = getRoleLabel(agent.role, lang);
    const deptPrefix = dept ? `${dept} ` : "";
    const identity = `${deptPrefix}${role} ${name}`.trim();

    const isUrgent = /긴급|즉시|urgent|immediately|critical/i.test(announcement);
    const isGoodNews = /축하|성공|감사|congrat|success|thank/i.test(announcement);
    const isPolicy = /정책|규칙|변경|policy|rule|update/i.test(announcement);
    const isMeeting = /회의|미팅|meeting|gather/i.test(announcement);

    if (isUrgent) {
      return pickL(
        l(
          [`${identity} 확인했습니다. 즉시 공유하고 대응하겠습니다.`],
          [`${identity} acknowledged. I will relay this immediately and respond.`],
        ),
        lang,
      );
    }

    if (isGoodNews) {
      return pickL(
        l(
          [`${identity} 확인했습니다. 좋은 소식으로 팀에 공유하겠습니다.`],
          [`${identity} acknowledged. I will share the good news with the team.`],
        ),
        lang,
      );
    }

    if (isMeeting) {
      return pickL(
        l(
          [`${identity} 확인했습니다. 일정 반영 후 회의 준비하겠습니다.`],
          [`${identity} acknowledged. I will block the time and prepare for the meeting.`],
        ),
        lang,
      );
    }

    if (isPolicy) {
      return pickL(
        l(
          [`${identity} 확인했습니다. 정책 변경 사항을 작업에 반영하겠습니다.`],
          [`${identity} acknowledged. I will align the team with the policy change.`],
        ),
        lang,
      );
    }

    return pickL(
      l(
        [`${identity} 확인했습니다. 팀에 공유하고 작업에 반영하겠습니다.`],
        [`${identity} acknowledged. I will share it with the team and reflect it in the work.`],
      ),
      lang,
    );
  }

  function scheduleAnnouncementReplies(announcement: string): void {
    const lang = resolveLang(announcement);
    const onlineAgents = db.prepare("SELECT * FROM agents WHERE status != 'offline'").all() as unknown as AgentRow[];
    const canonicalTeamLeads = onlineAgents.filter((agent) => {
      const canonical = resolveCanonicalIdentity(agent as any);
      return canonical.family === "orchestrator" && canonical.career_stage === "team-lead";
    });
    const teamLeaders =
      canonicalTeamLeads.length > 0
        ? canonicalTeamLeads
        : onlineAgents.filter((agent) => String(agent.role ?? "").toLowerCase() === "team_leader");

    let delay = 1200;
    for (const leader of teamLeaders) {
      const replyDelay = delay + Math.random() * 1200;
      setTimeout(() => {
        const reply = generateAnnouncementReply(leader, announcement, lang);
        sendAgentMessage(leader, reply, "chat", "all", null, null);
      }, replyDelay);
      delay += 1200 + Math.random() * 1000;
    }
  }

  return { generateAnnouncementReply, scheduleAnnouncementReplies };
}
