import { evaluateCanonicalMeetingAuthority } from "../../company/canonical-authority.ts";

type CreatePlannedApprovalToolsDeps = {
  reviewInFlight: Set<string>;
  reviewRoundState: Map<string, number>;
  db: any;
  getTaskReviewLeaders: (...args: any[]) => any[];
  resolveProjectPath: (...args: any[]) => any;
  resolveLang: (...args: any[]) => any;
  beginMeetingMinutes: (...args: any[]) => any;
  isTaskWorkflowInterrupted: (...args: any[]) => any;
  getTaskStatusById: (...args: any[]) => any;
  finishMeetingMinutes: (...args: any[]) => any;
  dismissLeadersFromCeoOffice: (...args: any[]) => any;
  clearTaskWorkflowState: (...args: any[]) => any;
  getAgentDisplayName: (...args: any[]) => any;
  getDeptName: (...args: any[]) => any;
  getRoleLabel: (...args: any[]) => any;
  sendAgentMessage: (...args: any[]) => any;
  emitMeetingSpeech: (...args: any[]) => any;
  appendMeetingMinuteEntry: (...args: any[]) => any;
  callLeadersToCeoOffice: (...args: any[]) => any;
  notifyCeo: (...args: any[]) => any;
  pickL: (...args: any[]) => any;
  l: (...args: any[]) => any;
  buildMeetingPrompt: (...args: any[]) => any;
  runAgentOneShot: (...args: any[]) => Promise<any>;
  chooseSafeReply: (...args: any[]) => any;
  sleepMs: (...args: any[]) => Promise<void>;
  randomDelay: (...args: any[]) => any;
  collectPlannedActionItems: (...args: any[]) => any[];
  appendTaskProjectMemo: (...args: any[]) => any;
  appendTaskLog: (...args: any[]) => any;
  reviewMeetingOneShotTimeoutMs?: number;
};

const PLANNED_PUBLIC_REQUIRED_DEPARTMENT_IDS = [
  "pmo",
  "planning-architecture",
  "planning",
  "development",
  "dev",
  "ui-ux",
  "design",
  "qa",
  "knowledge-docs",
  "operations",
];

export function createPlannedApprovalTools(deps: CreatePlannedApprovalToolsDeps) {
  const {
    reviewInFlight,
    reviewRoundState,
    db,
    getTaskReviewLeaders,
    resolveProjectPath,
    resolveLang,
    beginMeetingMinutes,
    isTaskWorkflowInterrupted,
    getTaskStatusById,
    finishMeetingMinutes,
    dismissLeadersFromCeoOffice,
    clearTaskWorkflowState,
    getAgentDisplayName,
    getDeptName,
    getRoleLabel,
    sendAgentMessage,
    emitMeetingSpeech,
    appendMeetingMinuteEntry,
    callLeadersToCeoOffice,
    notifyCeo,
    pickL,
    l,
    buildMeetingPrompt,
    runAgentOneShot,
    chooseSafeReply,
    sleepMs,
    randomDelay,
    collectPlannedActionItems,
    appendTaskProjectMemo,
    appendTaskLog,
    reviewMeetingOneShotTimeoutMs,
  } = deps;

  let cachedTaskColumns: Set<string> | null = null;
  function getTaskColumns(): Set<string> {
    if (cachedTaskColumns) return cachedTaskColumns;
    const rows = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    cachedTaskColumns = new Set(rows.map((row) => String(row.name ?? "").trim()).filter(Boolean));
    return cachedTaskColumns;
  }

  function parseApprovalGateState(raw?: string | null): { gates: string[]; blockedBy: string[] } {
    if (!raw || typeof raw !== "string") return { gates: [], blockedBy: [] };
    try {
      const parsed = JSON.parse(raw);
      const gates = Array.isArray(parsed?.gates) ? parsed.gates.map((g: unknown) => String(g ?? "").trim()).filter(Boolean) : [];
      const blockedBy = new Set<string>();
      if (parsed?.blocked === true || gates.includes("artifact-health-block")) blockedBy.add("approval_gate_blocked");
      if (gates.includes("human-approval-general")) blockedBy.add("approval_gate=human-approval-general");
      if (gates.includes("artifact-health-block")) blockedBy.add("approval_gate=artifact-health-block");
      return { gates, blockedBy: [...blockedBy] };
    } catch {
      return { gates: [], blockedBy: [] };
    }
  }

  function startPlannedApprovalMeeting(
    taskId: string,
    taskTitle: string,
    departmentId: string | null,
    onApproved: (planningNotes?: string[]) => void,
  ): void {
    const lockKey = `planned:${taskId}`;
    if (reviewInFlight.has(lockKey)) {
      return;
    }
    reviewInFlight.add(lockKey);

    void (async () => {
      let meetingId: string | null = null;
      const leaders = getTaskReviewLeaders(taskId, departmentId, {
        minLeaders: 5,
        includePlanning: true,
        fallbackAll: true,
        requiredDepartmentIds: PLANNED_PUBLIC_REQUIRED_DEPARTMENT_IDS,
      });
      const quorumReasons = leaders.length >= 2 ? [] : [`quorum_not_met:${leaders.length}/2`];
      try {
        const round = (reviewRoundState.get(lockKey) ?? 0) + 1;
        reviewRoundState.set(lockKey, round);

        const taskColumns = getTaskColumns();
        const taskSelectColumns = [
          "description",
          "project_path",
          "workflow_pack_key",
          ...(taskColumns.has("approval_gate_state_json") ? ["approval_gate_state_json"] : []),
        ];
        const taskCtx = db
          .prepare(`SELECT ${taskSelectColumns.join(", ")} FROM tasks WHERE id = ?`)
          .get(taskId) as
          | {
              description: string | null;
              project_path: string | null;
              workflow_pack_key: string | null;
              approval_gate_state_json?: string | null;
            }
          | undefined;
        const taskDescription = taskCtx?.description ?? null;
        const taskWorkflowPackKey = taskCtx?.workflow_pack_key ?? null;
        const authorityEvaluation = evaluateCanonicalMeetingAuthority(leaders, {
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          phase: "planned",
        });
        const approvalGateState = parseApprovalGateState(taskCtx?.approval_gate_state_json);
        const blockedBy = [
          ...quorumReasons,
          ...authorityEvaluation.blockedBy,
          ...approvalGateState.blockedBy,
        ];
        if (blockedBy.length > 0) {
          const reasonText = blockedBy.join(", ");
          appendTaskLog(taskId, "error", `Planned meeting blocked by canonical authority gate: ${reasonText}`);
          notifyCeo(
            pickL(
              l(
                [`[CEO OFFICE] '${taskTitle}' Planned ?뚯쓽瑜??쒖옉?????놁뒿?덈떎. 李⑤떒 ?ъ쑀: ${reasonText}`],
                [`[CEO OFFICE] Planned meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] '${taskTitle}' Planned 鴉싪??믧뼀冶뗣겎?띲겲?쎼굯?귞릤?? ${reasonText}`],
                [`[CEO OFFICE] ?졿퀡??뒯 '${taskTitle}' ??Planned 鴉싪??귛렅?좑폏${reasonText}`],
              ),
              resolveLang(taskDescription ?? taskTitle),
            ),
            taskId,
          );
          reviewRoundState.delete(lockKey);
          reviewInFlight.delete(lockKey);
          return;
        }

        const planningLeader = authorityEvaluation.chair;
        const otherLeaders = leaders.filter((l: any) => l.id !== planningLeader.id);
        let hasSupplementSignals = false;
        const seatIndexByAgent = new Map(leaders.slice(0, 6).map((leader: any, idx: number) => [leader.id, idx]));
        const projectPath = resolveProjectPath({
          title: taskTitle,
          description: taskDescription,
          project_path: taskCtx?.project_path ?? null,
        });
        const lang = resolveLang(taskDescription ?? taskTitle);
        const transcript: any[] = [];
        const publicFeedbackDeptIds = new Set<string>();
        const oneShotTimeoutMs = Math.max(5_000, Number(reviewMeetingOneShotTimeoutMs ?? 65_000));
        const oneShotOptions = { projectPath, timeoutMs: oneShotTimeoutMs, noTools: true };
        const wantsRevision = (content: string): boolean =>
          /보완|수정|보류|리스크|추가.*필요|hold|revise|revision|required|pending|risk|block|保留|修正|追加|风险|風險/i.test(content);
        const isTimeoutRun = (run: { text?: string; error?: string } | null | undefined): boolean => {
          const source = `${run?.error ?? ""}\n${run?.text ?? ""}`;
          return /timeout after|timed out|request timed out|aborted/i.test(source);
        };
        const compactPromptForRetry = (prompt: string): string => {
          const raw = String(prompt ?? "");
          const maxHead = 2600;
          const maxTail = 1400;
          const compacted =
            raw.length > maxHead + maxTail + 64
              ? `${raw.slice(0, maxHead)}\n\n[...timeout retry compacted...]\n\n${raw.slice(-maxTail)}`
              : raw;
          return `${compacted}\n\n[retry] Previous attempt timed out. Respond concisely in short actionable points.`;
        };
        const runMeetingOneShotWithRetry = async (
          agent: any,
          prompt: string,
          phase: "opening" | "feedback" | "summary" | "approval",
        ): Promise<any> => {
          const first = await runAgentOneShot(agent, prompt, oneShotOptions);
          if (!isTimeoutRun(first)) return first;
          appendTaskLog(
            taskId,
            "system",
            `Planned meeting ${phase} timed out (${oneShotTimeoutMs}ms); retrying once with compact prompt`,
          );
          const retryPrompt = compactPromptForRetry(prompt);
          const second = await runAgentOneShot(agent, retryPrompt, oneShotOptions);
          if (isTimeoutRun(second)) {
            appendTaskLog(taskId, "system", `Planned meeting ${phase} retry timed out (${oneShotTimeoutMs}ms)`);
          }
          return second;
        };
        meetingId = beginMeetingMinutes(taskId, "planned", round, taskTitle);
        let minuteSeq = 1;
        const abortIfInactive = (): boolean => {
          if (!isTaskWorkflowInterrupted(taskId)) return false;
          const status = getTaskStatusById(taskId);
          if (meetingId) finishMeetingMinutes(meetingId, "failed");
          dismissLeadersFromCeoOffice(taskId, leaders);
          clearTaskWorkflowState(taskId);
          if (status) {
            appendTaskLog(taskId, "system", `Planned meeting aborted due to task state change (${status})`);
          }
          return true;
        };

        const pushTranscript = (leader: any, content: string) => {
          transcript.push({
            speaker_agent_id: leader.id,
            speaker: getAgentDisplayName(leader, lang),
            department: getDeptName(leader.department_id ?? "", taskWorkflowPackKey),
            role: getRoleLabel(leader.role, lang),
            content,
          });
        };
        const markPublicFeedback = (leader: any, source: "opening" | "feedback" | "fallback") => {
          const deptId = String(leader?.department_id ?? "").trim();
          if (deptId) publicFeedbackDeptIds.add(deptId);
          appendTaskLog(
            taskId,
            "system",
            `meeting_public_feedback phase=planned source=${source} department_id=${deptId || "unknown"} agent_id=${leader?.id ?? "unknown"}`,
          );
        };
        const buildFallbackPublicFeedback = (leader: any): string => {
          const deptId = String(leader?.department_id ?? "").trim();
          const name = getAgentDisplayName(leader, lang);
          const deptName = getDeptName(deptId, taskWorkflowPackKey);
          const normalizedDeptId = deptId.toLowerCase();
          const koByDept: Record<string, string> = {
            pmo: "PMO 관점에서는 목표, 담당 부서, 일정 기준을 명확히 정리하겠습니다.",
            "planning-architecture": "기획/설계 관점에서는 범위, 산출물 기준, 의사결정 항목을 먼저 정리하겠습니다.",
            planning: "기획 관점에서는 범위, 산출물 기준, 의사결정 항목을 먼저 정리하겠습니다.",
            development: "개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.",
            dev: "개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.",
            "ui-ux": "UI/UX 관점에서는 입력 흐름, 버튼 배치, 오류 피드백이 자연스러운지 확인하겠습니다.",
            design: "UI/UX 관점에서는 입력 흐름, 버튼 배치, 오류 피드백이 자연스러운지 확인하겠습니다.",
            qa: "QA 관점에서는 사칙연산, 예외 입력, 회귀 테스트 기준을 먼저 잡겠습니다.",
            "knowledge-docs": "문서 관점에서는 결정 사항, 검증 기준, 최종 보고 항목을 남기겠습니다.",
            operations: "운영 관점에서는 실행 경로, 상태 보고, 장애 시 재시도 기준을 점검하겠습니다.",
            "cicd-repo": "CI/CD 관점에서는 브랜치, 병합, 빌드 검증 흐름을 확인하겠습니다.",
            devsecops: "CI/CD와 보안 관점에서는 브랜치, 병합, 빌드 검증 흐름을 확인하겠습니다.",
            "security-approval": "보안/승인 관점에서는 권한, 외부 연동, 배포 차단 조건을 확인하겠습니다.",
            "api-research": "API 리서치 관점에서는 필요한 외부 정보와 무료 토큰 범위를 확인하겠습니다.",
            bloggent: "블로그 운영 관점에서는 결과 요약과 콘텐츠 전환 가능성을 확인하겠습니다.",
            management: "관리 관점에서는 진행 상태, 담당자, 보고 누락 여부를 점검하겠습니다.",
          };
          const enByDept: Record<string, string> = {
            pmo: "From PMO, I will clarify goals, owning departments, and schedule criteria.",
            "planning-architecture": "From planning and architecture, I will clarify scope, deliverables, and decision points.",
            planning: "From planning, I will clarify scope, deliverables, and decision points.",
            development: "From development, I will check calculation logic, input validation, and UI wiring first.",
            dev: "From development, I will check calculation logic, input validation, and UI wiring first.",
            "ui-ux": "From UI/UX, I will check input flow, button placement, and error feedback.",
            design: "From UI/UX, I will check input flow, button placement, and error feedback.",
            qa: "From QA, I will define arithmetic, invalid-input, and regression checks first.",
            "knowledge-docs": "From documentation, I will capture decisions, validation criteria, and final report items.",
            operations: "From operations, I will check execution flow, status reporting, and retry criteria.",
            "cicd-repo": "From CI/CD, I will check branch, merge, and build verification flow.",
            devsecops: "From CI/CD and security, I will check branch, merge, and build verification flow.",
            "security-approval": "From security and approval, I will check permissions, external integrations, and release blocks.",
            "api-research": "From API research, I will confirm required external information and free-token limits.",
            bloggent: "From blog operations, I will check summary and content conversion opportunities.",
            management: "From management, I will check progress state, ownership, and report gaps.",
          };
          const ko = koByDept[normalizedDeptId] ?? `${deptName} 관점에서 보완 항목과 다음 액션을 정리하겠습니다.`;
          const en = enByDept[normalizedDeptId] ?? `From ${deptName}, I will clarify gaps and next actions.`;
          return pickL(l([`${name}: ${ko}`], [`${name}: ${en}`]), lang);
        };
        const speak = (
          leader: any,
          messageType: string,
          receiverType: string,
          receiverId: string | null,
          content: string,
        ) => {
          if (isTaskWorkflowInterrupted(taskId)) return;
          sendAgentMessage(leader, content, messageType, receiverType, receiverId, taskId);
          const seatIndex = seatIndexByAgent.get(leader.id) ?? 0;
          emitMeetingSpeech(leader.id, seatIndex, "kickoff", taskId, content, lang);
          pushTranscript(leader, content);
          if (meetingId) {
            appendMeetingMinuteEntry(meetingId, minuteSeq++, leader, lang, messageType, content, taskWorkflowPackKey);
          }
        };

        if (abortIfInactive()) return;
        callLeadersToCeoOffice(taskId, leaders, "kickoff");
        notifyCeo(
          pickL(
            l(
              [`[CEO OFFICE] '${taskTitle}' Planned ${round}차 회의를 시작합니다. 보완점을 수집해 실행 가능한 SubTask로 정리합니다.`],
              [`[CEO OFFICE] '${taskTitle}' planned round ${round} started. Collecting supplement points and turning them into executable subtasks.`],
            ),
            lang,
          ),
          taskId,
        );

        const openingPrompt = buildMeetingPrompt(planningLeader, {
          meetingType: "planned",
          round,
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          transcript,
          turnObjective:
            "Open the planned kickoff meeting and ask each leader for concrete supplement points and planning actions.",
          stanceHint: "At Planned stage, do not block kickoff; convert concerns into executable planning items.",
          lang,
        });
        const openingRun = await runMeetingOneShotWithRetry(planningLeader, openingPrompt, "opening");
        if (abortIfInactive()) return;
        const openingText = chooseSafeReply(openingRun, lang, "opening", planningLeader);
        speak(planningLeader, "chat", "all", null, openingText);
        markPublicFeedback(planningLeader, "opening");
        await sleepMs(randomDelay(700, 1260));
        if (abortIfInactive()) return;

        for (const leader of otherLeaders) {
          if (abortIfInactive()) return;
          const feedbackPrompt = buildMeetingPrompt(leader, {
            meetingType: "planned",
            round,
            taskTitle,
            taskDescription,
            workflowPackKey: taskWorkflowPackKey,
            transcript,
            turnObjective: "Share concise readiness feedback plus concrete supplement items to be planned as subtasks.",
            stanceHint: "Do not hold approval here; provide actionable plan additions with evidence/check item.",
            lang,
          });
          const feedbackRun = await runMeetingOneShotWithRetry(leader, feedbackPrompt, "feedback");
          if (abortIfInactive()) return;
          const feedbackText = chooseSafeReply(feedbackRun, lang, "feedback", leader);
          speak(leader, "chat", "all", null, feedbackText);
          markPublicFeedback(leader, "feedback");
          if (wantsRevision(feedbackText)) {
            hasSupplementSignals = true;
          }
          await sleepMs(randomDelay(620, 1080));
          if (abortIfInactive()) return;
        }

        for (const leader of leaders) {
          const deptId = String(leader?.department_id ?? "").trim();
          if (!deptId || publicFeedbackDeptIds.has(deptId)) continue;
          const fallbackText = buildFallbackPublicFeedback(leader);
          speak(leader, "chat", "all", null, fallbackText);
          markPublicFeedback(leader, "fallback");
          await sleepMs(randomDelay(320, 640));
          if (abortIfInactive()) return;
        }

        const summaryPrompt = buildMeetingPrompt(planningLeader, {
          meetingType: "planned",
          round,
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          transcript,
          turnObjective:
            "Summarize supplement points and announce that they will be converted to subtasks before execution.",
          stanceHint: "Keep kickoff moving and show concrete planned next steps instead of blocking.",
          lang,
        });
        const summaryRun = await runMeetingOneShotWithRetry(planningLeader, summaryPrompt, "summary");
        if (abortIfInactive()) return;
        const summaryText = chooseSafeReply(summaryRun, lang, "summary", planningLeader);
        speak(planningLeader, "report", "all", null, summaryText);
        await sleepMs(randomDelay(640, 1120));
        if (abortIfInactive()) return;

        for (const leader of leaders) {
          if (abortIfInactive()) return;
          const actionPrompt = buildMeetingPrompt(leader, {
            meetingType: "planned",
            round,
            taskTitle,
            taskDescription,
            workflowPackKey: taskWorkflowPackKey,
            transcript,
            turnObjective: "Propose one immediate planning action item for your team in subtask style.",
            stanceHint:
              "State what to do next, what evidence to collect, and who owns it. Do not block kickoff at this stage.",
            lang,
          });
          const actionRun = await runMeetingOneShotWithRetry(leader, actionPrompt, "approval");
          if (abortIfInactive()) return;
          const actionText = chooseSafeReply(actionRun, lang, "approval", leader);
          speak(leader, "status_update", "all", null, actionText);
          if (wantsRevision(actionText)) {
            hasSupplementSignals = true;
          }
          await sleepMs(randomDelay(420, 840));
          if (abortIfInactive()) return;
        }

        await sleepMs(randomDelay(520, 900));
        if (abortIfInactive()) return;
        const planItems = collectPlannedActionItems(transcript, 10);
        appendTaskProjectMemo(taskId, "planned", round, planItems, lang);
        appendTaskLog(
          taskId,
          "system",
          `Planned meeting round ${round}: action items collected (${planItems.length}, supplement-signals=${hasSupplementSignals ? "yes" : "no"})`,
        );
        notifyCeo(
          pickL(
            l(
              [`[CEO OFFICE] '${taskTitle}' Planned 회의를 완료했습니다. 개선 항목 ${planItems.length}건을 기록하고 실행 단계로 이동합니다.`],
              [`[CEO OFFICE] Planned meeting for '${taskTitle}' is complete. Recorded ${planItems.length} improvement items and moving to In Progress.`],
            ),
            lang,
          ),
          taskId,
        );
        if (meetingId) finishMeetingMinutes(meetingId, "completed");
        dismissLeadersFromCeoOffice(taskId, leaders);
        reviewRoundState.delete(lockKey);
        reviewInFlight.delete(lockKey);
        onApproved(planItems);
      } catch (err: any) {
        if (isTaskWorkflowInterrupted(taskId)) {
          if (meetingId) finishMeetingMinutes(meetingId, "failed");
          dismissLeadersFromCeoOffice(taskId, leaders);
          clearTaskWorkflowState(taskId);
          return;
        }
        const msg = err?.message ? String(err.message) : String(err);
        appendTaskLog(taskId, "error", `Planned meeting error: ${msg}`);
        const errLang = resolveLang(taskTitle);
        notifyCeo(
          pickL(
            l(
              [`[CEO OFFICE] '${taskTitle}' Planned 회의 처리 중 오류가 발생했습니다: ${msg}`],
              [`[CEO OFFICE] Error while processing planned meeting for '${taskTitle}': ${msg}`],
            ),
            errLang,
          ),
          taskId,
        );
        if (meetingId) finishMeetingMinutes(meetingId, "failed");
        dismissLeadersFromCeoOffice(taskId, leaders);
      } finally {
        reviewRoundState.delete(lockKey);
        reviewInFlight.delete(lockKey);
      }
    })();
  }

  return {
    startPlannedApprovalMeeting,
  };
}
