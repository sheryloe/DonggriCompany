import type { Lang } from "../../../types/lang.ts";
import { getCanonicalSnapshotByVersion, previewCanonicalRouting } from "../../company/canonical-policy.ts";

type CreateSessionReviewToolsDeps = Record<string, any>;

export function createSessionReviewTools(deps: CreateSessionReviewToolsDeps) {
  const {
    taskExecutionSessions,
    nowMs,
    randomUUID,
    stopRequestedTasks,
    stopRequestModeByTask,
    clearCliOutputDedup,
    crossDeptNextCallbacks,
    subtaskDelegationCallbacks,
    subtaskDelegationDispatchInFlight,
    delegatedTaskToSubtask,
    subtaskDelegationCompletionNoticeSent,
    reviewRoundState,
    reviewInFlight,
    appendTaskLog,
    notifyCeo,
    pickL,
    l,
    db,
    getProviderModelConfig,
    finishReview,
    randomDelay,
    startPlannedApprovalMeeting,
  } = deps;
  const taskColumns = (() => {
    try {
      const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name?: unknown }>;
      return new Set(columns.map((column) => String(column.name ?? "").trim()).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  })();

  function ensureTaskExecutionSession(taskId: string, agentId: string, provider: string): any {
    const now = nowMs();
    const taskRow = db.prepare(
      `SELECT id, title, description, project_path, workflow_pack_key, policy_version, resolved_execution_policy_json
       FROM tasks
       WHERE id = ?`,
    ).get(taskId) as
      | {
          id: string;
          title: string | null;
          description: string | null;
          project_path: string | null;
          workflow_pack_key: string | null;
          policy_version: string | null;
          resolved_execution_policy_json: string | null;
        }
      | undefined;
    if (!taskRow) {
      throw new Error(`task_not_found:${taskId}`);
    }

    let policyVersion = String(taskRow.policy_version ?? "").trim() || null;
    if (!policyVersion) {
      const compatPolicy = previewCanonicalRouting({
        text: [taskRow.title ?? "", taskRow.description ?? ""].filter(Boolean).join("\n"),
        projectPath: taskRow.project_path,
        workflowPackKey: taskRow.workflow_pack_key,
        providerModelConfig: getProviderModelConfig(),
        defaultProvider: provider,
      });
      const updates: string[] = [];
      const params: unknown[] = [];
      if (taskColumns.has("policy_version")) {
        updates.push("policy_version = ?");
        params.push(compatPolicy.policyVersion);
      }
      if (taskColumns.has("resolved_execution_policy_json")) {
        updates.push("resolved_execution_policy_json = ?");
        params.push(JSON.stringify(compatPolicy));
      }
      if (taskColumns.has("required_artifacts_json")) {
        updates.push("required_artifacts_json = ?");
        params.push(JSON.stringify(compatPolicy.requiredArtifacts));
      }
      if (taskColumns.has("approval_gate_state_json")) {
        updates.push("approval_gate_state_json = ?");
        params.push(
          JSON.stringify({
            gates: compatPolicy.approvalGates,
            blocked: compatPolicy.approvalGates.includes("artifact-health-block"),
          }),
        );
      }
      if (updates.length > 0) {
        params.push(taskId);
        db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      }
      policyVersion = compatPolicy.policyVersion;
      appendTaskLog(taskId, "system", `policy_snapshot_missing_on_legacy_row -> bound ${policyVersion}`);
      console.info("[workflow] policy_snapshot_bound_to_task", { taskId, policyVersion, reason: "execution_session" });
    }

    const pinnedSnapshot = getCanonicalSnapshotByVersion(policyVersion);
    if (!pinnedSnapshot) {
      appendTaskLog(taskId, "system", `policy_snapshot_lookup_failed (${policyVersion})`);
      console.warn("[workflow] policy_snapshot_lookup_failed", { taskId, policyVersion });
      throw new Error(`policy_snapshot_lookup_failed:${policyVersion}`);
    }
    const policyResolution = previewCanonicalRouting({
      text: [taskRow.title ?? "", taskRow.description ?? ""].filter(Boolean).join("\n"),
      projectPath: taskRow.project_path,
      workflowPackKey: taskRow.workflow_pack_key,
      providerModelConfig: getProviderModelConfig(),
      defaultProvider: provider,
      policyVersion,
    });
    const existing = taskExecutionSessions.get(taskId);
    if (existing && existing.agentId === agentId && existing.provider === provider && existing.policyVersion === policyVersion) {
      existing.lastTouchedAt = now;
      existing.policySnapshotHash = pinnedSnapshot.policy.hash;
      existing.policyResolutionJson = JSON.stringify(policyResolution);
      taskExecutionSessions.set(taskId, existing);
      return existing;
    }

    const nextSession: any = {
      sessionId: randomUUID(),
      taskId,
      agentId,
      provider,
      openedAt: now,
      lastTouchedAt: now,
      policyVersion,
      policySnapshotHash: pinnedSnapshot.policy.hash,
      policyResolutionJson: JSON.stringify(policyResolution),
    };
    taskExecutionSessions.set(taskId, nextSession);
    appendTaskLog(taskId, "system", `policy_snapshot_bound_to_session (${policyVersion})`);
    console.info("[workflow] policy_snapshot_bound_to_session", {
      taskId,
      sessionId: nextSession.sessionId,
      policyVersion,
    });
    appendTaskLog(
      taskId,
      "system",
      existing
        ? `Execution session rotated: ${existing.sessionId} -> ${nextSession.sessionId} (agent=${agentId}, provider=${provider}, policy=${policyVersion})`
        : `Execution session opened: ${nextSession.sessionId} (agent=${agentId}, provider=${provider}, policy=${policyVersion})`,
    );
    return nextSession;
  }

  function endTaskExecutionSession(taskId: string, reason: string): void {
    const existing = taskExecutionSessions.get(taskId);
    if (!existing) return;
    taskExecutionSessions.delete(taskId);
    appendTaskLog(
      taskId,
      "system",
      `Execution session closed: ${existing.sessionId} (reason=${reason}, duration_ms=${Math.max(0, nowMs() - existing.openedAt)})`,
    );
  }

  function getTaskStatusById(taskId: string): string | null {
    const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string } | undefined;
    return row?.status ?? null;
  }

  function isTaskWorkflowInterrupted(taskId: string): boolean {
    const status = getTaskStatusById(taskId);
    if (!status) return true; // deleted
    if (stopRequestedTasks.has(taskId)) return true;
    return status === "cancelled" || status === "pending" || status === "done" || status === "inbox";
  }

  function clearTaskWorkflowState(taskId: string): void {
    clearCliOutputDedup(taskId);
    crossDeptNextCallbacks.delete(taskId);
    subtaskDelegationCallbacks.delete(taskId);
    subtaskDelegationDispatchInFlight.delete(taskId);
    delegatedTaskToSubtask.delete(taskId);
    subtaskDelegationCompletionNoticeSent.delete(taskId);
    reviewInFlight.delete(taskId);
    reviewInFlight.delete(`planned:${taskId}`);
    reviewRoundState.delete(taskId);
    reviewRoundState.delete(`planned:${taskId}`);
    const status = getTaskStatusById(taskId);
    if (status === "done" || status === "cancelled") {
      endTaskExecutionSession(taskId, `workflow_cleared_${status}`);
    }
  }

  type ReviewRoundMode = "round1_review" | "round2_final";

  function getReviewRoundMode(round: number): ReviewRoundMode {
    return round <= 1 ? "round1_review" : "round2_final";
  }

  function scheduleNextReviewRound(taskId: string, taskTitle: string, currentRound: number, lang: Lang): void {
    if (currentRound >= 2) {
      appendTaskLog(
        taskId,
        "system",
        `Review round ${currentRound}: max rounds reached (2), skip scheduling additional review round`,
      );
      return;
    }
    const nextRound = 2;
    appendTaskLog(taskId, "system", `Review round ${currentRound}: scheduling round ${nextRound} final review`);
    notifyCeo(
      pickL(
        l(
          [
            `[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${currentRound} 취합이 완료되어 라운드 ${nextRound} 최종 승인 회의로 즉시 전환합니다.`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' review round ${currentRound} consolidation is complete. Moving directly to final approval round ${nextRound}.`,
          ],
          [
            `[CEO OFFICE] '${taskTitle}' のレビューラウンド${currentRound}集約が完了したため、最終承認ラウンド${nextRound}へ即時移行します。`,
          ],
          [`[CEO OFFICE] '${taskTitle}' 第 ${currentRound} 轮评审已完成汇总，立即转入第 ${nextRound} 轮最终审批会议。`],
        ),
        lang,
      ),
      taskId,
    );
    setTimeout(
      () => {
        const current = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as
          | { status: string }
          | undefined;
        if (!current || current.status !== "review") return;
        finishReview(taskId, taskTitle, {
          bypassProjectDecisionGate: true,
          trigger: "review_round_transition",
        });
      },
      randomDelay(1200, 1900),
    );
  }

  function getProjectReviewGateSnapshot(projectId: string): {
    activeTotal: number;
    activeReview: number;
    rootReviewTotal: number;
    ready: boolean;
  } {
    const row = db
      .prepare(
        `
  SELECT
    SUM(CASE WHEN status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS active_total,
    SUM(CASE WHEN status NOT IN ('done', 'cancelled') AND status = 'review' THEN 1 ELSE 0 END) AS active_review,
    SUM(CASE WHEN status = 'review' AND source_task_id IS NULL THEN 1 ELSE 0 END) AS root_review_total
  FROM tasks
  WHERE project_id = ?
`,
      )
      .get(projectId) as
      | {
          active_total: number | null;
          active_review: number | null;
          root_review_total: number | null;
        }
      | undefined;
    const activeTotal = row?.active_total ?? 0;
    const activeReview = row?.active_review ?? 0;
    const rootReviewTotal = row?.root_review_total ?? 0;
    const ready = activeTotal > 0 && activeTotal === activeReview && rootReviewTotal > 0;
    return { activeTotal, activeReview, rootReviewTotal, ready };
  }

  return {
    ensureTaskExecutionSession,
    endTaskExecutionSession,
    getTaskStatusById,
    isTaskWorkflowInterrupted,
    clearTaskWorkflowState,
    getReviewRoundMode,
    scheduleNextReviewRound,
    getProjectReviewGateSnapshot,
  };
}
