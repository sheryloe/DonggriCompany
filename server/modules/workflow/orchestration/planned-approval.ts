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
                [`[CEO OFFICE] '${taskTitle}' Planned 회의를 시작할 수 없습니다. 차단 사유: ${reasonText}`],
                [`[CEO OFFICE] Planned meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] Planned meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] Planned meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
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
            pmo: "PMO는 요구사항을 실행 작업으로 쪼개 담당 부서와 순서를 지정하겠습니다. 산출물은 SubTask 목록과 완료 기준표입니다.",
            "planning-architecture": "기획/설계는 계산기 범위를 사칙연산, 입력 오류, 결과 표시로 확정하겠습니다. 산출물은 요구사항, 화면 흐름, 예외 규칙입니다.",
            planning: "기획은 계산기 범위를 사칙연산, 입력 오류, 결과 표시로 확정하겠습니다. 산출물은 요구사항, 화면 흐름, 예외 규칙입니다.",
            development: "개발은 숫자 입력 파서와 사칙연산 함수를 분리 구현하고 버튼 클릭에 연결하겠습니다. 산출물은 계산 모듈, UI 연결 코드, 기본 단위 테스트입니다.",
            dev: "개발은 숫자 입력 파서와 사칙연산 함수를 분리 구현하고 버튼 클릭에 연결하겠습니다. 산출물은 계산 모듈, UI 연결 코드, 기본 단위 테스트입니다.",
            "ui-ux": "UI/UX는 숫자 입력창, 연산 버튼, 결과 영역을 한 화면 흐름으로 배치하겠습니다. 산출물은 레이아웃 기준과 상태별 오류 문구입니다.",
            design: "UI/UX는 숫자 입력창, 연산 버튼, 결과 영역을 한 화면 흐름으로 배치하겠습니다. 산출물은 레이아웃 기준과 상태별 오류 문구입니다.",
            qa: "QA는 정상 계산, 0으로 나누기, 빈 입력, 연속 연산 케이스를 표로 만들고 검증하겠습니다. 산출물은 테스트 체크리스트와 회귀 결과입니다.",
            "knowledge-docs": "문서는 결정 사항과 테스트 기준을 한 페이지로 정리하고 최종 보고에 포함하겠습니다. 산출물은 결정 로그와 완료 보고 초안입니다.",
            operations: "운영은 실행 경로와 실패 시 재시도 절차를 확인하겠습니다. 산출물은 실행 절차와 장애 대응 메모입니다.",
            "cicd-repo": "CI/CD는 작업 브랜치, 빌드 명령, 병합 기준을 고정하고 통과 여부를 확인하겠습니다. 산출물은 검증 로그와 병합 준비 체크입니다.",
            devsecops: "CI/CD와 보안은 작업 브랜치, 빌드 명령, 병합 기준, 보안 차단 조건을 확인하겠습니다. 산출물은 검증 로그와 승인 체크입니다.",
            "security-approval": "보안/승인은 외부 전송, 토큰, 권한 변경이 없는지 확인하겠습니다. 산출물은 승인/차단 체크 결과입니다.",
            "api-research": "API 리서치는 외부 API 필요 여부와 무료 토큰 사용 범위를 확인하겠습니다. 산출물은 사용 판단과 제한 조건입니다.",
            bloggent: "블로그는 완성 결과를 사용자 설명 글로 전환할 수 있게 핵심 기능과 사용 예시를 정리하겠습니다. 산출물은 게시글 초안 소재입니다.",
            management: "관리는 담당자, 진행 상태, 보고 누락 여부를 주기적으로 확인하겠습니다. 산출물은 상태표와 리스크 메모입니다.",
          };
          const enByDept: Record<string, string> = {
            pmo: "PMO will split requirements into executable work, assign owning departments and order. Deliverables: subtask list and acceptance criteria.",
            "planning-architecture": "Planning/architecture will lock calculator scope to arithmetic, input errors, and result display. Deliverables: requirements, screen flow, exception rules.",
            planning: "Planning will lock calculator scope to arithmetic, input errors, and result display. Deliverables: requirements, screen flow, exception rules.",
            development: "Development will separate the numeric parser and arithmetic functions, then wire them to button clicks. Deliverables: calculation module, UI wiring, basic unit tests.",
            dev: "Development will separate the numeric parser and arithmetic functions, then wire them to button clicks. Deliverables: calculation module, UI wiring, basic unit tests.",
            "ui-ux": "UI/UX will lay out the input, operation buttons, and result area as one flow. Deliverables: layout rules and state-specific error copy.",
            design: "UI/UX will lay out the input, operation buttons, and result area as one flow. Deliverables: layout rules and state-specific error copy.",
            qa: "QA will create and run a matrix for normal arithmetic, divide-by-zero, empty input, and chained operations. Deliverables: test checklist and regression result.",
            "knowledge-docs": "Docs will capture decisions and test criteria on one page and include them in the final report. Deliverables: decision log and report draft.",
            operations: "Operations will verify the execution path and retry procedure. Deliverables: run procedure and incident memo.",
            "cicd-repo": "CI/CD will fix the work branch, build command, and merge criteria, then verify pass/fail. Deliverables: verification log and merge-readiness check.",
            devsecops: "CI/CD and security will check the work branch, build command, merge criteria, and security blocks. Deliverables: verification log and approval check.",
            "security-approval": "Security/approval will check external transmission, tokens, and permission changes. Deliverables: approve/block result.",
            "api-research": "API research will decide whether external APIs are needed and confirm free-token limits. Deliverables: usage decision and constraints.",
            bloggent: "Blog operations will turn the result into user-facing explanation material. Deliverables: post draft material.",
            management: "Management will track owner, progress state, and report gaps. Deliverables: status table and risk memo.",
          };
          const ko = koByDept[normalizedDeptId] ?? `${deptName}는 담당 범위를 구체 작업으로 나누고 산출물과 완료 기준을 함께 보고하겠습니다.`;
          const en =
            enByDept[normalizedDeptId] ??
            `${deptName} will split its scope into concrete work and report deliverables with acceptance criteria.`;
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
            "Open the planned kickoff meeting and ask each leader to state target, method, deliverable, and acceptance criteria.",
          stanceHint:
            "At Planned stage, avoid vague readiness talk. Ask for concrete output and convert concerns into executable planning items.",
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
            turnObjective:
              "Share one concrete department plan with target, method, deliverable, and acceptance criteria for subtasks.",
            stanceHint:
              "Do not answer with only 'we will check'. State what will be made, how it will be verified, and the expected output.",
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
            "Summarize department points as executable subtasks with owner, method, deliverable, and acceptance criteria.",
          stanceHint: "Keep kickoff moving and show concrete planned next steps instead of generic agreement.",
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
            turnObjective:
              "Propose one immediate planning action item for your team with target, method, deliverable, and acceptance criteria.",
            stanceHint:
              "State what to do next, what evidence to collect, who owns it, and what output proves completion. Do not block kickoff at this stage.",
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
