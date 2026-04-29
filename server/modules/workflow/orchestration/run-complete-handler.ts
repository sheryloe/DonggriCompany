import fs from "node:fs";
import path from "node:path";
import {
  discoverVideoArtifact,
  resolveVideoArtifactRelativeCandidates,
  resolveVideoArtifactSpecForTask,
} from "../packs/video-artifact.ts";
import { evaluateRemotionOnlyGateFromLogFiles } from "../packs/video-render-engine-gate.ts";
import { upsertAgentGuideFile } from "../../routes/core/agents/agent-guide-files.ts";
import { buildAgentGuideMemorySnapshot, extractAndStoreTaskMemory } from "../../memory/store.ts";

type CreateRunCompleteHandlerDeps = Record<string, any>;

export function createRunCompleteHandler(deps: CreateRunCompleteHandlerDeps) {
  const {
    activeProcesses,
    stopProgressTimer,
    db,
    stopRequestedTasks,
    stopRequestModeByTask,
    appendTaskLog,
    clearTaskWorkflowState,
    codexThreadToSubtask,
    nowMs,
    logsDir,
    broadcast,
    processSubtaskDelegations,
    taskWorktrees,
    cleanupWorktree,
    findTeamLeader,
    getAgentDisplayName,
    pickL,
    l,
    notifyCeo,
    sendAgentMessage,
    resolveLang,
    formatTaskSubtaskProgressSummary,
    crossDeptNextCallbacks,
    recoverCrossDeptQueueAfterMissingCallback,
    subtaskDelegationCallbacks,
    finishReview,
    reconcileDelegatedSubtasksAfterRun,
    completeTaskWithoutReview,
    isReportDesignCheckpointTask,
    extractReportDesignParentTaskId,
    resumeReportAfterDesignCheckpoint,
    isPresentationReportTask,
    readReportFlowValue,
    startReportDesignCheckpoint,
    upsertReportFlowValue,
    isReportRequestTask,
    notifyTaskStatus,
    prettyStreamJson,
    getWorktreeDiffSummary,
    hasVisibleDiffSummary,
  } = deps;

  function parseWorkflowMeta(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw !== "string") return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  function mergeWorkflowMeta(taskId: string, mutate: (meta: Record<string, unknown>) => void): void {
    const row = db.prepare("SELECT workflow_meta_json FROM tasks WHERE id = ?").get(taskId) as
      | { workflow_meta_json: string | null }
      | undefined;
    const current = row ? parseWorkflowMeta(row.workflow_meta_json) : {};
    const next = { ...current };
    mutate(next);
    db.prepare("UPDATE tasks SET workflow_meta_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(next),
      nowMs(),
      taskId,
    );
  }

  function setReviewConsentMetaForRunComplete(taskId: string): void {
    const enteredReviewAt = nowMs();
    mergeWorkflowMeta(taskId, (meta) => {
      const existing = meta.review_consent;
      const current = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
      meta.review_consent = {
        ...current,
        started_by: "run_complete",
        entered_review_at: enteredReviewAt,
        stage: "awaiting_review",
        state: "awaiting_review",
        blocked: false,
        blocked_by: [],
      };
    });
  }

  function handleTaskRunComplete(taskId: string, exitCode: number): void {
    activeProcesses.delete(taskId);
    stopProgressTimer(taskId);

    // Get latest task snapshot early for stop/delete race handling.
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
      | {
          assigned_agent_id: string | null;
          department_id: string | null;
          title: string;
          description: string | null;
          status: string;
          task_type: string | null;
          workflow_pack_key: string | null;
          project_id: string | null;
          project_path: string | null;
          source_task_id: string | null;
          workflow_meta_json: string | null;
        }
      | undefined;
    const stopRequested = stopRequestedTasks.has(taskId);
    const stopMode = stopRequestModeByTask.get(taskId);
    stopRequestedTasks.delete(taskId);
    stopRequestModeByTask.delete(taskId);

    // If task was stopped/deleted or no longer in-progress, ignore late close events.
    if (!task || stopRequested || task.status !== "in_progress") {
      if (task) {
        appendTaskLog(
          taskId,
          "system",
          `RUN completion ignored (status=${task.status}, exit=${exitCode}, stop_requested=${stopRequested ? "yes" : "no"}, stop_mode=${stopMode ?? "none"})`,
        );
      }
      const keepWorkflowForResume = stopRequested && stopMode === "pause";
      if (!keepWorkflowForResume) {
        clearTaskWorkflowState(taskId);
      }
      return;
    }

    // Clean up Codex thread?뭩ubtask mappings for this task's subtasks
    for (const [tid, itemId] of codexThreadToSubtask) {
      const row = db.prepare("SELECT id FROM subtasks WHERE cli_tool_use_id = ? AND task_id = ?").get(itemId, taskId);
      if (row) codexThreadToSubtask.delete(tid);
    }

    const logPath = path.join(logsDir, `${taskId}.log`);
    const t = nowMs();
    let finalExitCode = exitCode;
    let result: string | null = null;
    try {
      if (fs.existsSync(logPath)) {
        const raw = fs.readFileSync(logPath, "utf8");
        result = raw.slice(-2000);
      }
    } catch {
      /* ignore */
    }
    const isVideoPreprodTask = task.workflow_pack_key === "video_preprod";
    const isVideoFinalRenderTask = isVideoPreprodTask && /\[VIDEO_FINAL_RENDER\]/i.test(task.title);
    const probeVideoArtifact = () => {
      const videoArtifactSpec = resolveVideoArtifactSpecForTask(db as any, {
        project_id: task.project_id,
        project_path: task.project_path,
        department_id: task.department_id,
        workflow_pack_key: task.workflow_pack_key,
      });
      const candidateRelativePaths = resolveVideoArtifactRelativeCandidates(videoArtifactSpec);
      const wtInfo = taskWorktrees.get(taskId) as { worktreePath?: string; projectPath?: string } | undefined;
      const outputRoot = task.project_path || wtInfo?.projectPath || process.cwd();
      const projectCandidates = candidateRelativePaths.map((relative) => path.join(outputRoot, relative));

      let videoArtifactReady = false;
      if (wtInfo?.worktreePath) {
        const worktreeCandidates = candidateRelativePaths.map((relative) => path.join(wtInfo.worktreePath!, relative));
        let sourceVideo: string | null = null;
        for (const candidate of worktreeCandidates) {
          if (!fs.existsSync(candidate)) continue;
          try {
            if (fs.statSync(candidate).size > 0) {
              sourceVideo = candidate;
              break;
            }
          } catch {
            // Ignore stat errors and continue searching candidates.
          }
        }

        // Fallback: discover any .mp4 in worktree's video_output/ or out/ dirs
        if (!sourceVideo) {
          sourceVideo = discoverVideoArtifact(wtInfo.worktreePath!);
          if (sourceVideo) {
            appendTaskLog(taskId, "system", `Video artifact discovered via directory scan in worktree: ${sourceVideo}`);
          }
        }

        if (sourceVideo) {
          try {
            const destVideo = path.join(outputRoot, videoArtifactSpec.relativePath);
            fs.mkdirSync(path.dirname(destVideo), { recursive: true });
            fs.copyFileSync(sourceVideo, destVideo);
            const size = fs.statSync(destVideo).size;
            if (size > 0) {
              videoArtifactReady = true;
              appendTaskLog(
                taskId,
                "system",
                `Video artifact synchronized: ${destVideo} (${size} bytes, source=${sourceVideo})`,
              );
            } else {
              appendTaskLog(taskId, "system", `Video artifact sync failed: rendered file is empty (${destVideo})`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            appendTaskLog(taskId, "system", `Video artifact sync failed: ${msg}`);
          }
        } else {
          appendTaskLog(
            taskId,
            "system",
            `Video artifact not found in worktree (checked: ${worktreeCandidates.join(", ")})`,
          );
        }
      }

      if (!videoArtifactReady) {
        for (const projectVideo of projectCandidates) {
          if (!fs.existsSync(projectVideo)) continue;
          try {
            const size = fs.statSync(projectVideo).size;
            if (size > 0) {
              videoArtifactReady = true;
              appendTaskLog(
                taskId,
                "system",
                `Video artifact verified at project path: ${projectVideo} (${size} bytes)`,
              );
              break;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            appendTaskLog(taskId, "system", `Video artifact verification failed: ${msg}`);
          }
        }
      }

      // Final fallback: discover any .mp4 in project root's video_output/ or out/ dirs
      if (!videoArtifactReady) {
        const discovered = discoverVideoArtifact(outputRoot);
        if (discovered) {
          videoArtifactReady = true;
          appendTaskLog(
            taskId,
            "system",
            `Video artifact discovered via directory scan at project root: ${discovered}`,
          );
        }
      }

      return {
        videoArtifactReady,
        videoArtifactSpec,
        projectCandidates,
      };
    };
    const failVideoFinalArtifactGate = (artifactProbe: ReturnType<typeof probeVideoArtifact>) => {
      finalExitCode = 87;
      appendTaskLog(
        taskId,
        "system",
        `Video artifact gate failed: [VIDEO_FINAL_RENDER] output missing/empty. checked=${artifactProbe.projectCandidates.join(", ")}`,
      );
      if (!task) return;
      notifyCeo(
        pickL(
          l(
            [
              `'${task.title}'의 최종 렌더 결과물이 확인되지 않아 실행을 실패 처리했습니다. Remotion으로 출력 파일을 생성한 뒤 다시 실행해 주세요.`,
            ],
            [
              `Marked '${task.title}' as failed because final render output is missing/empty. Generate the file with Remotion and retry.`,
            ],
            [
              `'${task.title}' の最終レンダー出力が見つからないため、実行を失敗として処理しました。Remotion で出力ファイルを生成して再実行してください。`,
            ],
            [`'${task.title}' 未检测到最终渲染产物，已将本次执行标记为失败。请使用 Remotion 生成输出文件后重试。`],
          ),
          resolveLang(task.description ?? task.title),
        ),
        taskId,
      );
    };
    if (finalExitCode !== 0 && isVideoFinalRenderTask) {
      const remotionGate = evaluateRemotionOnlyGateFromLogFiles({ logsDir, taskIds: [taskId] });
      const artifactProbe = probeVideoArtifact();
      if (remotionGate.passed && artifactProbe.videoArtifactReady) {
        appendTaskLog(
          taskId,
          "system",
          "Final render recovery: detected valid Remotion output despite non-zero exit; continuing as success.",
        );
        finalExitCode = 0;
      } else {
        appendTaskLog(
          taskId,
          "system",
          `Final render recovery skipped: remotion_ok=${remotionGate.passed ? "yes" : "no"}, artifact_ok=${artifactProbe.videoArtifactReady ? "yes" : "no"}`,
        );
      }
    }
    if (finalExitCode === 0 && isVideoFinalRenderTask) {
      const remotionGate = evaluateRemotionOnlyGateFromLogFiles({ logsDir, taskIds: [taskId] });
      if (!remotionGate.passed) {
        finalExitCode = 86;
        appendTaskLog(
          taskId,
          "system",
          `Video render engine gate failed: Remotion evidence required for [VIDEO_FINAL_RENDER]. checked_tasks=${remotionGate.checkedTaskIds.join(", ") || taskId}, remotion_tasks=${remotionGate.remotionEvidenceTaskIds.join(", ") || "none"}, forbidden_tasks=${remotionGate.forbiddenEngineTaskIds.join(", ") || "none"}`,
        );
      } else {
        appendTaskLog(
          taskId,
          "system",
          `Video render engine gate passed: Remotion evidence detected (${remotionGate.remotionEvidenceTaskIds.join(", ")})`,
        );
      }
    }
    if (finalExitCode === 0 && isVideoFinalRenderTask) {
      const artifactProbe = probeVideoArtifact();
      if (!artifactProbe.videoArtifactReady) {
        failVideoFinalArtifactGate(artifactProbe);
      }
    }

    const logKind = finalExitCode === 0 ? "completed" : "failed";
    appendTaskLog(taskId, "system", `RUN ${logKind} (exit code: ${finalExitCode})`);

    if (result) {
      db.prepare("UPDATE tasks SET result = ? WHERE id = ?").run(result, taskId);
    }

    // Auto-complete own-department subtasks on CLI success; foreign ones get delegated
    if (finalExitCode === 0) {
      const pendingSubtasks = db
        .prepare(
          "SELECT id, target_department_id FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')",
        )
        .all(taskId) as Array<{ id: string; target_department_id: string | null }>;
      if (pendingSubtasks.length > 0) {
        const now = nowMs();
        for (const sub of pendingSubtasks) {
          // Only auto-complete subtasks without a foreign department target
          if (!sub.target_department_id) {
            db.prepare("UPDATE subtasks SET status = 'done', completed_at = ? WHERE id = ?").run(now, sub.id);
            const updated = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sub.id);
            broadcast("subtask_update", updated);
          }
        }
      }
      // Trigger delegation for foreign-department subtasks
      processSubtaskDelegations(taskId);
    }

    // Update agent status back to idle
    if (task?.assigned_agent_id) {
      db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?").run(task.assigned_agent_id);

      if (finalExitCode === 0) {
        db.prepare(
          `
            UPDATE agents
            SET
              stats_tasks_done = stats_tasks_done + 1,
              stats_xp = stats_xp + 10,
              role = CASE
                WHEN role = 'intern' THEN 'junior'
                WHEN role = 'junior' AND (stats_xp + 10) >= 300 THEN 'senior'
                ELSE role
              END
            WHERE id = ?
          `,
        ).run(task.assigned_agent_id);
        try {
          extractAndStoreTaskMemory(db as any, {
            task: {
              id: taskId,
              title: task.title,
              description: task.description,
              assigned_agent_id: task.assigned_agent_id,
              department_id: task.department_id,
              project_id: task.project_id,
              project_path: task.project_path,
              task_type: task.task_type,
              workflow_pack_key: task.workflow_pack_key,
              workflow_meta_json: task.workflow_meta_json,
            },
            result,
            now: t,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          appendTaskLog(taskId, "system", `Memory extraction skipped: ${msg}`);
        }
      }

      const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id) as
        | Record<string, unknown>
        | undefined;
      if (agent && finalExitCode === 0) {
        try {
          const memorySnapshot = buildAgentGuideMemorySnapshot(db as any, String(agent.id ?? task.assigned_agent_id));
          upsertAgentGuideFile({
            id: String(agent.id ?? task.assigned_agent_id),
            name: String(agent.name ?? task.assigned_agent_id),
            role: (agent.role as string | null | undefined) ?? null,
            departmentId: (agent.department_id as string | null | undefined) ?? null,
            workflowProfileJson: (agent.workflow_profile as string | null | undefined) ?? null,
            agentProfileJson: (agent.agent_profile_json as string | null | undefined) ?? null,
            statsTasksDone: Number(agent.stats_tasks_done ?? 0),
            statsXp: Number(agent.stats_xp ?? 0),
            ...memorySnapshot,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          appendTaskLog(taskId, "system", `Agent guide snapshot update skipped: ${msg}`);
        }
      }
      broadcast("agent_status", agent);
    }

    if (finalExitCode === 0 && task) {
      if (isVideoPreprodTask) {
        const rootVideoTask = !task.source_task_id;
        const shouldCheckArtifactNow = rootVideoTask || isVideoFinalRenderTask;
        let deferArtifactGate = false;
        if (rootVideoTask && !isVideoFinalRenderTask) {
          const openSubtasksRow = db
            .prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')")
            .get(taskId) as { cnt?: number } | undefined;
          const openChildTasksRow = db
            .prepare(
              `
              SELECT COUNT(*) AS cnt
              FROM tasks
              WHERE source_task_id = ?
                AND status NOT IN ('done', 'cancelled')
            `,
            )
            .get(taskId) as { cnt?: number } | undefined;
          const openSubtasks = Number(openSubtasksRow?.cnt ?? 0);
          const openChildTasks = Number(openChildTasksRow?.cnt ?? 0);
          deferArtifactGate = openSubtasks > 0 || openChildTasks > 0;
          if (deferArtifactGate) {
            appendTaskLog(
              taskId,
              "system",
              `Video sequencing notice: documentation/collaboration still in progress. Artifact gate deferred until review stage (open_subtasks=${openSubtasks}, open_collab_tasks=${openChildTasks})`,
            );
            notifyCeo(
              pickL(
                l(
                  [
                    `'${task.title}'에 문서/협업 작업이 남아 있어 영상 품질 게이트를 Review 단계에서 이어서 확인합니다. (미완료 subtask ${openSubtasks}건, 협업 task ${openChildTasks}건)`,
                  ],
                  [
                    `'${task.title}' still has documentation/collaboration work pending, so video quality gating will continue in Review stage. (open subtasks: ${openSubtasks}, open collaboration tasks: ${openChildTasks})`,
                  ],
                  [
                    `'${task.title}' は文書/協업作業が残っているため、動画品質ゲートを Review 段階で継続確認します。(未完了 subtask ${openSubtasks} 件、協업 task ${openChildTasks} 件)`,
                  ],
                  [
                    `'${task.title}' 仍有文档/协作任务未完成，因此视频质量门禁将在 Review 阶段继续确认。（未完成 subtask ${openSubtasks} 个，协作 task ${openChildTasks} 个）`,
                  ],
                ),
                resolveLang(task.description ?? task.title),
              ),
              taskId,
            );
          }
        }

        if (shouldCheckArtifactNow && !deferArtifactGate) {
          const artifactProbe = probeVideoArtifact();
          if (!artifactProbe.videoArtifactReady) {
            if (isVideoFinalRenderTask) {
              failVideoFinalArtifactGate(artifactProbe);
            } else {
              appendTaskLog(
                taskId,
                "system",
                `Video artifact gate notice: missing/empty render output. Review stage will require artifact verification. checked=${artifactProbe.projectCandidates.join(", ")}`,
              );
              notifyCeo(
                pickL(
                  l(
                    [
                      `'${task.title}'의 영상 결과물이 아직 확인되지 않았습니다. 검토 단계에서 \`${artifactProbe.videoArtifactSpec.relativePath}\` (또는 legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`) 확인 후 승인해야 합니다.`,
                    ],
                    [
                      `Video artifact for '${task.title}' is not verified yet. In review stage, approval requires \`${artifactProbe.videoArtifactSpec.relativePath}\` (or legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`).`,
                    ],
                    [
                      `'${task.title}' の動画成果物は未確認です。レビュー段階で \`${artifactProbe.videoArtifactSpec.relativePath}\`（または legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`）を確認してから承認してください。`,
                    ],
                    [
                      `任务 '${task.title}' 的视频产物尚未验证。请在 Review 阶段确认 \`${artifactProbe.videoArtifactSpec.relativePath}\`（或 legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`）后再批准。`,
                    ],
                  ),
                  resolveLang(task.description ?? task.title),
                ),
                taskId,
              );
            }
          }
        }
      }

      if (isReportDesignCheckpointTask(task)) {
        const parentTaskId = extractReportDesignParentTaskId(task);
        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status done (report design checkpoint completed; review meeting skipped)",
        );
        if (parentTaskId) {
          resumeReportAfterDesignCheckpoint(parentTaskId, taskId);
        }
        return;
      }

      if (isPresentationReportTask(task)) {
        const designReview = (readReportFlowValue(task.description, "design_review") ?? "pending").toLowerCase();
        if (designReview !== "done") {
          const started = startReportDesignCheckpoint({
            id: taskId,
            title: task.title,
            description: task.description,
            project_id: task.project_id,
            project_path: task.project_path,
            assigned_agent_id: task.assigned_agent_id,
          });
          if (started) return;
          const fallbackDesc = upsertReportFlowValue(
            upsertReportFlowValue(task.description, "design_review", "skipped"),
            "final_regen",
            "ready",
          );
          db.prepare("UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?").run(
            fallbackDesc,
            nowMs(),
            taskId,
          );
        }

        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status done (report workflow: final PPT regenerated; second design confirmation skipped)",
        );
        return;
      }

      if (isReportRequestTask(task)) {
        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status done (report workflow: review meeting skipped for documentation/report task)",
        );
        return;
      }
    }

    if (finalExitCode === 0) {
      setReviewConsentMetaForRunComplete(taskId);
      // SUCCESS: Move to 'review' for team leader check
      db.prepare("UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ?").run(t, taskId);

      appendTaskLog(taskId, "system", "Status -> review (team leader review pending)");

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      broadcast("task_update", updatedTask);
      if (task) notifyTaskStatus(taskId, task.title, "review", resolveLang(task.description ?? task.title));

      // Collaboration child tasks should wait in review until parent consolidation meeting.
      if (task?.source_task_id) {
        reconcileDelegatedSubtasksAfterRun(taskId, 0);
        const sourceLang = resolveLang(task.description ?? task.title);
        appendTaskLog(
          taskId,
          "system",
          "Status -> review (delegated collaboration task waiting for parent consolidation)",
        );
        notifyCeo(
          pickL(
            l(
              [
                `'${task.title}' 하위 협업 작업이 리뷰 대기 상태로 전환되었습니다. 상위 작업의 단일 리뷰/병합 회의에서 최종 반영됩니다.`,
              ],
              [
                `'${task.title}' collaboration child task is now waiting in Review. It will be consolidated in the parent task's single review/merge meeting.`,
              ],
              [
                `'${task.title}' collaboration child task is now waiting in Review. It will be consolidated in the parent task's single review/merge meeting.`,
              ],
              [
                `'${task.title}' collaboration child task is now waiting in Review. It will be consolidated in the parent task's single review/merge meeting.`,
              ],
            ),
            sourceLang,
          ),
          taskId,
        );

        const nextDelay = 800 + Math.random() * 600;
        const nextCallback = crossDeptNextCallbacks.get(taskId);
        if (nextCallback) {
          crossDeptNextCallbacks.delete(taskId);
          setTimeout(nextCallback, nextDelay);
        } else {
          recoverCrossDeptQueueAfterMissingCallback(taskId);
        }
        const subtaskNext = subtaskDelegationCallbacks.get(taskId);
        if (subtaskNext) {
          subtaskDelegationCallbacks.delete(taskId);
          setTimeout(subtaskNext, nextDelay);
        }
        return;
      }

      // Notify: task entering review
      if (task) {
        const lang = resolveLang(task.description ?? task.title);
        const leader = findTeamLeader(task.department_id);
        const leaderName = leader
          ? getAgentDisplayName(leader, lang)
          : pickL(l(["팀 리드"], ["Team Lead"], ["Team Lead"], ["Team Lead"]), lang);
        notifyCeo(
          pickL(
            l(
              [`${leaderName}이(가) '${task.title}' 결과를 검토 중입니다.`],
              [`${leaderName} is reviewing the result for '${task.title}'.`],
              [`${leaderName} is reviewing the result for '${task.title}'.`],
              [`${leaderName} is reviewing the result for '${task.title}'.`],
            ),
            lang,
          ),
          taskId,
        );
      }

      // Schedule team leader review message (2-3s delay)
      setTimeout(() => {
        if (!task) return;
        const leader = findTeamLeader(task.department_id);
        if (!leader) {
          // No team leader -> auto-approve
          finishReview(taskId, task.title);
          return;
        }

        // Read the task result and pretty-parse it for the report
        let reportBody = "";
        try {
          const targetPath = taskWorktrees.get(taskId)?.projectPath || task?.project_path;
          if (targetPath) {
            const mdReportPath = path.join(targetPath, "tasks", "report.md");
            if (fs.existsSync(mdReportPath)) {
              const rawMd = fs.readFileSync(mdReportPath, "utf8").trim();
              if (rawMd) {
                reportBody = rawMd.length > 4000 ? "..." + rawMd.slice(-4000) : rawMd;
              }
            }
          }
          if (!reportBody) {
            const logFile = path.join(logsDir, `${taskId}.log`);
            if (fs.existsSync(logFile)) {
              const raw = fs.readFileSync(logFile, "utf8");
              const pretty = prettyStreamJson(raw);
              reportBody = pretty.length > 500 ? "..." + pretty.slice(-500) : pretty;
            }
          }
        } catch {
          /* ignore */
        }

        const wtInfo = taskWorktrees.get(taskId);
        let diffSummary = "";
        if (wtInfo) {
          diffSummary = getWorktreeDiffSummary(wtInfo.projectPath, taskId);
          if (hasVisibleDiffSummary(diffSummary)) {
            appendTaskLog(taskId, "system", `Worktree diff summary:\n${diffSummary}`);
          }
        }

        // Team leader sends completion report with actual result content + diff
        const reportLang = resolveLang(task.description ?? task.title);
        let reportContent = reportBody
          ? pickL(
              l(
                [`CEO, '${task.title}' 작업 완료를 보고드립니다.\n\n결과 요약:\n${reportBody}`],
                [`CEO, reporting completion for '${task.title}'.\n\nResult Summary:\n${reportBody}`],
                [`CEO, reporting completion for '${task.title}'.\n\nResult Summary:\n${reportBody}`],
                [`CEO, reporting completion for '${task.title}'.\n\nResult Summary:\n${reportBody}`],
              ),
              reportLang,
            )
          : pickL(
              l(
                [`CEO, '${task.title}' 작업 완료를 보고드립니다. 작업이 성공적으로 마무리되었습니다.`],
                [`CEO, reporting completion for '${task.title}'. The work has been finished successfully.`],
                [`CEO, reporting completion for '${task.title}'. The work has been finished successfully.`],
                [`CEO, reporting completion for '${task.title}'. The work has been finished successfully.`],
              ),
              reportLang,
            );

        const subtaskProgress = formatTaskSubtaskProgressSummary(taskId, reportLang);
        if (subtaskProgress) {
          reportContent += `\n\n${pickL(l(["보완/협업 진행 요약"], ["Remediation/Collaboration Progress"]), reportLang)}\n${subtaskProgress}`;
        }

        if (hasVisibleDiffSummary(diffSummary)) {
          reportContent += `\n\n${pickL(l([`변경 사항 (branch: ${wtInfo?.branchName}):\n${diffSummary}`], [`Changes (branch: ${wtInfo?.branchName}):\n${diffSummary}`]), reportLang)}`;
        }

        sendAgentMessage(leader, reportContent, "report", "all", null, taskId);

        // After another 2-3s: team leader approves - move to done
        setTimeout(() => {
          finishReview(taskId, task.title);
        }, 2500);
      }, 2500);
    } else {
      // FAILURE: Reset to inbox, team leader reports failure
      db.prepare("UPDATE tasks SET status = 'inbox', updated_at = ? WHERE id = ?").run(t, taskId);

      if (task?.source_task_id) {
        reconcileDelegatedSubtasksAfterRun(taskId, finalExitCode);
      }

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      broadcast("task_update", updatedTask);

      // Clean up worktree on failure
      const failWtInfo = taskWorktrees.get(taskId);
      if (failWtInfo) {
        cleanupWorktree(failWtInfo.projectPath, taskId);
        appendTaskLog(taskId, "system", "Worktree cleaned up (task failed)");
      }

      if (task) {
        const leader = findTeamLeader(task.department_id);
        if (leader) {
          setTimeout(() => {
            let errorBody = "";
            try {
              const logFile = path.join(logsDir, `${taskId}.log`);
              if (fs.existsSync(logFile)) {
                const raw = fs.readFileSync(logFile, "utf8");
                const pretty = prettyStreamJson(raw);
                errorBody = pretty.length > 300 ? "..." + pretty.slice(-300) : pretty;
              }
            } catch {
              /* ignore */
            }

            const failLang = resolveLang(task.description ?? task.title);
            const failContent = errorBody
              ? pickL(
                  l(
                    [
                      `CEO, '${task.title}' 작업 중 문제가 발생했습니다 (종료 코드: ${finalExitCode}).\n\n오류 내용:\n${errorBody}\n\n담당자를 다시 배정하거나 작업 내용을 수정한 뒤 재시도해 주세요.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}).\n\nError:\n${errorBody}\n\nPlease reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}).\n\nError:\n${errorBody}\n\nPlease reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}).\n\nError:\n${errorBody}\n\nPlease reassign the agent or revise the task, then try again.`,
                    ],
                  ),
                  failLang,
                )
              : pickL(
                  l(
                    [
                      `CEO, '${task.title}' 작업 중 문제가 발생했습니다 (종료 코드: ${finalExitCode}). 담당자를 다시 배정하거나 작업 내용을 수정한 뒤 재시도해 주세요.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}). Please reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}). Please reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}). Please reassign the agent or revise the task, then try again.`,
                    ],
                  ),
                  failLang,
                );

            sendAgentMessage(leader, failContent, "report", "all", null, taskId);
          }, 1500);
        }
        const failLang = resolveLang(task.description ?? task.title);
        notifyCeo(
          pickL(
            l(
              [`'${task.title}' 작업이 실패했습니다 (exit code: ${finalExitCode}).`],
              [`Task '${task.title}' failed (exit code: ${finalExitCode}).`],
              [`Task '${task.title}' failed (exit code: ${finalExitCode}).`],
              [`Task '${task.title}' failed (exit code: ${finalExitCode}).`],
            ),
            failLang,
          ),
          taskId,
        );
      }

      // Trigger next task delegation so it doesn't stall
      const nextCallback = crossDeptNextCallbacks.get(taskId);
      if (nextCallback) {
        crossDeptNextCallbacks.delete(taskId);
        setTimeout(nextCallback, 3000);
      }
      const subtaskNext = subtaskDelegationCallbacks.get(taskId);
      if (subtaskNext) {
        subtaskDelegationCallbacks.delete(taskId);
        setTimeout(subtaskNext, 3000);
      }
    }
  }

  return {
    handleTaskRunComplete,
  };
}
