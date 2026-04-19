import type { RuntimeContext } from "../../../types/runtime-context.ts";
import type { Lang } from "../../../types/lang.ts";
import type { AgentRow } from "./direct-chat.ts";

type L10n = Record<Lang, string[]>;

type ChatResponseDeps = {
  db: RuntimeContext["db"];
  resolveLang: (text?: string, fallback?: Lang) => Lang;
  getDeptName: (deptId: string) => string;
  getRoleLabel: (role: string, lang: Lang) => string;
  pickRandom: <T>(arr: T[]) => T;
  getFlairs: (agentName: string, lang: Lang) => string[];
  classifyIntent: (msg: string, lang: Lang) => Record<string, boolean>;
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
};

export function createChatReplyGenerator(deps: ChatResponseDeps): {
  generateChatReply: (agent: AgentRow, ceoMessage: string) => string;
} {
  const { db, resolveLang, getDeptName, getRoleLabel, pickRandom, getFlairs, classifyIntent, l, pickL } = deps;

  function generateChatReply(agent: AgentRow, ceoMessage: string): string {
    const message = ceoMessage.trim();
    const lang = resolveLang(message);
    const name = lang === "ko" ? agent.name_ko || agent.name : agent.name;
    const dept = agent.department_id ? getDeptName(agent.department_id) : "";
    const role = getRoleLabel(agent.role, lang);
    const flair = () => pickRandom(getFlairs(agent.name, lang));
    const intent = classifyIntent(message, lang);
    const identity = dept ? `${dept} ${role} ${name}` : `${role} ${name}`;

    let taskTitle = "";
    if (agent.current_task_id) {
      const row = db.prepare("SELECT title FROM tasks WHERE id = ?").get(agent.current_task_id) as
        | { title?: string }
        | undefined;
      taskTitle = String(row?.title ?? "").trim();
    }

    const currentTask = taskTitle
      ? lang === "ko"
        ? `"${taskTitle}" 작업`
        : `"${taskTitle}"`
      : lang === "ko"
        ? "현재 작업"
        : "my current task";

    if (agent.status === "offline") {
      return pickL(
        l(
          [`[자동응답] ${name}은 현재 오프라인입니다. 복귀 후 확인하겠습니다.`],
          [`[Auto-reply] ${name} is currently offline. I will check this when I return.`],
        ),
        lang,
      );
    }

    if (agent.status === "break") {
      if (intent.presence || intent.greeting) {
        return pickL(
          l(
            [`${identity}입니다. 잠깐 자리 비움 상태였고 지금 복귀했습니다. 필요한 내용을 알려주세요.`],
            [`${identity} here. I just returned from a short break. What do you need?`],
          ),
          lang,
        );
      }

      return pickL(
        l(
          ["잠시 자리 비움 상태였습니다. 지금 바로 확인하겠습니다."],
          ["I was away briefly, but I will check right away."],
        ),
        lang,
      );
    }

    if (agent.status === "working") {
      if (intent.presence) {
        return pickL(
          l(
            [`지금 ${currentTask} 진행 중입니다. 계속 응답 가능합니다.`],
            [`I am currently working on ${currentTask} and can still respond.`],
          ),
          lang,
        );
      }

      if (intent.greeting) {
        return pickL(
          l(
            [`${identity}입니다. ${flair()} 상태로 ${currentTask}를 진행 중입니다.`],
            [`${identity} here. I am ${flair()} while working on ${currentTask}.`],
          ),
          lang,
        );
      }

      if (intent.whatDoing || intent.report) {
        return pickL(
          l(
            [`현재 ${currentTask}에 집중하고 있습니다. ${flair()} 상태이며 진행은 안정적입니다.`],
            [`I am focused on ${currentTask}. ${flair()} and progress is stable.`],
          ),
          lang,
        );
      }

      if (intent.complaint) {
        return pickL(
          l(
            [`지연으로 보였다면 속도를 높이겠습니다. ${currentTask} 마무리 중입니다.`],
            [`If this looked slow, I will tighten execution immediately. I am finishing ${currentTask} now.`],
          ),
          lang,
        );
      }

      if (intent.canDo) {
        return pickL(
          l(
            [`${currentTask}를 마친 뒤 바로 처리 가능합니다.`],
            [`I can take it right after I finish ${currentTask}.`],
          ),
          lang,
        );
      }

      return pickL(
        l(
          [`확인했습니다. ${currentTask} 우선순위에 맞춰 반영하겠습니다.`],
          [`Understood. I will fold this into the priority around ${currentTask}.`],
        ),
        lang,
      );
    }

    return pickL(
      l(
        [`${identity} 확인했습니다. 바로 처리 가능합니다.`],
        [`${identity} acknowledged. I can take this immediately.`],
      ),
      lang,
    );
  }

  return { generateChatReply };
}
