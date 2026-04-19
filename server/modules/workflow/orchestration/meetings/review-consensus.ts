import type { Lang } from "../../../../types/lang.ts";
import { processReviewConsensusOutcome } from "./review-consensus-outcome.ts";
import { resolveAgentWorkflowProfile } from "../../agents/workflow-profile.ts";
import { evaluateCanonicalMeetingAuthority } from "../../../company/canonical-authority.ts";

type ReviewConsensusDeps = any;
type StructuredVerdict = "approved" | "hold" | "rejected";
type StructuredReviewerFeedback = {
  lens: string;
  pass1: string;
  pass2: string;
  finalVerdict: StructuredVerdict;
  confidence: number;
  blockingItems: string[];
  requiresFollowUp: boolean;
};

function parseApprovalGateState(raw?: string | null): { gates: string[]; blockedBy: string[] } {
  if (!raw || typeof raw !== "string") return { gates: [], blockedBy: [] };
  try {
    const parsed = JSON.parse(raw);
    const gates = Array.isArray(parsed?.gates) ? parsed.gates.map((gate: unknown) => String(gate ?? "").trim()).filter(Boolean) : [];
    const blockedBy = new Set<string>();
    if (parsed?.blocked === true || gates.includes("artifact-health-block")) blockedBy.add("approval_gate_blocked");
    if (gates.includes("human-approval-general")) blockedBy.add("approval_gate=human-approval-general");
    if (gates.includes("artifact-health-block")) blockedBy.add("approval_gate=artifact-health-block");
    return { gates, blockedBy: [...blockedBy] };
  } catch {
    return { gates: [], blockedBy: [] };
  }
}
export function createReviewConsensusTools(deps: ReviewConsensusDeps) {
  const {
    db,
    reviewInFlight,
    reviewRoundState,
    getTaskReviewLeaders,
    getTaskStatusById,
    getReviewRoundMode,
    scheduleNextReviewRound,
    resolveProjectPath,
    resolveLang,
    runAgentOneShot,
    chooseSafeReply,
    appendTaskLog,
    notifyCeo,
    broadcast,
    notifyTaskStatus,
    pickL,
    l,
    sendAgentMessage,
    emitMeetingSpeech,
    getAgentDisplayName,
    getDeptName,
    getRoleLabel,
    appendMeetingMinuteEntry,
    beginMeetingMinutes,
    finishMeetingMinutes,
    callLeadersToCeoOffice,
    dismissLeadersFromCeoOffice,
    wantsReviewRevision,
    meetingReviewDecisionByAgent,
    findLatestTranscriptContentByAgent,
    isDeferrableReviewHold,
    summarizeForMeetingBubble,
    appendTaskProjectMemo,
    appendTaskReviewFinalMemo,
    collectRevisionMemoItems,
    reserveReviewRevisionMemoItems,
    loadRecentReviewRevisionMemoItems,
    clearTaskWorkflowState,
    isTaskWorkflowInterrupted,
    randomDelay,
    sleepMs,
    buildMeetingPrompt,
    reviewMeetingOneShotTimeoutMs,
    REVIEW_MAX_ROUNDS,
    REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
    REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
    REVIEW_MAX_REMEDIATION_REQUESTS,
    REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND,
    REVIEW_MAX_REVISION_SIGNALS_PER_ROUND,
  } = deps;

  const REVIEWER_CONTRACT = [
    "[2x Review Contract]",
    "Return strict JSON only. No markdown, no preface.",
    "Required keys:",
    '- "pass1": first-pass judgment (string)',
    '- "pass2": counter-check / rebuttal (string)',
    '- "final_verdict": one of "approved" | "hold" | "rejected"',
    '- "confidence": number in [0,1]',
    '- "blocking_items": array of blocker strings (empty array allowed)',
  ].join("\n");

  function normalizeVerdict(value: unknown): StructuredVerdict | null {
    const raw = String(value ?? "")
      .trim()
      .toLowerCase();
    if (raw === "approved" || raw === "approve") return "approved";
    if (raw === "hold" || raw === "needs_revision" || raw === "revision_required") return "hold";
    if (raw === "rejected" || raw === "reject") return "rejected";
    return null;
  }

  function normalizeConfidence(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.max(0, Math.min(1, parsed));
  }

  function normalizeBlockingItems(value: unknown): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const pushItem = (raw: unknown) => {
      const cleaned = String(raw ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(cleaned);
    };
    if (Array.isArray(value)) {
      for (const item of value) pushItem(item);
      return out;
    }
    const text = String(value ?? "").trim();
    if (!text) return out;
    for (const part of text.split(/\n|[;,]/g)) pushItem(part);
    return out;
  }

  function tryParseStructuredFeedback(raw: string, lens: string): StructuredReviewerFeedback | null {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return null;
    const candidates: string[] = [trimmed];
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        const pass1 = String(parsed.pass1 ?? "").trim();
        const pass2 = String(parsed.pass2 ?? "").trim();
        const verdict = normalizeVerdict(parsed.final_verdict);
        if (!pass1 || !pass2 || !verdict) continue;
        const blockingItems = normalizeBlockingItems(parsed.blocking_items);
        const requiresFollowUp = verdict !== "approved" || blockingItems.length > 0;
        return {
          lens: lens || "general_quality",
          pass1,
          pass2,
          finalVerdict: verdict,
          confidence: normalizeConfidence(parsed.confidence),
          blockingItems,
          requiresFollowUp,
        };
      } catch {
        // ignore parse failures
      }
    }
    return null;
  }

  function buildStructuredFeedbackPrompt(basePrompt: string, lens: string): string {
    return [basePrompt, "", `Review lens: ${lens || "general_quality"}`, REVIEWER_CONTRACT].join("\n");
  }

  function summarizeStructuredFeedbackForMeeting(feedback: StructuredReviewerFeedback): string {
    const blockers =
      feedback.blockingItems.length > 0
        ? feedback.blockingItems.map((item, index) => `${index + 1}) ${item}`).join("; ")
        : "none";
    return `pass1=${feedback.pass1} | pass2=${feedback.pass2} | verdict=${feedback.finalVerdict} | confidence=${feedback.confidence.toFixed(2)} | blockers=${blockers}`;
  }

  function startReviewConsensusMeeting(
    taskId: string,
    taskTitle: string,
    departmentId: string | null,
    onApproved: () => void,
    onBlocked?: (blockedBy: string[]) => void,
  ): void {
    if (reviewInFlight.has(taskId)) return;
    reviewInFlight.add(taskId);
    const emitBlock = (reasons: string[]) => {
      try {
        onBlocked?.([...reasons]);
      } catch {
        // ignore callback errors
      }
    };
    void (async () => {
      let meetingId: string | null = null;
      const leaders = getTaskReviewLeaders(taskId, departmentId);
      const quorumReasons = leaders.length >= 2 ? [] : [`quorum_not_met:${leaders.length}/2`];
      if (quorumReasons.length > 0) {
        const reasonText = quorumReasons.join(", ");
        emitBlock(quorumReasons);

        appendTaskLog(taskId, "error", `Review meeting blocked by canonical authority gate: ${reasonText}`);
        notifyCeo(
          pickL(
            l(
              [
                `[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`,
              ],
              [
                `[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`,
              ],
              [
                `[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`,
              ],
              [
                `[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`,
              ],
            ),
            resolveLang(taskTitle),
          ),
          taskId,
        );
        reviewRoundState.delete(taskId);
        reviewInFlight.delete(taskId);
        return;
      }
      try {
        const latestMeeting = db
          .prepare(
            `
        SELECT id, round, status
        FROM meeting_minutes
        WHERE task_id = ?
          AND meeting_type = 'review'
        ORDER BY started_at DESC, created_at DESC
        LIMIT 1
      `,
          )
          .get(taskId) as { id: string; round: number; status: string } | undefined;
        const resumeMeeting = latestMeeting?.status === "in_progress";
        const round = resumeMeeting ? (latestMeeting?.round ?? 1) : (latestMeeting?.round ?? 0) + 1;
        const effectiveMaxReviewRounds = Math.max(1, Math.min(2, Number(REVIEW_MAX_ROUNDS ?? 2)));
        reviewRoundState.set(taskId, round);
        if (!resumeMeeting && round > effectiveMaxReviewRounds) {
          const cappedLang = resolveLang(taskTitle);
          const maxRoundReasons = [
            "approval_gate_blocked",
            `review_round_limit_exceeded:${round}/${effectiveMaxReviewRounds}`,
          ];
          emitBlock(maxRoundReasons);
          appendTaskLog(
            taskId,
            "system",
            `Review round ${round} exceeds max_rounds=${effectiveMaxReviewRounds}; hard-blocking consensus`,
          );
          const reviewMaxRoundMessage = `[CEO OFFICE] '${taskTitle}' exceeded max review rounds (${effectiveMaxReviewRounds}). Review consensus is blocked until manual intervention.`;
          notifyCeo(
            pickL(
              l(
                [reviewMaxRoundMessage],
                [reviewMaxRoundMessage],
                [reviewMaxRoundMessage],
                [reviewMaxRoundMessage],
              ),
              cappedLang,
            ),
            taskId,
          );
          reviewRoundState.delete(taskId);
          reviewInFlight.delete(taskId);
          return;
        }

        const roundMode = getReviewRoundMode(round);
        const isRound1Remediation = roundMode === "round1_review";
        const isRound2Merge = false;
        const isFinalDecisionRound = roundMode === "round2_final";

        const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
        const taskColumnSet = new Set(taskColumns.map((row) => String(row.name).trim()).filter(Boolean));
        const taskCtx = db
          .prepare(`SELECT description, project_path, workflow_pack_key${taskColumnSet.has("approval_gate_state_json") ? ", approval_gate_state_json" : ""} FROM tasks WHERE id = ?`)
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
        const approvalGateState = parseApprovalGateState((taskCtx as { approval_gate_state_json?: string | null } | undefined)?.approval_gate_state_json);
        const authorityEvaluation = evaluateCanonicalMeetingAuthority(leaders, {
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          phase: "review",
        });
        const blockedBy = [...quorumReasons, ...authorityEvaluation.blockedBy, ...approvalGateState.blockedBy];
        if (blockedBy.length > 0) {
          const reasonText = blockedBy.join(", ");
          emitBlock(blockedBy);

          const lang = resolveLang(taskDescription ?? taskTitle);
          appendTaskLog(taskId, "error", `Review meeting blocked by canonical authority gate: ${reasonText}`);
          notifyCeo(
            pickL(
              l(
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: ${reasonText}`],
              ),
              lang,
            ),
            taskId,
          );
          reviewRoundState.delete(taskId);
          reviewInFlight.delete(taskId);
          return;
        }

        const planningLeader = authorityEvaluation.chair;
        if (!planningLeader) {
          appendTaskLog(taskId, "error", "Review meeting blocked: missing canonical chair");
          notifyCeo(
            pickL(
              l(
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: missing canonical chair.`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: missing canonical chair.`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: missing canonical chair.`],
                [`[CEO OFFICE] Review meeting for '${taskTitle}' is blocked. Reason: missing canonical chair.`],
              ),
              resolveLang(taskDescription ?? taskTitle),
            ),
            taskId,
          );
          reviewRoundState.delete(taskId);
          reviewInFlight.delete(taskId);
          return;
        }
        const otherLeaders = leaders.filter((l: any) => l.id !== planningLeader.id);
        let needsRevision = false;
        let reviseOwner: any = null;
        const seatIndexByAgent = new Map(leaders.slice(0, 6).map((leader: any, idx: number) => [leader.id, idx]));

        const projectPath = resolveProjectPath({
          title: taskTitle,
          description: taskDescription,
          project_path: taskCtx?.project_path ?? null,
        });
        const lang = resolveLang(taskDescription ?? taskTitle);
        const transcript: any[] = [];
        const structuredReviewByAgent = new Map<string, StructuredReviewerFeedback>();
        const oneShotTimeoutMs = Math.max(5_000, Number(reviewMeetingOneShotTimeoutMs ?? 65_000));
        const oneShotOptions = { projectPath, timeoutMs: oneShotTimeoutMs, noTools: true };
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
            `Review meeting ${phase} timed out (${oneShotTimeoutMs}ms); retrying once with compact prompt`,
          );
          const retryPrompt = compactPromptForRetry(prompt);
          const second = await runAgentOneShot(agent, retryPrompt, oneShotOptions);
          if (isTimeoutRun(second)) {
            appendTaskLog(taskId, "system", `Review meeting ${phase} retry timed out (${oneShotTimeoutMs}ms)`);
          }
          return second;
        };
        meetingId = resumeMeeting
          ? (latestMeeting?.id ?? null)
          : beginMeetingMinutes(taskId, "review", round, taskTitle);
        if (meetingId) {
          try {
            db.prepare("DELETE FROM review_round_feedback_items WHERE meeting_id = ? AND round = ?").run(
              meetingId,
              round,
            );
          } catch (err: any) {
            appendTaskLog(
              taskId,
              "system",
              `Review round ${round}: feedback table cleanup skipped (${String(err?.message ?? err)})`,
            );
          }
        }
        let minuteSeq = 1;
        if (meetingId) {
          const seqRow = db
            .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM meeting_minute_entries WHERE meeting_id = ?")
            .get(meetingId) as { max_seq: number } | undefined;
          minuteSeq = (seqRow?.max_seq ?? 0) + 1;
        }
        const abortIfInactive = (): boolean => {
          if (!isTaskWorkflowInterrupted(taskId)) return false;
          const status = getTaskStatusById(taskId);
          if (meetingId) finishMeetingMinutes(meetingId, "failed");
          dismissLeadersFromCeoOffice(taskId, leaders);
          clearTaskWorkflowState(taskId);
          if (status) {
            appendTaskLog(taskId, "system", `Review meeting aborted due to task state change (${status})`);
          }
          return true;
        };

        const pushTranscript = (leader: any, content: string) => {
          transcript.push({
            speaker_agent_id: leader.id,
            speaker: getAgentDisplayName(leader, lang),
            department: getDeptName(leader.department_id ?? "", taskWorkflowPackKey),
            role: getRoleLabel(leader.role, lang as Lang),
            content,
          });
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
          emitMeetingSpeech(leader.id, seatIndex, "review", taskId, content, lang);
          pushTranscript(leader, content);
          if (meetingId) {
            appendMeetingMinuteEntry(meetingId, minuteSeq++, leader, lang, messageType, content, taskWorkflowPackKey);
          }
        };

        if (abortIfInactive()) return;
        callLeadersToCeoOffice(taskId, leaders, "review");
        const resumeNotice = isRound2Merge
          ? l(
              [
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
              ],
              [
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`,
              ],
            )
          : isFinalDecisionRound
            ? l(
                [
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Final approval and documentation will be completed without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Final approval and documentation will be completed without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Final approval and documentation will be completed without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Final approval and documentation will be completed without additional remediation.`,
                ],
              )
            : l(
                [
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing team-lead feedback and mutual approvals.`,
                ],
              );
        const startNotice = isRound2Merge
          ? l(
              [
                `[CEO OFFICE] '${taskTitle}' review round ${round} started. Team leads are consolidating round 1 remediation outputs and making merge-readiness decisions.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} started. Team leads are consolidating round 1 remediation outputs and making merge-readiness decisions.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} started. Team leads are consolidating round 1 remediation outputs and making merge-readiness decisions.`,
                `[CEO OFFICE] '${taskTitle}' review round ${round} started. Team leads are consolidating round 1 remediation outputs and making merge-readiness decisions.`,
              ],
            )
          : isFinalDecisionRound
            ? l(
                [
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Final approval and documentation package will be finalized without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Final approval and documentation package will be finalized without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Final approval and documentation package will be finalized without additional remediation.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Final approval and documentation package will be finalized without additional remediation.`,
                ],
              )
            : l(
                [
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Collecting team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Collecting team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Collecting team-lead feedback and mutual approvals.`,
                  `[CEO OFFICE] '${taskTitle}' review round ${round} started. Collecting team-lead feedback and mutual approvals.`,
                ],
              );
        notifyCeo(pickL(resumeMeeting ? resumeNotice : startNotice, lang), taskId);
        const openingPrompt = buildMeetingPrompt(planningLeader, {
          meetingType: "review",
          round,
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          transcript,
          turnObjective: isRound2Merge
            ? "Kick off round 2 merge-synthesis discussion and ask each leader to verify consolidated remediation output."
            : isFinalDecisionRound
              ? "Kick off round 2 final decision discussion and confirm that no additional remediation round will be opened."
              : "Kick off round 1 review discussion and ask each leader for all required remediation items in one pass.",
          stanceHint: isRound2Merge
            ? "Focus on consolidation and merge readiness. Convert concerns into documented residual risks instead of new subtasks."
            : isFinalDecisionRound
              ? "Finalize approval decision and documentation package. Do not ask for new remediation subtasks."
              : "Capture every remediation requirement now so execution can proceed in parallel once.",
          lang,
        });
        const openingRun = await runMeetingOneShotWithRetry(planningLeader, openingPrompt, "opening");
        if (abortIfInactive()) return;
        const openingText = chooseSafeReply(openingRun, lang, "opening", planningLeader);
        speak(planningLeader, "chat", "all", null, openingText);
        await sleepMs(randomDelay(720, 1300));
        if (abortIfInactive()) return;

        for (const leader of leaders) {
          if (abortIfInactive()) return;
          const reviewerProfile = resolveAgentWorkflowProfile({
            workflowProfileRaw: (leader as any).workflow_profile ?? null,
            agentName: leader.name,
            cliProvider: leader.cli_provider,
            departmentId: leader.department_id,
          });
          const reviewLens = reviewerProfile.review_lenses?.[0] || "general_quality";
          const feedbackPrompt = buildMeetingPrompt(leader, {
            meetingType: "review",
            round,
            taskTitle,
            taskDescription,
            workflowPackKey: taskWorkflowPackKey,
            transcript,
            turnObjective: isRound2Merge
              ? "Validate merged remediation output and state whether it is ready for final-round sign-off."
              : isFinalDecisionRound
                ? "Provide final approval opinion with documentation-ready rationale."
                : "Provide concise review feedback and list all revision requirements that must be addressed in round 1.",
            stanceHint: isRound2Merge
              ? "Do not ask for a new remediation round; if concerns remain, describe residual risks for final documentation."
              : isFinalDecisionRound
                ? "No additional remediation is allowed in this final round. Choose final approve or approve-with-residual-risk."
                : "If revision is needed, explicitly state what must be fixed before approval.",
            lang,
          });
          const structuredPrompt = buildStructuredFeedbackPrompt(feedbackPrompt, reviewLens);
          const feedbackRun = await runMeetingOneShotWithRetry(leader, structuredPrompt, "feedback");
          if (abortIfInactive()) return;
          let feedback = tryParseStructuredFeedback(String(feedbackRun?.text ?? ""), reviewLens);
          if (!feedback) {
            appendTaskLog(
              taskId,
              "system",
              `Review round ${round}: invalid structured review output from ${leader.id}; retry once`,
            );
            const retryRun = await runMeetingOneShotWithRetry(
              leader,
              `${structuredPrompt}\n\n[retry] Previous output was invalid. Return strict JSON only.`,
              "feedback",
            );
            if (abortIfInactive()) return;
            feedback = tryParseStructuredFeedback(String(retryRun?.text ?? ""), reviewLens);
          }
          if (!feedback) {
            const fallbackText = chooseSafeReply(feedbackRun, lang, "feedback", leader);
            feedback = {
              lens: reviewLens,
              pass1: fallbackText,
              pass2: "Counter-check unavailable due to invalid structured output format.",
              finalVerdict: "hold",
              confidence: 0.35,
              blockingItems: ["Structured review output contract violation"],
              requiresFollowUp: true,
            };
            appendTaskLog(
              taskId,
              "system",
              `Review round ${round}: fallback hold applied for ${leader.id} (structured format missing)`,
            );
          }
          structuredReviewByAgent.set(leader.id, feedback);
          if (meetingId) {
            try {
              db.prepare(
                `
                INSERT INTO review_round_feedback_items (
                  meeting_id, task_id, round, agent_id, lens, pass1, pass2, final_verdict, confidence, blocking_items_json, requires_jules_action
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              ).run(
                meetingId,
                taskId,
                round,
                leader.id,
                feedback.lens,
                feedback.pass1,
                feedback.pass2,
                feedback.finalVerdict,
                feedback.confidence,
                feedback.blockingItems.length > 0 ? JSON.stringify(feedback.blockingItems) : null,
                feedback.requiresFollowUp ? 1 : 0,
              );
            } catch (err: any) {
              appendTaskLog(
                taskId,
                "system",
                `Review round ${round}: failed to persist structured feedback for ${leader.id} (${String(err?.message ?? err)})`,
              );
            }
          }
          const feedbackText = summarizeStructuredFeedbackForMeeting(feedback);
          speak(
            leader,
            "chat",
            leader.id === planningLeader.id ? "all" : "agent",
            leader.id === planningLeader.id ? null : planningLeader.id,
            feedbackText,
          );
          if (feedback.finalVerdict !== "approved" || feedback.blockingItems.length > 0) {
            needsRevision = true;
            if (!reviseOwner) reviseOwner = leader;
          }
          await sleepMs(randomDelay(650, 1180));
          if (abortIfInactive()) return;
        }

        if (otherLeaders.length === 0 && !structuredReviewByAgent.has(planningLeader.id)) {
          if (abortIfInactive()) return;
          const soloPrompt = buildMeetingPrompt(planningLeader, {
            meetingType: "review",
            round,
            taskTitle,
            taskDescription,
            workflowPackKey: taskWorkflowPackKey,
            transcript,
            turnObjective: isRound2Merge
              ? "As the only reviewer, decide whether round 1 remediation is fully consolidated and merge-ready."
              : isFinalDecisionRound
                ? "As the only reviewer, publish the final approval conclusion and documentation note."
                : "As the only reviewer, provide your single-party review conclusion with complete remediation checklist.",
            stanceHint: isFinalDecisionRound
              ? "No further remediation round is allowed. Conclude with final decision and documented residual risks if any."
              : "Summarize risks, dependencies, and confidence level in one concise message.",
            lang,
          });
          const soloRun = await runMeetingOneShotWithRetry(planningLeader, soloPrompt, "feedback");
          if (abortIfInactive()) return;
          const planningProfile = resolveAgentWorkflowProfile({
            workflowProfileRaw: (planningLeader as any).workflow_profile ?? null,
            agentName: planningLeader.name,
            cliProvider: planningLeader.cli_provider,
            departmentId: planningLeader.department_id,
          });
          const planningLens = planningProfile.review_lenses?.[0] || "general_quality";
          const soloFeedbackPrompt = buildStructuredFeedbackPrompt(soloPrompt, planningLens);
          const soloStructuredRun = await runMeetingOneShotWithRetry(planningLeader, soloFeedbackPrompt, "feedback");
          if (abortIfInactive()) return;
          let soloFeedback = tryParseStructuredFeedback(String(soloStructuredRun?.text ?? ""), planningLens);
          if (!soloFeedback) {
            soloFeedback = {
              lens: planningLens,
              pass1: chooseSafeReply(soloRun, lang, "feedback", planningLeader),
              pass2: "Counter-check unavailable due to invalid structured output format.",
              finalVerdict: "hold",
              confidence: 0.35,
              blockingItems: ["Structured review output contract violation"],
              requiresFollowUp: true,
            };
            appendTaskLog(
              taskId,
              "system",
              `Review round ${round}: fallback hold applied for ${planningLeader.id} (single-reviewer structured format missing)`,
            );
          }
          structuredReviewByAgent.set(planningLeader.id, soloFeedback);
          if (meetingId) {
            try {
              db.prepare(
                `
                INSERT INTO review_round_feedback_items (
                  meeting_id, task_id, round, agent_id, lens, pass1, pass2, final_verdict, confidence, blocking_items_json, requires_jules_action
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              ).run(
                meetingId,
                taskId,
                round,
                planningLeader.id,
                soloFeedback.lens,
                soloFeedback.pass1,
                soloFeedback.pass2,
                soloFeedback.finalVerdict,
                soloFeedback.confidence,
                soloFeedback.blockingItems.length > 0 ? JSON.stringify(soloFeedback.blockingItems) : null,
                soloFeedback.requiresFollowUp ? 1 : 0,
              );
            } catch (err: any) {
              appendTaskLog(
                taskId,
                "system",
                `Review round ${round}: failed to persist structured feedback for ${planningLeader.id} (${String(err?.message ?? err)})`,
              );
            }
          }
          const soloText = summarizeStructuredFeedbackForMeeting(soloFeedback);
          speak(planningLeader, "chat", "all", null, soloText);
          if (soloFeedback.finalVerdict !== "approved" || soloFeedback.blockingItems.length > 0) {
            needsRevision = true;
            if (!reviseOwner) reviseOwner = planningLeader;
          }
          await sleepMs(randomDelay(620, 980));
          if (abortIfInactive()) return;
        }

        const summaryPrompt = buildMeetingPrompt(planningLeader, {
          meetingType: "review",
          round,
          taskTitle,
          taskDescription,
          workflowPackKey: taskWorkflowPackKey,
          transcript,
          turnObjective: isRound2Merge
            ? "Synthesize round 2 consolidation, clarify merge readiness, and announce move to final decision round."
            : isFinalDecisionRound
              ? "Synthesize final review outcome and publish final documentation/approval direction."
              : needsRevision
                ? "Synthesize feedback and announce concrete remediation subtasks and execution handoff."
                : "Synthesize feedback and request final all-leader approval.",
          stanceHint: isRound2Merge
            ? "No new remediation subtasks in round 2. Convert concerns into documented residual-risk notes."
            : isFinalDecisionRound
              ? "Finalize now. Additional remediation rounds are not allowed."
              : needsRevision
                ? "State that remediation starts immediately and review will restart only after remediation is completed."
                : "State that the final review package is ready for immediate approval.",
          lang,
        });
        const summaryRun = await runMeetingOneShotWithRetry(planningLeader, summaryPrompt, "summary");
        if (abortIfInactive()) return;
        const summaryText = chooseSafeReply(summaryRun, lang, "summary", planningLeader);
        speak(planningLeader, "report", "all", null, summaryText);
        await sleepMs(randomDelay(680, 1120));
        if (abortIfInactive()) return;

        for (const leader of leaders) {
          if (abortIfInactive()) return;
          const isReviseOwner = reviseOwner?.id === leader.id;
          const approvalPrompt = buildMeetingPrompt(leader, {
            meetingType: "review",
            round,
            taskTitle,
            taskDescription,
            workflowPackKey: taskWorkflowPackKey,
            transcript,
            turnObjective: isRound2Merge
              ? "State whether this consolidated package is ready to proceed into final decision round."
              : isFinalDecisionRound
                ? "State your final approval decision and documentation conclusion for this task."
                : "State your final approval decision for this review round.",
            stanceHint: isRound2Merge
              ? "If concerns remain, record residual risk only. Do not request a new remediation subtask round."
              : isFinalDecisionRound
                ? "This is the final round. Additional remediation is not allowed; conclude with approve or approve-with-documented-risk."
                : !needsRevision
                  ? "Approve the current review package if ready; otherwise hold approval with concrete revision items."
                  : isReviseOwner
                    ? "Hold approval until your requested revision is reflected."
                    : "Agree with conditional approval pending revision reflection.",
            lang,
          });
          const approvalRun = await runMeetingOneShotWithRetry(leader, approvalPrompt, "approval");
          if (abortIfInactive()) return;
          const approvalText = chooseSafeReply(approvalRun, lang, "approval", leader);
          speak(leader, "status_update", "all", null, approvalText);
          if (!structuredReviewByAgent.has(leader.id) && wantsReviewRevision(approvalText)) {
            needsRevision = true;
            if (!reviseOwner) reviseOwner = leader;
          }
          await sleepMs(randomDelay(420, 860));
          if (abortIfInactive()) return;
        }

        const shouldReturn = await processReviewConsensusOutcome({
          taskId,
          taskTitle,
          round,
          roundMode,
          isRound1Remediation,
          isRound2Merge,
          isFinalDecisionRound,
          structuredReviewByAgent,
          leaders,
          transcript,
          lang,
          workflowPackKey: taskWorkflowPackKey,
          meetingId,
          onApproved,
          abortIfInactive,
          meetingReviewDecisionByAgent,
          findLatestTranscriptContentByAgent,
          isDeferrableReviewHold,
          summarizeForMeetingBubble,
          getDeptName,
          getAgentDisplayName,
          appendTaskLog,
          REVIEW_MAX_REVISION_SIGNALS_PER_ROUND,
          REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND,
          appendTaskProjectMemo,
          sleepMs,
          randomDelay,
          collectRevisionMemoItems,
          REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
          REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
          reserveReviewRevisionMemoItems,
          loadRecentReviewRevisionMemoItems,
          pickL,
          l,
          db,
          REVIEW_MAX_REMEDIATION_REQUESTS,
          notifyCeo,
          broadcast,
          notifyTaskStatus,
          finishMeetingMinutes,
          dismissLeadersFromCeoOffice,
          reviewRoundState,
          reviewInFlight,
          appendTaskReviewFinalMemo,
          scheduleNextReviewRound,
        });
        if (shouldReturn) return;
      } catch (err: any) {
        if (isTaskWorkflowInterrupted(taskId)) {
          if (meetingId) finishMeetingMinutes(meetingId, "failed");
          dismissLeadersFromCeoOffice(taskId, leaders);
          clearTaskWorkflowState(taskId);
          return;
        }
        const msg = err?.message ? String(err.message) : String(err);
        appendTaskLog(taskId, "error", `Review consensus meeting error: ${msg}`);
        const errLang = resolveLang(taskTitle);
        const reviewRoundErrorMessage = `[CEO OFFICE] Error while processing review round for '${taskTitle}': ${msg}`;
        notifyCeo(
          pickL(
            l([reviewRoundErrorMessage], [reviewRoundErrorMessage], [reviewRoundErrorMessage], [reviewRoundErrorMessage]),
            errLang,
          ),
          taskId,
        );
      } finally {
        reviewRoundState.delete(taskId);
        reviewInFlight.delete(taskId);
      }
    })();
  }

  return {
    startReviewConsensusMeeting,
  };
}
